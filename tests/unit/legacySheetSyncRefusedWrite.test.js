/**
 * STARFORGED COMPANION
 * tests/unit/legacySheetSyncRefusedWrite.test.js
 *
 * A refused save of one shared legacy track is that track's alone
 * (known-issues SUPPLY-SYNC-TWINS, found while fixing issue #331 X52).
 *
 * A player's sheet edit flows back to the crew's shared legacy tracks: the
 * canonical GM saves each edited track to campaignState, then mirrors it to
 * every sheet. A save the world refused threw out of the pass into the hook's
 * catch, which only logged: the other tracks of the edit were never saved or
 * mirrored, an edit queued during the pass was stranded, and the edited sheet
 * stayed ahead of the shared track it mirrors. Each track now stands alone:
 * the refusal is warned and named, the pass goes on, and the sheets are set to
 * the track as the world kept it.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { failWrites, holdWrites } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;

let table, kira, ren;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  await table.reset({ world: { settings: { chronicleAutoEntry: false,
    campaignState: { ...CampaignStateSchema, legacyTracks: { quests: { ticks: 8, cycles: 0, cleared: false } } } } } });
  kira = table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, system: { legacies: { quests: 8 } } });
  ren  = table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, system: { legacies: { quests: 8 } } });
});

const shared = (track) => table.world.campaignState().legacyTracks?.[track] ?? null;
const savesTrack = (track, ticks) => (w) => w.kind === 'setting' && w.key === KEY && w.value?.legacyTracks?.[track]?.ticks === ticks;

async function kiraEdits(changes) {
  await table.client('pl-1').run(() => kira.update(changes));
  await table.settle(); await table.drain();
}

describe('a refused save of one shared legacy track during the sheet sync (SUPPLY-SYNC-TWINS)', () => {
  it('control: an edit of two tracks saves and mirrors both', async () => {
    await kiraEdits({ 'system.legacies.quests': 9, 'system.legacies.bonds': 5 });
    expect(shared('quests')).toMatchObject({ ticks: 9 });
    expect(shared('bonds')).toMatchObject({ ticks: 5 });
    expect([ren.system.legacies.quests, ren.system.legacies.bonds]).toEqual([9, 5]);
  });

  it("is that track's alone: the edit's other track is still saved and mirrored, and the refusal is named", async () => {
    silenceConsoleErrors();
    const refusal = failWrites(table, savesTrack('quests', 9));

    await kiraEdits({ 'system.legacies.quests': 9, 'system.legacies.bonds': 5 });

    expect(refusal.refused).toBe(1);
    expect(shared('bonds')).toMatchObject({ ticks: 5 });
    expect(ren.system.legacies.bonds).toBe(5);
    expect(getCapturedWarns().some(w => /the shared quests legacy was not saved/.test(w))).toBe(true);
  });

  it('the edited sheet is set back to the shared track the world kept — no sheet stays ahead of it', async () => {
    silenceConsoleErrors();
    failWrites(table, savesTrack('quests', 9));
    await kiraEdits({ 'system.legacies.quests': 9 });
    expect(shared('quests')).toMatchObject({ ticks: 8 });
    expect([kira.system.legacies.quests, ren.system.legacies.quests]).toEqual([8, 8]);
  });

  it('an edit queued while a refused save was in flight still gets its pass', async () => {
    silenceConsoleErrors();
    const held = holdWrites(table, savesTrack('quests', 9));
    const first = table.client('pl-1').run(() => kira.update({ 'system.legacies.quests': 9 }));
    await held.arrived;                                                      // the quests save is in flight
    await table.client('pl-2').run(() => ren.update({ 'system.legacies.discoveries': 3 }));
    await table.settle();                                                    // its hook reaches the GM mid-pass: queued
    held.fail();                                                             // the world refuses the quests save
    await first;
    await table.settle(); await table.drain();
    expect(shared('discoveries')).toMatchObject({ ticks: 3 });
    expect(kira.system.legacies.discoveries).toBe(3);
  });
});
