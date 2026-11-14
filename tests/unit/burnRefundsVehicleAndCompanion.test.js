/**
 * STARFORGED COMPANION
 * tests/unit/burnRefundsVehicleAndCompanion.test.js
 *
 * Issue #354 P2-09 (alpha 23 playtest part 2) — a burn or an improvement that
 * reverts a miss's Pay the Price puts back the vehicle integrity or companion
 * health the price took.
 *
 * In the playtest an Undertake an Expedition missed, its price was "Your
 * vehicle suffers damage" (the ISV Savela, integrity 5 → 4), and the player
 * burned momentum to a weak hit. The narration was superseded, but integrity
 * stayed at 4 and the Pay the Price / Withstand Damage cards stood as paid:
 * the player paid the miss's cost and the weak hit's. The receipts a reversal
 * undoes covered the four character meters only (decisions.md → "Burn
 * Momentum reverses Pay-the-Price side effects" rejected the vehicle and
 * companion routes "until a playtest shows it matters"). Since issue #353 R1
 * a miss's stated cost can be ship or companion damage too.
 *
 * Driven on a booted GM + player table: the real move pipeline, price,
 * executors and Burn Momentum / Improve Result handlers; the interpretation,
 * the dice and the price's d100 scripted at their boundaries.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], interpretation: null, abilities: [], ptp: 65 }));
vi.mock("../../src/pacing/router.js", async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../src/moves/interpreter.js", async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: "chat" })),
}));
vi.mock("../../src/moves/abilityScanner.js", async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => control.abilities),
}));
vi.mock("../../src/ui/settingsPanel.js", async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock("../../src/moves/resolver.js", async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, "random");
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});
// The price's d100: 65 "Your vehicle suffers damage", 53 "A friend, companion, or ally is in harm's way".
vi.mock("../../src/oracles/roller.js", async (original) => {
  const real = await original();
  return { ...real, rollOracle: (...args) => {
    if (args[0] !== "pay_the_price") return real.rollOracle(...args);
    const rng = vi.spyOn(Math, "random").mockReturnValueOnce((control.ptp - 0.5) / 100);
    try { return real.rollOracle(...args); } finally { rng.mockRestore(); }
  } };
});

import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";
import { buildSupersededPriceContent, retryUpgradeStep, upgradeStepRecord, describeUpgradeStep } from "../../src/moves/resultUpgrade.js";

let table, pc, ship;
const world = () => table.world.campaignState();
const flags = (id) => table.world.message(id).flags[MODULE_ID];
const html  = (id) => String(table.world.message(id).content ?? "");
const integrity = () => ship.flags[MODULE_ID].ship.integrity;

// challenge 6, 7; action die 1 — iron 3 + 1 misses; momentum 9 burns it to a strong hit.
const MISS = [0.55, 0.65, 0.1];
const FUGITIVE = [{ assetId: null, abilityIndex: null, assetName: "Fugitive",
  text: "improve the result to a strong hit", resultImprovement: { improveTo: "strong_hit" }, hasClock: false }];

/** A vendor-shaped asset with a condition track (a Companion's Health). */
function trackAsset(id, name, category, trackName, value, max) {
  const item = {
    id, name, type: "asset",
    system: { category, abilities: [], track: { enabled: true, name: trackName, value, min: 0, max } },
    update: async (changes) => {
      if ("system.track.value" in changes) item.system.track.value = changes["system.track.value"];
    },
  };
  return item;
}

async function addShip({ integrityNow = 5, battered = false } = {}) {
  ship = table.addActor({ id: "ship-savela", name: "ISV Savela", type: "starship",
    system: { debility: { battered } },
    flags: { [MODULE_ID]: {
      entityType: "ship",
      ship: { _id: "ship-rec", name: "ISV Savela", isCommandVehicle: true, integrity: integrityNow, integrityMax: 5, battered },
    } } });
  await table.client("gm-1").run(() => game.settings.set(MODULE_ID, "campaignState", { ...world(), shipIds: [ship.id] }));
}

async function faceDangerMiss(stakes = null) {
  control.interpretation = { moveId: "face_danger", moveName: "Face Danger", statUsed: "iron", adds: 0, rationale: "probe",
    mischiefApplied: false, ...(stakes ? { stakes } : {}) };
  control.dice = MISS;
  await table.client("pl-1").chat("Isaac pushes the Savela through the corridor.", { speaker: { actor: pc.id } });
  await table.settle(); await table.drain();
  return table.cards(f => f.moveResolution).at(-1);
}

async function click(card, selector) {
  await table.client("pl-1").click(card._id, selector);
  await table.settle(); await table.drain();
}

