/**
 * STARFORGED COMPANION
 * tests/unit/draftCardConcurrentConfirm.test.js
 *
 * Rows of one "New Entities Detected" card resolved concurrently all keep
 * their status, and a Confirm never creates an entity that already exists
 * (issue #321 U25).
 *
 * confirmDraft copied the card's `drafts` array at the click, awaited the
 * whole creation (Actor.create, the connectionIds write, the bond Item, the
 * portrait, the ledger promote), then wrote that copy back with only its own
 * row marked. A Confirm on a second row of the same card ran at the same time
 * (the in-flight guard is per row), so whichever finished last wrote a copy in
 * which the other row was still "pending": that row's Confirm came back, and
 * clicking it created the NPC a second time. Card writes now run one at a time
 * per card and change only their own row of the live card; Confirm checks for
 * an existing entity of that name and type before creating one.
 *
 * Distinct from DRAFT-CONFIRM-TWO-GMS (known-issues): one GM, one client.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { deferred } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

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
const rows  = (card) => table.world.message(card._id).flags[MODULE_ID].drafts.map(d => [d.name, d.status]);

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
  // A person's row has two confirming buttons — Confirm and "No one" (issue
  // #354 P2-16) — so Mira's Confirm is the third on the card.
  gm.click(card._id, '[data-action="sf-draft-confirm"]', { index: 2 });   // Mira — runs to the end
  await table.settle();
  hold.resolve();                                                         // Vance's create lands
  await table.drain();
}

describe('two rows of one draft card confirmed concurrently', () => {
  it('both stay confirmed — the slower write does not revert the other row', async () => {
    const card = await twoDraftCard();
    await confirmBothConcurrently(card);

    expect(named('Vance Oduya')).toHaveLength(1);
    expect(named('Mira Kade')).toHaveLength(1);
    expect(rows(card)).toEqual([['Vance Oduya', 'confirmed'], ['Mira Kade', 'confirmed']]);
  });

  it('no Confirm is offered again, so the NPC is not created a second time', async () => {
    const card = await twoDraftCard();
    await confirmBothConcurrently(card);

    const gm = table.client('gm-1');
    const root = gm.render(card._id);
    expect(root.querySelectorAll('[data-action="sf-draft-confirm"]')).toHaveLength(0);
    expect(named('Mira Kade')).toHaveLength(1);
  });

  it('a Confirm and a Dismiss on two rows both land', async () => {
    const card = await twoDraftCard();
    const gm = table.client('gm-1');
    const hold = deferred();
    table.interceptWrites((w) => (w.kind === 'actor.create' && w.name === 'Vance Oduya' ? hold.promise : undefined));

    gm.click(card._id, '[data-action="sf-draft-confirm"]', { index: 0 });   // Vance — in flight
    gm.click(card._id, '[data-action="sf-draft-dismiss"]', { index: 1 });   // Mira — dismissed meanwhile
    await table.settle();
    hold.resolve();
    await table.drain();

    expect(rows(card)).toEqual([['Vance Oduya', 'confirmed'], ['Mira Kade', 'dismissed']]);
  });
});

describe('Confirm on an entity that already exists', () => {
  it('marks the row and creates nothing — a lost card write cannot mint a duplicate NPC', async () => {
    expectConsoleError(/updateDraftCard failed/);
    const card = await twoDraftCard();
    const gm = table.client('gm-1');

    // The first Confirm creates Mira, but its card write is refused, so her
    // row still offers Confirm.
    const refuse = table.interceptWrites((w) => (w.kind === 'message.update' && w.id === card._id
      ? new Error('the card write was lost') : undefined));
    gm.click(card._id, '[data-action="sf-draft-confirm"]', { index: 2 });   // Mira's Confirm (after Vance's Confirm and "No one")
    await table.drain();
    refuse();
    expect(named('Mira Kade')).toHaveLength(1);
    expect(rows(card)).toEqual([['Vance Oduya', 'pending'], ['Mira Kade', 'pending']]);

    gm.click(card._id, '[data-action="sf-draft-confirm"]', { index: 2 });   // Mira's Confirm (after Vance's Confirm and "No one")
    await table.drain();

    expect(named('Mira Kade')).toHaveLength(1);
    expect(table.world.campaignState().connectionIds).toHaveLength(1);
    expect(rows(card)).toEqual([['Vance Oduya', 'pending'], ['Mira Kade', 'confirmed']]);
  });
});
