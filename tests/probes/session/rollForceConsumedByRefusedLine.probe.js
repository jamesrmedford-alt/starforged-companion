/**
 * PROBE — SESSION-04 ROLL-FORCE-CONSUMED-BY-REFUSED-LINE (ninth audit, area session)
 *
 * What the user does: the classifier sent a player's line to narration; the
 * GM types `!roll` ("the next undecorated chat input will route to the move
 * interpreter") and the player retypes their line — while another move is
 * still being narrated (the pendingMove lock is held).
 *
 * What happens: `routePacedInput` (src/pacing/router.js:173-176) sees
 * `pacing.forceNextAsMove`, CLEARS it on the store (`clearForceMove`) and
 * returns `runMove: true`; only then does the pipeline check the lock
 * (src/index.js:878-892) and refuse the line — "A move is already being
 * resolved" (on the GM's screen; MOVE-BUSY-NOTICE). The line is dropped AND
 * the `!roll` is spent: the next line — anyone's — goes back through the
 * classifier, which may send it to narration again. The same consumption
 * happens on the D8 no-character refusal (src/index.js:869-873).
 *
 * What should happen: `!roll` forces the next line the move interpreter
 * actually takes — a line the pipeline refuses does not use it up: the force
 * is consumed where the lock is claimed (or the router leaves it set when the
 * caller does not run the move).
 *
 * Control: with no move in flight, `!roll` + a line runs the move without a
 * classifier call and consumes the force (today: passes).
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/session/rollForceConsumedByRefusedLine.probe.js
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [0.25, 0.35, 0.9] }));
vi.mock('../../../src/moves/interpreter.js', async (orig) => ({
  ...(await orig()), interpretMove: vi.fn(async (text) => ({
    moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'iron', adds: 0, rationale: 'test',
    mischiefApplied: false, playerNarration: text, inputMethod: 'chat',
  })),
}));
vi.mock('../../../src/moves/abilityScanner.js', async (orig) => ({
  ...(await orig()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (orig) => ({
  ...(await orig()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../../src/moves/resolver.js', async (orig) => {
  const real = await orig();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, 'random');
    for (const d of control.dice) rng.mockReturnValueOnce(d);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

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

describe('SESSION-04 `!roll` is spent by a line the pipeline then refuses', () => {
  it('a line typed while another move holds the lock is refused — and the !roll force is gone with it', async () => {
    await reset({ moveInFlight: true });
    await type('gm-1', '!roll');
    expect(forced()).toBe(true);                         // the GM's !roll landed

    await type('pl-1', 'Kira forces the hatch and dives through.', { actor: 'pc-kira' });
    expect(table.client('gm-1').notifications.some(n => /already being resolved/.test(n.message))).toBe(true);   // refused
    expect(table.cards(f => f.moveResolution)).toHaveLength(0);
    // FAILS today: the force was cleared by the router before the lock refused the line.
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
