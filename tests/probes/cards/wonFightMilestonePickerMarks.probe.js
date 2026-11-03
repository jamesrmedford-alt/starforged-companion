/**
 * PROBE — IC WON-FIGHT-PICKER-ONE-MARK
 *
 * What the user does: wins a Formidable fight (marks ×2) that served a vow
 * since renamed ("Rescue Vex" → "Free Calloway" — the fight track keeps only
 * `linkedVowName`); the roller holds two open vows. They press the victory
 * card's "⚑ Mark milestone (×2)", then pick the vow on the picker it posts.
 *
 * What happens: markLinkedVowMilestone → applyReachMilestone(actor, name, 2)
 * finds no vow by the stale name and posts postMilestonePickerCard(vows,
 * actorId) — which carries no mark count — and returns "pick", which
 * markLinkedVowMilestone reports `{ ok: true }`: the victory card's button is
 * stamped applied. The pick (milestonePicker.js applyMilestonePick) marks
 * milestoneTicks(rank) once. The ×2 is lost.
 *
 * What should happen: the picked vow takes the card's two milestones
 * (marksForSourceRank × the vow's ticks per mark).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

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

describe('PROBE IC WON-FIGHT-PICKER-ONE-MARK', () => {
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

    // Expected: two Dangerous milestones (2 × 8 ticks). Today: one (8).
    expect(calloway.system.current).toBe(16);
  }, 30_000);
});
