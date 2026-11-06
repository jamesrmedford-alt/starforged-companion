/**
 * Probe — CONT-5 ROUND-CLARIFY-ON-GM (continuity auditor, eleventh audit).
 *
 * Batch Mode (decisions.md, 2026-11, issue #340): "The player confirms the
 * reading in their own window … No confirm dialog opens on the GM's screen
 * during a round", and the move lock "is free while a roller decides … (an
 * interactive wait never holds it)". The round's reading (readAction) never
 * resolves the narrator's relevance; the roll stage does — rollMove, on the
 * canonical GM under the round's move lock — and for a hybrid move (Face
 * Danger, Secure an Advantage, Undertake an Expedition…) whose line names no
 * one on a hit it asks the Haiku classifier, and an implied reference ("I talk
 * him down") opens the "Who are you interacting with?" ClarificationDialog —
 * on the GM's screen, mid-round, holding the lock, once per such entry. The
 * round shows "resolving" to every player until the GM answers.
 *
 * The dialog itself is replaced by a recorder (it would wait for a click):
 * rollMove's real call reaches it, and the recorder answers "No specific
 * entity" at once and notes the client and the stored lock.
 *
 * Asserts the CORRECT behaviour: no dialog opens on the GM's client during a
 * round's rolls.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ pace: null, interpret: null, dice: [], prompts: [] }));
vi.mock('../../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
  decidePacing: vi.fn(async ({ playerText }) => control.pace(playerText)),
}));
vi.mock('../../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (text) => control.interpret(text)),
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
vi.mock('../../../src/world/clarificationDialog.js', async (importOriginal) => ({
  ...(await importOriginal()),
  ClarificationDialog: {
    prompt: vi.fn(async () => {
      control.prompts.push({
        client:      globalThis.game?.user?.id ?? null,
        pendingMove: globalThis.game?.settings?.get?.('starforged-companion', 'campaignState')?.pendingMove ?? null,
      });
      return { kind: 'none', entityId: null, entityType: null, entityName: null };
    }),
  },
}));
vi.mock('../../../src/moves/resolver.js', async (importOriginal) => {
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

import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';
const ROUND_REPLY = 'Kira talks the guard down while Ren watches the door.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
// challenge 3 and 4, action die 6 (+edge 2 = 8): a strong hit.
const STRONG = [0.25, 0.35, 0.9];
const FACE_DANGER = { moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 'risky', mischiefApplied: false };

let table;
let implied = true;   // what the relevance classifier answers
const round = () => table.world.getSetting('batchMode.round');
let seq = 0;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.pace = () => ({ runMove: true, decision: 'MOVE', suggestedMove: null });
  control.interpret = () => ({ ...FACE_DANGER });
  control.dice = [STRONG];
  control.prompts = [];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    campaignState: {
      ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1,
      currentSceneId: 'sc-1', sceneTruths: [],
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [] } });
  scriptClaude(table, { fallback: (call) => {
    if (call.model === NARRATION_MODEL) return ROUND_REPLY;
    if (/implies interaction with a specific known individual/.test(JSON.stringify(call.system ?? ''))) {
      return JSON.stringify({ impliedEntity: implied, referenceType: implied ? 'pronoun' : 'none' });
    }
    return '{}';
  } });
});

async function relay(userId, kind, payload) {
  const c = table.client(userId);
  const gmRelay = await c.import('../../src/multiplayer/gmRelay.js');
  const res = await c.run(() => gmRelay.requestGmAction(kind, payload));
  await table.settle();
  return res;
}

/** Batch Mode on; Kira's Face Danger names no one ("him"); Ren passes; Kira confirms; the round resolves. */
async function playRound() {
  await table.client('gm-1').setSetting('batchMode.enabled', true);
  await table.settle();
  const submissionId = `sub-pl-1-${++seq}`;
  await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I talk him down before he fires.', submissionId });
  await relay('pl-2', 'batch.pass', { roundId: round().id });
  const r = round();
  expect(r.entries['pl-1']).toMatchObject({ status: 'read', reading: { kind: 'move', moveId: 'face_danger' } });
  await relay('pl-1', 'batch.confirm', { roundId: r.id, submissionId: r.entries['pl-1'].submissionId, choices: {} });
  await table.drain();
  expect(round()).toMatchObject({ number: 2, phase: 'collecting' });   // round 1 resolved and narrated
}

describe("CONT-5 — a round's roll asks the GM who a player meant", () => {
  it("no clarification dialog opens on the GM's screen while the round rolls", async () => {
    implied = true;
    await playRound();
    // What happened today, for the record: the GM was asked, under the round's lock.
    expect.soft(control.prompts.map(p => typeof p.pendingMove === 'string' || p.pendingMove === true), 'the move lock held while the GM was asked').toEqual([]);
    expect(control.prompts.map(p => p.client), 'clarification dialogs opened during the round').toEqual([]);
  }, 30_000);

  it('control: when the classifier finds no implied reference, the round rolls without asking anyone', async () => {
    implied = false;
    await playRound();
    expect(control.prompts).toEqual([]);
  }, 30_000);
});
