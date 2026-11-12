/**
 * DRAFT-CONFIRM-TWO-GMS (known-issues). Two GMs pressing Confirm on the same
 * "New Entities Detected" row at the same moment created the NPC twice: each
 * press ran confirmDraft on its own client, past the per-client in-flight
 * guard, and each checked "does Vex exist yet?" before either had made her
 * (issue #321 U25 narrowed it to a truly simultaneous press). Confirm and
 * Dismiss are relayed to the canonical GM now (relayCardAction, as the suffer
 * card is), where the relay queue runs one press at a time: the second finds
 * the row confirmed and does nothing.
 *
 * Harness: draftCardConcurrentConfirm.test.js's, with a second GM.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';

let table;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.GM2, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, autoSeedConnection: false,
    campaignState: {
      ...CampaignStateSchema,
      sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [],
    },
  } } });
  table.addActor({ id: 'pc-pat', name: 'Kira', ownership: { 'pl-1': 3 } });
});

const named = (name) => table.actors.filter(a => a.name === name && a.flags?.[MODULE_ID]?.entityType === 'connection');
const rows  = (card) => table.world.message(card._id).flags[MODULE_ID].drafts.map(d => [d.name, d.status]);

async function draftCard() {
  const gm = table.client('gm-1');
  const { routeEntityDrafts } = await gm.import('../../src/entities/entityExtractor.js');
  await gm.run(() => routeEntityDrafts(
    [{ type: 'connection', name: 'Vance Oduya', description: 'The dockmaster of the Hollow Spire.', confidence: 'high' }],
    game.settings.get(MODULE_ID, 'campaignState'),
    { autoCreateConnection: false },
  ));
  await table.settle();
  const cards = table.cards(f => f.draftEntityCard);
  expect(cards).toHaveLength(1);
  return cards[0];
}

describe('DRAFT-CONFIRM-TWO-GMS — two GMs press Confirm on one row at once', () => {
  it('the NPC is created once, and the row is confirmed', async () => {
    const card = await draftCard();
    table.client('gm-2').click(card._id, '[data-action="sf-draft-confirm"]');
    table.client('gm-1').click(card._id, '[data-action="sf-draft-confirm"]');
    await table.drain();

    expect(named('Vance Oduya')).toHaveLength(1);                       // was 2
    expect(table.world.campaignState().connectionIds).toHaveLength(1);
    expect(rows(card)).toEqual([['Vance Oduya', 'confirmed']]);
  });

  it('a Confirm and a Dismiss pressed at once on one row: the first to reach the canonical GM wins, nothing is half-done', async () => {
    const card = await draftCard();
    table.client('gm-1').click(card._id, '[data-action="sf-draft-confirm"]');
    table.client('gm-2').click(card._id, '[data-action="sf-draft-dismiss"]');
    await table.drain();

    expect(named('Vance Oduya')).toHaveLength(1);
    expect(rows(card)).toEqual([['Vance Oduya', 'confirmed']]);
    expect(table.world.campaignState().dismissedEntities ?? []).toEqual([]);
  });

  it('control: the non-canonical GM\'s Confirm alone creates the NPC (relayed)', async () => {
    const card = await draftCard();
    table.client('gm-2').click(card._id, '[data-action="sf-draft-confirm"]');
    await table.drain();
    expect(named('Vance Oduya')).toHaveLength(1);
    expect(rows(card)).toEqual([['Vance Oduya', 'confirmed']]);
  });

  it('control: the non-canonical GM\'s Dismiss alone dismisses the row (relayed)', async () => {
    const card = await draftCard();
    table.client('gm-2').click(card._id, '[data-action="sf-draft-dismiss"]');
    await table.drain();
    expect(named('Vance Oduya')).toHaveLength(0);
    expect(rows(card)).toEqual([['Vance Oduya', 'dismissed']]);
  });
});
