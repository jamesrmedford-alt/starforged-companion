/**
 * PROBE — ENT-02 REFUSED-REGISTRATION-ORPHAN (tenth audit, area entities)
 *
 * What the user does: the GM confirms a narrator-detected connection ("Vex")
 * from the New Entities card; the world refuses the one campaignState write
 * that lists the new card (a server error, a dropped socket — the fault
 * issue #331 X35 was fixed for). The GM reads "Failed to create connection
 * "Vex"", the row still offers Confirm, and presses it again. A sibling: the
 * GM creates a starship from the sidebar (Auto-Seed Starship off, the
 * default) and the write that lists it in `shipIds` is refused.
 *
 * What happens: the creator made the Actor BEFORE the registration
 * (connection.js:94-108; ship.js:527-542 registerStarshipActorLight) and
 * leaves it when the registration is refused — an NPC card no id list names.
 * The next Confirm checks `entityExistsForName` over `connectionIds`
 * (entityExtractor.js:1162-1177), finds nothing, and creates a SECOND "Vex"
 * card: two Vex Actors in the NPCs folder (the Entities panel lists both —
 * it walks every flagged Actor, entityPanel.js:122), one of them listed. With
 * Auto-Seed NPC on, both were seeded and both portraits billed. The sidebar
 * ship's refusal is a console.warn (ship.js:539): the GM is told nothing, the
 * panel shows the ship, and no load-time repair (index.js:7552-7616, the
 * command-vehicle scan at :3053-3067) ever lists it — `getCommandVehicle`,
 * SHIP POSITION and Withstand Damage never see it. Deleting the listed
 * duplicate by hand leaves the roster pointing at nothing while the orphan
 * keeps the sidebar entry.
 *
 * What should happen: a creation the world could not register is undone
 * (the Actor deleted with the refusal told to the GM), or the retry adopts
 * the orphan it made (a get-or-create keyed on the record id,
 * rules/reachability.md §7 — `findMigratedConnectionActor` is the pattern),
 * and a refused registration is told to the GM ("No silent failures"). Either
 * way: one Vex card, listed, after the retry; a sidebar ship that the world
 * refused is named to the GM and listed by the next load.
 *
 * Control: with the write accepted, one Confirm makes one listed card and a
 * sidebar ship is listed at once.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/entities/refusedRegistrationOrphan.probe.js
 */

/* global expectConsoleError */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { failWrites, campaignStateWrite } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

let table;
const world = () => table.world.campaignState();
const named = (name) => table.actors.filter(a => a.name === name && a.flags?.[MODULE_ID]?.entityType === 'connection');
const rows  = (card) => table.world.message(card._id).flags[MODULE_ID].drafts.map(d => [d.name, d.status]);

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
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
});

async function vexDraftCard() {
  const gm = table.client('gm-1');
  const { routeEntityDrafts } = await gm.import('../../src/entities/entityExtractor.js');
  await gm.run(() => routeEntityDrafts(
    [{ type: 'connection', name: 'Vex', description: 'A wiry pilot with a burned hand.', confidence: 'high' }],
    game.settings.get(MODULE_ID, 'campaignState'),
    { autoCreateConnection: false },
  ));
  await table.settle();
  const cards = table.cards(f => f.draftEntityCard);
  expect(cards).toHaveLength(1);
  return cards[0];
}

/** The canonical GM's load-time entity repairs (index.js ready: the migrator passes and the command-vehicle scan). */
async function runLoadTimeRepairs() {
  const gm = table.client('gm-1');
  const migrator = await gm.import('../../src/entities/migrator.js');
  const ship     = await gm.import('../../src/entities/ship.js');
  await gm.run(async () => {
    const state = game.settings.get(MODULE_ID, 'campaignState');
    await migrator.flattenSectorActorFolders(state);
    await migrator.scaffoldPcShipFolders();
    await migrator.migrateJournalConnectionsToActors(state);
    await migrator.backfillNpcCardSheets();
    await migrator.syncEntityRecordNames(state);
    await migrator.moveRecordNotesToSheets();
    for (const actor of (game.actors?.contents ?? []).filter(a => a?.type === 'starship')) {
      await ship.syncCommandVehicleFlag(actor, game.settings.get(MODULE_ID, 'campaignState'));
    }
  });
  await table.drain();
}

