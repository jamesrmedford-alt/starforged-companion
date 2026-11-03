// tests/unit/wonFightMilestonePickerMarks.test.js
// A won fight's ×N milestone that falls to the vow picker marks the picked
// vow N times (issue #326 W43). The fight track keeps only
// `linkedVowName`; after a rename, markLinkedVowMilestone →
// applyReachMilestone(actor, name, marks) found no vow by the stale name
// and posted the picker, which carried no mark count, and the pick
// (milestonePicker.js applyMilestonePick) marked milestoneTicks(rank) once
// while the victory card was stamped applied. The marks now ride the
// picker's choices.

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

let table, calloway, sister;

function vowItem(id, name, ticks = 0) {
  const item = {
    id, name, type: 'progress',
    system: { subtype: 'vow', rank: 'dangerous', current: ticks, completed: false },
    flags: { [MODULE_ID]: { vowId: `vid-${id}` } },
    update: async (changes) => {
      if ('system.current' in changes) item.system.current = changes['system.current'];
      if ('system.completed' in changes) item.system.completed = changes['system.completed'];
    },
    setFlag: async (mod, key, val) => { (item.flags[mod] ??= {})[key] = val; },
  };
  return item;
}

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 2, currentSceneId: 'sc-1' },
  } } });
  calloway = vowItem('v-cal', 'Free Calloway');        // was "Rescue Vex"
  sister   = vowItem('v-sis', 'Find my sister');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [calloway, sister] } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  scriptClaude(table);
  silenceConsoleErrors();
});

describe('a won fight\'s milestone count rides the vow picker (issue #326 W43)', () => {
  it('a ×2 milestone that falls to the picker marks the picked vow twice', async () => {
    const card = await table.client('gm-1').run(() => globalThis.ChatMessage.create({
      content: `<div class="sf-card sf-fight-vow"><p><button type="button" data-action="sf-mark-milestone">⚑ Mark milestone (×2)</button></p></div>`,
      flags: { [MODULE_ID]: { fightVowCard: true, vowName: 'Rescue Vex', marks: 2, connectionName: null, vowRank: null, actorId: 'pc-kira' } },
    }));
    await table.settle();

    table.client('pl-1').click(card.id, '[data-action="sf-mark-milestone"]');
    await table.settle(); await table.drain();

    const [picker] = table.cards(f => f.milestonePicker);
    expect(picker, 'the stale name posted a picker').toBeTruthy();
    expect(table.world.message(card.id).flags[MODULE_ID].resolvedActions?.markMilestone).toBe(true);

    table.client('pl-1').click(picker._id, '[data-action="sf-milestone-pick"][data-vow-id="v-cal"]');
    await table.settle(); await table.drain();

    // Two Dangerous milestones (2 × 8 ticks); the picker used to mark one (8).
    expect(calloway.system.current).toBe(16);
  }, 30_000);
  it('control: a Reach a Milestone with two open vows and none named marks the picked vow once', async () => {
    const card = await table.client('gm-1').run(() => globalThis.ChatMessage.create({
      content: `<div class="sf-card sf-fight-vow"><p><button type="button" data-action="sf-mark-milestone">⚑ Mark milestone (×1)</button></p></div>`,
      flags: { [MODULE_ID]: { fightVowCard: true, vowName: 'Rescue Vex', marks: 1, connectionName: null, vowRank: null, actorId: 'pc-kira' } },
    }));
    await table.settle();

    table.client('pl-1').click(card.id, '[data-action="sf-mark-milestone"]');
    await table.settle(); await table.drain();
    const [picker] = table.cards(f => f.milestonePicker);
    table.client('pl-1').click(picker._id, '[data-action="sf-milestone-pick"][data-vow-id="v-sis"]');
    await table.settle(); await table.drain();
    expect(sister.system.current).toBe(8);
    expect(calloway.system.current).toBe(0);
  }, 30_000);

  it('the ×2 picker says so and stamps the marks on every choice', async () => {
    const card = await table.client('gm-1').run(() => globalThis.ChatMessage.create({
      content: `<div class="sf-card sf-fight-vow"><p><button type="button" data-action="sf-mark-milestone">⚑ Mark milestone (×2)</button></p></div>`,
      flags: { [MODULE_ID]: { fightVowCard: true, vowName: 'Rescue Vex', marks: 2, connectionName: null, vowRank: null, actorId: 'pc-kira' } },
    }));
    await table.settle();
    table.client('pl-1').click(card.id, '[data-action="sf-mark-milestone"]');
    await table.settle(); await table.drain();

    const [picker] = table.cards(f => f.milestonePicker);
    expect(picker.content).toContain('Reach a Milestone (×2)');
    expect(picker.flags[MODULE_ID].choices).toEqual([
      { vowId: 'v-cal', actorId: 'pc-kira', marks: 2 },
      { vowId: 'v-sis', actorId: 'pc-kira', marks: 2 },
    ]);
  }, 30_000);
});
