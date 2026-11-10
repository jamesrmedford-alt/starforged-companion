/* global silenceConsoleErrors -- tests/setup.js */
/**
 * PROBE — R2T: ROUND-READING-LOST-ON-CANONICAL-LEAVE (twelfth audit, round 2,
 * 2026-11-10). The GM handover, on the collecting side.
 *
 * A Batch Mode round's readings run on the canonical GM (driver.js
 * startReading 476-521: the reading's Claude call on that client, its
 * promise in this client's `_readings` map). When that GM leaves while a
 * player's action is being read, the reading dies with their browser and the
 * entry stays `submitted` with no error. The GM who is canonical now hears
 * the leave (onUserConnected(user, false), driver.js 1786-1810) and only runs
 * advanceRound("user-left"), which cannot resolve a round with a submitted
 * entry (round.js readyToResolve 615-621) and starts no reading. The lost
 * readings are started again only by recoverRound (driver.js 1669-1674) —
 * on `ready`, a user joining, a keyed-GM registry write — or by a GM's Send
 * now (rollRound 856-859). A leave writes no registry (ids only;
 * isCanonicalGM filters by `active`), so none of them fires.
 *
 * The player's window says "Reading your action…" for good, the GM's lists
 * them as submitted, and the round never resolves by itself; Send now would
 * roll the reading unconfirmed (actingOrder uses an unconfirmed reading as
 * read). The help promises "the round resolves when every connected player is
 * ready or has passed", and recovery for the resolving side
 * (resolver-left) exists — the collecting side has none.
 *
 * Scenario: two GMs with a Claude key each — Gina (gm-1, canonical: the lower
 * id) and Gus (gm-2) — and Pat. Pat submits; Gina's game is reading it when
 * she closes her browser.
 *
 * Harness: the batch probes' (real driver, relays and pipeline; the
 * interpreter mocked — its first call held, as a reading in flight is).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ holdFirst: false, held: null, calls: [] }));
vi.mock('../../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => {
    const reading = { moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 'risky', mischiefApplied: false };
    control.calls.push(globalThis.game?.user?.id ?? null);
    if (control.holdFirst && control.calls.length === 1) {
      // The reading in flight on the GM who is about to leave: never answered.
      return new Promise(() => {});
    }
    return reading;
  }),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/entities/entityExtractor.js', async (importOriginal) => ({
  ...(await importOriginal()),
  runCombinedDetectionPass: vi.fn(async () => ({ worldJournal: [], entities: [], renames: [] })),
  appendGenerativeTierUpdates: vi.fn(async () => {}),
}));

import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

let table;
const round = () => table.world.getSetting('batchMode.round');

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.GM2, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.holdFirst = false;
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

const TEXT = 'I slip through the vent before the drones turn.';

describe('R2T — the canonical GM leaves while a round entry is being read', () => {
  it("Gina leaves mid-reading: Gus (canonical now) reads Pat's action, so the round can go on", async () => {
    control.holdFirst = true;
    expect(round()).toMatchObject({ number: 1, phase: 'collecting' });
    await relay('pl-1', 'batch.submit', { roundId: round().id, text: TEXT, submissionId: 'leave-1' });
    expect(control.calls).toEqual(['gm-1']);                       // Gina's game is reading it …
    expect(round().entries['pl-1'].status).toBe('submitted');

    await table.leave('gm-1');                                      // … when she closes her browser
    await table.settle(); await table.drain();
    const gate = await table.client('gm-2').import('../../src/multiplayer/gmGate.js');
    expect(table.client('gm-2').run(() => gate.isCanonicalGM()), 'Gus is the canonical GM now').toBe(true);

    expect.soft(control.calls, 'the reading is started again on Gus').toEqual(['gm-1', 'gm-2']);
    expect(round().entries['pl-1'], "Pat's action is read again on the GM who is canonical now")
      .toMatchObject({ status: 'read', error: null });
  }, 60_000);

  it('control: Gina stays — the reading lands and Pat can confirm', async () => {
    // (a submission id of its own: each client's reading map outlives reset())
    await relay('pl-1', 'batch.submit', { roundId: round().id, text: TEXT, submissionId: 'stay-1' });
    await table.drain();
    expect(round().entries['pl-1']).toMatchObject({ status: 'read' });
    await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'stay-1', choices: {} });
    await table.drain();
    expect(['rolling', 'upgrading', 'narrating', 'closed', 'collecting']).toContain(round().phase);
    expect(table.cards(f => f.narratorCard && f.roundId)).toHaveLength(1);
  }, 60_000);
});
