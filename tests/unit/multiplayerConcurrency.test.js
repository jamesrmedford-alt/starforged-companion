/**
 * STARFORGED COMPANION
 * tests/unit/multiplayerConcurrency.test.js
 *
 * Concurrency (issue #282 item 3), on a booted multi-client table
 * (tests/helpers/multiClient.js).
 *
 * STALE-SNAPSHOT-CLOBBER: the move pipeline reads campaignState before its
 * confirm dialog and its Claude calls — seconds to minutes — and used to write
 * that snapshot back whole, reverting everything the GM relay applied in the
 * meantime: a player's X-Card played mid-narration (the card said "paused";
 * the narrator kept going), a Take a Break, a flag, `!bond` ticks, a `!truth`
 * correction. decisions.md → "Long-running pipeline writes merge relay-owned
 * fields".
 *
 * Here a player's narration starts the canonical GM's real pipeline, which is
 * held at a pause point (the confirm dialog, or the narration's Claude call)
 * by a deferred promise the test owns. Other players act during the pause,
 * through their own clients and the real relay; then the pipeline is
 * released, and every relayed write must have survived persistResolution.
 *
 * The GM relay queue: relayed actions run one at a time on the canonical GM
 * (a slow handler — an oracle follow-up's Claude call — holds the next one),
 * the X-Card skips the queue, and a handler that never settles is released
 * after GM_ACTION_TIMEOUT_MS so later relays still run.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

// The pipeline: Face Danger +iron, no pacing call, the confirm dialog held by
// the test when `control.confirm` is set, and three scripted dice inside the
// REAL resolveMove — challenge 3 and 4, action 6 (+iron 3 = 9): a strong hit.
const control = vi.hoisted(() => ({ confirm: null }));
vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => ({
    moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'iron', adds: 0, rationale: 'test', mischiefApplied: false,
  })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(() => (control.confirm ? control.confirm.promise : Promise.resolve(true))),
}));
vi.mock('../../src/moves/resolver.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0.25)   // challenge die 3
        .mockReturnValueOnce(0.35)   // challenge die 4
        .mockReturnValueOnce(0.9);   // action die 6
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { GM_ACTION_TIMEOUT_MS } from '../../src/multiplayer/gmRelay.js';

const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';   // narrationModel default
const DEFAULT_REPLY = 'The hull groans and holds.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

let table;
const world = () => table.world.campaignState();

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.confirm = null;
  await table.reset({ world: { settings: { campaignState: {
    ...CampaignStateSchema,
    sessionActive: true, currentSessionId: 'sess-1', currentSceneId: 'sc-1', sceneTruths: [],
    legacyTracks: { bonds: { ticks: 4, cleared: false } },
  } } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-pat',   name: 'Kira', ownership: { 'pl-1': 3 } });
  table.addActor({ id: 'pc-quinn', name: 'Ren',  ownership: { 'pl-2': 3 } });
});

/** Pat (pl-1) narrates; the canonical GM's pipeline starts and reaches its pause point. */
async function startMove() {
  await table.client('pl-1').chat('I brace against the hull and push through the breach.', { speaker: { actor: 'pc-pat' } });
  await table.settle();
}

/** Hold the move narration's Claude call until the returned deferred resolves. */
function holdNarration() {
  const held = deferred();
  let taken = false;
  table.claude.respond((call) => {
    if (!taken && call.client === 'gm-1' && call.model === NARRATION_MODEL) {
      taken = true;
      return held.promise.then(() => DEFAULT_REPLY);
    }
    return DEFAULT_REPLY;
  });
  return held;
}

