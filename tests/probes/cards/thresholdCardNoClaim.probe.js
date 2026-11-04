/* global structuredClone */
/**
 * PROBE — CARDS-07 THRESHOLD-CARD-NO-CLAIM (ninth audit, area cards)
 *
 * What the user does: an Enter the Fray posts the "⚔ A fight looms" threshold
 * card (Enter the Fray / Find another way). A player presses one button; the
 * GM's chat re-renders the card (a scroll, a popout, a reload), or the GM
 * presses too. Later the fight is won, and the old card is still in the log.
 *
 * What happens: the threshold card is the one shared-button card without a
 * claim. registerCombatThresholdHook (src/index.js:4360-4418) disables both
 * buttons in the clicker's DOM only (`disable()`), stamps nothing on the
 * card and checks no flag at render, so every other client — and the
 * clicker's own next render — shows both buttons armed:
 *   - "🚪 Find another way" posts a way-out card from the pressing client
 *     (:4404-4415): a second press from the GM's client posts a second
 *     way-out card, each with its own one-shot off-ramps (wayOut.pick claims
 *     per card), so the crew can roll two exits from one fight;
 *   - "⚔ Enter the Fray" after the fight ended (Take Decisive Action won it,
 *     the track completed) begins the fight AGAIN: createCombatTrackFromThreshold
 *     → applyCombatProgress({ beginsFight: true }) matches open fights only
 *     (src/moves/combat.js:240-254, :302-321), so a new "Raiders" track is
 *     created and "Created combat track … Battle instead" is posted for a
 *     fight that is over — the issue #325 W11 shape the sibling Battle button
 *     was given a `fight-over` claim for.
 * The press is also the raw `combat.enterFray` socket (RELAY-LEGACY-KINDS).
 *
 * What should happen: one choice per threshold card, claimed on the
 * GM-authored card before the effect (rules/reachability.md §8: "A local
 * `disabled` is not a guard — another client, or a re-render, re-arms it"),
 * so a second press or a re-render finds it taken, and a stale Enter the
 * Fray after its fight ended opens no new fight.
 *
 * Controls: the first press of each button works — one way-out card; one
 * fight created with the card's label.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/cards/thresholdCardNoClaim.probe.js
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { CampaignStateSchema } from '../../../src/schemas.js';
import { buildCombatThresholdHtml } from '../../../src/moves/combatThreshold.js';

function makeTracksJournal(tracks = []) {
  const store = { [`${MODULE_ID}.tracks`]: structuredClone(tracks) };
  return {
    id: 'tracks-journal', name: 'Starforged Progress Tracks',
    getFlag: (mod, key) => store[`${mod}.${key}`],
    setFlag: async (mod, key, value) => { store[`${mod}.${key}`] = structuredClone(value); },
  };
}

let table;
const journal = () => table.journal.find(j => j.name === 'Starforged Progress Tracks');
const tracks  = () => journal().getFlag(MODULE_ID, 'tracks') ?? [];
const openFights = () => tracks().filter(t => t.type === 'combat' && !t.completed);

async function postThresholdCard() {
  const card = await table.client('gm-1').run(() => globalThis.ChatMessage.create({
    content: buildCombatThresholdHtml({ label: 'Raiders', suggestedRank: 'dangerous', vowNames: [] }),
    flags: { [MODULE_ID]: { combatThresholdCard: true, label: 'Raiders', position: null, actorId: 'pc-kira', resolutionId: 'res-1' } },
  }));
  await table.settle();
  return card.id;
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1 },
  } } });
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  table.journal._set(makeTracksJournal([]));
});

describe('CARDS-07 the threshold card\'s buttons act once per card', () => {
  it('control: the first "Find another way" posts one way-out card with its three off-ramps', async () => {
    const id = await postThresholdCard();
    table.client('pl-1').click(id, '[data-action="sf-way-out"]');
    await table.settle(); await table.drain();
    const wayOut = table.cards(f => f.wayOutCard);
    expect(wayOut).toHaveLength(1);
    expect(wayOut[0].content).toContain('data-action="sf-way-out-move"');
  }, 30_000);

  it('control: the first "Enter the Fray" creates the fight the card names, once', async () => {
    const id = await postThresholdCard();
    table.client('gm-1').click(id, '[data-action="sf-enter-fray"]');
    await table.settle(); await table.drain();
    expect(openFights().map(t => t.label)).toEqual(['Raiders']);
    expect(table.cards(f => f.combatTrackCard && f.created)).toHaveLength(1);
  }, 30_000);

  it('"Find another way" pressed by the player, then by the GM on a re-render, posts one way-out card', async () => {
    const id = await postThresholdCard();

    table.client('pl-1').click(id, '[data-action="sf-way-out"]');
    await table.settle(); await table.drain();
    expect(table.cards(f => f.wayOutCard)).toHaveLength(1);           // control: the first press works

    const gmRoot = table.client('gm-1').render(id);
    // Expected: the choice is taken everywhere. Today: both buttons armed on every other client.
    expect.soft(gmRoot.querySelector('[data-action="sf-way-out"]').disabled).toBe(true);
    expect.soft(gmRoot.querySelector('[data-action="sf-enter-fray"]').disabled).toBe(true);

    table.client('gm-1').click(id, '[data-action="sf-way-out"]');
    await table.settle(); await table.drain();
    expect.soft(table.cards(f => f.wayOutCard)).toHaveLength(1);      // today: 2 — two sets of off-ramps
  }, 30_000);

  it('"Enter the Fray" pressed again on the old card after the fight ended begins no new fight', async () => {
    const id = await postThresholdCard();

    table.client('gm-1').click(id, '[data-action="sf-enter-fray"]');
    await table.settle(); await table.drain();
    expect(openFights()).toHaveLength(1);                             // control: the fight is created
    expect(openFights()[0].label).toBe('Raiders');

    // The fight is won: its track completes (Take Decisive Action's endCombat).
    await journal().setFlag(MODULE_ID, 'tracks', tracks().map(t => ({ ...t, completed: true, completedAt: Date.now() })));
    expect(openFights()).toHaveLength(0);

    const gmRoot = table.client('gm-1').render(id);
    expect.soft(gmRoot.querySelector('[data-action="sf-enter-fray"]').disabled).toBe(true);   // today: armed again
    table.client('gm-1').click(id, '[data-action="sf-enter-fray"]');
    await table.settle(); await table.drain();
    // Today: a second "Raiders" fight is created and "Created combat track … Battle instead" posts again.
    expect.soft(openFights()).toHaveLength(0);
    expect.soft(table.cards(f => f.combatTrackCard && f.created)).toHaveLength(1);
  }, 30_000);
});
