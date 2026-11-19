/**
 * STARFORGED COMPANION
 * tests/unit/anySufferVehicleAndCompanionChoice.test.js
 *
 * Issue #364 ANY-SUFFER-SUPPORT-VEHICLE — which vehicle, which companion.
 *
 * 1. A "make a suffer move" card's Withstand Damage counted only the command
 *    vehicle: a PC with a Hoverbike and no starship found it greyed out
 *    ("unavailable"), and one with both could never choose the bike — the
 *    starship took it unasked. The card now counts every vehicle that could
 *    take it: one is taken, several ask "which vehicle?" on a follow-up card,
 *    as several companions ask "which companion?" (issue #362 AC28).
 * 2. A Pay the Price route — "A friend, companion, or ally is in harm's way",
 *    or a stated Companion Takes a Hit — with several companions and none
 *    named harmed the first in the list. It asks which. A "Your vehicle
 *    suffers damage" route with no command vehicle found "no vehicle to take
 *    it" though the PC rode a support vehicle: the only one takes it, several
 *    ask which; with a command vehicle it is the starship's, as before (a
 *    null target is the starship — issue #345 AA14).
 *
 * On a booted GM / player table (tests/helpers/multiClient.js): the cards are
 * the real ones, posted on the canonical GM; the player's picks go through
 * their own client and relay to the GM.
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { CampaignStateSchema } from "../../src/schemas.js";

const PICK = '[data-action="sf-suffer-pick"]';
const WITHSTAND = `${PICK}[data-suffer-id="withstand_damage"]`;
const option = (i) => `${PICK}[data-option-index="${i}"]`;

/** A vendor-shaped asset with a condition track, written by its own update(). */
function asset(id, name, category, trackName, value) {
  const item = { id, name, type: "asset",
    system: { category, abilities: [], track: { enabled: true, name: trackName, value, min: 0, max: 5 }, conditions: [] },
    update: async (changes) => { if ("system.track.value" in changes) item.system.track.value = changes["system.track.value"]; } };
  return item;
}
const hoverbike = () => asset("bike-1", "Hoverbike", "Support Vehicle", "Integrity", 3);
const rover     = () => asset("rover-1", "Rover", "Support Vehicle", "Integrity", 4);
const rockhorn  = () => asset("c-rockhorn", "Rockhorn", "Companion", "Health", 4);
const glowcat   = () => asset("c-glowcat", "Glowcat", "Companion", "Health", 3);

let table, ship, cardModule, indexModule;
const world = () => table.world.campaignState();
const gm = () => table.client("gm-1");
const sufferCards = () => table.cards(f => f.sufferCard && f.sufferPrompt);
const labels = (card) => [...table.client("pl-1").render(card._id).querySelectorAll(PICK)].map(b => b.textContent.trim());
const shipIntegrity = () => ship.flags[MODULE_ID].ship.integrity;

function addPc(...items) {
  return table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 },
    system: { health: { value: 5 }, momentum: { value: 2 } }, items: { contents: items } });
}
async function addShip() {
  ship = table.addActor({ id: "ship-savela", name: "ISV Savela", type: "starship", system: { debility: {} },
    flags: { [MODULE_ID]: { entityType: "ship",
      ship: { _id: "ship-rec", name: "ISV Savela", isCommandVehicle: true, integrity: 5, integrityMax: 5, battered: false } } } });
  await gm().run(() => game.settings.set(MODULE_ID, "campaignState", { ...world(), shipIds: [ship.id] }));
}
/** A "make a suffer move (-1)" card for the PC, as a price's or a move's choice posts it. */
async function anyCard(pc) {
  await gm().run(() => cardModule.postSufferChoiceCard({ sufferPrompt: { kind: "any", amount: 1, count: 1 }, actor: pc, executorOpts: { isMiss: true } }));
  await table.settle();
  return sufferCards().at(-1);
}
async function click(card, selector) {
  await table.client("pl-1").click(card._id, selector);
  await table.settle(); await table.drain();
}
/** A Pay the Price route dispatched for the PC, as a rolled or stated price's is (the relayed `!ptp`'s entry). */
async function payRoute(pc, route) {
  await gm().run(() => indexModule.applyPayThePriceSufferFromRelay({ routes: [route], actorId: pc.id }, { requesterIsGM: true }));
  await table.settle(); await table.drain();
}
const COMPANION_ROUTE = { move: "companion_takes_a_hit", amount: 1, soloFallback: "endure_harm" };
const VEHICLE_ROUTE   = { move: "withstand_damage", amount: 1 };

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
  cardModule  = await table.client("gm-1").import("../../src/moves/sufferCard.js");
  indexModule = await table.client("gm-1").import("../../src/index.js");
}, 60_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  ship = null;
  await table.reset({ world: { settings: { chronicleAutoEntry: false, narratorSessionSummary: false, campaignState: {
    ...CampaignStateSchema, sessionActive: true, currentSessionId: "asv-s1", sessionNumber: 1, currentSceneId: "asv-scene", sceneTruths: [], clocks: [],
  } } } });
  silenceConsoleErrors();
});

