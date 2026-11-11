/**
 * STARFORGED COMPANION
 * tests/unit/clarificationAskedBeforeRoll.test.js
 *
 * "Who are you interacting with?" is asked before the dice (issue #347 D1,
 * option A).
 *
 * A hybrid move whose line implies someone it does not name ("I slip past
 * him") opens the GM's clarification prompt. It was awaited after the roll —
 * the dice rolled, the outcome's effects and price applied — with the move
 * lock held and no result card, narration or record until it was answered:
 * an unnoticed prompt locked the table, and decisions.md ("Move-concurrency
 * lock covers narration + persistence, not post-roll prompts") called it a
 * pre-roll dialog, which it was not. It is now asked before the dice, where
 * the move has done nothing yet (the confirm step's place): the line is
 * classified there, once, and the GM's pick stands whatever the outcome — a
 * miss included. Closing the prompt is "No specific entity" and the move
 * goes on.
 */
/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [0.0, 0.15, 0.99], clarify: null, asked: 0, open: [] }));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../src/moves/resolver.js', async (importOriginal) => {
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
// The GM's prompt: open until the test answers it.
vi.mock('../../src/world/clarificationDialog.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    ClarificationDialog: { prompt: vi.fn(() => { control.asked += 1; control.open.push(control.clarify); return control.clarify.promise; }) },
  };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude, deferred } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { resolveMove } from '../../src/moves/resolver.js';

let table, script;
const world = () => table.world.campaignState();
const NONE = { kind: 'none', entityId: null, entityType: null, entityName: null };
const NEW  = { kind: 'new', entityId: null, entityType: null, entityName: null };
// Face Danger: challenge dice 1 and 2, action die 6 — a strong hit; 10 and 10
// against a 1 — a miss.
const STRONG_HIT = [0.0, 0.15, 0.99];
const MISS       = [0.99, 0.99, 0.0];

const isClassify  = (c) => /implies interaction with a specific known individual/.test(c.system ?? '');
const isNarration = (c) => /NARRATOR PERMISSIONS/.test(c.system ?? '');
const narrationCalls = () => table.claude.calls.filter(isNarration);
const implied = () => script.when(isClassify, '{"impliedEntity": true, "referenceType": "pronoun"}', { times: -1 });

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.dice = STRONG_HIT;
  control.clarify = null;
  control.asked = 0;
  resolveMove.mockClear();
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [] },
  } } });
  table.addActor({ id: 'pc-1', name: 'Kira', ownership: { 'pl-1': 3 }, system: { momentum: { value: 2, max: 10, resetValue: 2 } } });
  table.addActor({ id: 'pc-2', name: 'Ren',  ownership: { 'pl-2': 3 } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  script = scriptClaude(table);
  table.claude.calls.length = 0;
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

describe('"Who are you interacting with?" is asked before the dice (issue #347 D1)', () => {
  it('while the prompt is open nothing is rolled, applied or posted; answered, the move rolls and the lock is free', async () => {
    implied();
    control.clarify = deferred();
    faceDanger('pl-1', 'pc-1', 'Kira', 'I slip past him before he can raise the alarm.');
    await table.settle();

    expect(control.asked, 'the GM was asked who was meant').toBe(1);
    expect(resolveMove, 'no dice while the prompt is open').not.toHaveBeenCalled();
    expect(table.cards(f => f.moveResolution), 'no result card').toHaveLength(0);
    expect(table.actors.get('pc-1').system.momentum.value, 'no outcome applied').toBe(2);

    control.clarify.resolve(NONE);
    await table.settle(); await table.drain();
    expect(resolveMove).toHaveBeenCalledTimes(1);
    expect(table.cards(f => f.moveResolution && f.actorId === 'pc-1')).toHaveLength(1);
    expect(world().pendingMove).toBe(false);
  }, 30_000);

  it("the GM's pick stands on a miss: \"Someone new\" is narrated as a discovery", async () => {
    implied();
    control.dice = MISS;
    control.clarify = deferred();
    faceDanger('pl-1', 'pc-1', 'Kira', 'I slip past him before he can raise the alarm.');
    await table.settle();
    expect(control.asked, 'asked before the dice, whatever they show').toBe(1);
    control.clarify.resolve(NEW);
    await table.settle(); await table.drain();

    expect(resolveMove.mock.results[0]?.value?.outcome).toBe('miss');
    expect(table.cards(f => f.moveResolution && f.actorId === 'pc-1')).toHaveLength(1);
    expect(narrationCalls()).toHaveLength(1);
    expect(narrationCalls()[0].system).toContain('DISCOVERY MODE');
  }, 30_000);

  it('the line is classified once: the read after the roll uses the read before it', async () => {
    implied();
    control.clarify = deferred();
    faceDanger('pl-1', 'pc-1', 'Kira', 'I slip past him before he can raise the alarm.');
    await table.settle();
    control.clarify.resolve(NONE);
    await table.settle(); await table.drain();
    expect(table.claude.calls.filter(isClassify)).toHaveLength(1);
    expect(narrationCalls()[0].system).toContain('EMBELLISHMENT MODE');   // "No specific entity"
  }, 30_000);

  it('control: a miss whose line implies no one asks nothing and is narrated as an embellishment', async () => {
    control.dice = MISS;
    faceDanger('pl-1', 'pc-1', 'Kira', 'I haul the bulkhead door shut behind us.');
    await table.settle(); await table.drain();
    expect(control.asked).toBe(0);
    expect(table.cards(f => f.moveResolution && f.actorId === 'pc-1')).toHaveLength(1);
    expect(narrationCalls()[0].system).toContain('EMBELLISHMENT MODE');
    expect(world().pendingMove).toBe(false);
  }, 30_000);

  it('control: a hit whose line implies no one asks nothing and is narrated as a discovery', async () => {
    faceDanger('pl-2', 'pc-2', 'Ren', 'I haul the bulkhead door shut behind us.');
    await table.settle(); await table.drain();
    expect(control.asked).toBe(0);
    expect(narrationCalls()[0].system).toContain('DISCOVERY MODE');
  }, 30_000);
});
