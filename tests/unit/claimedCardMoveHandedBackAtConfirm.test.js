/**
 * STARFORGED COMPANION
 * tests/unit/claimedCardMoveHandedBackAtConfirm.test.js
 *
 * A card button's forced move the GM does not let roll gives the card its
 * press back (issue #347 AB06).
 *
 * A one-shot card button (here "⚑ Mark Progress on Vow", gmRelay
 * "milestone.suggestion") claims its card (`milestoneMarked: true`), then
 * posts its forced move. The claim was released only if that post failed:
 * when the GM closed the forced move's confirm dialog (or "Re-interpret"ed —
 * there is nothing to re-word in a button's move), the pipeline returned and
 * the card read "⚑ Milestone marked" on every client for good, though nothing
 * was marked. The pipeline now hands the claim back and whispers the roller.
 */
/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [0.0, 0.15, 0.99], confirm: () => true, throwIn: null }));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async (interpretation) => {
    if (control.throwIn === interpretation?.moveId) throw new Error('confirm failed');
    return control.confirm(interpretation);
  }),
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

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude, failWrites, campaignStateWrite } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

let table, vow;

function makeVow() {
  const item = {
    id: 'vow-1', type: 'progress', name: 'Find Chen', flags: { [MODULE_ID]: { vowId: 'vid-chen' } },
    system: { subtype: 'vow', rank: 'dangerous', current: 0, completed: false },
    async update(changes) { for (const [k, v] of Object.entries(changes)) if (k === 'system.current') item.system.current = v; return item; },
    async setFlag(scope, key, value) { (item.flags[scope] ??= {})[key] = value; return item; },
  };
  return item;
}

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.dice = [0.0, 0.15, 0.99];
  control.confirm = () => true;
  control.throwIn = null;
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [] },
  } } });
  vow = makeVow();
  table.addActor({ id: 'pc-1', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [vow] } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  scriptClaude(table);
  silenceConsoleErrors();
});

/** Kira's Gather Information strong hit: its move card offers "⚑ Mark Progress on Vow". */
async function postMoveCardWithMilestoneButton() {
  table.client('pl-1').chat('I comb the archive for word of Chen.', {
    speaker: { actor: 'pc-1', alias: 'Kira' },
    flags: { [MODULE_ID]: { bypassPacing: true, forcedMoveId: 'gather_information' } },
  });
  await table.settle(); await table.drain();
  const [card] = table.cards(f => f.moveResolution && f.milestoneSuggestion?.eligible);
  expect(card, 'the strong hit posted a move card with the milestone suggestion').toBeTruthy();
  return card;
}

describe('a claimed card button whose forced move the GM does not confirm (issue #347 AB06)', () => {
  it('the GM closes the confirm dialog of the button\'s Reach a Milestone: the card is pressable again', async () => {
    const card = await postMoveCardWithMilestoneButton();

    // The GM closes (or "Re-interpret"s) the confirm dialog of the forced Reach a Milestone.
    control.confirm = (interpretation) => interpretation?.moveId !== 'reach_a_milestone';
    table.client('pl-1').click(card._id, '[data-action="sf-reach-milestone"]');
    await table.settle(); await table.drain();

    // The forced move was posted and went nowhere: nothing marked, the lock free.
    expect(table.cards(f => f.forcedMoveId === 'reach_a_milestone')).toHaveLength(1);
    expect(vow.system.current, 'no milestone was marked').toBe(0);
    expect(table.world.campaignState().pendingMove, 'the move lock is free').toBe(false);

    const claimed = table.world.message(card._id).flags[MODULE_ID].milestoneMarked === true;
    expect(claimed, 'the card\'s claim is released when its forced move is not rolled').toBe(false);
    // …and the roller's player is told.
    const told = table.cards(f => !!f.moveNotRolledNotice);
    expect(told).toHaveLength(1);
    expect(table.world.message(told[0]._id).whisper).toContain('pl-1');

    // …so the press can be made again and marks the vow.
    control.confirm = () => true;
    table.client('pl-1').click(card._id, '[data-action="sf-reach-milestone"]');
    await table.settle(); await table.drain();
    expect(vow.system.current).toBe(8);
  }, 30_000);

  it('control: the same press with the dialog accepted marks the vow once and keeps the claim', async () => {
    const card = await postMoveCardWithMilestoneButton();
    table.client('pl-1').click(card._id, '[data-action="sf-reach-milestone"]');
    await table.settle(); await table.drain();
    const claimed = table.world.message(card._id).flags[MODULE_ID].milestoneMarked === true;
    expect({ ticks: vow.system.current, claimed }).toEqual({ ticks: 8, claimed: true });
  }, 30_000);
  it('the world refuses the forced move\'s lock claim: the card is pressable again and its roller is told', async () => {
    const card = await postMoveCardWithMilestoneButton();
    const isClaim = (w) => campaignStateWrite('gm-1')(w) && w.value?.pendingMove === true && !table.world.campaignState().pendingMove;
    failWrites(table, isClaim, { times: 1 });
    table.client('pl-1').click(card._id, '[data-action="sf-reach-milestone"]');
    await table.settle(); await table.drain();

    expect(vow.system.current).toBe(0);
    expect(table.world.message(card._id).flags[MODULE_ID].milestoneMarked).toBe(false);
    expect(table.cards(f => !!f.moveNotRolledNotice)).toHaveLength(1);
  }, 30_000);

  it('a forced move that fails before its dice gives the card its press back', async () => {
    const card = await postMoveCardWithMilestoneButton();
    control.throwIn = 'reach_a_milestone';
    table.client('pl-1').click(card._id, '[data-action="sf-reach-milestone"]');
    await table.settle(); await table.drain();

    expect(vow.system.current).toBe(0);
    expect(table.world.message(card._id).flags[MODULE_ID].milestoneMarked).toBe(false);
    expect(table.world.campaignState().pendingMove).toBe(false);
  }, 30_000);
});
