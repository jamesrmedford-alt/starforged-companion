/**
 * STARFORGED COMPANION
 * tests/unit/heldResultBeforePrice.test.js
 *
 * Issue #354 P2-10 (decided, maintainer 2026-11-13): free-flow play asks
 * Burn / Improve / Keep BEFORE a result's Pay the Price is paid and before it
 * is narrated, as a Batch Mode round asks before its narration.
 *
 * The alpha 23 playtest: on every miss the price landed first and the miss was
 * narrated while the Burn button was still live — a burn then undid a price
 * already on the table and struck through a narration the table had read.
 *
 * End to end, on a booted table (tests/helpers/multiClient.js): a player's
 * line goes through the GM's real move pipeline — resolver, the result card,
 * the record — with the interpretation, the abilities, the dice and the d100
 * scripted at their boundaries, as tests/unit/payThePriceRoutes.test.js does.
 *
 *   - A result whose card offers an upgrade is held: no price, no narration.
 *   - Keep the result: the price is paid, one narration follows, the upgrades close.
 *   - Burn / Improve: no price was ever paid — nothing to undo, nothing struck —
 *     and the upgraded result is the move's one narration, told the player's line.
 *   - An upgraded result that pays a price too pays the held one, once.
 *   - The roller's next line, or a consequence chosen, keeps a held result.
 *   - A result that offers no upgrade, and the setting off, are as before.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], interpretation: null, abilities: [], ptp: [78] }));
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
    const rng = vi.spyOn(Math, "random");
    for (const value of control.ptp) rng.mockReturnValueOnce((value - 0.5) / 100);
    try { return real.rollOracle(...args); } finally { rng.mockRestore(); }
  } };
});

import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

let table, pc;
const flags      = (id) => table.world.message(id).flags[MODULE_ID];
const content    = (id) => String(table.world.message(id).content);
const narrations = () => table.cards(f => f.narratorCard && f.resolutionId);
const priceCards = () => table.cards(f => f.payThePriceCard);
const suffers    = () => table.cards(f => f.sufferCard && f.suffer).map(c => c.flags[MODULE_ID]);
const choices    = () => table.cards(f => f.sufferCard && f.sufferPrompt && !f.suffer);
const narratorCalls = () => table.claude.calls.filter(c => /MOVE OUTCOME|Narrate the consequence/.test(`${c.system}\n${c.userText}`));

// [challenge, challenge, action] Math.random values.
const MISS   = [0.55, 0.65, 0.1];   // challenge 6, 7; action die 1 — wits 2 misses; momentum 9 burns to a strong hit
const WEAK   = [0.25, 0.65, 0.5];   // challenge 3, 7; action die 4 — wits 2 is a weak hit; momentum 9 burns to a strong hit
const STRONG = [0.05, 0.15, 0.9];   // challenge 1, 2 — a strong hit: nothing to upgrade
const FUGITIVE = [{ assetId: null, assetName: "Fugitive", resultImprovement: { improveTo: "strong_hit" }, hasClock: false }];
const BURN    = '[data-action="sf-burn-momentum"]';
const IMPROVE = '[data-action="sf-improve-result"]';
const KEEP    = '[data-action="sf-keep-result"]';

/** Narrate a move as the player and return its move card. */
async function roll(moveId, { statUsed = "wits", dice = MISS, line = `I attempt ${moveId}.` } = {}) {
  control.interpretation = { moveId, moveName: moveId, statUsed, adds: 0, rationale: "test", mischiefApplied: false };
  control.dice = dice;
  await table.client("pl-1").chat(line, { speaker: { actor: pc.id } });
  await table.settle(); await table.drain();
  return table.cards(f => f.moveResolution).at(-1);
}

/** A user clicks a button on a card, on their own client. */
async function click(card, selector, user = "pl-1") {
  await table.client(user).click(card._id, selector);
  await table.settle(); await table.drain();
}

