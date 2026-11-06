/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/batchUpgradeGoneRoller.test.js
 *
 * Issue #342 Z26 UPGRADE-WAITS-ON-GONE-ROLLER (the eleventh audit's BATCH-11
 * and MP-5 — one finding, two probes).
 *
 * round.js's lifecycle: "upgrading ──(each offered roller chose; Send now =
 * Keep; the roller left = Keep)──► narrating". The driver implemented "the
 * roller left" only on a userConnected(false) event DURING the upgrade step.
 * A roller who confirmed and dropped BEFORE the round resolved is still
 * rolled (a READY entry acts — the round resolves once every connected
 * participant is ready), and the step offered them Burn / Improve like anyone
 * else; no event would ever come, so the round sat in `upgrading` until a GM
 * pressed Send now. The step now keeps, silently, the offer of a roller who
 * isn't connected.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [] }));
vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => ({ moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 't', mischiefApplied: false })),
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

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

// challenge 4 and 8, action die 3 (+edge 2 = 5): a weak hit a burn of 9 raises.
const WEAK   = [0.35, 0.75, 0.4];
// challenge 3 and 4, action die 6 (+edge 2 = 8): a strong hit.
const STRONG = [0.25, 0.35, 0.9];
const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';
const REPLY = 'The round turns.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

let table;
const round = () => table.world.getSetting('batchMode.round');
const narrations = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL);
const roundCards = () => table.cards(f => f.narratorCard && f.roundId);

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.dice = [];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [] } });
  scriptClaude(table, { fallback: () => REPLY });
  silenceConsoleErrors();
  table.actors.get('pc-kira').system.momentum.value = 9;
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

async function kiraConfirms() {
  await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I slip through the vent before the drones turn.', submissionId: 'k1' });
  await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'k1', choices: {} });
}

async function bothSubmit() {
  await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I slip through the vent before the drones turn.', submissionId: 'k1' });
  await relay('pl-2', 'batch.submit', { roundId: round().id, text: 'I vault the barricade.', submissionId: 'r1' });
  await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'k1', choices: {} });
}

describe('Z26 — a roller offered an upgrade who is not connected', () => {
  it('control: Kira leaves DURING the upgrade step — kept for her, narrated', async () => {
    control.dice = [WEAK];
    await kiraConfirms();
    await relay('pl-2', 'batch.pass', { roundId: round().id });
    await table.drain();
    expect(round()).toMatchObject({ phase: 'upgrading' });
    await table.leave('pl-1');
    try {
      await table.drain();
      expect(roundCards()).toHaveLength(1);
    } finally {
      await table.join('pl-1');
    }
  }, 30_000);

  it('Kira left after her confirm, before the round resolved — the round does not wait on her decision (BATCH-11)', async () => {
    control.dice = [WEAK];
    await kiraConfirms();
    await table.leave('pl-1');
    try {
      await relay('pl-2', 'batch.pass', { roundId: round().id });      // every connected participant ready
      await table.drain();
      const state = `${round()?.number}:${round()?.phase}; Kira's upgrade decided: ${round()?.entries?.['pl-1']?.upgrade?.decided ?? null}`;
      expect(roundCards(), state).toHaveLength(1);
      expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
    } finally {
      await table.join('pl-1');
    }
  }, 30_000);

  it('control: Pat leaves DURING the upgrade step — his Burn is kept for him and the round is narrated (MP-5)', async () => {
    control.dice = [WEAK, STRONG];
    await bothSubmit();
    await relay('pl-2', 'batch.confirm', { roundId: round().id, submissionId: 'r1', choices: {} });
    await table.drain();
    expect(round()).toMatchObject({ phase: 'upgrading' });
    await table.leave('pl-1');
    try {
      await table.drain();
      expect(narrations()).toHaveLength(1);
      expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
    } finally {
      await table.join('pl-1');
    }
  }, 30_000);

  it('Pat confirms, then drops before the round resolves: the round does not wait for his Burn — kept, his card closed (MP-5)', async () => {
    control.dice = [WEAK, STRONG];
    await bothSubmit();
    await table.leave('pl-1');                 // Kira is ready; Pat's browser closes
    try {
      // Quinn's confirm: every CONNECTED participant is ready — the round resolves.
      await relay('pl-2', 'batch.confirm', { roundId: round().id, submissionId: 'r1', choices: {} });
      await table.drain();
      // Kira's weak hit was rolled; the burn it offered to a player who is not here is kept.
      expect(narrations()).toHaveLength(1);
      expect(narrations().at(-1)?.userText ?? '').toMatch(/Face Danger[^\n]*: weak hit/);
      expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
      const kiraCard = table.cards(f => f.moveResolution && f.actorId === 'pc-kira')[0];
      expect(kiraCard.flags[MODULE_ID].burn.roundClosed).toBe(true);
    } finally {
      await table.join('pl-1');
    }
  }, 30_000);
});
