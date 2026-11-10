/**
 * PROBE — CONT-1 XCARD-BLOCK-READ-FROM-MOVE-SNAPSHOT (SAFETY)
 *
 * The narrator's re-assertion guard (ledgers.js applySidecar: findEquivalentTruth
 * over sceneTruths, findSessionStrike over sessionRetractions) reads the
 * CALLER'S working copy. A free-flow move narrates from the cached
 * campaignState read before its lock claim and confirm dialog (index.js:969
 * `const campaignState = game.settings.get(…)` → narrateResolution →
 * applyNarratorSidecar → applySidecarSideData → applySidecar, narrator.js
 * ~4300). W05 made the PROMPT read the live ledgers (buildNarratorExtras →
 * liveSceneLedger) and X02 the AUDIT (auditCampaignState) — the sidecar's
 * write-half guard still reads the snapshot, and the persist's merge
 * (sceneLifecycle.js mergeSceneLedgers) re-retracts only the X-carded
 * narration's OWN entries (by xCardedNarrationIds), never a new narration's
 * restatement of them.
 *
 * So the X-Card's "for the rest of the session the narrator cannot record
 * those facts again" (help → Safety System; rules/narrator-memory.md 6b) does
 * not hold for a move that was waiting at its confirm dialog when the X-Card
 * was played and resumed:
 *   A. same scene — Ren's move waits; Pat's `@scene` answer (which needs no
 *      move lock) records "Vance — Is dead"; Pat plays !x, the GM resumes; Ren
 *      confirms; Ren's narration restates the fact → recorded LIVE (the
 *      snapshot never held the X-carded truth, so neither guard sees it).
 *   B. ended scene — the X-carded narration's truth lives on
 *      sessionRetractions.narrated (XCARD-ENDED-SCENE-TRUTHS-UNBLOCKED); the
 *      X-Card moves it to `blocked` in the STORE only; the snapshot's
 *      `blocked` is empty → recorded LIVE.
 * Controls: the same restatement by a narration whose state was read after the
 * X-Card is refused (the guard works when it reads the store's lists).
 *
 * Harness: tests/unit/xcardLiveLedger.test.js's (W05).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ confirm: null }));
vi.mock('../../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => ({
    moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'iron', adds: 0, rationale: 'test', mischiefApplied: false,
  })),
}));
vi.mock('../../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(() => (control.confirm ? control.confirm.promise : Promise.resolve(true))),
}));
vi.mock('../../../src/moves/resolver.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.25).mockReturnValueOnce(0.35).mockReturnValueOnce(0.9);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';
const DEAD = 'Is dead';

let table;
const world = () => table.world.campaignState();
const liveDead = () => (world().sceneTruths ?? []).filter(t => t.fact === DEAD && !t.retracted);

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

const sidecar = (newTruths) => '\n```json\n' + JSON.stringify({ newTruths, stateChanges: [] }) + '\n```';

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.confirm = null;
  await table.reset({ world: { settings: { campaignState: {
    ...CampaignStateSchema,
    sessionActive: true, currentSessionId: 'sess-7', sessionNumber: 7, currentSceneId: 'sc-1', sceneTruths: [],
    sceneState: { bySubject: {}, sceneId: 'sc-1' },
  } } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-pat',   name: 'Kira', ownership: { 'pl-1': 3 } });
  table.addActor({ id: 'pc-quinn', name: 'Ren',  ownership: { 'pl-2': 3 } });
  table.claude.respond((call) => {
    if (call.model !== NARRATION_MODEL) return '{}';
    // Every narration — the scene answer the X-Card removes and Ren's move —
    // states the dockmaster's death: the restatement the guard exists to refuse.
    if (/Vance/.test(call.userText) && !/Narrate the consequence/.test(call.userText)) {
      return 'Vance lies twisted at the foot of the gantry, his eyes open and empty.' + sidecar([{ subject: 'Vance', fact: DEAD }]);
    }
    return 'You walk past the place where Vance fell.' + sidecar([{ subject: 'Vance', fact: DEAD }]);
  });
});

describe('CONT-1 — a move waiting at its confirm dialog can re-record what the X-Card removed', () => {
  it('control: a move typed after the X-Card and resume cannot restate the removed fact (same scene)', async () => {
    await table.client('pl-1').chat('@scene Is Vance still breathing?', { speaker: { actor: 'pc-pat' } });
    await table.settle();
    expect(liveDead()).toHaveLength(1);

    await table.client('pl-1').chat('!x');
    await table.settle();
    expect(liveDead()).toHaveLength(0);
    await table.client('gm-1').chat('!x clear');
    await table.settle();
    expect(world().xCardActive).toBe(false);

    await table.client('pl-2').chat('I walk on toward the docks.', { speaker: { actor: 'pc-quinn' } });
    await table.settle();
    expect(table.claude.calls.filter(c => c.model === NARRATION_MODEL && /Narrate the consequence/.test(c.userText))).toHaveLength(1);
    expect(liveDead()).toHaveLength(0);
  }, 60_000);

  it('A: the X-carded narration posted while the move waited — the move\'s narration records it live again', async () => {
    // Ren types a move; it waits at the confirm dialog (its campaignState is read now).
    control.confirm = deferred();
    await table.client('pl-2').chat('I walk on toward the docks.', { speaker: { actor: 'pc-quinn' } });
    await table.settle();
    expect(world().pendingMove).toBe(true);

    // Meanwhile Pat asks the scene (no move lock needed): the answer records the death.
    await table.client('pl-1').chat('@scene Is Vance still breathing?', { speaker: { actor: 'pc-pat' } });
    await table.settle();
    expect(liveDead()).toHaveLength(1);

    // Pat plays the X-Card on that answer; the GM resumes.
    await table.client('pl-1').chat('!x');
    await table.settle();
    const removed = (world().sceneTruths ?? []).find(t => t.fact === DEAD);
    expect(removed).toMatchObject({ retracted: true, retractedBy: 'xcard' });
    expect(world().xCardedNarrationIds).toContain(removed.narrationId);
    await table.client('gm-1').chat('!x clear');
    await table.settle();

    // Ren confirms; his move is narrated now, with the X-Card lifted.
    control.confirm.resolve(true);
    await table.settle();
    const moveCalls = table.claude.calls.filter(c => c.model === NARRATION_MODEL && /Narrate the consequence/.test(c.userText));
    expect(moveCalls).toHaveLength(1);
    expect(moveCalls[0].system).toContain('## X-CARD — REDIRECT');   // setup: the post-resume narration

    // The removed fact must not be a live, binding truth again.
    expect(liveDead().map(t => `${t.subject?.text ?? t.subject?.kind} — ${t.fact}`
      + (t.narrationId === removed.narrationId ? ' (the X-carded answer)' : ' (recorded by the move narration)'))).toEqual([]);
  }, 60_000);

  it('B: the X-carded narration\'s scene had ended — the move\'s narration records it live again', async () => {
    await table.client('pl-1').chat('@scene Is Vance still breathing?', { speaker: { actor: 'pc-pat' } });
    await table.settle();
    expect(liveDead()).toHaveLength(1);
    await table.client('gm-1').chat('!scene start');
    await table.settle();
    expect(world().currentSceneId).not.toBe('sc-1');
    expect(world().sessionRetractions?.narrated?.some(n => n.fact === DEAD)).toBe(true);   // setup: kept for a later X-Card

    control.confirm = deferred();
    await table.client('pl-2').chat('I walk on toward the docks.', { speaker: { actor: 'pc-quinn' } });
    await table.settle();
    expect(world().pendingMove).toBe(true);

    await table.client('pl-1').chat('!x');
    await table.settle();
    expect(world().sessionRetractions?.blocked?.some(b => b.fact === DEAD)).toBe(true);    // setup: the X-Card blocked it
    await table.client('gm-1').chat('!x clear');
    await table.settle();

    control.confirm.resolve(true);
    await table.settle();
    const moveCalls = table.claude.calls.filter(c => c.model === NARRATION_MODEL && /Narrate the consequence/.test(c.userText));
    expect(moveCalls).toHaveLength(1);

    expect(liveDead().map(t => t.fact)).toEqual([]);
  }, 60_000);

  it('A (strike sibling): a GM\'s `!truth strike` made while the move waited does not stop its narration recording the struck fact live', async () => {
    control.confirm = deferred();
    await table.client('pl-2').chat('I walk on toward the docks.', { speaker: { actor: 'pc-quinn' } });
    await table.settle();
    await table.client('pl-1').chat('@scene Is Vance still breathing?', { speaker: { actor: 'pc-pat' } });
    await table.settle();
    const truth = (world().sceneTruths ?? []).find(t => t.fact === DEAD);
    await table.client('gm-1').chat(`!truth strike ${truth.id.slice(0, 8)}`);
    await table.settle();
    expect((world().sceneTruths ?? []).find(t => t.id === truth.id)).toMatchObject({ retracted: true, retractedBy: 'gm' });

    control.confirm.resolve(true);
    await table.settle();
    // CORRECTED says "do NOT re-assert: Vance — Is dead"; TRUTHS must not also bind it.
    expect(liveDead().map(t => t.fact)).toEqual([]);
  }, 60_000);

  it('control B: the same restatement by a move typed after the X-Card is refused (ended scene)', async () => {
    await table.client('pl-1').chat('@scene Is Vance still breathing?', { speaker: { actor: 'pc-pat' } });
    await table.settle();
    await table.client('gm-1').chat('!scene start');
    await table.settle();
    await table.client('pl-1').chat('!x');
    await table.settle();
    await table.client('gm-1').chat('!x clear');
    await table.settle();

    await table.client('pl-2').chat('I walk on toward the docks.', { speaker: { actor: 'pc-quinn' } });
    await table.settle();
    expect(table.claude.calls.filter(c => c.model === NARRATION_MODEL && /Narrate the consequence/.test(c.userText))).toHaveLength(1);
    expect(liveDead()).toHaveLength(0);
  }, 60_000);
});
