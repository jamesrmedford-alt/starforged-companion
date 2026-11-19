/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/batchRoundUpgradeStepKeptAtLoad.test.js
 *
 * Issue #364 ROUND-UPGRADE-STEP-RECOVERED-AT-LOAD (left open by
 * ROUND-UPGRADE-STEP-AT-SESSION-END).
 *
 * A Batch Mode round has rolled and recorded its moves and asks Kira's player
 * Burn / Improve / Keep — the upgrade step. Nobody ends the session: the table
 * goes quiet, and four idle hours later the session is over. Idle hours run
 * no advance pass, so the round still waits when the GM's game next loads —
 * and that load's recovery closed it as it closes a round whose resolving
 * page died mid-roll or mid-narration: `session-ended`, its moves never
 * narrated, nobody told. Only a pass on a page that stayed loaded applied the
 * Keep ROUND-UPGRADE-STEP-AT-SESSION-END added.
 *
 * Now the recovery leaves a round at its upgrade step to the advance pass, as
 * every other recovery does: Keep for everyone still deciding, then its one
 * narration — or, where the pass closes a round unnarrated (the X-Card), the
 * paused notice listing its results and the GMs told. The same when the GM
 * resolving it leaves. A round whose resolving page died while it was being
 * narrated is still closed unnarrated.
 *
 * Booted tables (tests/helpers/multiClient.js): the round through the real
 * relays; the idle hours as the session's aged activity stamp (nothing is
 * written when time passes); the load as the GM's page reloading.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (narration) => ({
    moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 'test',
    mischiefApplied: false, playerNarration: narration, inputMethod: 'chat',
  })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/entities/entityExtractor.js', async (importOriginal) => ({
  ...(await importOriginal()),
  runCombinedDetectionPass: vi.fn(async () => ({ worldJournal: [], entities: [], renames: [] })),
  appendGenerativeTierUpdates: vi.fn(async () => {}),
}));
vi.mock('../../src/moves/resolver.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    // challenge 4 and 8, action 3 (+edge 2 = 5): a weak hit a burn of 9 raises.
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.35).mockReturnValueOnce(0.75).mockReturnValueOnce(0.4);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-5-5';
const REPLY = 'Kira slips through the vent, scraped and late.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const HOUR = 3_600_000;
const ago = (ms) => new Date(Date.now() - ms).toISOString();

let table, claude;
const world = () => table.world.campaignState();
const round = () => table.world.getSetting('batchMode.round');
const roundNarrations = () => table.cards(f => f.roundId && f.narratorCard);
const roundCalls = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL && /THIS ROUND/.test(c.userText ?? ''));
const kirasCard = () => table.cards(f => f.moveResolution && f.actorId === 'pc-kira').at(-1);

/** A session minted six hours ago and begun; the round's own submission keeps it in play. */
async function seat({ keys = { 'gm-1': 'sk-ant-gina' } } = {}) {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false, autoRecapEnabled: false,
    combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, sessionStartedId: 'sess-1', currentSessionId: 'sess-1', sessionNumber: 1,
      lastSessionTimestamp: ago(6 * HOUR), currentSceneId: 'sc-1', sceneTruths: [] },
    sessionActivity: { sessionId: 'sess-1', at: ago(HOUR) },
  } } });
  for (const [id, key] of Object.entries(keys)) await table.setClaudeKey(id, key);
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [] } });
  table.actors.get('pc-kira').system.momentum.value = 9;
  claude = scriptClaude(table, { fallback: () => REPLY });
  silenceConsoleErrors();
  await table.client('gm-1').setSetting('batchMode.enabled', true);
  await table.settle();
}

async function relay(userId, kind, payload) {
  const c = table.client(userId);
  const gmRelay = await c.import('../../src/multiplayer/gmRelay.js');
  const res = await c.run(() => gmRelay.requestGmAction(kind, payload));
  await table.settle();
  return res;
}

/** Kira's weak hit is rolled and recorded; the round asks her player Burn / Keep. */
async function weakHitWaitingForKira() {
  await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I slip through the vent before the drones turn.', submissionId: 'k1' });
  await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'k1', choices: {} });
  await relay('pl-2', 'batch.pass', { roundId: round().id });
  await table.drain();
  expect(round(), 'setup: the round waits at its upgrade step').toMatchObject({ number: 1, phase: 'upgrading', resolverId: 'gm-1' });
  expect(round().entries['pl-1'].upgrade, 'setup: Kira has not decided').toMatchObject({ burn: { previewOutcome: 'strong_hit' }, decided: null });
  expect(roundCalls(), 'setup: nothing narrated yet').toHaveLength(0);
}

/**
 * Four idle hours: nothing said since five hours ago. Time passing writes
 * nothing and runs no pass — the stamp is aged in the store, no hook fired.
 */
function fourIdleHoursPass() {
  table.world.setSetting('sessionActivity', { sessionId: 'sess-1', at: ago(5 * HOUR) });
}

/** The GM's game loads again: a fresh page, its `ready` — the mint, then the round driver's recovery. */
async function gmLoadsAgain() {
  await table.reload('gm-1');
  await table.settle();
  await table.drain();
}

