/**
 * STARFORGED COMPANION
 * tests/unit/bondItemAfterRelist.test.js
 *
 * Known-issues BOND-ITEM-AFTER-RELIST. A draft Confirm whose registration the
 * world refused leaves its NPC card unlisted (issue #337 Y34), and the
 * canonical GM's world load lists it (`migrator.registerUnlistedEntityActors`).
 * When that load lands before the GM presses Confirm again, the Confirm finds
 * the connection already listed and takes issue #321 U25's "exists" path —
 * which marks the row confirmed and creates nothing: the PC never got the
 * bond Item the first Confirm died before making (no Connections-tab entry,
 * no CHARACTER STATE bond, nothing for the BOND-ITEM-MIRROR writers to reach).
 *
 * The "exists" path now puts the bond on the PC the Confirm would bond
 * (`registerConnectionOnActiveCharacter`, idempotent per PC and connection),
 * so U25's own case — a Confirm whose card write was lost — makes no second.
 */

/* global expectConsoleError */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { failWrites, campaignStateWrite } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

let table;
const world = () => table.world.campaignState();
const named = (name) => table.actors.filter(a => a.name === name && a.flags?.[MODULE_ID]?.entityType === 'connection');
const rows  = (card) => table.world.message(card._id).flags[MODULE_ID].drafts.map(d => [d.name, d.status]);
const bondItems = (pcId, recordId) => table.actors.find(a => a.id === pcId).items.contents
  .filter(i => i.system?.subtype === 'bond' && i.flags?.[MODULE_ID]?.connectionId === recordId);

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, autoSeedConnection: false, autoSeedStarship: false,
    campaignState: {
      ...CampaignStateSchema,
      sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [],
      connectionIds: [], shipIds: [], sectors: [],
    },
  } } });
  // Two PCs: the narration was Ren's, so the bond is Ren's (issue #321 U23) —
  // not the first PC a GM's own fallback would pick.
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-1': 3 } });
});

/** The narration (Ren's) names Vex; the GM is offered the draft card. */
async function vexDraftCard() {
  const gm = table.client('gm-1');
  const { routeEntityDrafts } = await gm.import('../../src/entities/entityExtractor.js');
  await gm.run(() => routeEntityDrafts(
    [{ type: 'connection', name: 'Vex', description: 'A wiry pilot with a burned hand.', confidence: 'high' }],
    game.settings.get(MODULE_ID, 'campaignState'),
    { autoCreateConnection: false, actorId: 'pc-ren' },
  ));
  await table.settle();
  const cards = table.cards(f => f.draftEntityCard);
  expect(cards).toHaveLength(1);
  return cards[0];
}

/** The canonical GM's world-load pass that lists an unregistered entity (index.js ready). */
async function worldLoadListsTheCard() {
  const gm = table.client('gm-1');
  const migrator = await gm.import('../../src/entities/migrator.js');
  await gm.run(() => migrator.registerUnlistedEntityActors());
  await table.drain();
}

describe('a refused Confirm whose card the world load listed before the GM pressed Confirm again', () => {
  it("the second Confirm puts the bond Item on the narration's PC — one Vex, one bond", async () => {
    expectConsoleError(/registering connectionIds failed/);
    expectConsoleError(/draft confirm: createXxx failed/);
    const gm = table.client('gm-1');
    const card = await vexDraftCard();
    const refused = failWrites(table, campaignStateWrite('gm-1'), { times: 1 });

    gm.click(card._id, '[data-action="sf-draft-confirm"]');
    await table.drain();
    expect(refused.refused).toBe(1);
    expect(rows(card)).toEqual([['Vex', 'pending']]);   // control: Confirm is offered again
    expect(named('Vex')).toHaveLength(1);
    const orphanId = named('Vex')[0].id;
    const recordId = named('Vex')[0].flags[MODULE_ID].connection._id;
    expect(bondItems('pc-ren', recordId)).toHaveLength(0);   // control: the refused Confirm died before the bond

    await worldLoadListsTheCard();
    expect(world().connectionIds).toEqual([orphanId]);       // control: listed before the second press

    gm.click(card._id, '[data-action="sf-draft-confirm"]');
    await table.drain();

    expect(rows(card)).toEqual([['Vex', 'confirmed']]);
    expect(named('Vex')).toHaveLength(1);
    // The "exists" path marked the row and made no bond Item.
    expect(bondItems('pc-ren', recordId)).toHaveLength(1);
    expect(bondItems('pc-ren', recordId)[0].name).toBe('Vex');
    expect(bondItems('pc-kira', recordId)).toHaveLength(0);  // the narration's PC's, not the GM's fallback
  }, 30_000);

  it("control: a Confirm whose card write was lost (U25's case) — the second Confirm makes no second bond Item", async () => {
    expectConsoleError(/updateDraftCard failed/);
    const gm = table.client('gm-1');
    const card = await vexDraftCard();
    // The first Confirm creates Vex and the bond; its card write is refused.
    failWrites(table, (w) => w.kind === 'message.update' && w.id === card._id && w.client === 'gm-1', { times: 1 });

    gm.click(card._id, '[data-action="sf-draft-confirm"]');
    await table.drain();
    expect(rows(card)).toEqual([['Vex', 'pending']]);
    const recordId = named('Vex')[0].flags[MODULE_ID].connection._id;
    expect(bondItems('pc-ren', recordId)).toHaveLength(1);

    gm.click(card._id, '[data-action="sf-draft-confirm"]');
    await table.drain();
    expect(rows(card)).toEqual([['Vex', 'confirmed']]);
    expect(named('Vex')).toHaveLength(1);
    expect(bondItems('pc-ren', recordId)).toHaveLength(1);
  }, 30_000);
});
