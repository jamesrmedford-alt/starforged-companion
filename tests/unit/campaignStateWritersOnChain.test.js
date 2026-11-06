/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/campaignStateWritersOnChain.test.js
 *
 * CAMPSTATE-CHAIN-PARTIAL (found while fixing issue #342 Z17) — the relay
 * handlers' writes, the move's record and its +1 claims.
 *
 * Z17 put the canonical GM's fire-and-forget campaignState writers on one
 * per-client chain (src/multiplayer/campaignStateChain.js): each reads the
 * store only once the write ahead of it has landed. A writer off it reads the
 * cache inside another write's round trip, and its whole-object write,
 * applied after, puts that write's fields back: a player's Take a Break, Set
 * a Flag or End a Session relayed while the GM's oracle capture was on its
 * way erased the oracle answer; a move's claim of Take a Break's +1 did the
 * same; and a move's record, read while a player's X-Card pause was on its way,
 * put `xCardActive: false` back — or, behind a chained write that re-read the
 * pause, was itself lost. These writers now run on the chain: the relay
 * handlers (Set a Flag, Take a Break, Begin / End a Session), persistResolution
 * and every writer that merges only its own fields onto the store
 * (writeOwnedFields), the next-move claims and grant, and the spotlight
 * persist.
 *
 * The harness applies a write at once, so the GM's campaignState writes are
 * held and released in the order the client sent them (the server applies
 * them in that order) — the round trip the harness does not model.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [], confirmGate: null }));
vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => ({ moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 'risky', mischiefApplied: false })),
}));
vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => { if (control.confirmGate) await control.confirmGate; return true; }),
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
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random');
      for (const d of control.dice.shift() ?? []) dice.mockReturnValueOnce(d);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS } from '../helpers/multiClient.js';
import { campaignStateWrite, deferred, scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';
const REPLY = 'Kira slips through the vent.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const STRONG = [0.25, 0.35, 0.9];

let table;
let script;
let gates = [];
const world = () => table.world.campaignState();
const questions = () => (world().recentOracles ?? []).map(e => e.question);

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());
afterEach(async () => {
  for (const g of gates) g.resolve(undefined);
  gates = [];
  await table.settle(); await table.drain();
});

async function resetTable({ key = false } = {}) {
  control.dice = [STRONG];
  control.confirmGate = null;
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false, combatTrackerEnabled: false, autoRecapEnabled: false,
    campaignState: {
      ...CampaignStateSchema, sessionActive: true, sessionStartedId: 'sess-1', currentSessionId: 'sess-1', sessionNumber: 1,
      lastSessionTimestamp: new Date().toISOString(), currentSceneId: 'sc-1', sceneTruths: [], recentOracles: [],
      safetyFlags: [], xCardActive: false,
    },
  } } });
  // With no key an oracle answer posts no follow-up (only its capture writes).
  if (key) await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [] } });
  script = scriptClaude(table, { fallback: () => REPLY });
  silenceConsoleErrors();
}

async function relay(userId, kind, payload) {
  const c = table.client(userId);
  const gmRelay = await c.import('../../src/multiplayer/gmRelay.js');
  const res = await c.run(() => gmRelay.requestGmAction(kind, payload));
  await table.settle();
  return res;
}

/** Hold the GM's campaignState writes (the round trip): each released in the order it was sent. */
function holdGmCampaignStateWrites() {
  const held = [];
  table.interceptWrites((w) => {
    if (!campaignStateWrite('gm-1')(w)) return undefined;
    const gate = deferred();
    gates.push(gate);
    held.push({ value: w.value, gate });
    return gate.promise;
  });
  return held;
}

async function releaseInOrder(held) {
  for (let i = 0; i < held.length; i++) {
    held[i].gate.resolve(undefined);
    await table.settle();
  }
  await table.drain();
}

/** Ren asks the oracle; the d100 lands on YES at "likely". Its card is captured on the GM. */
async function renAsks() {
  const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.1);   // d100 = 11
  try {
    await table.client('pl-2').chat('!oracle yes likely is the hatch sealed');
    await table.settle();
  } finally {
    dice.mockRestore();
  }
}

/** Ren's answer is on its way to the server (the GM's capture write, held). */
async function answerInFlight() {
  const held = holdGmCampaignStateWrites();
  await renAsks();
  expect(held[0]?.value?.recentOracles?.map(e => e.question), 'the capture\'s write is in flight').toEqual(['is the hatch sealed']);
  return held;
}

