/**
 * STARFORGED COMPANION
 * tests/unit/sceneStartSerialised.test.js
 *
 * Issue #335 Y05 (CONCURRENT-SCENE-MINT) — scene starts run one at a time on
 * the canonical GM, and a start waits for the one in flight before it looks
 * for the store's scene, so it continues that scene instead of minting a
 * second one ("A scene is never minted over a live one", rules/narrator-
 * memory.md 6). Two narrations one command fires each narrate on their own
 * working copy (issue #329 X09); with no scene open both read the store inside
 * the first start's write round trip, each minted a scene, and the narration
 * on the losing scene had its facts dropped as "the scene changed meanwhile".
 *
 *   - startScene itself: a second start while the first one's write is in
 *     flight adopts its scene; the wait is bounded, so a start whose write
 *     never settles holds the next one for SCENE_START_WAIT_MS at most.
 *   - `!pay-the-price` filling a tension clock with no scene open: its trigger
 *     vignette and the oracle follow-up — the follow-up narrates after the
 *     vignette, in its scene, and both beats are recorded.
 *
 * (Begin a Session's clock and galley vignettes: beginSessionOneScene.test.js.)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

// The `!ptp` roll lands on a narrative row (no routed suffer move).
vi.mock('../../src/oracles/roller.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    rollOracle: vi.fn((id, opts = {}) => original.rollOracle(id, id === 'pay_the_price' ? { ...opts, roll: 6 } : opts)),
  };
});

import { startScene } from '../../src/factContinuity/sceneLifecycle.js';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { scriptClaude, deferred } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;

describe('issue #335 Y05 — startScene runs one start at a time', () => {
  const stored = () => game.settings.get(MODULE_ID, 'campaignState');
  const sceneless = () => ({
    currentSessionId: 's-1', sessionNumber: 1,
    currentSceneId: null, sceneTruths: [], sceneState: { bySubject: {}, sceneId: null }, sceneFrame: null,
  });
  let realSet;
  beforeEach(() => {
    game.settings._store.set(KEY, sceneless());
    realSet = game.settings.set;
  });
  afterEach(() => {
    game.settings.set = realSet;
    game.settings._store.delete(KEY);
    vi.useRealTimers();
  });

  /** Hold the first `n` campaignState writes until `gate` resolves; record each write's scene id. */
  function holdFirstWrites(gate, n = 1) {
    const sent = [];
    game.settings.set = async (mod, key, value) => {
      if (key === 'campaignState') {
        sent.push(value?.currentSceneId ?? null);
        if (sent.length <= n) await gate;
      }
      return realSet.call(game.settings, mod, key, value);
    };
    return sent;
  }

  it("a second start while the first one's write is in flight continues the scene the first opened", async () => {
    const gate = deferred();
    const sent = holdFirstWrites(gate.promise);
    const clockCopy  = foundry.utils.deepClone(stored());
    const galleyCopy = foundry.utils.deepClone(stored());

    const first  = startScene(clockCopy,  { reason: 'clock_vignette' });
    const second = startScene(galleyCopy, { reason: 'session_vignette' });
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(sent).toHaveLength(1);                    // the second waits: it has minted nothing

    gate.resolve();
    const [a, b] = await Promise.all([first, second]);
    expect(b).toBe(a);                               // it adopted the first start's scene
    expect(galleyCopy.currentSceneId).toBe(a);
    expect(sent).toEqual([a]);                       // one scene-start write for both
    expect(stored().currentSceneId).toBe(a);
  });

  it('control: two starts one after the other — the second continues the first scene', async () => {
    const a = await startScene(foundry.utils.deepClone(stored()), { reason: 'first' });
    const b = await startScene(foundry.utils.deepClone(sceneless()), { reason: 'second' });
    expect(b).toBe(a);
  });

  it('the wait is bounded: a start whose write never settles holds the next one for 10 s at most', async () => {
    vi.useFakeTimers();
    const sent = holdFirstWrites(new Promise(() => {}));   // the first write never settles
    const warn = vi.spyOn(console, 'warn');

    void startScene(foundry.utils.deepClone(stored()), { reason: 'hung' });
    const second = startScene(foundry.utils.deepClone(stored()), { reason: 'next' });
    await vi.advanceTimersByTimeAsync(9_000);
    expect(sent).toHaveLength(1);                    // still waiting
    await vi.advanceTimersByTimeAsync(1_500);
    const id = await second;                         // went ahead: the store never had the hung scene
    expect(id).toMatch(/^sc-/);
    expect(sent).toHaveLength(2);
    expect(warn.mock.calls.some(c => /still running after 10000ms/.test(String(c[0])))).toBe(true);

    // A third start waits for the second (done), not the hung first.
    const third = await startScene(foundry.utils.deepClone(sceneless()), { reason: 'third' });
    expect(third).toBe(id);
  });
});

