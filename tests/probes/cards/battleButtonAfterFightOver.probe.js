/**
 * PROBE — IC BATTLE-BUTTON-REROLLS-FINISHED-FIGHT
 *
 * What the user does: enters a fight; the "Enter the Fray" combat-track card
 * (postCombatTrackCard) offers "⚔ Battle instead". The player presses it and
 * the Battle ends the fight. The GM's copy of the card — or the player's own
 * after a reload / chat re-render — still shows a live Battle button, and it
 * is pressed again.
 *
 * What happens: wireCombatTrackCardButtons (src/index.js ~6700) disables the
 * button only in the clicker's DOM and stamps nothing, so every other client
 * and every re-render arms it again. The second press posts another forced
 * `battle` naming the fight by id (forcedMoveTargetId). The pipeline's
 * gone-track guard (src/index.js ~1108, issue #306 R06: "a track deleted or
 * finished before the roll resolves rolls nothing") only covers progress
 * moves (`tickInfo.source` combat / expedition / vow); Battle is an action
 * move, so it rolls in full against the finished fight: a strong hit gives
 * +2 momentum, a weak hit or miss routes a Pay the Price (a d100 card, its
 * suffer route and a tick on every tension and vow clock) — for a fight that
 * is over. finishCombat then closes nothing.
 *
 * What should happen: the Battle button is one-shot per card, and a Battle
 * naming a finished fight by id is "not rolled", as Take Decisive Action and
 * Finish an Expedition are.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [] }));
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

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';
import { resolveMove } from '../../../src/moves/resolver.js';

const STRONG = [0.0, 0.15, 0.99];   // challenge 1 and 2, action die 6
const MISS   = [0.95, 0.95, 0.0];   // challenge 10 and 10, action die 1
let table, fight, store;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 2, currentSceneId: 'sc-1', sceneTruths: [] },
  } } });
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  scriptClaude(table);
  silenceConsoleErrors();
  resolveMove.mockClear();

  const gm = table.client('gm-1');
  store = await gm.import('../../src/ui/progressTracks.js');
  const journal = { id: 'tracks-journal', name: 'Starforged Progress Tracks', _flags: {},
    getFlag(mod, key) { return this._flags[`${mod}.${key}`]; },
    async setFlag(mod, key, value) { this._flags[`${mod}.${key}`] = structuredClone(value); } };
  table.journal._set(journal);
  fight = await gm.run(() => store.addProgressTrack({ label: 'Archive guards', type: 'combat', rank: 'dangerous' }));
});

async function postCombatTrackCard() {
  const msg = await table.client('gm-1').run(() => globalThis.ChatMessage.create({
    content: `<div class="sf-ptp-card"><strong>Enter the Fray</strong><p>Created combat track <strong>Archive guards</strong> (dangerous).</p>`
      + `<p><button type="button" data-action="sf-battle" class="entity-btn">⚔ Battle instead</button></p></div>`,
    flags: { [MODULE_ID]: { combatTrackCard: true, created: true, trackId: fight.id, trackLabel: 'Archive guards' } },
  }));
  await table.settle();
  return msg.id;
}

const ptpCards = () => table.cards(f => f.payThePriceCard);

describe('PROBE IC BATTLE-BUTTON-REROLLS-FINISHED-FIGHT', () => {
  it('the player\'s Battle ends the fight; the GM pressing the same card\'s Battle afterwards rolls nothing', async () => {
    const id = await postCombatTrackCard();

    control.dice = STRONG;
    table.client('pl-1').click(id, '[data-action="sf-battle"]');
    await table.settle(); await table.drain();
    expect(resolveMove).toHaveBeenCalledTimes(1);
    const tracks = await table.client('gm-1').run(() => store.listProgressTracks());
    expect(tracks.find(t => t.id === fight.id)?.completed).toBe(true);   // the fight is over

    control.dice = MISS;
    table.client('gm-1').click(id, '[data-action="sf-battle"]');
    await table.settle(); await table.drain();

    // Expected: no second Battle and no Pay the Price for a fight that is over.
    // Today: a second Battle is rolled; its miss routes Pay the Price.
    expect({ battles: resolveMove.mock.calls.length, payThePrice: ptpCards().length })
      .toEqual({ battles: 1, payThePrice: 0 });
  }, 30_000);

  it('the clicker\'s own Battle button is live again after a re-render', async () => {
    const id = await postCombatTrackCard();
    control.dice = STRONG;
    table.client('pl-1').click(id, '[data-action="sf-battle"]');
    await table.settle(); await table.drain();
    const root = table.client('pl-1').render(id);
    expect(root.querySelector('[data-action="sf-battle"]').disabled).toBe(true);
  }, 30_000);
});
