/* global silenceConsoleErrors */
/**
 * Twelfth audit — CARD area probe.
 *
 * CARD-7 MILESTONE-PICK-GONE-VOW-CLOSES-PICKER (LOSE-STATE / UX)
 *
 * A Reach a Milestone naming no vow while Kira holds two posts the "⚑ Reach a
 * Milestone — Which vow advances?" picker (index.js postMilestonePickerCard
 * ~5964). One of the two vows leaves her sheet (deleted — a duplicate, or one
 * she dropped by hand) before anyone picks, and her player presses its stale
 * button.
 *
 * applyMilestonePick (src/moves/milestonePicker.js ~72): a vow FULFILLED since
 * is refused before the claim, with a short card, "The picker stays open for
 * its other vows" (issue #331 X20). A vow DELETED since is found missing only
 * AFTER the claim (`resolved: true`, ~131): the handler returns "no-vow" with
 * a console warning, the claim kept — the picker is closed for good, its other
 * vow's button disabled on every render, nothing marked and nobody told. The
 * milestone is lost (the move was already rolled; nothing re-offers it).
 *
 * Driven on a booted table: Kira's player types the move, the real pipeline
 * posts the real picker, her player presses it.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const control = vi.hoisted(() => ({ interpretation: null }));
vi.mock('../../../src/pacing/router.js', async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: 'chat' })),
}));
vi.mock('../../../src/moves/abilityScanner.js', async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

let table, findChen, repayDebts, kiraItems;

function vowItem(id, name) {
  const item = {
    id, type: 'progress', name, flags: { [MODULE_ID]: { vowId: id } },
    system: { subtype: 'vow', rank: 'dangerous', current: 8, completed: false },
    async update(changes) {
      for (const [k, v] of Object.entries(changes)) {
        const parts = k.split('.'); let t = item;
        for (const p of parts.slice(0, -1)) t = (t[p] ??= {});
        t[parts.at(-1)] = v;
      }
      return item;
    },
    async setFlag(scope, key, value) { (item.flags[scope] ??= {})[key] = value; return item; },
  };
  return item;
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

async function setUp() {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'mp-s1', sessionNumber: 1,
      currentSceneId: 'mp-scene', sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  findChen   = vowItem('v-chen', 'Find Chen');
  repayDebts = vowItem('v-debts', 'Repay Old Debts');
  kiraItems  = [findChen, repayDebts];
  // A live item list (find / filter read it too), so a vow removed mid-test is gone for every reader.
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: {
    contents: kiraItems, find: (fn) => kiraItems.find(fn) ?? null, filter: (fn) => kiraItems.filter(fn),
    [Symbol.iterator]: () => kiraItems[Symbol.iterator](),
  } });
  scriptClaude(table, { fallback: () => 'A step closer.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  silenceConsoleErrors();
  control.interpretation = { moveId: 'reach_a_milestone', moveName: 'Reach a Milestone', statUsed: null, adds: 0,
    isProgressMove: false, moveTarget: null, rationale: 'test', mischiefApplied: false };
  await table.client('pl-1').chat('Kira takes a step toward her goals.', { speaker: { actor: 'pc-kira' } });
  await table.settle(); await table.drain();
  const [picker] = table.cards(f => f.milestonePicker);
  expect(picker, 'two open vows, none named: the picker is posted (setup)').toBeTruthy();
  return picker;
}

async function pick(picker, vowId) {
  // A fresh render each press (as a reload, or the 15 s re-arm, gives): the
  // pressed client's buttons are disabled until the relay settles.
  table.client('pl-1').render(picker._id);
  table.client('pl-1').click(picker._id, `[data-action="sf-milestone-pick"][data-vow-id="${vowId}"]`);
  await table.settle(); await table.drain();
}

describe('CARD-7 — a milestone picker pressed for a vow deleted since it was posted', () => {
  it('control: "Find Chen" fulfilled meanwhile — the press marks nothing, and the picker stays open for "Repay Old Debts"', async () => {
    const picker = await setUp();
    findChen.system.completed = true;
    await pick(picker, 'v-chen');
    await pick(picker, 'v-debts');
    expect(repayDebts.system.current).toBe(16);
  }, 30_000);

  it('"Find Chen" deleted meanwhile — the press leaves the picker open for "Repay Old Debts"', async () => {
    const picker = await setUp();
    kiraItems.splice(kiraItems.indexOf(findChen), 1);
    await pick(picker, 'v-chen');
    await pick(picker, 'v-debts');
    expect(repayDebts.system.current, 'the milestone still reaches the vow that remains').toBe(16);
  }, 30_000);
});
