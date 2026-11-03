/**
 * PROBE — IP-06 PIPELINE-FIRST-PC-FALLBACK (eighth audit, area index-pipeline)
 *
 * What the user does: at a table with two or more player characters, a
 * player who owns no PC of their own (a new player whose character is not
 * assigned yet, an observer seat) types narration in the chat.
 *
 * What happens: resolveSpeakerActorId (multiplayer/speaker.js) correctly
 * returns null for them — issue #321 U23's rule: "a player with no PC of
 * their own is never handed another player's character". The move pipeline
 * (src/index.js registerChatHook) then falls back anyway:
 * `rollerActor = speakerActor ?? getPlayerActors()[0]`, and persistResolution
 * does the same (`getActor(speakerActorId) ?? getPlayerActors()[0]`). The
 * move is rolled with the first PC's stats, its meters (here +1 momentum)
 * land on that PC — another player's character — and the move card names
 * that PC as its roller (`actorId`, which then owns the Burn / Improve and
 * waypoint buttons).
 *
 * What should happen: the first-PC fallback is resolveUserActorId's — only
 * for a GM author or a one-PC world. A PC-less player's narration is not
 * rolled for someone else's character: the author is told they have no
 * character to roll for (or the move is not run), and no PC is changed.
 *
 * The control: the PC's own player rolling the same move is credited.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../../src/pacing/router.js', async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (original) => ({
  ...(await original()),
  interpretMove: vi.fn(async (text) => ({ moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0,
    rationale: 'test', mischiefApplied: false, playerNarration: text, inputMethod: 'chat' })),
}));
vi.mock('../../../src/moves/abilityScanner.js', async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../../src/moves/resolver.js', async (original) => {
  const real = await original();
  // Challenge 2 and 3; action 6 + edge: a strong hit (+1 momentum).
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, 'random').mockReturnValueOnce(0.15).mockReturnValueOnce(0.25).mockReturnValueOnce(0.99);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

let table;
let kira;

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 's-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  // Two PCs: Kira is Pat's (pl-1); Ren belongs to a player not at the table.
  // Quinn (pl-2) owns no PC.
  kira = table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, system: { momentum: { value: 2, max: 10, min: -6, resetValue: 2 } } });
  table.addActor({ id: 'pc-ren', name: 'Ren', ownership: { 'pl-absent': 3 } });
  scriptClaude(table, { fallback: () => 'The crowd parts.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
});

describe('IP-06 a player with no PC of their own is not handed another player\'s character', () => {
  it('Quinn (no PC) types a move: it is not rolled for Kira, and Kira is not changed', async () => {
    await table.client('pl-2').chat('I slip through the crowd before the patrol spots me.');
    await table.settle(); await table.drain();

    const cards = table.cards(f => f.moveResolution);
    expect.soft(cards.map(c => c.flags[MODULE_ID].actorId)).not.toContain('pc-kira');   // actual: ["pc-kira"] — Kira is the roller
    expect.soft(kira.system.momentum.value).toBe(2);                                    // actual: 3 — Kira takes Quinn's +1
  }, 30_000);

  it('control: Pat (Kira\'s player) types the same move and Kira is credited', async () => {
    await table.client('pl-1').chat('I slip through the crowd before the patrol spots me.');
    await table.settle(); await table.drain();

    expect(table.cards(f => f.moveResolution)[0].flags[MODULE_ID].actorId).toBe('pc-kira');
    expect(kira.system.momentum.value).toBe(3);
  }, 30_000);
});
