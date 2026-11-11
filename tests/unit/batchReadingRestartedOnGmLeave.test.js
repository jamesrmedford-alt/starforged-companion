/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/batchReadingRestartedOnGmLeave.test.js
 *
 * Issue #345 AA42 ROUND-READING-LOST-ON-CANONICAL-LEAVE (the twelfth audit's
 * R2T-3). The GM handover, on the collecting side.
 *
 * A Batch Mode round's readings run on the canonical GM (driver.js
 * startReading: the reading's Claude call on that client, its promise in this
 * client's `_readings` map). When that GM leaves while a player's action is
 * being read, the reading dies with their browser and the entry stays
 * `submitted` with no error. The GM who is canonical now heard the leave
 * (onUserConnected(user, false)) and only ran advanceRound("user-left"),
 * which cannot resolve a round with a submitted entry and starts no reading.
 * Lost readings were started again only by recoverRound — on `ready`, a user
 * joining, a keyed-GM registry write — or by a GM's Send now (which rolls the
 * reading unconfirmed). A leave writes no registry, so none of them fired:
 * the player's window said "Reading your action…" for good, and the round
 * never resolved by itself.
 *
 * The fix: a GM leaving while the round collects runs recoverRound on the GM
 * who is canonical now — it starts the lost readings again, as the
 * resolver-left recovery resumes a resolving round. A reading that GM's own
 * game is running is left to run (startReading returns it).
 *
 * Scenario: two GMs with a Claude key each — Gina (gm-1, canonical: the lower
 * id) and Gus (gm-2) — and Pat (pl-1, Kira's player). Pat submits; Gina's
 * game is reading it when she closes her browser.
 *
 * Harness: the Batch Mode table (real driver, relays and pipeline; the
 * interpreter mocked — its first call held, as a reading in flight is).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ holdFirst: false, release: null, calls: [] }));
vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => {
    const reading = { moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 'risky', mischiefApplied: false };
    control.calls.push(globalThis.game?.user?.id ?? null);
    if (control.holdFirst && control.calls.length === 1) {
      // The reading in flight: answered only when the test releases it — never,
      // on the GM who leaves.
      return new Promise((resolve) => { control.release = () => resolve(reading); });
    }
    return reading;
  }),
}));
vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
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

import { simulateTable, USERS } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

let table;
const round = () => table.world.getSetting('batchMode.round');
const roundCards = () => table.cards(f => f.narratorCard && f.roundId);

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.GM2, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.holdFirst = false;
  control.release = null;
  control.calls = [];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  await table.setClaudeKey('gm-2', 'sk-ant-gus');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  scriptClaude(table);
  silenceConsoleErrors();
  await table.client('gm-1').setSetting('batchMode.enabled', true);
  await table.settle();
});

async function relay(userId, kind, payload) {
  const c = table.client(userId);
  const gmRelay = await c.import('../../src/multiplayer/gmRelay.js');
  const res = await c.run(() => gmRelay.requestGmAction(kind, payload));
  await table.settle();
  return res;
}

async function canonical(userId) {
  const gate = await table.client(userId).import('../../src/multiplayer/gmGate.js');
  return table.client(userId).run(() => gate.isCanonicalGM());
}

const TEXT = 'I slip through the vent before the drones turn.';

describe('issue #345 AA42 — the canonical GM leaves while a round entry is being read', () => {
  it("Gina leaves mid-reading: Gus (canonical now) reads Pat's action, and the round goes on once Pat confirms", async () => {
    control.holdFirst = true;
    expect(round()).toMatchObject({ number: 1, phase: 'collecting' });
    // (a submission id of its own in each test: each client's reading map outlives reset())
    await relay('pl-1', 'batch.submit', { roundId: round().id, text: TEXT, submissionId: 'leave-1' });
    expect(control.calls).toEqual(['gm-1']);                       // Gina's game is reading it …
    expect(round().entries['pl-1'].status).toBe('submitted');

    await table.leave('gm-1');                                      // … when she closes her browser
    await table.settle(); await table.drain();
    expect(await canonical('gm-2'), 'Gus is the canonical GM now').toBe(true);

    expect.soft(control.calls, 'the reading is started again on Gus').toEqual(['gm-1', 'gm-2']);
    expect(round().entries['pl-1'], "Pat's action is read again on the GM who is canonical now")
      .toMatchObject({ status: 'read', error: null });

    await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'leave-1', choices: {} });
    await table.drain();
    expect(roundCards()).toHaveLength(1);
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
  }, 60_000);

  it('control: Gina stays — the reading lands and Pat can confirm', async () => {
    await relay('pl-1', 'batch.submit', { roundId: round().id, text: TEXT, submissionId: 'stay-1' });
    await table.drain();
    expect(round().entries['pl-1']).toMatchObject({ status: 'read' });
    await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'stay-1', choices: {} });
    await table.drain();
    expect(['rolling', 'upgrading', 'narrating', 'closed', 'collecting']).toContain(round().phase);
    expect(roundCards()).toHaveLength(1);
  }, 60_000);

  it('control: Gus leaves while Gina\'s game reads — her reading is left to run, not started a second time', async () => {
    control.holdFirst = true;
    await relay('pl-1', 'batch.submit', { roundId: round().id, text: TEXT, submissionId: 'gus-1' });
    expect(control.calls).toEqual(['gm-1']);

    await table.leave('gm-2');
    await table.settle(); await table.drain();
    expect(await canonical('gm-1'), 'Gina is still the canonical GM').toBe(true);
    expect(control.calls, 'no second reading').toEqual(['gm-1']);

    control.release();
    await table.settle(); await table.drain();
    expect(round().entries['pl-1']).toMatchObject({ status: 'read', error: null });
    expect(control.calls).toEqual(['gm-1']);
  }, 60_000);
});
