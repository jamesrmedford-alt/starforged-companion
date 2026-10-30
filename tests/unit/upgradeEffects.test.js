/**
 * STARFORGED COMPANION
 * tests/unit/upgradeEffects.test.js
 *
 * An upgraded result applies its outcome's other effects (issue #313,
 * UPGRADE-PIPELINE-EFFECTS), end to end on a booted GM / player table
 * (tests/helpers/multiClient.js): a player's narration goes through the GM's
 * real move pipeline — resolver, Pay the Price route, persist, the move card
 * — and the player clicks Burn Momentum or Improve Result on their own
 * client, which relays it to the canonical GM. Tracks are written by the real
 * store (src/ui/progressTracks.js). The interpretation, the abilities, the
 * dice and the Pay the Price roll are scripted at their boundaries.
 *
 * Burn Momentum and Improve Result swapped the move's meters, reverted the
 * miss's Pay the Price and reconciled its choice card — and nothing else of
 * the upgraded outcome ran: a Strike burned from a miss to a strong hit
 * marked no progress and stayed in the miss's bad spot; an Undertake an
 * Expedition improved from a miss marked no progress. The pipeline's
 * consequence branches now run through one applier (index.js
 * applyOutcomeEffects) for what the upgraded outcome adds over the original.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], interpretation: null, abilities: [], ptp: 78 }));
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
// Challenge dice first (two d10), then the action die (d6), inside the REAL resolveMove.
vi.mock("../../src/moves/resolver.js", async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, "random");
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});
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
import { effectsNoteHtml } from "../../src/moves/resultUpgrade.js";

let table, pc, journal;
const world   = () => table.world.campaignState();
const flags   = (id) => table.world.message(id).flags[MODULE_ID];
const content = (id) => table.world.message(id).content;
const lastLog = () => world().sessionLogs["effects-s1"].at(-1);
const tracks  = () => journal.getFlag(MODULE_ID, "tracks") ?? [];
const track   = (id) => tracks().find(t => t.id === id);

// [challenge, challenge, action] Math.random values. Iron 3 and an action die
// of 1 miss both; momentum 8 burns to a strong hit against 6 and 7, to a weak
// hit against 6 and 9.
const MISS      = [0.55, 0.65, 0.1];   // challenge 6, 7
const MISS_HIGH = [0.55, 0.85, 0.1];   // challenge 6, 9
// Fugitive-style: improve to a strong hit, its cost a note (no clock).
const FUGITIVE  = [{ assetId: null, abilityIndex: null, assetName: "Fugitive",
  text: "improve the result to a strong hit", resultImprovement: { improveTo: "strong_hit" }, hasClock: false }];
const BURN      = '[data-action="sf-burn-momentum"]';
const IMPROVE   = '[data-action="sf-improve-result"]';

/** The "Starforged Progress Tracks" journal: a document-level flag store, as progressTracks.js writes it. */
function makeTracksJournal() {
  const store = {};
  return {
    id:      "tracks-journal",
    name:    "Starforged Progress Tracks",
    getFlag: (mod, key) => store[`${mod}.${key}`],
    setFlag: async (mod, key, value) => { store[`${mod}.${key}`] = structuredClone(value); },
  };
}

/** Open (or update) a track through the real store on the GM's client. */
async function openTrack(label, { type = "combat", rank = "dangerous", ...fields } = {}) {
  const gm = table.client("gm-1");
  const store = await gm.import("../../src/ui/progressTracks.js");
  return gm.run(async () => {
    const created = await store.addProgressTrack({ label, type, rank });
    await store.updateTrackFields(created.id, fields);
    return created;
  });
}

/** Narrate a move as the player and return its move card. */
async function roll(moveId, { statUsed = "iron", dice = MISS, ...more } = {}) {
  control.interpretation = { moveId, moveName: moveId, statUsed, adds: 0, rationale: "test", mischiefApplied: false, ...more };
  control.dice = dice;
  await table.client("pl-1").chat(`I attempt ${moveId}.`, { speaker: { actor: pc.id } });
  await table.settle(); await table.drain();
  return table.cards(f => f.moveResolution).at(-1);
}

