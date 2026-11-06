/**
 * Eleventh audit — UPG-8 KEPT-PRICE-FOLLOWUP-CARD-SUPERSEDED (issue #335 Y09,
 * incomplete fix).
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
 * Battle, but not `upgraded` (only reconcileChoices' keepPriceCard stamps
 * that, and it ran before this card existed). Kira presses it: the pick is
 * refused as a choice of the outcome the burn superseded (sufferCard.js
 * upgradeKindFor → "burn") and the card is retired — "The result changed —
 * momentum was burned — so this choice no longer applies. Nothing on it was
 * applied." The resist roll the kept price owes is never made: Y09's harm, one
 * card later.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/upgrades/keptPriceFollowUpCardSuperseded.probe.js
 */

/* global silenceConsoleErrors */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], interpretation: null, ptp: [70] }));
vi.mock("../../../src/pacing/router.js", async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../../src/moves/interpreter.js", async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: "chat" })),
}));
vi.mock("../../../src/moves/abilityScanner.js", async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock("../../../src/ui/settingsPanel.js", async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock("../../../src/moves/resolver.js", async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, "random");
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});
vi.mock("../../../src/oracles/roller.js", async (original) => {
  const real = await original();
  return { ...real, rollOracle: (...args) => {
    if (args[0] !== "pay_the_price") return real.rollOracle(...args);
    const rng = vi.spyOn(Math, "random");
    for (const value of control.ptp) rng.mockReturnValueOnce((value - 0.5) / 100);
    try { return real.rollOracle(...args); } finally { rng.mockRestore(); }
  } };
});

import { simulateTable, USERS, MODULE_ID } from "../../helpers/multiClient.js";
import { scriptClaude } from "../../helpers/faults.js";
import { CampaignStateSchema } from "../../../src/schemas.js";

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

describe("UPG-8 — the resist card a kept price's follow-up posts after the burn", () => {
  it("control: the kept picker's pick lands — Endure Harm (-1), health 1 → 0 — and posts the resist card", async () => {
    const { resist } = await keptPriceHarmsToZero();
    expect(flags(resist._id).resolved).toBe(false);
  }, 30_000);

  it("is the upgraded result's card too: pressed, it rolls Endure Harm as Kira — not refused as superseded", async () => {
    const { resist } = await keptPriceHarmsToZero();
    control.dice = RESIST_DICE;
    await click(resist, '[data-action="sf-suffer-pick"][data-option-index="0"]');

    expect(flags(resist._id).superseded).not.toBe(true);
    const endure = table.cards(f => f.moveResolution).at(-1);
    expect(endure.content).toMatch(/Endure Harm/);
  }, 30_000);
});