const priceCards   = () => table.cards(f => f.payThePriceCard);
const sufferCardsOf = (move) => table.cards(f => f.sufferCard && f.suffer === move);
const reversalCard = () => table.cards(f => f.burnReversal || f.improveReversal).at(-1);

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  control.abilities = [];
  control.ptp = 65;
  await table.reset({ world: { settings: {
    // The price is paid and the result narrated at once, and an upgrade
    // undoes them — the flow these tests are about. (Asking first is the
    // default since issue #354 P2-10: heldResultBeforePrice.test.js.)
    holdResultForUpgrade: false,
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "p209-s1", sessionNumber: 1,
      currentSceneId: "p209-scene", sceneTruths: [], clocks: [], recentOracles: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  scriptClaude(table, { fallback: () => 'The hull groans and holds.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  silenceConsoleErrors();
});

describe("issue #354 P2-09 — a price that damaged the ship", () => {
  beforeEach(async () => {
    pc = table.addActor({ id: "pc-isaac", name: "Isaac Sutton", ownership: { "pl-1": 3 }, system: { momentum: { value: 9 } } });
    await addShip();
  });

  it("control: the miss's price lands on the ship, and its cards name the move it was paid for", async () => {
    const card = await faceDangerMiss();
    expect(integrity()).toBe(4);
    expect(flags(card._id).burn.ptpReversals.assetDeltas).toEqual([
      { move: "withstand_damage", track: "integrity", amount: 1, actorId: "pc-isaac", before: 5, after: 4,
        name: "ISV Savela", vehicleActorId: "ship-savela" },
    ]);
    const [suffer] = sufferCardsOf("withstand_damage");
    expect(suffer.flags[MODULE_ID].priceOf).toBe(flags(card._id).burn.resolutionId);
  }, 30_000);

  it("Burn Momentum puts the integrity back, says so, and strikes the price's cards", async () => {
    const card = await faceDangerMiss();
    expect(integrity()).toBe(4);

    await click(card, '[data-action="sf-burn-momentum"]');

    expect(flags(card._id).burn.consumed).toBe(true);
    expect(integrity(), "the damage a burned miss never dealt is put back").toBe(5);
    expect(html(reversalCard()._id)).toMatch(/ISV Savela: integrity \+1 restored/);
    // The Pay the Price card and the Withstand Damage card no longer stand as paid.
    const [price]  = priceCards();
    const [suffer] = sufferCardsOf("withstand_damage");
    expect(flags(price._id).priceSuperseded).toBe("burn");
    expect(flags(suffer._id).priceSuperseded).toBe("burn");
    expect(html(price._id)).toMatch(/sf-price-superseded/);
    expect(html(suffer._id)).toMatch(/Reverted — momentum was burned to upgrade the result, so this price was not paid\./);
  }, 30_000);

  it("Improve Result does the same", async () => {
    control.abilities = FUGITIVE;
    const card = await faceDangerMiss();
    expect(integrity()).toBe(4);

    await click(card, '[data-action="sf-improve-result"]');

    expect(flags(card._id).improve.consumed).toBe(true);
    expect(integrity()).toBe(5);
    expect(flags(sufferCardsOf("withstand_damage")[0]._id).priceSuperseded).toBe("improve");
    expect(html(priceCards()[0]._id)).toMatch(/the result was improved, so this price was not paid/);
  }, 30_000);

  it("a battered ship takes the refund: putting damage back is not raising integrity", async () => {
    await addShip({ integrityNow: 3, battered: true });
    const card = await faceDangerMiss();
    expect(integrity()).toBe(2);
    await click(card, '[data-action="sf-burn-momentum"]');
    expect(integrity()).toBe(3);
  }, 30_000);

  it("a miss stated before the roll as ship damage (issue #353 R1) is refunded the same way", async () => {
    // The stakes as the interpreter hands them on (stakes.js withPriceSource).
    const card = await faceDangerMiss({ hit: "You thread the corridor.", miss: "A shard tears through the hull plating.",
      missSuffer: { move: "withstand_damage", amount: 2 }, priceStated: true });
    expect(integrity(), "the stated miss cost 2 integrity").toBe(3);
    expect(html(priceCards()[0]._id)).toMatch(/As stated before the roll/);

    await click(card, '[data-action="sf-burn-momentum"]');

    expect(integrity()).toBe(5);
    expect(html(reversalCard()._id)).toMatch(/ISV Savela: integrity \+2 restored/);
  }, 30_000);

  it("control: a burn whose price stands (Battle burned to a weak hit) keeps the damage and its cards", async () => {
    pc.system.momentum.value = 6;
    control.interpretation = { moveId: "battle", moveName: "Battle", statUsed: "iron", adds: 0, rationale: "probe", mischiefApplied: false };
    control.dice = [0.35, 0.75, 0.0];   // challenge 4 and 8; action die 1
    await table.client("pl-1").chat("Isaac throws the Savela into the fight.", { speaker: { actor: pc.id } });
    await table.settle(); await table.drain();
    const card = table.cards(f => f.moveResolution).at(-1);
    expect(integrity()).toBe(4);

    await click(card, '[data-action="sf-burn-momentum"]');

    expect(html(card._id)).toMatch(/Burned → Weak Hit/);
    expect(integrity(), "the weak hit pays the price too").toBe(4);
    expect(flags(priceCards()[0]._id).priceSuperseded).toBeUndefined();
  }, 30_000);
});

describe("issue #354 P2-09 — a price that hurt a companion", () => {
  let glowcat;
  beforeEach(async () => {
    glowcat = trackAsset("glowcat", "Glowcat", "Companion", "Health", 3, 4);
    pc = table.addActor({ id: "pc-isaac", name: "Isaac Sutton", ownership: { "pl-1": 3 }, system: { momentum: { value: 9 } },
      items: { contents: [glowcat] } });
    control.ptp = 53;
  });

  it("Burn Momentum puts the companion's health back and strikes its card", async () => {
    const card = await faceDangerMiss();
    expect(glowcat.system.track.value).toBe(2);
    expect(flags(card._id).burn.ptpReversals.assetDeltas).toMatchObject([
      { move: "companion_takes_a_hit", track: "health", amount: 1, itemId: "glowcat", actorId: "pc-isaac" },
    ]);

    await click(card, '[data-action="sf-burn-momentum"]');

    expect(glowcat.system.track.value).toBe(3);
    expect(html(reversalCard()._id)).toMatch(/Glowcat: health \+1 restored/);
    expect(flags(sufferCardsOf("companion_takes_a_hit")[0]._id).priceSuperseded).toBe("burn");
  }, 30_000);

  it("damage past 0 came off momentum: an improvement gives that back too", async () => {
    glowcat.system.track.value = 0;
    control.abilities = FUGITIVE;
    pc.system.momentum.value = 4;
    const card = await faceDangerMiss();
    expect(glowcat.system.track.value).toBe(0);
    expect(pc.system.momentum.value, "the harm the companion could not take was momentum").toBe(3);
    // No track loss landed, so there is no track receipt — the momentum is the receipt.
    expect(flags(card._id).improve.ptpReversals.assetDeltas).toEqual([]);
    expect(flags(card._id).improve.ptpReversals.sufferMeterDeltas).toMatchObject([{ meterKey: "momentum", amount: 1, overflow: true }]);

    await click(card, '[data-action="sf-improve-result"]');

    expect(pc.system.momentum.value).toBeGreaterThanOrEqual(4);
  }, 30_000);
});

describe("issue #354 P2-09 — the restore as a GM's Retry step", () => {
  beforeEach(async () => {
    pc = table.addActor({ id: "pc-isaac", name: "Isaac Sutton", ownership: { "pl-1": 3 } });
    await addShip({ integrityNow: 3 });
  });

  it("a refused restore's step is kept whole, described, and its Retry lands it", async () => {
    const step = upgradeStepRecord({ effect: "assetTrack", track: "integrity", amount: 1, pcId: "pc-isaac", name: "ISV Savela", vehicleActorId: "ship-savela" });
    expect(step).toEqual({ step: "upgrade", effect: "assetTrack", track: "integrity", amount: 1, pcId: "pc-isaac", name: "ISV Savela", vehicleActorId: "ship-savela" });
    expect(describeUpgradeStep(step, "the world refused it")).toMatch(/Restore ISV Savela's integrity by 1, which the reverted price took/);
    const result = await table.client("gm-1").run(() => retryUpgradeStep(step));
    expect(result).toEqual({ ok: true });
    expect(integrity()).toBe(4);
  }, 30_000);

  it("a step that names no track, or an amount no suffer move takes, is refused", async () => {
    for (const bad of [
      { effect: "assetTrack", track: "supply", amount: 1, vehicleActorId: "ship-savela" },
      { effect: "assetTrack", track: "integrity", amount: 99, vehicleActorId: "ship-savela" },
      { effect: "assetTrack", track: "integrity", amount: 1 },
      { effect: "assetTrack", track: "health", amount: 1, itemId: "glowcat", pcId: "ship-savela" },
    ]) {
      expect(await table.client("gm-1").run(() => retryUpgradeStep(bad)), JSON.stringify(bad)).toMatchObject({ ok: false, reason: "invalid step" });
    }
    expect(integrity()).toBe(3);
  }, 30_000);
});

describe("issue #354 P2-09 — buildSupersededPriceContent", () => {
  it("strikes the card once, with the note for what upgraded the result", () => {
    const once = buildSupersededPriceContent("<div class=\"sf-ptp-card\">Pay the Price</div>", "burn");
    expect(once).toMatch(/^<div class="sf-price-superseded"/);
    expect(once).toMatch(/momentum was burned/);
    expect(buildSupersededPriceContent(once, "burn")).toBe(once);
    expect(buildSupersededPriceContent("x", "improve")).toMatch(/the result was improved/);
  });
});