async function resetTable(settings = {}) {
  control.abilities = [];
  control.ptp = [78];   // Pay the Price 78: Endure Harm (-1)
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, ...settings,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "held-s1", sessionNumber: 1,
      currentSceneId: "held-scene", sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  // Momentum 9: a miss against 6 and 7 can be burned to a strong hit.
  pc = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, system: { momentum: { value: 9 } } });
  scriptClaude(table, { fallback: () => 'The moment turns.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => { await resetTable(); });

describe("issue #354 P2-10 — a result that can be upgraded is held: nothing is paid, nothing is narrated", () => {
  it("a burnable miss: the card asks Burn / Keep, no Pay the Price is posted, health is untouched, and there is no narration", async () => {
    const card = await roll("gather_information");

    const f = flags(card._id);
    expect(f.awaitingUpgrade).toMatchObject({ open: true, speakerActorId: pc.id,
      heldPrice: { moveName: expect.any(String), skipClockIds: [] },
      resolution: { moveId: "gather_information", outcome: "miss", playerNarration: "I attempt gather_information." } });
    expect(f.burn).toMatchObject({ canBurn: true, originalApplied: true, ptpReversals: null });
    expect(content(card._id)).toMatch(/data-action="sf-keep-result"[^>]*>Keep the result</);
    expect(content(card._id)).toContain("Nothing has been paid or narrated yet");

    expect(priceCards()).toEqual([]);
    expect(suffers()).toEqual([]);
    expect(pc.system.health.value).toBe(5);
    expect(pc.system.momentum.value).toBe(9);
    expect(narrations()).toEqual([]);
    expect(narratorCalls()).toEqual([]);
  });

  it("control: a result that offers no upgrade is paid and narrated at once, and its card asks nothing", async () => {
    const strong = await roll("gather_information", { dice: STRONG });
    expect(flags(strong._id).awaitingUpgrade).toBeUndefined();
    expect(content(strong._id)).not.toMatch(/sf-keep-result/);
    expect(narrations()).toHaveLength(1);

    // A miss that momentum cannot beat: nothing to ask, so the price lands.
    pc.system.momentum.value = 2;
    const miss = await roll("gather_information");
    expect(flags(miss._id).awaitingUpgrade).toBeUndefined();
    expect(priceCards()).toHaveLength(1);
    expect(pc.system.health.value).toBe(4);
    expect(narrations()).toHaveLength(2);
  });

  it("control: with \"Ask before paying and narrating\" off, the price is paid and the miss narrated at once", async () => {
    await resetTable({ holdResultForUpgrade: false });
    const card = await roll("gather_information");
    expect(flags(card._id).awaitingUpgrade).toBeUndefined();
    expect(flags(card._id).burn.ptpReversals).toBeTruthy();
    expect(priceCards()).toHaveLength(1);
    expect(pc.system.health.value).toBe(4);
    expect(narrations()).toHaveLength(1);
  });
});

describe("issue #354 P2-10 — Keep the result: the price is paid, one narration follows, the upgrades close", () => {
  it("the roller keeps a miss: Pay the Price lands on them, the narration is seeded with it and told their line, and the card is settled", async () => {
    const card = await roll("gather_information");
    await click(card, KEEP);

    expect(flags(card._id).awaitingUpgrade).toMatchObject({ open: false, resolvedBy: "keep" });
    expect(flags(card._id).burn.kept).toBe(true);
    expect(priceCards()).toHaveLength(1);
    expect(priceCards()[0].content).toContain("d100 = <strong>78</strong> · You are harmed");
    expect(suffers()).toEqual([expect.objectContaining({ suffer: "endure_harm", before: 5, after: 4 })]);
    expect(pc.system.health.value).toBe(4);

    expect(narrations()).toHaveLength(1);
    expect(narrations()[0].flags[MODULE_ID]).toMatchObject({ resolutionId: flags(card._id).resolutionId, outcome: "miss" });
    const call = narratorCalls().at(-1);
    expect(`${call.system}\n${call.userText}`).toContain("Pay the Price: You are harmed");
    expect(call.userText).toContain("I attempt gather_information.");
  });

  it("a kept result cannot be burned afterwards — pressed anyway, nothing changes", async () => {
    const card = await roll("gather_information");
    await click(card, KEEP);
    await click(card, BURN);
    expect(flags(card._id).burn.consumed).not.toBe(true);
    expect(pc.system.momentum.value).toBe(9);
    expect(narrations()).toHaveLength(1);
    expect(narrations()[0].flags[MODULE_ID].outcome).toBe("miss");
  });

  it("once kept, the button is gone from the card — and a second keep sent anyway pays and narrates nothing more", async () => {
    const card = await roll("gather_information");
    await click(card, KEEP);
    await expect(click(card, KEEP)).rejects.toThrow(/sees no "\[data-action="sf-keep-result"\]"/);
    // A press that was already on its way: the GM's handler refuses it.
    const { applyKeepResultFromRelay } = await table.client("gm-1").import("../../src/moves/heldResult.js");
    const again = await table.client("gm-1").run(() => applyKeepResultFromRelay({ messageId: card._id }, { requesterIsGM: true }));
    expect(again).toEqual({ applied: false, reason: "not-awaiting" });
    expect(priceCards()).toHaveLength(1);
    expect(pc.system.health.value).toBe(4);
    expect(narrations()).toHaveLength(1);
  });

  it("a GM may keep it; another player may not", async () => {
    const card = await roll("gather_information");
    await click(card, KEEP, "pl-2");
    expect(flags(card._id).awaitingUpgrade.open).toBe(true);
    expect(narrations()).toEqual([]);
    await click(card, KEEP, "gm-1");
    expect(flags(card._id).awaitingUpgrade).toMatchObject({ open: false, resolvedBy: "keep" });
    expect(narrations()).toHaveLength(1);
  });

  it("a held weak hit with no price: keeping it narrates it, and pays nothing", async () => {
    const card = await roll("gather_information", { dice: WEAK });
    expect(flags(card._id).awaitingUpgrade).toMatchObject({ open: true, heldPrice: null });
    expect(content(card._id)).toContain("Not narrated yet");
    expect(narrations()).toEqual([]);
    await click(card, KEEP);
    expect(priceCards()).toEqual([]);
    expect(narrations()).toHaveLength(1);
    expect(narrations()[0].flags[MODULE_ID].outcome).toBe("weak_hit");
  });
});

describe("issue #354 P2-10 — Burn / Improve of a held result: nothing was paid, nothing is struck, one narration", () => {
  it("a burn of a held miss: no price card, no reversal card, health untouched — and the burned result is narrated once, with the player's line", async () => {
    const card = await roll("gather_information");
    await click(card, BURN);

    expect(flags(card._id).burn.consumed).toBe(true);
    expect(flags(card._id).awaitingUpgrade).toMatchObject({ open: false, resolvedBy: "burn" });
    expect(priceCards()).toEqual([]);
    expect(suffers()).toEqual([]);
    expect(table.cards(f => f.burnReversal)).toEqual([]);
    expect(pc.system.health.value).toBe(5);
    expect(pc.system.momentum.value).toBe(4);   // reset 2, +2 for the strong hit

    expect(narrations()).toHaveLength(1);
    expect(narrations()[0].flags[MODULE_ID].outcome).toBe("strong_hit");
    expect(table.cards(f => f.narratorCard && f.burnSuperseded)).toEqual([]);
    expect(narratorCalls()).toHaveLength(1);
    expect(narratorCalls()[0].userText).toContain("I attempt gather_information.");
    // The card no longer asks.
    await expect(click(card, KEEP)).rejects.toThrow(/sees no "\[data-action="sf-keep-result"\]"/);
    expect(narrations()).toHaveLength(1);
  });

  it("an improvement of a held miss does the same", async () => {
    control.abilities = FUGITIVE;
    pc.system.momentum.value = 2;      // no burn to offer: the asset's improvement alone holds it
    const card = await roll("gather_information");
    expect(flags(card._id).awaitingUpgrade.open).toBe(true);
    expect(narrations()).toEqual([]);

    await click(card, IMPROVE);

    expect(flags(card._id).improve.consumed).toBe(true);
    expect(flags(card._id).awaitingUpgrade).toMatchObject({ open: false, resolvedBy: "improve" });
    expect(priceCards()).toEqual([]);
    expect(pc.system.health.value).toBe(5);
    expect(narrations()).toHaveLength(1);
    expect(narrations()[0].flags[MODULE_ID].outcome).toBe("strong_hit");
    expect(table.cards(f => f.improveReversal)).toEqual([]);
  });

  it("a burn to a weak hit that pays a price too pays the held price — once, after the burn — and narrates it", async () => {
    // Battle: iron 1, challenge 4 and 8, die 1 — a miss; momentum 6 beats one die: a weak hit, which pays the price too.
    pc.system.momentum.value = 6;
    pc.system.iron = 1;
    const card = await roll("battle", { statUsed: "iron", dice: [0.35, 0.75, 0.0], line: "Kira throws herself into the fight." });
    expect(flags(card._id).awaitingUpgrade).toMatchObject({ open: true });
    expect(priceCards()).toEqual([]);

    await click(card, BURN);

    expect(narrations()).toHaveLength(1);
    expect(narrations()[0].flags[MODULE_ID].outcome).toBe("weak_hit");
    expect(priceCards()).toHaveLength(1);
    expect(pc.system.health.value).toBe(4);
    const call = narratorCalls().at(-1);
    expect(`${call.system}\n${call.userText}`).toContain("Pay the Price: You are harmed");
  });
});

describe("issue #354 P2-10 — a held result is kept when its roller goes on", () => {
  it("their next line: the held miss is paid and narrated first, then the new move — two narrations, in order", async () => {
    const first = await roll("gather_information");
    expect(narrations()).toEqual([]);

    const second = await roll("face_danger", { dice: STRONG, line: "I push on through the hatch." });

    expect(flags(first._id).awaitingUpgrade).toMatchObject({ open: false, resolvedBy: "later" });
    expect(flags(first._id).burn.kept).toBe(true);
    expect(priceCards()).toHaveLength(1);
    expect(pc.system.health.value).toBe(4);
    expect(narrations().map(c => c.flags[MODULE_ID].resolutionId)).toEqual([flags(first._id).resolutionId, flags(second._id).resolutionId]);
    expect(narrations().map(c => c.flags[MODULE_ID].outcome)).toEqual(["miss", "strong_hit"]);
  });

  it("a consequence chosen on a held weak hit's choice card keeps it: its narration follows", async () => {
    const card = await roll("face_danger", { statUsed: "wits", dice: WEAK });
    expect(flags(card._id).awaitingUpgrade.open).toBe(true);
    const choice = choices().at(-1);
    expect(choice, "the weak hit's suffer choice (setup)").toBeTruthy();

    await click(choice, '[data-suffer-id="endure_harm"]');

    expect(flags(card._id).awaitingUpgrade).toMatchObject({ open: false, resolvedBy: "choice" });
    expect(narrations()).toHaveLength(1);
    expect(narrations()[0].flags[MODULE_ID].outcome).toBe("weak_hit");
  });

  it("a keep that arrives while a burn of the card is being applied leaves the result to the burn", async () => {
    const card = await roll("gather_information");
    const gm = table.client("gm-1");
    const upgrades = await gm.import("../../src/moves/burnMomentum.js");
    const held = await gm.import("../../src/moves/heldResult.js");
    // The burn's handler holds the card's upgrade claim from its checks to its re-narration.
    const res = await gm.run(async () => {
      upgrades.claimResultUpgrade(card._id);
      try { return await held.keepHeldResult(game.messages.get(card._id), "later"); }
      finally { upgrades.releaseResultUpgrade(card._id); }
    });
    expect(res).toEqual({ applied: false, reason: "in-flight" });
    expect(flags(card._id).awaitingUpgrade.open).toBe(true);
    expect(priceCards()).toEqual([]);
    expect(narrations()).toEqual([]);
  });

  it("another player's line leaves it waiting", async () => {
    const card = await roll("gather_information");
    table.addActor({ id: "pc-bex", name: "Bex", ownership: { "pl-2": 3 } });
    control.interpretation = { moveId: "face_danger", moveName: "face_danger", statUsed: "wits", adds: 0, rationale: "test", mischiefApplied: false };
    control.dice = STRONG;
    await table.client("pl-2").chat("Bex keeps watch at the door.", { speaker: { actor: "pc-bex" } });
    await table.settle(); await table.drain();
    expect(flags(card._id).awaitingUpgrade.open).toBe(true);
    expect(priceCards()).toEqual([]);
  });
});