describe("a suffer card's Withstand Damage counts every vehicle that could take it (issue #364 ANY-SUFFER-SUPPORT-VEHICLE)", () => {
  it("a support vehicle and no command vehicle: the pick is open, and damages that vehicle", async () => {
    const bike = hoverbike();
    const card = await anyCard(addPc(bike));
    const button = table.client("pl-1").render(card._id).querySelector(WITHSTAND);
    expect(button.disabled).toBe(false);
    expect(button.textContent).not.toMatch(/unavailable/);

    await click(card, WITHSTAND);
    expect(bike.system.track.value).toBe(2);
    expect(table.world.message(card._id).flags[MODULE_ID].resolved).toBe(true);
    expect(sufferCards()).toHaveLength(1);
  }, 60_000);

  it("several support vehicles: the pick asks which, and the one chosen takes it", async () => {
    const bike = hoverbike(); const car = rover();
    const card = await anyCard(addPc(bike, car));
    await click(card, WITHSTAND);

    expect(table.world.message(card._id).content).toMatch(/Withstand Damage chosen — choose which vehicle on the follow-up card/);
    expect({ bike: bike.system.track.value, car: car.system.track.value }).toEqual({ bike: 3, car: 4 });
    const which = sufferCards().at(-1);
    expect(which._id).not.toBe(card._id);
    expect(labels(which)).toEqual(["Hoverbike takes the damage (-1)", "Rover takes the damage (-1)"]);

    await click(which, option(1));
    expect({ bike: bike.system.track.value, car: car.system.track.value }).toEqual({ bike: 3, car: 3 });
  }, 60_000);

  it("the command vehicle and a support vehicle: the pick asks which — the starship no longer takes it unasked", async () => {
    const bike = hoverbike();
    const pc = addPc(bike);
    await addShip();
    const card = await anyCard(pc);
    await click(card, WITHSTAND);

    expect(shipIntegrity()).toBe(5);
    const which = sufferCards().at(-1);
    expect(labels(which)).toEqual(["ISV Savela takes the damage (-1)", "Hoverbike takes the damage (-1)"]);
    await click(which, option(1));
    expect(bike.system.track.value).toBe(2);
    expect(shipIntegrity()).toBe(5);

    // …and the starship, when it is the one chosen.
    const again = await anyCard(pc);
    await click(again, WITHSTAND);
    await click(sufferCards().at(-1), option(0));
    expect(shipIntegrity()).toBe(4);
    expect(bike.system.track.value).toBe(2);
  }, 60_000);

  it("control: the command vehicle alone takes it at once; with no vehicle at all the pick stays closed", async () => {
    const pc = addPc();
    const none = await anyCard(pc);
    expect(table.client("pl-1").render(none._id).querySelector(WITHSTAND).disabled).toBe(true);

    await addShip();
    const card = await anyCard(pc);
    await click(card, WITHSTAND);
    expect(shipIntegrity()).toBe(4);
    expect(sufferCards().filter(m => !m.flags[MODULE_ID].resolved).map(m => m._id)).toEqual([none._id]);
  }, 60_000);
});

describe("a Pay the Price route asks which companion or vehicle when several could take it (issue #364 ANY-SUFFER-SUPPORT-VEHICLE)", () => {
  it("\"a companion is in harm's way\" with two companions asks which — the first in the list is not harmed unasked", async () => {
    const rock = rockhorn(); const glow = glowcat();
    const pc = addPc(rock, glow);
    await payRoute(pc, COMPANION_ROUTE);

    expect({ rock: rock.system.track.value, glow: glow.system.track.value }).toEqual({ rock: 4, glow: 3 });
    const which = sufferCards().at(-1);
    expect(which, "the route posted a which-companion card").toBeTruthy();
    expect(labels(which)).toEqual(["Rockhorn takes the hit (-1)", "Glowcat takes the hit (-1)"]);
    expect(which.flags[MODULE_ID].actorId).toBe(pc.id);

    await click(which, option(1));
    expect({ rock: rock.system.track.value, glow: glow.system.track.value }).toEqual({ rock: 4, glow: 2 });
    expect(pc.system.health.value).toBe(5);
  }, 60_000);

  it("control: one companion takes the hit at once; a named one takes it among several; none falls back to Endure Harm", async () => {
    const rock = rockhorn(); const glow = glowcat();
    let pc = addPc(glow);
    await payRoute(pc, COMPANION_ROUTE);
    expect(glow.system.track.value).toBe(2);
    expect(sufferCards()).toHaveLength(0);

    pc = addPc(rock, glow);
    await payRoute(pc, { ...COMPANION_ROUTE, companionItemId: "c-glowcat" });
    expect({ rock: rock.system.track.value, glow: glow.system.track.value }).toEqual({ rock: 4, glow: 1 });
    expect(sufferCards()).toHaveLength(0);

    pc = addPc();
    await payRoute(pc, COMPANION_ROUTE);
    expect(pc.system.health.value).toBe(4);
  }, 60_000);

  it("\"your vehicle suffers damage\" with no command vehicle: the only support vehicle takes it; two ask which", async () => {
    const bike = hoverbike(); const car = rover();
    let pc = addPc(bike);
    await payRoute(pc, VEHICLE_ROUTE);
    expect(bike.system.track.value).toBe(2);
    expect(sufferCards()).toHaveLength(0);

    pc = addPc(bike, car);
    await payRoute(pc, VEHICLE_ROUTE);
    expect({ bike: bike.system.track.value, car: car.system.track.value }).toEqual({ bike: 2, car: 4 });
    const which = sufferCards().at(-1);
    expect(labels(which)).toEqual(["Hoverbike takes the damage (-1)", "Rover takes the damage (-1)"]);
    await click(which, option(1));
    expect({ bike: bike.system.track.value, car: car.system.track.value }).toEqual({ bike: 2, car: 3 });
  }, 60_000);

  it("control: with a command vehicle the route is the starship's, whatever support vehicle the PC owns (issue #345 AA14)", async () => {
    const bike = hoverbike();
    const pc = addPc(bike);
    await addShip();
    await payRoute(pc, VEHICLE_ROUTE);
    expect(shipIntegrity()).toBe(4);
    expect(bike.system.track.value).toBe(3);
    expect(sufferCards()).toHaveLength(0);
  }, 60_000);
});
