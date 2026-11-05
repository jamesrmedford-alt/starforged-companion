/**
 * STARFORGED COMPANION
 * tests/unit/rollForceSpentByRunningLine.test.js
 *
 * Issue #331 X37 (ROLL-FORCE-CONSUMED-BY-REFUSED-LINE). The GM types `!roll`;
 * the next line arrives while another move holds the `pendingMove` lock.
 * routePacedInput saw the force, cleared it on the store and returned
 * `runMove: true`; only then did the pipeline refuse the line ("A move is
 * already being resolved"). The line was dropped and the `!roll` spent: the
 * retyped line went back through the classifier. The no-character refusal
 * (issue #326 D8) spent it the same way. The router now leaves the force and
 * the pipeline spends it once the line holds the lock.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [0.25, 0.35, 0.9] }));
vi.mock('../../src/moves/interpreter.js', async (orig) => ({
  ...(await orig()), interpretMove: vi.fn(async (text) => ({
    moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'iron', adds: 0, rationale: 'test',
    mischiefApplied: false, playerNarration: text, inputMethod: 'chat',
  })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (orig) => ({
  ...(await orig()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (orig) => ({
  ...(await orig()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../src/moves/resolver.js', async (orig) => {
  const real = await orig();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, 'random');
    for (const d of control.dice) rng.mockReturnValueOnce(d);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

let table;
const world = () => table.world.campaignState();
const forced = () => world().pacing?.forceNextAsMove === true;
// The pacing classifier's own call (its system prompt names it); the
// post-narration detection passes use Haiku too, so the model is no key.
const classifierCalls = () => table.claude.calls.filter(c => /pacing pre-classifier/i.test(c.system ?? ''));

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

async function reset({ moveInFlight }) {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'rf-s1', sessionNumber: 1,
      lastSessionTimestamp: new Date().toISOString(), currentSceneId: 'rf-scene', sceneTruths: [], clocks: [],
      pendingMove: moveInFlight, pendingMoveBy: moveInFlight ? 'gm-1' : null },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  scriptClaude(table, { fallback: () => 'Steel rings.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
}

async function type(userId, text, speaker = null) {
  await table.client(userId).chat(text, speaker ? { speaker } : {});
  await table.settle(); await table.drain();
}

describe('X37 — `!roll` is spent only by a line the pipeline runs', () => {
  it('a line typed while another move holds the lock is refused — and the !roll force stays for the next', async () => {
    await reset({ moveInFlight: true });
    await type('gm-1', '!roll');
    expect(forced()).toBe(true);                         // the GM's !roll landed

    await type('pl-1', 'Kira forces the hatch and dives through.', { actor: 'pc-kira' });
    expect(table.client('gm-1').notifications.some(n => /already being resolved/.test(n.message))).toBe(true);   // refused
    expect(table.cards(f => f.moveResolution)).toHaveLength(0);
    // The force was cleared by the router before the lock refused the line.
    expect(forced()).toBe(true);
  }, 30_000);

  it('a player with no character at a two-PC table is refused, and the force stays', async () => {
    await reset({ moveInFlight: false });
    // Two PCs, neither the player's: they have no character of their own.
    table.actors.get('pc-kira').ownership = { 'gm-1': 3 };
    table.addActor({ id: 'pc-ren', name: 'Ren', ownership: { 'gm-1': 3 } });
    await type('gm-1', '!roll');
    expect(forced()).toBe(true);
    await type('pl-1', 'I force the hatch.');                // no speaker of their own
    expect(table.cards(f => f.moveResolution)).toHaveLength(0);
    expect(forced()).toBe(true);
  }, 30_000);

  it('control: with no move in flight, !roll + a line runs the move with no classifier call and consumes the force', async () => {
    await reset({ moveInFlight: false });
    await type('gm-1', '!roll');
    expect(forced()).toBe(true);

    await type('pl-1', 'Kira forces the hatch and dives through.', { actor: 'pc-kira' });
    expect(classifierCalls()).toHaveLength(0);
    expect(table.cards(f => f.moveResolution)).toHaveLength(1);
    expect(forced()).toBe(false);
  }, 30_000);
});