describe('CAMPSTATE-CHAIN-PARTIAL — a relayed write sent while the GM\'s oracle capture is on its way', () => {
  beforeEach(async () => { await resetTable(); });

  it('Take a Break: the +1 and the oracle answer both stand', async () => {
    const held = await answerInFlight();
    await relay('pl-1', 'session.takeBreak', {});
    await releaseInOrder(held);
    expect(world().nextMoveAdd).toMatchObject({ value: 1, source: 'take_a_break' });
    expect(questions()).toEqual(['is the hatch sealed']);
  }, 30_000);

  it('Set a Flag: the flag and the oracle answer both stand', async () => {
    const held = await answerInFlight();
    await relay('pl-1', 'safety.setFlag', { text: 'No harm to the ship\'s cat', visibility: 'public' });
    await releaseInOrder(held);
    expect((world().safetyFlags ?? []).map(f => f.text)).toEqual(['No harm to the ship\'s cat']);
    expect(questions()).toEqual(['is the hatch sealed']);
  }, 30_000);

  it('End a Session: the session\'s end and the oracle answer both stand', async () => {
    const held = await answerInFlight();
    await relay('pl-1', 'session.end', { questFocus: 'Find the Hollow Spire', connectionFocus: '' });
    await releaseInOrder(held);
    expect(world().sessionActive).toBe(false);
    expect(world().sessionEndedId).toBe('sess-1');
    expect(world().questFocus).toBe('Find the Hollow Spire');
    expect(questions()).toEqual(['is the hatch sealed']);
  }, 30_000);

  it('Begin a Session: the new session and the oracle answer both stand', async () => {
    // The last session was ended (its scene closed): Begin starts the next.
    table.world.setSetting('campaignState', { ...world(), sessionActive: false, sessionEndedId: 'sess-1', currentSceneId: null });
    const held = await answerInFlight();
    await relay('pl-1', 'session.begin', { vignetteRolled: false, includeGalley: false });
    await releaseInOrder(held);
    expect(world().sessionActive).toBe(true);
    expect(world().currentSessionId).not.toBe('sess-1');
    expect(world().sessionStartedId).toBe(world().currentSessionId);
    expect(questions()).toEqual(['is the hatch sealed']);
  }, 30_000);

  it('control: Take a Break once the answer has landed — both stand', async () => {
    await renAsks();
    await table.drain();
    await relay('pl-1', 'session.takeBreak', {});
    await table.drain();
    expect(world().nextMoveAdd).toMatchObject({ value: 1, source: 'take_a_break' });
    expect(questions()).toEqual(['is the hatch sealed']);
  }, 30_000);
});

describe('CAMPSTATE-CHAIN-PARTIAL — a move\'s own writes inside another write\'s round trip', () => {
  it('a move that takes Take a Break\'s +1 while an oracle answer is on its way keeps the answer', async () => {
    await resetTable({ key: true });
    await relay('pl-1', 'session.takeBreak', {});
    await table.drain();
    expect(world().nextMoveAdd?.value).toBe(1);

    // Kira's move waits in the confirm dialog (its lock claimed) …
    const confirm = deferred();
    control.confirmGate = confirm.promise;
    await table.client('pl-1').chat('I slip through the vent before the drones turn.', { speaker: { actor: 'pc-kira' } });
    await table.settle();
    expect(world().pendingMove).toBe(true);
    // … while Ren's answer goes to the server; then it is confirmed and rolled.
    const held = await answerInFlight();
    confirm.resolve();
    await table.settle();
    await releaseInOrder(held);

    const card = table.cards(f => f.moveResolution && f.actorId === 'pc-kira');
    expect(card).toHaveLength(1);
    expect(world().nextMoveAdd ?? null).toBeNull();      // the +1 was taken
    expect(questions()).toEqual(['is the hatch sealed']);
  }, 30_000);

  it('a move that takes its roller\'s "+1 on your next move" while an oracle answer is on its way keeps the answer', async () => {
    await resetTable({ key: true });
    table.world.setSetting('campaignState', {
      ...world(), nextMoveBonuses: { 'pc-kira': { value: 1, sources: ['secure_an_advantage'], setAt: new Date().toISOString() } },
    });
    const confirm = deferred();
    control.confirmGate = confirm.promise;
    await table.client('pl-1').chat('I slip through the vent before the drones turn.', { speaker: { actor: 'pc-kira' } });
    await table.settle();
    const held = await answerInFlight();
    confirm.resolve();
    await table.settle();
    await releaseInOrder(held);

    expect(table.cards(f => f.moveResolution && f.actorId === 'pc-kira')).toHaveLength(1);
    expect(world().nextMoveBonuses?.['pc-kira'] ?? null).toBeNull();   // the +1 was taken
    expect(questions()).toEqual(['is the hatch sealed']);
  }, 30_000);

  it('the GM\'s !lore while an oracle answer is on its way: the lore recap and the answer both stand', async () => {
    await resetTable({ key: true });
    table.world.setSetting('campaignState', {
      ...world(), loreRecap: '',
      worldTruths: { cataclysm: { categoryName: 'Cataclysm', title: 'We escaped the ravages of a catastrophic war.' } },
    });
    const held = await answerInFlight();
    await table.client('gm-1').chat('!lore');
    await table.settle();
    await releaseInOrder(held);
    expect(world().loreRecap).toBeTruthy();
    expect(questions()).toEqual(['is the hatch sealed']);
  }, 30_000);

  it('a move recorded while a player\'s X-Card pause is on its way: the pause and the move\'s record both stand', async () => {
    await resetTable({ key: true });
    const narration = script.hold(call => call.model === NARRATION_MODEL);
    await table.client('pl-1').chat('I slip through the vent before the drones turn.', { speaker: { actor: 'pc-kira' } });
    await narration.arrived;

    const held = holdGmCampaignStateWrites();
    await table.client('pl-2').chat('!x');
    await table.settle();
    expect(held[0]?.value?.xCardActive, 'the pause\'s write is in flight').toBe(true);

    narration.release();
    await table.settle();
    await releaseInOrder(held);

    // Sanity: the move rolled and was recorded (its record is the one write that stamps updatedAt).
    expect(table.cards(f => f.moveResolution && f.actorId === 'pc-kira')).toHaveLength(1);
    const record = held.find(h => typeof h.value?.updatedAt === 'string' && h.value.updatedAt !== held[0].value.updatedAt);
    expect(record, 'the move\'s record was written').toBeTruthy();
    expect(world().pendingMove).toBe(false);
    // The scene stays paused, and the move's record stands.
    expect(world().xCardActive).toBe(true);
    expect(world().xCardPlays).toBe(1);
    expect(world().updatedAt).toBe(record.value.updatedAt);
  }, 30_000);
});
