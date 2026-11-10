/**
 * PROBE — R2M-5 ROUND-FIGURE-OWNER-DESCRIPTION-OUTRANKS-NARRATION (ATTRIBUTION)
 * Introduced by issue #342 Z09's fix (ROUND-CAPTURE-CREDITS-FIRST-ROLLER).
 *
 * A Batch Mode round's Make a Connection hits each create "the figure its own
 * character met" (narrator.js runRoundNarrationPasses ~1105). Who met a figure
 * is roundFigureOwner's ladder (narrator.js ~1170):
 *   1. the acting player whose own line names the figure;
 *   2. else the acting PC the figure's DETECTED DESCRIPTION names;
 *   3. else the acting PC the narration names beside it, clause by clause.
 * Rung 2 reads "a description that names a PC" as "that PC met them". A
 * detected description names a PC for any relation the prose gave the NPC —
 * "an old crewmate of Ren's", "the fixer who sold Ren his ship" — and rung 2
 * outranks the narration that says who actually found them. So when Kira's
 * hit meets Orla Teague, "who once crewed with Ren", and Ren's own hit meets
 * someone else, Orla is created as REN's connection — his connection seed, his
 * bond Item — and Kira's Make a Connection makes nothing; Ren's real contact
 * goes to the draft card. Rung 3 would have read the narration's "Kira finds
 * Orla Teague…" clause.
 *
 * Real producers: narrateRound (the round's narration and capture on the
 * canonical GM) → runRoundNarrationPasses → runDiscoveryDetection →
 * routeEntityDrafts (connectionRollers) → createConnection /
 * registerConnectionOnActiveCharacter. Claude scripted at api-proxy (the
 * narration and the detection reply). Harness copied from
 * tests/unit/roundConnectionBondHolder.test.js.
 */

/* global makeTestActor */
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
import { narrateRound } from '../../../src/narration/narrator.js';
import { invalidateActorCache } from '../../../src/character/actorBridge.js';

const MODULE_ID = 'starforged-companion';
const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';
const reply = (text) => ({ content: [{ type: 'text', text }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'end_turn' });

const NARRATION =
  'Kira finds Orla Teague mending nets by the airlock, and the two of them talk until the shift bell. '
  + 'Across the concourse, Ren shares a bottle with Dace Mirren, a courier who owes nobody.'
  + '\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const detection = (orlaDescription) => JSON.stringify({
  entities: [
    { name: 'Orla Teague', type: 'connection', description: orlaDescription },
    { name: 'Dace Mirren', type: 'connection', description: 'A courier who owes nobody.' },
  ],
  worldJournal: {},
  renames: [],
});

function script(narration, detectionReply) {
  apiPost.mockImplementation(async (_url, _headers, body) => {
    if (body?.model === NARRATION_MODEL) return reply(narration);
    const prompt = String(body?.messages?.[0]?.content ?? '');
    if (/entities/i.test(prompt) && /worldJournal|world journal/i.test(prompt)) return reply(detectionReply);
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

const ROUND = {
  id: 'round-7', number: 7, phase: 'narrating', acting: ['pl-1', 'pl-2'],
  entries: {
    'pl-1': { userId: 'pl-1', actorId: 'pc-kira', actorName: 'Kira', text: 'I look for someone who knows the docks.', rolled: { narrationInput: makeAConnection('res-k') } },
    'pl-2': { userId: 'pl-2', actorId: 'pc-ren',  actorName: 'Ren',  text: 'I buy the courier a drink and make a friend.', rolled: { narrationInput: makeAConnection('res-r') } },
  },
};

function installPc(id, name) {
  const pc = makeTestActor({ id, type: 'character', name, hasPlayerOwner: true });
  game.actors._set(id, pc);
  invalidateActorCache(id);
  return pc;
}
const bondsOf = (actor) => actor.items.contents
  .filter(i => i.type === 'progress' && i.system?.subtype === 'bond')
  .map(i => i.name);

let kira, ren;
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
  ren  = installPc('pc-ren', 'Ren');
});

const narrate = () => narrateRound({ round: structuredClone(ROUND), campaignState: structuredClone(game.settings.get(MODULE_ID, 'campaignState')) });

describe("R2M-5 — a round's figure goes to the PC its description mentions, over the narration that says who met them", () => {
  it('control: with descriptions that name no PC, each hit gets the figure the narration gives them', async () => {
    script(NARRATION, detection('A net-mender by the airlock.'));
    expect((await narrate()).posted).toBe('card');
    expect({ kira: bondsOf(kira), ren: bondsOf(ren) }).toEqual({ kira: ['Orla Teague'], ren: ['Dace Mirren'] });
  });

  it("Orla Teague, whom Kira found, is Kira's connection even though her description says she once crewed with Ren", async () => {
    script(NARRATION, detection('A net-mender by the airlock who once crewed with Ren.'));
    expect((await narrate()).posted).toBe('card');
    expect.soft(bondsOf(ren), "Ren's bonds").not.toContain('Orla Teague');
    expect({ kira: bondsOf(kira), ren: bondsOf(ren) }).toEqual({ kira: ['Orla Teague'], ren: ['Dace Mirren'] });
  });
});
