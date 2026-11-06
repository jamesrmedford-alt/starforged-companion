/**
 * Probe — BATCH-11 UPGRADE-WAITS-ON-GONE-ROLLER (eleventh audit).
 *
 * round.js's lifecycle: "upgrading ──(each offered roller chose; Send now =
 * Keep; the roller left = Keep)──► narrating". The driver implements "the
 * roller left" only on the userConnected(false) event DURING the upgrade step
 * (onUserConnected → keepUpgrades). A roller who confirmed and then dropped
 * BEFORE the round resolved is still rolled (a READY entry acts), and
 * beginUpgrades offers them Burn / Improve like anyone else — but no event
 * will ever come for them: the round sits in `upgrading`, "Waiting for: Kira",
 * until a GM notices and presses Send now.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (narration) => ({
    moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 'test',
    mischiefApplied: false, playerNarration: narration, inputMethod: 'chat',
  })),
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
vi.mock('../../../src/moves/resolver.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    // a weak hit a burn of 9 raises to a strong hit
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.35).mockReturnValueOnce(0.75).mockReturnValueOnce(0.4);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const REPLY = 'Kira slips through the vent.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

let table;
const round = () => table.world.getSetting('batchMode.round');
const roundCards = () => table.cards(f => f.narratorCard && f.roundId);

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [] } });
  table.actors.get('pc-kira').system.momentum.value = 9;
  scriptClaude(table, { fallback: () => REPLY });
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

async function kiraConfirms() {
  await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I slip through the vent before the drones turn.', submissionId: 'k1' });
  await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'k1', choices: {} });
}

describe('BATCH-11 — a roller offered an upgrade who had already left', () => {
  it('control: Kira leaves DURING the upgrade step — kept for her, narrated', async () => {
    await kiraConfirms();
    await relay('pl-2', 'batch.pass', { roundId: round().id });
    await table.drain();
    expect(round()).toMatchObject({ phase: 'upgrading' });
    await table.leave('pl-1');
    await table.drain();
    expect(roundCards()).toHaveLength(1);
    await table.join('pl-1');
  }, 30_000);

  it('Kira left after her confirm, before the round resolved — the round does not wait on her decision', async () => {
    await kiraConfirms();
    await table.leave('pl-1');
    await relay('pl-2', 'batch.pass', { roundId: round().id });      // every connected participant ready
    await table.drain();
    const state = `${round()?.number}:${round()?.phase}; Kira's upgrade decided: ${round()?.entries?.['pl-1']?.upgrade?.decided ?? null}`;
    await table.join('pl-1');
    expect(roundCards(), state).toHaveLength(1);
  }, 30_000);
});