describe('issue #364 ROUND-UPGRADE-STEP-RECOVERED-AT-LOAD — the GM\'s game loads with a round still at its upgrade step, its session over', () => {
  beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
  afterAll(() => table?.teardown());
  beforeEach(() => seat());

  it('keeps the result for everyone still deciding and narrates the round once — it was closed unnarrated', async () => {
    await weakHitWaitingForKira();
    const roundId = round().id;
    fourIdleHoursPass();
    await gmLoadsAgain();

    expect(world().currentSessionId, 'the load minted the next session').not.toBe('sess-1');
    expect(round()).toMatchObject({ id: roundId, phase: 'closed', closeReason: 'resolved' });
    expect(round().entries['pl-1'].upgrade).toMatchObject({ decided: 'keep' });
    expect(roundCalls()).toHaveLength(1);
    expect(roundNarrations()).toHaveLength(1);
    expect(roundNarrations()[0].flags[MODULE_ID].sessionId, 'told as its own session\'s, not the one the load minted').toBe('sess-1');
    // The rolled result stands: nothing was burned, and the card's Burn is closed.
    expect(table.actors.get('pc-kira').system.momentum.value).toBe(9);
    expect(kirasCard().flags[MODULE_ID].burn).toMatchObject({ roundClosed: true });
    expect(kirasCard().flags[MODULE_ID].burn.consumed ?? false).toBe(false);
    // The pass let go of the move lock, and opened no round into a session nobody has begun.
    expect(world().pendingMove).toBe(false);
    expect(round().id, 'no round opened after it').toBe(roundId);
  }, 60_000);

  it('a Keep pressed afterwards, and a second load, narrate nothing more', async () => {
    await weakHitWaitingForKira();
    const roundId = round().id;
    fourIdleHoursPass();
    await gmLoadsAgain();
    await relay('pl-1', 'batch.keep', { roundId });
    await gmLoadsAgain();
    expect(roundCalls()).toHaveLength(1);
    expect(roundNarrations()).toHaveLength(1);
    expect(round()).toMatchObject({ id: roundId, phase: 'closed', closeReason: 'resolved' });
  }, 60_000);

  it('under the X-Card it is closed as the pass closes one: its results listed, nothing narrated, the GMs told', async () => {
    await weakHitWaitingForKira();
    await table.client('gm-1').setSetting('campaignState', { ...world(), xCardActive: true, xCardPlays: 1 });
    await table.settle();
    expect(round(), 'setup: still waiting for Kira, under the X-Card').toMatchObject({ phase: 'upgrading' });
    fourIdleHoursPass();
    await gmLoadsAgain();

    expect(round()).toMatchObject({ phase: 'closed' });
    expect(round().entries['pl-1'].upgrade).toMatchObject({ decided: 'keep' });
    expect(roundCalls(), 'nothing is narrated under the X-Card').toHaveLength(0);
    const paused = table.cards(f => f.roundId && f.narrationPaused);
    expect(paused).toHaveLength(1);
    expect(paused[0].content).toMatch(/Kira — Face Danger: Weak Hit/);
    expect(table.cards(f => f.batchRoundUnnarratedNotice)).toHaveLength(1);
  }, 60_000);

  it('control: a load inside the session leaves the round waiting for Kira', async () => {
    await weakHitWaitingForKira();
    await gmLoadsAgain();
    expect(world().currentSessionId).toBe('sess-1');
    expect(round()).toMatchObject({ phase: 'upgrading' });
    expect(round().entries['pl-1'].upgrade).toMatchObject({ decided: null });
    expect(roundCalls()).toHaveLength(0);
  }, 60_000);

  it('control: a round whose resolving page died while it was narrated is still closed unnarrated at the load', async () => {
    await weakHitWaitingForKira();
    // Kira keeps; the narration is held at its Claude call — the round is being narrated.
    const held = claude.hold(c => c.model === NARRATION_MODEL);
    await relay('pl-1', 'batch.keep', { roundId: round().id });
    await held.arrived;
    await table.settle();
    expect(round(), 'setup: the round is being narrated').toMatchObject({ phase: 'narrating' });
    try {
      fourIdleHoursPass();
      await gmLoadsAgain();
      expect(round()).toMatchObject({ phase: 'closed', closeReason: 'session-ended' });
      expect(roundNarrations()).toHaveLength(0);
    } finally {
      held.release();
      await table.settle(); await table.drain();
    }
    expect(roundNarrations(), 'the dead page\'s narration is not posted').toHaveLength(0);
  }, 60_000);
});

describe('issue #364 ROUND-UPGRADE-STEP-RECOVERED-AT-LOAD — the GM resolving it leaves, its session over', () => {
  beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.GM2, USERS.P1, USERS.P2] }); }, 30_000);
  afterAll(() => table?.teardown());
  // Both GMs hold a key: Gina (gm-1) is canonical and resolves; Gus (gm-2) takes over when she leaves.
  beforeEach(() => seat({ keys: { 'gm-1': 'sk-ant-gina', 'gm-2': 'sk-ant-gus' } }));

  it('the GM who becomes canonical keeps for Kira and narrates the round', async () => {
    await weakHitWaitingForKira();
    const roundId = round().id;
    fourIdleHoursPass();
    await table.leave('gm-1');                                          // recoverRound("resolver-left") on Gus
    await table.settle(); await table.drain();

    expect(round()).toMatchObject({ id: roundId, phase: 'closed', closeReason: 'resolved' });
    expect(round().entries['pl-1'].upgrade).toMatchObject({ decided: 'keep' });
    expect(roundCalls().map(c => c.client)).toEqual(['gm-2']);
    expect(roundNarrations()).toHaveLength(1);
  }, 60_000);

  it('control: while the session lasts, the GM who takes over goes on waiting for Kira', async () => {
    await weakHitWaitingForKira();
    await table.leave('gm-1');
    await table.settle(); await table.drain();
    expect(round()).toMatchObject({ phase: 'upgrading', resolverId: 'gm-2' });
    expect(round().entries['pl-1'].upgrade).toMatchObject({ decided: null });
    expect(roundCalls()).toHaveLength(0);
  }, 60_000);
});
