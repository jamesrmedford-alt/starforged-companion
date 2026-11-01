/**
 * STARFORGED COMPANION
 * tests/unit/loneShipNpcDraft.test.js
 *
 * Confirming a ship the narration introduced never displaces the players'
 * ship (issue #321 U26).
 *
 * When no tracked ship is flagged isCommandVehicle (a sidebar-made ship without
 * the STARSHIP asset), "a single tracked starship is the command vehicle" —
 * the lone-ship fallback. Every ship the GM confirmed from a "New Entities
 * Detected" card went into the same campaignState.shipIds, unflagged like the
 * players' own, so the first pirate cutter confirmed left two candidates and
 * no command vehicle: Withstand Damage rolled +0, integrity changes and
 * repairs found no vehicle, and the narrator's SHIP POSITION line vanished.
 * With no players' ship tracked, the NPC ship became "your ship" instead.
 *
 * The draft Confirm now marks the ship `npcShip`, and every lone-ship
 * fallback (ship.js, abilityScanner, narratorPrompt, `!ship envision`, the
 * Campaign Start envision) skips it. The test drives the real Confirm.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { ShipSchema } from '../../src/entities/ship.js';

let table;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

async function resetWith({ wayward }) {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    campaignState: {
      ...CampaignStateSchema,
      sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [],
      shipIds: wayward ? ['ship-wayward'] : [],
    },
  } } });
  if (wayward) {
    // The players' ship, made in the sidebar: tracked, never flagged.
    table.addActor({
      id: 'ship-wayward', type: 'starship', name: 'Wayward', ownership: { 'pl-1': 3 },
      flags: { [MODULE_ID]: { entityType: 'ship', entityId: 'rec-wayward',
        ship: { ...ShipSchema, _id: 'rec-wayward', name: 'Wayward', integrity: 5 } } },
    });
  }
}

/** The narration names a pirate cutter; the GM confirms it from the draft card. */
async function confirmDetectedShip() {
  const gm = table.client('gm-1');
  const { routeEntityDrafts } = await gm.import('../../src/entities/entityExtractor.js');
  await gm.run(() => routeEntityDrafts(
    [{ type: 'ship', name: 'Black Fang', description: 'A pirate cutter running dark.', confidence: 'high' }],
    game.settings.get(MODULE_ID, 'campaignState'),
    {},
  ));
  await table.settle();
  const card = table.cards(f => f.draftEntityCard)[0];
  expect(card).toBeTruthy();
  gm.click(card._id, '[data-action="sf-draft-confirm"]');
  await table.drain();
  const fang = table.actors.find(a => a.name === 'Black Fang');
  expect(fang?.type).toBe('starship');
  expect(table.world.campaignState().shipIds).toContain(fang.id);
  return fang;
}

/** What each lone-ship fallback resolves, read on the GM's client. */
async function commandVehicleEverywhere() {
  const gm = table.client('gm-1');
  const ship    = await gm.import('../../src/entities/ship.js');
  const scanner = await gm.import('../../src/moves/abilityScanner.js');
  const prompt  = await gm.import('../../src/narration/narratorPrompt.js');
  const envision = await gm.import('../../src/entities/shipEnvision.js');
  const stats   = await gm.import('../../src/moves/statEnrichment.js');
  return gm.run(async () => {
    const cs = game.settings.get(MODULE_ID, 'campaignState');
    const actorId = ship.getCommandVehicleActorId(cs);
    return {
      actorId,
      record:        ship.getCommandVehicle(cs)?.name ?? null,
      scanner:       scanner.getCommandVehicleActor(cs)?.id ?? null,
      envision:      envision.parseShipEnvisionCommand('!ship envision', cs).actor?.id ?? null,
      positionLine:  prompt.buildShipPositionLine(cs),
      withstandAdds: actorId ? stats.resolveStatValue(null, 'integrity', cs) : null,
      damage:        actorId ? ((await ship.changeIntegrity(actorId, -1)).reason ?? 'ok') : null,
    };
  });
}

describe('a ship confirmed from a draft card', () => {
  it("leaves the players' ship as the command vehicle everywhere", async () => {
    await resetWith({ wayward: true });
    await confirmDetectedShip();

    const cv = await commandVehicleEverywhere();
    expect(cv).toMatchObject({
      actorId: 'ship-wayward', record: 'Wayward', scanner: 'ship-wayward', envision: 'ship-wayward',
      withstandAdds: 5, damage: 'ok',
    });
    expect(cv.positionLine).toMatch(/Wayward/);
    expect(table.actors.find(a => a.id === 'ship-wayward').flags[MODULE_ID].ship.integrity).toBe(4);
  });

  it('is marked as someone else\'s ship', async () => {
    await resetWith({ wayward: true });
    const fang = await confirmDetectedShip();

    expect(fang.flags[MODULE_ID].ship.npcShip).toBe(true);
    expect(fang.flags[MODULE_ID].ship.isCommandVehicle).toBe(false);
  });

  it("does not become the players' ship when theirs is not tracked", async () => {
    await resetWith({ wayward: false });
    await confirmDetectedShip();

    const cv = await commandVehicleEverywhere();
    expect(cv).toMatchObject({ actorId: null, record: null, scanner: null, envision: null, positionLine: '' });
  });

  it("control: the players' lone ship resolves before any ship is detected", async () => {
    await resetWith({ wayward: true });

    const cv = await commandVehicleEverywhere();
    expect(cv).toMatchObject({ actorId: 'ship-wayward', record: 'Wayward', scanner: 'ship-wayward', envision: 'ship-wayward' });
  });
});
