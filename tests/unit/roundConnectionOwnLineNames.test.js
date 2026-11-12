/**
 * STARFORGED COMPANION
 * tests/unit/roundConnectionOwnLineNames.test.js
 *
 * Issue #347 residual ROUND-CONNECTION-LINE-JOINED (AB10's rule in a Batch
 * Mode round). A Make a Connection hit that made no one connects the NPC the
 * move names (entityExtractor.js connectNamedFigure): the one the player's
 * line names, else the one the narration names; several, none is guessed and
 * the GMs are told which (issue #347 AB10). A round handed the capture one
 * line for every hit — all its entries' lines joined (narrator.js
 * runRoundNarrationPasses: `playerNarration`) — so the roller's own line was
 * never told apart: two players sharing one character, the hit's line naming
 * Orla Teague and the other's naming Dace Mirren, made no connection and told
 * the GMs both were named. Now each hit carries its own entry's line
 * (`connectionRollers[].lineText`).
 *
 * Harness: roundPendingConnectionNamed.test.js's (narrateRound with Claude
 * scripted at api-proxy).
 */

/* global makeTestActor, structuredClone */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});
vi.mock('../../src/entities/connection.js', async (importOriginal) => ({
  ...(await importOriginal()),
  createConnection: vi.fn(async (data) => ({
    _id: `conn-${String(data.name).toLowerCase().replace(/\s+/g, '-')}`, name: data.name, rank: 'dangerous',
  })),
}));

import { apiPost } from '../../src/api-proxy.js';
import { narrateRound } from '../../src/narration/narrator.js';
import { invalidateActorCache } from '../../src/character/actorBridge.js';

const MODULE_ID = 'starforged-companion';
const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';
const reply = (text) => ({ content: [{ type: 'text', text }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'end_turn' });
const SIDECAR = '\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
/** The detection leaves pending names out of its reply (its prompt says so). */
const NO_NEW_ENTITIES = JSON.stringify({ entities: [], worldJournal: {}, renames: [] });

function script(narration) {
  apiPost.mockImplementation(async (_url, _headers, body) => {
    if (body?.model === NARRATION_MODEL) return reply(narration + SIDECAR);
    const prompt = String(body?.messages?.[0]?.content ?? '');
    if (/entities/i.test(prompt) && /worldJournal|world journal/i.test(prompt)) return reply(NO_NEW_ENTITIES);
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

/** Two players who both play Kira: pl-1's Make a Connection hit, pl-3's action with no roll. */
function sharedPcRound(hitLine, otherLine) {
  return {
    id: 'round-6', number: 6, phase: 'narrating', acting: ['pl-1', 'pl-3'],
    entries: {
      'pl-1': { userId: 'pl-1', actorId: 'pc-kira', actorName: 'Kira', text: hitLine, rolled: { narrationInput: makeAConnection('res-k') } },
      'pl-3': { userId: 'pl-3', actorId: 'pc-kira', actorName: 'Kira', text: otherLine, rolled: { narrationInput: { kind: 'narrative' } } },
    },
  };
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
const severalNotices = () => ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.knownNpcsConnectionNotice);

const DACE = ['Dace Mirren', 'A courier who drank alone at the far end of the bar.'];
const ORLA = ['Orla Teague', 'A net-mender by the airlock.'];
const NARRATION = 'Kira finds Orla Teague mending nets by the airlock, then asks Dace Mirren about the cargo.';

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
  kira = makeTestActor({ id: 'pc-kira', type: 'character', name: 'Kira', hasPlayerOwner: true });
  game.actors._set('pc-kira', kira);
  invalidateActorCache('pc-kira');
});

const narrate = (round) => narrateRound({ round, campaignState: structuredClone(game.settings.get(MODULE_ID, 'campaignState')) });

describe("issue #347 ROUND-CONNECTION-LINE-JOINED — a round's Make a Connection hit is named by its own player's line", () => {
  it("the hit's line names Orla Teague, the other player's names Dace Mirren: Orla is Kira's connection, Dace stays pending", async () => {
    const card = installPendingCard([DACE, ORLA]);
    script(NARRATION);
    expect((await narrate(sharedPcRound('I look for Orla Teague by the airlock.', 'I ask Dace Mirren about the cargo.'))).posted).toBe('card');
    expect.soft(statuses(card), 'the rows after the round').toEqual({ 'Dace Mirren': 'pending', 'Orla Teague': 'confirmed' });
    expect.soft(severalNotices(), 'no "several NPCs" notice').toHaveLength(0);
    expect(bondsOf(kira), "Kira's bonds").toEqual(['Orla Teague']);
  });

  it("the hit's line names no one, the other player's names Dace Mirren: Dace is not made Kira's connection", async () => {
    const card = installPendingCard([DACE, ORLA]);
    script('Kira finds Orla Teague mending nets by the airlock.');
    expect((await narrate(sharedPcRound('I look for someone who knows the docks.', 'I ask Dace Mirren about the cargo.'))).posted).toBe('card');
    // The joined lines named Dace alone, so the other player's NPC was bonded
    // to the hit's roller. Naming no one, the hit's line now settles nothing:
    // the round names two NPCs Kira met, and none is guessed.
    expect.soft(statuses(card), 'the rows after the round').toEqual({ 'Dace Mirren': 'pending', 'Orla Teague': 'pending' });
    expect.soft(severalNotices(), 'the GMs are told').toHaveLength(1);
    expect(bondsOf(kira), "Kira's bonds").toEqual([]);
  });

  it("control: a hit whose own line names both — none is guessed, and the GMs are told", async () => {
    const card = installPendingCard([DACE, ORLA]);
    script(NARRATION);
    expect((await narrate(sharedPcRound('I look for Orla Teague or Dace Mirren.', 'I check the cargo manifest.'))).posted).toBe('card');
    expect(statuses(card)).toEqual({ 'Dace Mirren': 'pending', 'Orla Teague': 'pending' });
    expect(bondsOf(kira)).toEqual([]);
    expect(severalNotices().length).toBeGreaterThan(0);
  });

  it("control: a hit whose own line names no one — the narration's only NPC is the connection", async () => {
    const card = installPendingCard([DACE, ORLA]);
    script('Kira finds Orla Teague mending nets by the airlock.');
    expect((await narrate(sharedPcRound('I look for someone who knows the docks.', 'I check the cargo manifest.'))).posted).toBe('card');
    expect(statuses(card)).toEqual({ 'Dace Mirren': 'pending', 'Orla Teague': 'confirmed' });
    expect(bondsOf(kira)).toEqual(['Orla Teague']);
  });
});