describe('ENT-02 a Confirm whose registration the world refused, then confirmed again', () => {
  it('the retry adopts (or the refusal undoes) the card the first Confirm made — one Vex, listed', async () => {
    expectConsoleError(/registering connectionIds failed/);
    expectConsoleError(/draft confirm: createXxx failed/);
    const gm = table.client('gm-1');
    const card = await vexDraftCard();
    const refused = failWrites(table, campaignStateWrite('gm-1'), { times: 1 });

    gm.click(card._id, '[data-action="sf-draft-confirm"]');
    await table.drain();
    expect(refused.refused).toBe(1);
    expect(gm.notifications.some(n => /Failed to create connection "Vex"/.test(n.message))).toBe(true);   // control: the GM was told
    expect(rows(card)).toEqual([['Vex', 'pending']]);                                                     // control: Confirm is offered again
    expect(world().connectionIds).toEqual([]);                                                            // the world never took it
    expect(named('Vex')).toHaveLength(1);                                                                 // … but the card exists

    // The GM presses Confirm again; the world takes this write.
    gm.click(card._id, '[data-action="sf-draft-confirm"]');
    await table.drain();
    expect(rows(card)).toEqual([['Vex', 'confirmed']]);
    expect(world().connectionIds).toHaveLength(1);                                                        // control: one card listed
    // Expected: one Vex card — the one the world lists. Actual: two Vex
    // Actors in the NPCs folder, one of them listed; the Entities panel
    // shows both.
    expect(named('Vex')).toHaveLength(1);
    expect.soft(named('Vex').map(a => a.id)).toEqual(world().connectionIds);
  }, 30_000);

  it('control: with the write accepted one Confirm makes one listed card', async () => {
    const gm = table.client('gm-1');
    const card = await vexDraftCard();
    gm.click(card._id, '[data-action="sf-draft-confirm"]');
    await table.drain();
    expect(rows(card)).toEqual([['Vex', 'confirmed']]);
    expect(named('Vex')).toHaveLength(1);
    expect(world().connectionIds).toEqual(named('Vex').map(a => a.id));
  }, 30_000);
});

describe('ENT-02 a sidebar starship whose registration the world refused', () => {
  it('the GM is told, and the next load lists the ship the module registered on its own Actor', async () => {
    expectConsoleError(/registering shipIds failed/);
    const gm = table.client('gm-1');
    const refused = failWrites(table, campaignStateWrite('gm-1'), { times: 1 });

    await gm.run(() => Actor.create({ name: 'Kestrel', type: 'starship' }));
    await table.drain();
    expect(refused.refused).toBe(1);
    const ship = table.actors.find(a => a.type === 'starship' && a.name === 'Kestrel');
    expect(ship?.flags?.[MODULE_ID]?.ship?._id).toBeTruthy();   // control: the module wrote its ship record onto the Actor
    expect(world().shipIds).toEqual([]);                        // the world never took the id

    // Expected ("No silent failures"): the GM is told the ship was not
    // registered. Actual: a console.warn, nothing on screen.
    expect.soft(gm.notifications.some(n => /Kestrel|starship|registered/i.test(n.message))).toBe(true);

    // Expected (rules/reachability.md §7 — a creation is get-or-create on a
    // stable id): the load-time repairs list the ship whose record the Actor
    // carries. Actual: no pass registers it — the Entities panel shows it,
    // getCommandVehicle / SHIP POSITION / Withstand Damage never do.
    await runLoadTimeRepairs();
    expect(world().shipIds).toContain(ship.id);
  }, 30_000);

  it('control: with the write accepted a sidebar ship is listed at once', async () => {
    const gm = table.client('gm-1');
    await gm.run(() => Actor.create({ name: 'Kestrel', type: 'starship' }));
    await table.drain();
    const ship = table.actors.find(a => a.type === 'starship' && a.name === 'Kestrel');
    expect(world().shipIds).toEqual([ship.id]);
  }, 30_000);
});