describe('issue #335 Y05 — `!pay-the-price` filling a tension clock: one scene for the vignette and the follow-up', () => {
  const NARRATION_MODEL = 'claude-sonnet-5-5';
  const VIGNETTE_FACT = 'The reactor shielding has failed';
  const FOLLOWUP_FACT = 'The coolant lines are frosting over';
  const VIGNETTE = 'Klaxons scream as the shielding gives way.\n```json\n' + JSON.stringify({
    newTruths: [{ subject: 'the reactor', fact: VIGNETTE_FACT }],
    stateChanges: [{ subject: 'the reactor', attribute: 'condition', value: 'venting' }],
    sceneFrame: { location: 'the engine room', present: ['Kira'], situation: 'The breach' },
  }) + '\n```';
  const FOLLOWUP = 'Frost blooms along the pipes.\n```json\n' + JSON.stringify({
    newTruths: [{ subject: 'the coolant lines', fact: FOLLOWUP_FACT }], stateChanges: [],
    sceneFrame: { location: 'the engine room', present: ['Kira'], situation: 'Signs of a looming threat' },
  }) + '\n```';
  const isVignette = (call) => /The clock "/.test(call.userText);

  let table;
  const world = () => table.world.campaignState();
  beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
  afterAll(() => table?.teardown());
  beforeEach(async () => {
    await table.reset({ world: { settings: {
      chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false,
      campaignState: {
        ...CampaignStateSchema, sessionActive: true, sessionStartedId: 'sess-1', currentSessionId: 'sess-1', sessionNumber: 1,
        currentSceneId: null, sceneTruths: [], sceneState: { bySubject: {}, sceneId: null }, sceneFrame: null,
        clocks: [{ _id: 'ck-breach', name: 'Reactor breach', type: 'tension', segments: 4, filled: 3, active: true, createdAt: new Date().toISOString() }],
      },
    } } });
    await table.setClaudeKey('gm-1', 'sk-ant-gina');
    table.addActor({ id: 'pc-kira', name: 'Kira', type: 'character', ownership: { 'pl-1': 3 } });
  });

  it("a player's !ptp: the follow-up narrates after the trigger vignette, in its scene, and both beats are recorded", async () => {
    const claude = scriptClaude(table, { fallback: (call) => (call.model !== NARRATION_MODEL ? '{}' : isVignette(call) ? VIGNETTE : FOLLOWUP) });
    const vignetteCall = claude.hold(call => call.model === NARRATION_MODEL && isVignette(call));

    await table.client('pl-1').chat('!ptp', { speaker: { actor: 'pc-kira' } });
    await vignetteCall.arrived;
    await table.settle();
    // The trigger vignette is in flight: the follow-up has asked for nothing yet.
    expect(table.claude.calls.filter(c => c.model === NARRATION_MODEL && !isVignette(c))).toHaveLength(0);

    vignetteCall.release(VIGNETTE);
    await table.settle(); await table.drain();

    expect(table.cards(f => f.clockVignetteCard)).toHaveLength(1);
    expect(table.cards(f => f.oracleNarrationCard)).toHaveLength(1);
    expect(world().currentSceneId).toMatch(/^sc-/);
    expect(world().sceneTruths.map(t => t.fact).sort()).toEqual([FOLLOWUP_FACT, VIGNETTE_FACT].sort());
    expect(new Set(world().sceneTruths.map(t => t.sceneId))).toEqual(new Set([world().currentSceneId]));
    // The follow-up read its copy after the vignette's beat: the reactor's state stands.
    expect(Object.keys(world().sceneState.bySubject)).toContain('the reactor');
  }, 30_000);
});
