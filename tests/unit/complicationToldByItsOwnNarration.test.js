/**
 * STARFORGED COMPANION
 * tests/unit/complicationToldByItsOwnNarration.test.js
 *
 * CHOSEN-COST-TOLD-TWICE (the long haul's eighth live round, 2026-11-26,
 * explorations/long-haul-live-20261126-184225/): a cost card's peril or
 * complication is narrated by its own oracle follow-up — a72's "The man from
 * the berth has followed you across the docks" — and its card was never
 * stamped `toldBy`, so the chosen-cost rule (D10, CHOSEN-COST-NEVER-TOLD)
 * asked the next narration to tell it again: "[chosen-since] Since the last
 * narration, Mira Kestrel chose Complication at destination" at a25, a32 and
 * a73, three of the run's four. a73: "The cost of arriving shows at once. A
 * complication has followed you here."
 *
 * The complication's card carries the cost card it was chosen on; its
 * follow-up narration, once posted, stamps that card told.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { resetSkeletonTable, gmOf, narrationCallsOf, onGm, MODULE_ID } from '../helpers/skeletonTable.js';

let table;
let restore;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => { restore = await resetSkeletonTable(table); });
afterEach(() => restore?.());

/** A Set a Course weak hit's cost card, its "Complication at destination" picked after the roll's narration. */
async function costCard() {
  const { mapConsequences } = await gmOf(table).import('../../src/moves/resolver.js');
  const prompt = mapConsequences('set_a_course', 'weak_hit', false).sufferPrompt;
  expect(prompt.options[2].label).toBe('Complication at destination');
  return onGm(table, () => ChatMessage.create({ content: '<p>The cost card.</p>', flags: { [MODULE_ID]: {
    sufferCard: true, sufferPrompt: prompt, resolutionId: 'res-a71', actorId: 'pc-kira',
    resolved: true, chosenIndex: 2, pickedAfterNarration: true,
  } } }));
}

const owed = async () => {
  const { choicesChosenSince } = await gmOf(table).import('../../src/moves/contracts/obligations.js');
  return gmOf(table).run(() => choicesChosenSince()).map(p => p.cardId);
};

async function pickComplication(card) {
  const { runSufferResolution } = await gmOf(table).import('../../src/moves/sufferDialog.js');
  table.replies = () => ({ prose: 'A hand lands on the counter beside your credits.', sidecar: { newTruths: [], stateChanges: [] } });
  await onGm(table, () => runSufferResolution([{ kind: 'complication', scope: 'destination', label: 'Complication at destination' }],
    game.actors.get('pc-kira'), { sufferCardId: card?.id ?? null }));
}

describe('CHOSEN-COST-TOLD-TWICE — a complication is told by its own narration, once', () => {
  it('control: picked after the roll\'s narration, the cost is owed to the next narration', async () => {
    const card = await costCard();
    expect(await owed()).toEqual([card.id]);
  }, 40_000);

  it('the complication\'s narration stamps its cost card told: the next narration owes nothing', async () => {
    const card = await costCard();
    await pickComplication(card);
    // The complication was narrated, by its own follow-up…
    expect(narrationCallsOf(table).some(c => /complication/i.test(c.userText ?? ''))).toBe(true);
    const narrated = gmOf(table).run(() => game.messages.contents.find(m => m.flags?.[MODULE_ID]?.oracleNarrationCard));
    expect(narrated).toBeTruthy();
    // …which stamped the cost card with its own narration's id.
    const told = gmOf(table).run(() => game.messages.get(card.id)?.flags?.[MODULE_ID]?.toldBy ?? null);
    expect(told).toBeTruthy();
    expect(told).toBe(narrated.flags[MODULE_ID].narrationId);
    expect(await owed()).toEqual([]);
  }, 40_000);

  it('a complication posted with no cost card stamps nothing', async () => {
    const card = await costCard();
    await pickComplication(null);
    expect(gmOf(table).run(() => game.messages.get(card.id)?.flags?.[MODULE_ID]?.toldBy ?? null)).toBeNull();
    expect(await owed()).toEqual([card.id]);
  }, 40_000);
});
