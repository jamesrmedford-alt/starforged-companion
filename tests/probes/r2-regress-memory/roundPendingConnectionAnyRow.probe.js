/**
 * PROBE — R2M-2 ROUND-HIT-CONFIRMS-UNNAMED-PENDING-ROW (WRONG-TARGET / ATTRIBUTION)
 * A regression of issue #342 Z09 (ROUND-CAPTURE-CREDITS-FIRST-ROLLER).
 *
 * W23 (issue #325): a Make a Connection hit on an NPC whose ◈ New Entities row
 * is still pending confirms THAT row as the roller's connection — "the pending
 * connection row the move's narration names (whole words, the full name)"
 * (entityExtractor.js confirmNamedPendingConnection, doc ~2262). Free-flow keeps
 * that rule: connectionSlots' `names` is `wholeWordPattern(draft.name).test(namingText)`
 * (entityExtractor.js ~700).
 *
 * Z09 gave a Batch Mode round its own slots (narrator.js runRoundNarrationPasses
 * ~1105 → connectionRollers; entityExtractor.js connectionSlots ~688): each hit's
 * `names` is its `owns(draft)` — roundFigureOwner(entries, narration)(draft) ===
 * roller (narrator.js ~1170). That ladder never asks whether the round's
 * narration names the row at all:
 *   - with ONE acting PC, roundFigureOwner returns `() => pcs[0].actorId` — every
 *     row is "theirs";
 *   - with two or more, its rung 2 (the figure's description names the PC) is
 *     read off the old row's description, whatever this narration says.
 * confirmNamedPendingConnection then confirms the FIRST pending connection row
 * on the NEWEST draft card — any NPC from any earlier narration — as the
 * roller's connection: bond Item on their sheet, stamped with the round's
 * narration, the row marked confirmed. The NPC the hit was really about stays
 * pending (or, when it was already known, nothing is made — ENT-2 — but now a
 * stranger is bonded instead).
 *
 * Real producers: narrateRound (the Batch Mode round's narration and capture,
 * on the canonical GM), runDiscoveryDetection → routeEntityDrafts →
 * confirmNamedPendingConnection → confirmDraft → createConnection /
 * registerConnectionOnActiveCharacter. Claude is scripted at api-proxy
 * (narration + detection reply). Harness copied from
 * tests/unit/roundConnectionBondHolder.test.js.
 */

/* global makeTestActor, structuredClone */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});
vi.mock('../../../src/entities/connection.js', async (importOriginal) => ({
  ...(await importOriginal()),
  createConnection: vi.fn(async (data) => ({
    _id: `conn-${String(data.name).toLowerCase().replace(/\s+/g, '-')}`, name: data.name, rank: 'dangerous',
  })),
}));

import { apiPost } from '../../../src/api-proxy.js';
import { createConnection } from '../../../src/entities/connection.js';
import { narrateRound, runPostNarrationPasses } from '../../../src/narration/narrator.js';
import { invalidateActorCache } from '../../../src/character/actorBridge.js';

