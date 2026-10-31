/**
 * PROBE — DRAFT-CARD-STALE-STATUS
 *
 * confirmDraft (src/entities/entityExtractor.js) copies the card's `drafts`
 * array when the click lands, awaits the whole creation (Actor.create, the
 * connectionIds write, the bond Item, the silent portrait, the ledger
 * promote), then writes that copy back with its own row marked "confirmed"
 * (updateDraftCard → message.setFlag("drafts", copy)). The in-flight guard
 * (_draftsInFlight) is keyed per card AND draft index, so a Confirm on a
 * second row of the same card runs at the same time. Whichever finishes
 * last writes a snapshot in which the other row is still "pending": that
 * row's status reverts and its Confirm / Dismiss buttons come back.
 *
 * Here the first row's Actor.create is held (standing in for the slow part
 * of a real confirm — the awaited portrait generation, several socket
 * round trips on Forge) while the GM confirms the second row.
 *
 * Correct behaviour (asserted): after both confirms settle the card shows
 * both rows confirmed, and the re-armed Confirm (if any) does not create a
 * second NPC card for an entity that already exists.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { deferred } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

let table;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    campaignState: {
      ...CampaignStateSchema,
      sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [],
    },
  } } });
  table.addActor({ id: 'pc-pat', name: 'Kira', ownership: { 'pl-1': 3 } });
});

const named = (name) => table.actors.filter(a => a.name === name && a.flags?.[MODULE_ID]?.entityType === 'connection');

async function twoDraftCard() {
  const gm = table.client('gm-1');
  const { routeEntityDrafts } = await gm.import('../../src/entities/entityExtractor.js');
  await gm.run(() => routeEntityDrafts(
    [
      { type: 'connection', name: 'Vance Oduya', description: 'The dockmaster of the Hollow Spire.', confidence: 'high' },
      { type: 'connection', name: 'Mira Kade',   description: 'A courier with a burned hand.',        confidence: 'high' },
    ],
    game.settings.get(MODULE_ID, 'campaignState'),
    { autoCreateConnection: false },
  ));
  await table.settle();
  const cards = table.cards(f => f.draftEntityCard);
  expect(cards).toHaveLength(1);
  return cards[0];
}

/** GM confirms Vance (held mid-create), then Mira; then Vance finishes. */
async function confirmBothConcurrently(card) {
  const gm = table.client('gm-1');
  const hold = deferred();
  table.interceptWrites((w) => (w.kind === 'actor.create' && w.name === 'Vance Oduya' ? hold.promise : undefined));

  gm.click(card._id, '[data-action="sf-draft-confirm"]', { index: 0 });   // Vance — in flight
  gm.click(card._id, '[data-action="sf-draft-confirm"]', { index: 1 });   // Mira — runs to the end
  await table.settle();
  hold.resolve();                                                         // Vance's create lands
  await table.drain();
}

describe('PROBE DRAFT-CARD-STALE-STATUS', () => {
  it('two drafts confirmed back to back on one card both stay confirmed', async () => {
    const card = await twoDraftCard();
    await confirmBothConcurrently(card);

    expect(named('Vance Oduya')).toHaveLength(1);
    expect(named('Mira Kade')).toHaveLength(1);
    // Expected ['confirmed','confirmed']; the late writer reverts Mira's row.
    expect(table.world.message(card._id).flags[MODULE_ID].drafts.map(d => [d.name, d.status]))
      .toEqual([['Vance Oduya', 'confirmed'], ['Mira Kade', 'confirmed']]);
  });

  it('the reverted row cannot create a second NPC card for the same entity', async () => {
    const card = await twoDraftCard();
    await confirmBothConcurrently(card);

    // The GM sees Mira's row offering Confirm again and clicks it.
    const gm = table.client('gm-1');
    const root = gm.render(card._id);
    const reArmed = root.querySelectorAll('[data-action="sf-draft-confirm"]');
    if (reArmed.length) {
      gm.click(card._id, '[data-action="sf-draft-confirm"]', { index: 0 });
      await table.drain();
    }

    expect(named('Mira Kade')).toHaveLength(1);
  });
});