/** `!bond dangerous` on a player's client with a scripted strong hit (+2 bonds ticks). */
async function bondStrongHit(userId) {
  const dice = vi.spyOn(Math, 'random')
    .mockReturnValueOnce(0.9)    // action die 6 (+2 dangerous = 8)
    .mockReturnValueOnce(0.25)   // challenge die 3
    .mockReturnValueOnce(0.35);  // challenge die 4
  try {
    await table.client(userId).chat('!bond dangerous');
    await table.settle();
  } finally {
    dice.mockRestore();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Writes relayed while the move pipeline holds its snapshot
// ─────────────────────────────────────────────────────────────────────────────

describe('a relayed write that lands while the GM\'s move pipeline is paused survives its persist', () => {
  it('paused at the confirm dialog: a player\'s X-Card silences the narration and survives the persist', async () => {
    control.confirm = deferred();
    await startMove();
    expect(world().pendingMove).toBe(true);   // the pipeline holds the lock and its snapshot

    await table.client('pl-2').chat('!x');
    await table.settle();
    expect(world().xCardActive).toBe(true);

    control.confirm.resolve(true);
    await table.settle();

    expect(table.cards(f => f.moveResolution)).toHaveLength(1);
    expect(table.cards(f => f.narrationPaused)).toHaveLength(1);
    expect(table.cards(f => f.narratorCard)).toEqual([]);
    expect(table.claude.calls.filter(c => c.model === NARRATION_MODEL)).toEqual([]);
    expect(world().xCardActive).toBe(true);
    expect(world().pendingMove).toBe(false);
  });

  it('paused at the narration: a Take a Break, a flag, !bond ticks, a !truth and an X-Card all survive the persist', async () => {
    const narration = holdNarration();
    await startMove();
    expect(table.claude.calls.some(c => c.model === NARRATION_MODEL)).toBe(true);   // the call is in flight
    expect(world().pendingMove).toBe(true);

    // Every other player acts meanwhile, each on their own client.
    table.client('pl-2').answerDialogs(d => (d.title === 'Take a Break'
      ? d.choose('move_on')
      : d.submit({ 'textarea[name="text"]': 'spiders', 'select[name="visibility"]': 'public' })));
    await table.client('pl-2').chat('!break');
    await table.settle();
    await table.client('pl-2').chat('!flag');
    await table.settle();
    await bondStrongHit('pl-1');
    await table.client('pl-2').chat('!truth set hatch Sealed from the inside');
    await table.settle();
    await table.client('pl-1').chat('!x');
    await table.settle();

    const mid = world();
    expect(mid.nextMoveAdd).toMatchObject({ value: 1 });
    expect(mid.safetyFlags).toHaveLength(1);
    expect(mid.legacyTracks.bonds.ticks).toBe(6);
    expect(mid.sceneTruths.map(t => t.fact)).toContain('Sealed from the inside');
    expect(mid.xCardActive).toBe(true);

    narration.resolve();
    await table.settle();

    const after = world();
    expect(after.pendingMove).toBe(false);                                     // the pipeline finished…
    expect(table.cards(f => f.moveResolution)).toHaveLength(1);
    expect(after.nextMoveAdd).toMatchObject({ value: 1, source: 'take_a_break' });   // …and reverted none of it
    expect(after.safetyFlags).toMatchObject([{ text: 'spiders', createdBy: 'Quinn' }]);
    expect(after.legacyTracks.bonds.ticks).toBe(6);
    expect(after.sceneTruths.map(t => t.fact)).toContain('Sealed from the inside');
    expect(after.xCardActive).toBe(true);
  });

  it('the pipeline still persists its own work around the relayed writes', async () => {
    const narration = holdNarration();
    await startMove();
    await table.client('pl-2').chat('!truth set hatch Sealed from the inside');
    await table.settle();
    narration.resolve();
    await table.settle();

    const after = world();
    expect(after.sceneTruths.map(t => t.fact)).toContain('Sealed from the inside');
    const log = Object.values(after.sessionLogs ?? {}).flat();
    expect(log.some(e => e?.moveId === 'face_danger')).toBe(true);
    expect(table.cards(f => f.narratorCard).map(c => c.author)).toEqual(['gm-1']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The GM relay queue
// ─────────────────────────────────────────────────────────────────────────────

describe('the GM relay queue', () => {
  /** Hold the oracle follow-up narration (a relayed oracle.narrate handler) on the GM. */
  function holdOracleNarration() {
    const held = deferred();
    table.claude.respond((call) => (call.client === 'gm-1' ? held.promise.then(() => DEFAULT_REPLY) : DEFAULT_REPLY));
    return held;
  }

  afterEach(() => { vi.useRealTimers(); });

  it('runs relayed actions one at a time — a flag waits for the oracle follow-up ahead of it — but the X-Card skips the line', async () => {
    const held = holdOracleNarration();
    await table.client('pl-1').chat('!oracle yes likely is the hatch sealed');   // relays oracle.narrate to the keyed GM
    await table.settle();
    expect(table.claude.calls.map(c => c.client)).toEqual(['gm-1']);

    table.client('pl-2').answerDialogs(d => d.submit({ 'textarea[name="text"]': 'spiders' }));
    await table.client('pl-2').chat('!flag');
    await table.settle();
    expect(world().safetyFlags).toBeUndefined();   // queued behind the follow-up

    await table.client('pl-2').chat('!x');
    await table.settle();
    expect(world().xCardActive).toBe(true);         // not queued

    held.resolve();
    await table.settle();
    expect(table.cards(f => f.oracleNarrationCard)).toHaveLength(1);
    expect(world().safetyFlags).toMatchObject([{ text: 'spiders' }]);
  });

  it('a handler that never settles is released after GM_ACTION_TIMEOUT_MS, with a warning — later relays still run', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const held = holdOracleNarration();
    try {
      await table.client('pl-1').chat('!oracle yes is anyone aboard');
      await table.settle();
      // requestOracleNarration relays from a setTimeout(0): fire it (on pl-1).
      await vi.advanceTimersByTimeAsync(0);
      await table.settle();
      expect(table.claude.calls.map(c => c.client)).toEqual(['gm-1']);   // the follow-up is stuck on the GM
      table.client('pl-2').answerDialogs(d => d.submit({ 'textarea[name="text"]': 'drowning' }));
      await table.client('pl-2').chat('!flag');
      await table.settle();
      expect(world().safetyFlags).toBeUndefined();

      await vi.advanceTimersByTimeAsync(GM_ACTION_TIMEOUT_MS - 1);
      await table.settle();
      expect(world().safetyFlags).toBeUndefined();

      await vi.advanceTimersByTimeAsync(2);
      await table.settle();
      expect(world().safetyFlags).toMatchObject([{ text: 'drowning' }]);
      expect(getCapturedWarns().some(w => /still running after 60000ms — running "safety.setFlag" anyway/.test(w))).toBe(true);
    } finally {
      held.resolve();   // let the stuck follow-up finish so the GM's queue is idle for the next test
      vi.useRealTimers();
      await table.settle();
    }
  });
});
