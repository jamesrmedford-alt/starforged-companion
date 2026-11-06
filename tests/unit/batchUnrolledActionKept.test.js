/* global silenceConsoleErrors -- tests/setup.js and Node globals, as in tests/unit */
/**
 * STARFORGED COMPANION
 * tests/unit/batchUnrolledActionKept.test.js
 *
 * Issue #342 Z31 (UNROLLED-ACTION-TEXT-LOST; the Batch Mode auditor's probe —
 * BATCH-5's second path). The Round window cleared its draft once the round
 * showed the submission (Sent), so the action's text lived only on the round
 * entry. When the round then resolved WITHOUT that entry — its author
 * disconnected before confirming (the round resolves once every connected
 * participant is ready), or its reading failed and a GM pressed Send now —
 * the author came back to the next round with an empty box. The draft now
 * stays until the round takes the action (roundWindow.js draftAfterRound):
 * an action the round did not roll stays its author's draft.
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
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.25).mockReturnValueOnce(0.35).mockReturnValueOnce(0.9);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const REPLY = 'Ren vaults the barricade.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const KIRA = 'I wire the airlock to blow on my signal, then wait in the crawlspace above it.';

let table;
const round = () => table.world.getSetting('batchMode.round');

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [] } });
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

/** Kira writes her action in her Round window and presses Submit; the round shows it (Sent). */
async function kiraSubmitsFromHerWindow() {
  const c = table.client('pl-1');
  const mod = await c.import('../../src/ui/roundWindow.js');
  await c.run(async () => {
    const app = mod.RoundWindowApp.instance ?? await mod.RoundWindowApp.open();
    await app.draftFromOutside(KIRA);                 // what she typed in the box
    await mod.RoundWindowApp.DEFAULT_OPTIONS.actions.submit.call(app, null, null);
  });
  await table.settle();
  await table.drain();
  expect(round().entries['pl-1']).toMatchObject({ status: 'read', text: KIRA });
}

describe('an action the round resolved without stays its author\'s draft (issue #342 Z31)', () => {
  it('control: while the round collects, her text is on her entry — and stays her draft until the round takes it', async () => {
    await kiraSubmitsFromHerWindow();
    expect(table.client('pl-1').getSetting('batchMode.draft')).toBe(KIRA);
  }, 30_000);

  it('control: the round takes her action (she confirms, it is narrated): her draft goes', async () => {
    await kiraSubmitsFromHerWindow();
    await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: round().entries['pl-1'].submissionId, choices: {} });
    await relay('pl-2', 'batch.pass', { roundId: round().id });
    await table.drain();
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
    expect(table.client('pl-1').getSetting('batchMode.draft')).toBe('');
  }, 30_000);

  it('Kira drops before confirming; Ren\'s ready resolves the round — her action is her draft again', async () => {
    await kiraSubmitsFromHerWindow();
    await table.leave('pl-1');
    await relay('pl-2', 'batch.submit', { roundId: round().id, text: 'I vault the barricade.', submissionId: 'r1' });
    await relay('pl-2', 'batch.confirm', { roundId: round().id, submissionId: 'r1', choices: {} });
    await table.drain();
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });   // resolved without her, as designed
    await table.join('pl-1');
    await table.settle();
    // Correct: the action Kira wrote and never had rolled is still hers to send.
    expect(table.client('pl-1').getSetting('batchMode.draft')).toBe(KIRA);
  }, 30_000);
});