/** The player clicks a button on a card, on their own client. */
async function click(card, selector) {
  await table.client("pl-1").click(card._id, selector);
  await table.settle(); await table.drain();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  control.abilities = [];
  control.ptp = 78;   // Pay the Price 78: Endure Harm (-1)
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "effects-s1", sessionNumber: 1,
      currentSceneId: "effects-scene", sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  pc = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, system: { momentum: { value: 8 } } });
  journal = makeTracksJournal();
  table.journal._set(journal);
  scriptClaude(table, { fallback: () => 'The moment turns.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
});

describe("a combat move upgraded from a miss", () => {
  it("Strike burned from a miss to a strong hit marks progress twice on its fight and takes control", async () => {
    const boarders = await openTrack("Boarders", { ticks: 0 });
    const card = await roll("strike", { moveTarget: "Boarders", combatRank: "dangerous" });
    expect(lastLog().outcome).toBe("miss");
    expect(track(boarders.id)).toMatchObject({ ticks: 0, combatState: "bad_spot" });
    expect(pc.system.health.value).toBe(4);   // the miss's Pay the Price
    // The card names the fight and the move's target for the upgrade.
    expect(flags(card._id).burn).toMatchObject({
      originalApplied: true, targets: { combatTrackId: boarders.id }, move: { moveTarget: "Boarders", combatRank: "dangerous" },
    });

    await click(card, BURN);

    expect(flags(card._id).burn.consumed).toBe(true);
    expect(lastLog().outcome).toBe("strong_hit");
    expect(track(boarders.id)).toMatchObject({ ticks: 16, combatState: "in_control" });   // dangerous: 8 ticks a mark, twice
    expect(pc.system.health.value).toBe(5);     // the price reverted
    expect(pc.system.momentum.value).toBe(2);   // reset
    expect(table.cards(f => f.combatProgressCard).map(c => c.flags[MODULE_ID].marksApplied)).toEqual([2]);
    expect(content(card._id)).toContain("Also applied: progress marked 2 times on Boarders; in control.");
  });

  it("Clash burned from a miss to a weak hit marks once, stays in the bad spot, and keeps the price it already paid", async () => {
    const boarders = await openTrack("Boarders", { ticks: 0 });
    const card = await roll("clash", { moveTarget: "Boarders", combatRank: "dangerous", dice: MISS_HIGH });
    expect(lastLog().outcome).toBe("miss");
    expect(pc.system.health.value).toBe(4);

    await click(card, BURN);

    expect(lastLog().outcome).toBe("weak_hit");
    expect(track(boarders.id)).toMatchObject({ ticks: 8, combatState: "bad_spot" });
    // The weak hit pays the price too: the one already rolled stands.
    expect(pc.system.health.value).toBe(4);
    expect(table.cards(f => f.burnReversal)).toHaveLength(0);
    expect(content(card._id)).toContain("Also applied: progress marked once on Boarders.");
    expect(content(card._id)).toContain("The Pay the Price already rolled stands");
  });

  it("the fight the move was about is the one marked — over by the burn, nothing is marked and the card says so", async () => {
    const boarders = await openTrack("Boarders", { ticks: 0 });
    const card = await roll("strike", { moveTarget: "Boarders", combatRank: "dangerous" });
    const gm = table.client("gm-1");
    const store = await gm.import("../../src/ui/progressTracks.js");
    await gm.run(() => store.updateTrackFields(boarders.id, { completed: true }));
    const turret = await openTrack("Turret", { ticks: 0 });

    await click(card, BURN);

    expect(lastLog().outcome).toBe("strong_hit");
    expect(track(turret.id).ticks).toBe(0);
    expect(track(turret.id).combatState ?? null).toBeNull();   // the position went to no other fight
    expect(track(boarders.id).ticks).toBe(0);
    expect(tracks()).toHaveLength(2);   // no fight created for it either
    expect(content(card._id)).toContain("Not applied: combat progress ×2 — its fight is over; in control — no open fight matched.");
  });
});

