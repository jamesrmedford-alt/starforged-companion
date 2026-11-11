/**
 * PROBE (thirteenth audit, area "moves A") — MOVA: the "Who are you
 * interacting with?" prompt is a POST-roll GM dialog awaited under the move
 * lock, before the move's result card exists.
 *
 * movePipeline.js rollMove: resolveMove (the dice) → applyOutcomeEffects →
 * the per-move branches → the Pay the Price card → resolveRelevance →
 * `await ClarificationDialog.prompt(...)` → only then postMoveResult. The
 * prompt opens on the canonical GM's screen for a hit of a hybrid move (Face
 * Danger, Secure an Advantage, Battle, Undertake an Expedition …) whose line
 * names nobody the table knows. Until the GM answers it: no result card, no
 * dice, no narration, nothing recorded — and `campaignState.pendingMove`
 * stays set, so every other player's line is dropped ("A move is already
 * being resolved", shown on the GM's screen) and every card button's move is
 * held.
 *
 * decisions.md → "Move-concurrency lock covers narration + persistence, not
 * post-roll prompts" calls ClarificationDialog a PRE-roll dialog that holds
 * the lock "at the start, where a cancel releases the lock immediately". It is
 * awaited after the roll and its effects, and closing it cancels nothing (it
 * resolves "none" and the move goes on). The decision's own rule — "an
 * interactive prompt must never hold a cross-client concurrency lock" (the
 * v1.7.12 lock-up, PLAYTEST-1712 M/N) — is the one asserted here.
 */
/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

// Face Danger strong hit: challenge dice 1 and 2, action die 6.
const control = vi.hoisted(() => ({ dice: [0.0, 0.15, 0.99], clarify: null, asked: 0, open: [] }));
vi.mock('../../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../../src/moves/resolver.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random');
      for (const d of control.dice) dice.mockReturnValueOnce(d);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});
// The relevance resolver finds an implicit reference ("I slip past him"): the
// pipeline asks the GM who was meant. Only while the test arms it.
vi.mock('../../../src/context/relevanceResolver.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    resolveRelevance: vi.fn(async (...args) => (control.clarify
      ? { resolvedClass: 'interaction', entityIds: [], entityTypes: [], matchedNames: [], needsClarification: true, referenceType: 'pronoun' }
      : original.resolveRelevance(...args))),
  };
});
// The GM's dialog: open until the test answers it.
vi.mock('../../../src/world/clarificationDialog.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    ClarificationDialog: { prompt: vi.fn(() => { control.asked += 1; control.open.push(control.clarify); return control.clarify.promise; }) },
  };
});

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude, deferred } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

let table;
const world = () => table.world.campaignState();
const NONE = { kind: 'none', entityId: null, entityType: null, entityName: null };

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.dice = [0.0, 0.15, 0.99];
  control.clarify = null;
  control.asked = 0;
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [] },
  } } });
  table.addActor({ id: 'pc-1', name: 'Kira', ownership: { 'pl-1': 3 } });
  table.addActor({ id: 'pc-2', name: 'Ren',  ownership: { 'pl-2': 3 } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  scriptClaude(table);
  silenceConsoleErrors();
});

// Whatever a test left open is answered, so its pipeline ends before the next test.
afterEach(async () => {
  for (const prompt of control.open.splice(0)) prompt.resolve(NONE);
  await table.settle(); await table.drain();
});

const faceDanger = (userId, actorId, alias, line) => table.client(userId).chat(line, {
  speaker: { actor: actorId, alias },
  flags: { [MODULE_ID]: { bypassPacing: true, forcedMoveId: 'face_danger' } },
});

describe('the post-roll "Who are you interacting with?" prompt and the move lock', () => {
  it('control: once the GM answers, the move posts its card, is recorded, and the lock is free', async () => {
    control.clarify = deferred();
    faceDanger('pl-1', 'pc-1', 'Kira', 'I slip past him before he can raise the alarm.');
    await table.settle();
    expect(control.asked).toBe(1);
    expect(world().pendingMove).toBe(true);
    control.clarify.resolve(NONE);
    await table.settle(); await table.drain();
    expect(table.cards(f => f.moveResolution && f.actorId === 'pc-1')).toHaveLength(1);
    expect(world().pendingMove).toBe(false);
  }, 30_000);

  it('while the GM has not answered it, the table is not locked: another player\'s move still rolls', async () => {
    control.clarify = deferred();
    faceDanger('pl-1', 'pc-1', 'Kira', 'I slip past him before he can raise the alarm.');
    await table.settle();

    // The dice are rolled and the GM's prompt is open; the move's card is not on the table yet.
    expect(control.asked, 'the GM was asked who was meant').toBe(1);
    expect(table.cards(f => f.moveResolution), 'no result card while the prompt is open').toHaveLength(0);

    // FAILS today: the prompt is awaited inside the locked section.
    expect(world().pendingMove, 'an open GM prompt does not hold the move lock').toBe(false);

    // …so Ren's move, typed meanwhile, is rolled rather than dropped.
    const pending = control.clarify;
    control.clarify = null;                         // Ren's line names nobody implicit
    faceDanger('pl-2', 'pc-2', 'Ren', 'I haul the bulkhead door shut behind us.');
    await table.settle();
    expect(table.cards(f => f.moveResolution && f.actorId === 'pc-2'), 'Ren\'s move rolled').toHaveLength(1);

    pending.resolve(NONE);
    await table.settle(); await table.drain();
  }, 30_000);
});
