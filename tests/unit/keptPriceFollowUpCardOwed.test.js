/**
 * STARFORGED COMPANION
 * tests/unit/keptPriceFollowUpCardOwed.test.js
 *
 * Issue #342 Z47 KEPT-PRICE-FOLLOWUP-CARD-SUPERSEDED (the upgrades auditor's
 * UPG-8 probe; issue #335 Y09, incomplete fix).
 *
 * The priceStandsKeepsPriceCards.test.js table (the real pipeline). Kira
 * (health 1, supply 0, unprepared, momentum 6, iron 1) Battles and misses;
 * its Pay the Price — "You waste resources" — is redirected while unprepared
 * to the W16 picker ("Make a suffer move (-1)", no Sacrifice Resources),
 * bound to the Battle and stamped `priceCard`. She burns: the miss becomes a
 * weak hit, which for Battle still pays the price, so the burn keeps the
 * price and Y09 keeps its picker (`upgraded`). She then makes the redirected
 * loss on it: Endure Harm (-1) — health 1 → 0, and the harm owes the resist
 * roll (issue #330 D3). That 🛡 card is posted by the picker's own pick with
 * the picker's executor opts (`resolutionId`, `priceCard`) — bound to the
 * Battle, but it was not `upgraded` (only reconcileChoices' keepPriceCard
 * stamped that, and it ran before this card existed), so Kira's press was
 * refused as a choice of the outcome the burn superseded and the resist roll
 * the kept price owes was never made. The keep now rides the kept card's
 * executor opts into what its pick posts.
 */

/* global silenceConsoleErrors */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], interpretation: null, ptp: [70] }));
vi.mock("../../src/pacing/router.js", async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../src/moves/interpreter.js", async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: "chat" })),
}));
vi.mock("../../src/moves/abilityScanner.js", async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
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
const flags = (id) => table.world.message(id).flags[MODULE_ID];
const BURN  = '[data-action="sf-burn-momentum"]';
// challenge 4 and 8; action die 1 — iron 1 → 2: a miss; momentum 6 beats one die (a weak hit).
const MISS = [0.35, 0.75, 0.0];
const RESIST_DICE = [0.05, 0.05, 0.99];   // the resist roll: challenge 1, 1; die 6 — a strong hit

const pickers     = () => table.cards(f => f.sufferCard && f.sufferPrompt?.kind === "any");
const resistCards = () => table.cards(f => f.sufferCard && f.sufferPrompt?.resist === "health");

async function click(card, selector) {
  await table.client("pl-1").click(card._id, selector);
  await table.settle(); await table.drain();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  control.ptp = [70];
  await table.reset({ world: { settings: {
    // The price is paid and the result narrated at once, and an upgrade
    // undoes them — the flow these tests are about. (Asking first is the
    // default since issue #354 P2-10: heldResultBeforePrice.test.js.)
    holdResultForUpgrade: false,
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "u8-s1", sessionNumber: 1,
      currentSceneId: "u8-scene", sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  scriptClaude(table, { fallback: () => 'The fight turns.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  pc = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 },
    system: { momentum: { value: 6 }, supply: { value: 0 }, health: { value: 1 }, debility: { unprepared: true }, iron: 1 } });
  silenceConsoleErrors();
});

/** The Battle miss, its redirected price, the burn to a weak hit that keeps it, and the loss made as Endure Harm. */
async function keptPriceHarmsToZero() {
  control.interpretation = { moveId: "battle", moveName: "Battle", statUsed: "iron", adds: 0, rationale: "test", mischiefApplied: false };
  control.dice = MISS;
  await table.client("pl-1").chat("Kira throws herself into the fight — Battle.", { speaker: { actor: pc.id } });
  await table.settle(); await table.drain();
  const card = table.cards(f => f.moveResolution).at(-1);
  const picker = pickers().at(-1);
  expect(picker.flags[MODULE_ID]).toMatchObject({ priceCard: true, resolutionId: flags(card._id).resolutionId });

  await click(card, BURN);
  expect(flags(card._id).burn.consumed).toBe(true);
  expect(table.world.message(card._id).content).toMatch(/Burned → Weak Hit[\s\S]*already rolled stands/);
  expect(flags(picker._id)).toMatchObject({ upgraded: true, resolved: false });   // Y09: kept

  await click(picker, '[data-action="sf-suffer-pick"][data-suffer-id="endure_harm"]');
  expect(pc.system.health.value).toBe(0);
  const resist = resistCards().at(-1);
  expect(resist).toBeTruthy();                                                  // the kept price's harm owes it
  return { card, resist };
}

describe("Z47 — the resist card a kept price's follow-up posts after the burn", () => {
  it("control: the kept picker's pick lands — Endure Harm (-1), health 1 → 0 — and posts the resist card", async () => {
    const { resist } = await keptPriceHarmsToZero();
    expect(flags(resist._id).resolved).toBe(false);
  }, 30_000);

  it("is the upgraded result's card too: pressed, it rolls Endure Harm as Kira — not refused as superseded", async () => {
    const { resist } = await keptPriceHarmsToZero();
    control.dice = RESIST_DICE;
    await click(resist, '[data-action="sf-suffer-pick"][data-option-index="0"]');

    expect(flags(resist._id).superseded).not.toBe(true);
    expect(flags(resist._id)).toMatchObject({ upgraded: true, priceCard: true, resolved: true });
    const endure = table.cards(f => f.moveResolution).at(-1);
    expect(endure.content).toMatch(/Endure Harm/);
    expect(endure.flags[MODULE_ID].actorId).toBe("pc-kira");
  }, 30_000);

  it("the same for Endure Stress: the kept picker's stress at 0 spirit owes its resist roll, and pressing it rolls Endure Stress", async () => {
    await pc.update({ "system.health.value": 5, "system.spirit.value": 1 });
    control.interpretation = { moveId: "battle", moveName: "Battle", statUsed: "iron", adds: 0, rationale: "test", mischiefApplied: false };
    control.dice = MISS;
    await table.client("pl-1").chat("Kira throws herself into the fight — Battle.", { speaker: { actor: pc.id } });
    await table.settle(); await table.drain();
    const card = table.cards(f => f.moveResolution).at(-1);
    const picker = pickers().at(-1);
    await click(card, BURN);
    expect(flags(picker._id)).toMatchObject({ upgraded: true, resolved: false });

    await click(picker, '[data-action="sf-suffer-pick"][data-suffer-id="endure_stress"]');
    expect(pc.system.spirit.value).toBe(0);
    const resist = table.cards(f => f.sufferCard && f.sufferPrompt?.resist === "spirit").at(-1);
    expect(flags(resist._id)).toMatchObject({ upgraded: true, resolved: false });

    control.dice = RESIST_DICE;
    await click(resist, '[data-action="sf-suffer-pick"][data-option-index="0"]');
    expect(flags(resist._id).superseded).not.toBe(true);
    expect(table.cards(f => f.moveResolution).at(-1).content).toMatch(/Endure Stress/);
  }, 30_000);
});