describe("an exploration move upgraded from a miss", () => {
  it("Undertake an Expedition improved from a miss to a strong hit begins the expedition and marks it", async () => {
    control.abilities = FUGITIVE;
    const card = await roll("undertake_an_expedition", { moveTarget: "Kessler Drift", expeditionRank: "dangerous" });
    expect(lastLog().outcome).toBe("miss");
    expect(tracks()).toEqual([]);
    expect(pc.system.health.value).toBe(4);

    await click(card, IMPROVE);

    expect(flags(card._id).improve.consumed).toBe(true);
    expect(lastLog().outcome).toBe("strong_hit");
    expect(tracks()).toHaveLength(1);
    expect(tracks()[0]).toMatchObject({ label: "Kessler Drift", type: "expedition", rank: "dangerous", ticks: 8 });
    expect(table.cards(f => f.expeditionProgressCard).map(c => c.flags[MODULE_ID].created)).toEqual([true]);
    expect(pc.system.health.value).toBe(5);
    expect(pc.system.momentum.value).toBe(8);   // an improvement changes the result, not the roll
    expect(content(card._id)).toContain("Also applied: progress marked on the Kessler Drift expedition.");
  });
});

describe("Enter the Fray upgraded while its threshold card waits", () => {
  it("the burned strong hit's opening position replaces the miss's on the card, and lands on the fight when entered", async () => {
    const card = await roll("enter_the_fray", { moveTarget: "Raiders", combatRank: "dangerous" });
    expect(lastLog().outcome).toBe("miss");
    const [threshold] = table.cards(f => f.combatThresholdCard);
    expect(threshold.flags[MODULE_ID]).toMatchObject({ position: "bad_spot", resolutionId: flags(card._id).resolutionId });
    expect(threshold.content).toContain("you begin <strong>in a bad spot</strong>");
    expect(tracks()).toEqual([]);

    await click(card, BURN);

    expect(lastLog().outcome).toBe("strong_hit");
    expect(pc.system.momentum.value).toBe(4);   // reset 2, then the strong hit's +2
    expect(flags(threshold._id).position).toBe("in_control");
    expect(content(threshold._id)).toContain("you begin <strong>in control</strong>");
    expect(content(threshold._id)).not.toContain("bad spot");
    expect(content(card._id)).toContain("Also applied: in control once you enter the fight.");

    // Entering the fight creates it with the burned position.
    await table.client("gm-1").click(threshold._id, '[data-action="sf-enter-fray"]');
    await table.settle(); await table.drain();
    expect(tracks()).toHaveLength(1);
    expect(tracks()[0]).toMatchObject({ label: "Raiders", type: "combat", combatState: "in_control" });
  });
});

describe("Battle upgraded from a lost miss", () => {
  it("wins the fight it ended: the vow it served gets its victory card", async () => {
    const pirates = await openTrack("Pirates", { rank: "formidable", ticks: 0, linkedVowName: "Avenge the Nine" });
    const card = await roll("battle", { moveTarget: "Pirates" });
    expect(lastLog().outcome).toBe("miss");
    expect(track(pirates.id).completed).toBe(true);
    expect(table.cards(f => f.fightVowCard)).toHaveLength(0);
    expect(flags(card._id).burn.targets.combatTrackId).toBe(pirates.id);

    await click(card, BURN);

    expect(lastLog().outcome).toBe("strong_hit");
    expect(table.cards(f => f.fightVowCard).map(c => c.flags[MODULE_ID])).toEqual([
      expect.objectContaining({ vowName: "Avenge the Nine", marks: 2, actorId: pc.id }),
    ]);
    expect(pc.system.momentum.value).toBe(4);   // reset 2, then the strong hit's +2
    expect(pc.system.health.value).toBe(5);     // the price reverted
    expect(content(card._id)).toContain("Also applied: the fight won — a milestone toward Avenge the Nine.");
  });
});

describe("effectsNoteHtml", () => {
  it("lists what was applied and what was not, escaped, and the kept price", () => {
    const html = effectsNoteHtml({ applied: ["progress marked once on <Boarders>"], notApplied: ["in control — no open fight matched"], priceStands: true });
    expect(html).toBe('<div class="sf-move-effect sf-upgrade-effects">Also applied: progress marked once on &lt;Boarders&gt;. '
      + "Not applied: in control — no open fight matched. The Pay the Price already rolled stands — this result pays it too.</div>");
  });

  it("says nothing when there is nothing to say", () => {
    expect(effectsNoteHtml()).toBe("");
    expect(effectsNoteHtml({ applied: [], notApplied: [], priceStands: false })).toBe("");
  });
});