const MODULE_ID = 'starforged-companion';
const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';
const reply = (text) => ({ content: [{ type: 'text', text }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'end_turn' });

/** Kira's hit: she finds Orla Teague, whose row an earlier narration left pending. */
const ORLA_NARRATION = 'Orla Teague looks up from her nets by the airlock and waves Kira over; they talk until the shift bell.'
  + '\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
/** The detection leaves pending names out of its reply (its prompt says so). */
const NO_NEW_ENTITIES = JSON.stringify({ entities: [], worldJournal: {}, renames: [] });

function script(narration, detection) {
  apiPost.mockImplementation(async (_url, _headers, body) => {
    if (body?.model === NARRATION_MODEL) return reply(narration);
    const prompt = String(body?.messages?.[0]?.content ?? '');
    if (/entities/i.test(prompt) && /worldJournal|world journal/i.test(prompt)) return reply(detection);
    return reply('{}');
  });
}

const makeAConnection = (resolutionId) => ({
  kind: 'move', moveId: 'make_a_connection', moveName: 'Make a Connection', statUsed: 'heart',
  outcome: 'strong_hit', outcomeLabel: 'Strong Hit', isMatch: false,
  loremasterContext: 'Make a Connection (+heart): strong hit — you create a connection.',
  oracleSeeds: null, resolutionId,
  relevance: { resolvedClass: 'discovery', entityIds: [], entityTypes: [] },
});

/** A round only Kira acted in: her Make a Connection strong hit. */
const SOLO_ROUND = {
  id: 'round-3', number: 3, phase: 'narrating', acting: ['pl-1'],
  entries: {
    'pl-1': { userId: 'pl-1', actorId: 'pc-kira', actorName: 'Kira', text: 'I look for Orla Teague by the airlock.', rolled: { narrationInput: makeAConnection('res-k') } },
  },
};

function installPc(id, name) {
  const pc = makeTestActor({ id, type: 'character', name, hasPlayerOwner: true });
  game.actors._set(id, pc);
  invalidateActorCache(id);
  return pc;
}

/** An earlier narration's ◈ New Entities card with these connection rows still pending. */
function installPendingCard(rows) {
  const msg = {
    id: 'draft-earlier', content: '',
    flags: { [MODULE_ID]: { draftEntityCard: true, drafts: rows.map(([name, description], index) => ({ name, type: 'connection', description, index, status: 'pending' })) } },
    update: async (data) => { Object.assign(msg, data); return msg; },
    setFlag: async (mod, key, val) => { msg.flags[mod][key] = val; return msg; },
  };
  global.game.messages = { contents: [msg], get: (id) => (id === msg.id ? msg : null) };
  return msg;
}

const bondsOf = (actor) => actor.items.contents
  .filter(i => i.type === 'progress' && i.system?.subtype === 'bond')
  .map(i => i.name);
const statuses = (card) => Object.fromEntries(card.flags[MODULE_ID].drafts.map(d => [d.name, d.status]));

const DACE = ['Dace Mirren', 'A courier who drank alone at the far end of the bar.'];
const ORLA = ['Orla Teague', 'A net-mender by the airlock.'];

let kira;
beforeEach(() => {
  vi.clearAllMocks();
  game.actors._reset();
  game.settings._store.clear();
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
  game.settings._store.set(`${MODULE_ID}.chronicleAutoEntry`, false);
  game.settings._store.set(`${MODULE_ID}.campaignState`, {
    currentSessionId: 's1', sessionNumber: 1, currentSceneId: 'sc-1', connectionIds: [],
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' },
  });
  global.game.user = { id: 'gm-1', isGM: true };
  global.game.users = [{ id: 'gm-1', isGM: true, active: true }];
  global.game.messages = { contents: [], get: () => null };
  ChatMessage._reset();
  kira = installPc('pc-kira', 'Kira');
});

const narrate = (round) => narrateRound({ round, campaignState: structuredClone(game.settings.get(MODULE_ID, 'campaignState')) });

describe('R2M-2 — a round\'s Make a Connection hit confirms a pending row its narration never names', () => {
  it('control (free-flow, W23): the same hit narrated on its own confirms the row the narration names', async () => {
    const card = installPendingCard([DACE, ORLA]);
    script(ORLA_NARRATION, NO_NEW_ENTITIES);
    await runPostNarrationPasses(
      'Orla Teague looks up from her nets by the airlock and waves Kira over; they talk until the shift bell.',
      { moveId: 'make_a_connection', outcome: 'strong_hit', playerNarration: 'I look for Orla Teague by the airlock.', oracleSeeds: null },
      { resolvedClass: 'discovery', entityIds: [], entityTypes: [] },
      structuredClone(game.settings.get(MODULE_ID, 'campaignState')),
      { actorId: 'pc-kira', narrationId: 'nar-free' },
    );
    expect(bondsOf(kira)).toEqual(['Orla Teague']);
    expect(statuses(card)).toEqual({ 'Dace Mirren': 'pending', 'Orla Teague': 'confirmed' });
  });

  it('control: a solo round whose only pending row is the one it names confirms it', async () => {
    const card = installPendingCard([ORLA]);
    script(ORLA_NARRATION, NO_NEW_ENTITIES);
    expect((await narrate(SOLO_ROUND)).posted).toBe('card');
    expect(bondsOf(kira)).toEqual(['Orla Teague']);
    expect(statuses(card)).toEqual({ 'Orla Teague': 'confirmed' });
  });

  it("a solo round's hit on pending Orla Teague confirms Orla — not Dace Mirren, an earlier row the round never mentions", async () => {
    const card = installPendingCard([DACE, ORLA]);
    script(ORLA_NARRATION, NO_NEW_ENTITIES);
    expect((await narrate(SOLO_ROUND)).posted).toBe('card');
    expect.soft(statuses(card), 'the rows after the round').toEqual({ 'Dace Mirren': 'pending', 'Orla Teague': 'confirmed' });
    expect(bondsOf(kira), "Kira's bonds").toEqual(['Orla Teague']);
  });

  it("a solo round's hit whose NPC no row holds bonds no stranger: an unrelated pending row stays pending", async () => {
    const card = installPendingCard([DACE]);
    // Kira wins over the quartermaster — a face the GM already has on file, so the detection proposes nothing.
    script('Kira shares a drink with the quartermaster and wins her trust.\n```json\n{"newTruths":[],"stateChanges":[]}\n```', NO_NEW_ENTITIES);
    const round = structuredClone(SOLO_ROUND);
    round.entries['pl-1'].text = 'I win over the quartermaster.';
    expect((await narrate(round)).posted).toBe('card');
    expect.soft(createConnection.mock.calls.map(([d]) => d.name), 'connections created').toEqual([]);
    expect.soft(statuses(card), 'the unrelated row').toEqual({ 'Dace Mirren': 'pending' });
    expect(bondsOf(kira), "Kira's bonds").toEqual([]);
  });

  it("with two acting PCs, a pending row whose old description names Kira is not confirmed by a round that never mentions it", async () => {
    installPc('pc-vex', 'Vex');
    const card = installPendingCard([['Dace Mirren', 'A courier who still owes Kira a favour.']]);
    script('Kira shares a drink with the quartermaster and wins her trust, while Vex tunes the drive.\n```json\n{"newTruths":[],"stateChanges":[]}\n```', NO_NEW_ENTITIES);
    const round = {
      id: 'round-4', number: 4, phase: 'narrating', acting: ['pl-1', 'pl-2'],
      entries: {
        'pl-1': { userId: 'pl-1', actorId: 'pc-kira', actorName: 'Kira', text: 'I win over the quartermaster.', rolled: { narrationInput: makeAConnection('res-k') } },
        'pl-2': { userId: 'pl-2', actorId: 'pc-vex', actorName: 'Vex', text: 'I tune the drive.', rolled: { narrationInput: { kind: 'narrative' } } },
      },
    };
    expect((await narrate(round)).posted).toBe('card');
    expect.soft(statuses(card), 'the unrelated row').toEqual({ 'Dace Mirren': 'pending' });
    expect(bondsOf(kira), "Kira's bonds").toEqual([]);
  });
});
