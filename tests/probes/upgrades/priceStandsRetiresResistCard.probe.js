/**
 * PROBE — UPGRADES-01 PRICE-STANDS-RETIRES-OWED-ROLL (tenth audit, area upgrades)
 *
 * What the user does: Kira (health 1, momentum 6, iron 1) Battles and misses.
 * The miss Pays the Price and the d100 lands "You are harmed": Endure Harm -1
 * takes her health to 0, and the harm step owes the resist roll — a
 * "🛡 Resist the harm — roll Endure Harm" card bound to the Battle's
 * resolution (issue #330 D3; bound so an upgrade that undoes the price retires
 * it, issue #331 X15). Momentum 6 beats one challenge die, so she burns
 * momentum: the miss becomes a WEAK hit — which, for Battle (and Clash), still
 * Pays the Price. The burn therefore keeps the price
 * already rolled (`priceStands`, issue #313): her health stays 0 and the move
 * card says "The Pay the Price already rolled stands — this result pays it
 * too".
 *
 * What happens: handleBurnClick → reconcileChoices → retireOutcomeChoiceCards
 * (src/moves/resultUpgrade.js) retires EVERY pending choice card bound to the
 * resolution — the resist card among them — as "◈ Consequence superseded …
 * Nothing on it was applied", although the harm it belongs to was kept. The
 * mandatory resist roll ("Then, if your health is 0 … roll +health or +iron")
 * is lost: no roll is made and nothing says one is still owed. The same
 * happens to the W16 redirect picker of a "You waste resources" at 0 supply
 * while unprepared (the second test).
 *
 * What should happen: a price that stands keeps its follow-up cards. Only a
 * price the upgrade undoes — a burn or improvement to a strong hit, which
 * reverts the clocks and refunds the meters — retires them (decisions.md
 * issue #331: "A card bound to a move leaves with the move's result" — here
 * the price did not leave with it; issue #313: a weak hit that pays the price
 * too keeps the miss's Pay the Price).
 *
 * Control: the same miss burned to a STRONG hit (momentum 9) reverts the
 * price — health refunded to 1 — and retires the resist card (X15 holds).
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/upgrades/priceStandsRetiresResistCard.probe.js
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], interpretation: null, ptp: [78] }));
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
// Challenge dice first (two d10), then the action die (d6), inside the REAL resolveMove.
vi.mock("../../../src/moves/resolver.js", async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, "random");
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});
// The Pay the Price d100, scripted (78: "You are harmed" → Endure Harm -1; 70: "You waste resources").
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

// challenge 4 and 8; action die 1 — iron 1 → 2: a miss. Momentum 6 beats one
// die (a weak hit); momentum 9 beats both (a strong hit).
const MISS = [0.35, 0.75, 0.0];

const resistCards = () => table.cards(f => f.sufferCard && f.sufferPrompt?.resist === "health");
const pickers     = () => table.cards(f => f.sufferCard && f.sufferPrompt?.kind === "any");

async function battle() {
  control.interpretation = { moveId: "battle", moveName: "Battle", statUsed: "iron", adds: 0, rationale: "probe", mischiefApplied: false };
  control.dice = MISS;
  await table.client("pl-1").chat("Kira throws herself into the fight — Battle.", { speaker: { actor: pc.id } });
  await table.settle(); await table.drain();
  return table.cards(f => f.moveResolution).at(-1);
}

async function click(card, selector) {
  await table.client("pl-1").click(card._id, selector);
  await table.settle(); await table.drain();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  control.ptp = [78];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "ps-s1", sessionNumber: 1,
      currentSceneId: "ps-scene", sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  scriptClaude(table, { fallback: () => 'The fight turns.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  silenceConsoleErrors();
});

describe("UPGRADES-01 a burn to a weak hit that still pays the price retires the price's owed resist roll", () => {
  it("the resist card of a harm the burn kept stays pending — it is retired as superseded today", async () => {
    pc = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 },
      system: { momentum: { value: 6 }, health: { value: 1 }, iron: 1 } });
    const card = await battle();

    // Sanity: a miss whose price took the last health and owes the resist roll, bound to the move.
    expect(flags(card._id).burn).toMatchObject({ canBurn: true, originalApplied: true, originalOutcome: "miss", previewOutcome: "weak_hit" });
    expect(pc.system.health.value).toBe(0);
    const [resist] = resistCards();
    expect(resist).toBeTruthy();
    expect(resist.flags[MODULE_ID].resolutionId).toBe(flags(card._id).resolutionId);
    expect(resist.flags[MODULE_ID].resolved).toBe(false);

    await click(card, BURN);

    // The burn landed on a weak hit, and the price stands: nothing refunded, the card says so.
    expect(flags(card._id).burn.consumed).toBe(true);
    expect(table.world.message(card._id).content).toMatch(/Burned → Weak Hit/);
    expect(table.world.message(card._id).content).toMatch(/already rolled stands/);
    expect(pc.system.health.value).toBe(0);

    // Expected: the resist roll the kept harm owes is still on the table.
    // Actual: the card reads "◈ Consequence superseded … Nothing on it was applied".
    const after = flags(resist._id);
    expect(after.superseded).not.toBe(true);
    expect(after.resolved).toBe(false);
    expect.soft(table.world.message(resist._id).content).not.toMatch(/superseded/i);
  }, 30_000);

  it("same shape: the W16 redirect picker of a 'You waste resources' at 0 supply while unprepared", async () => {
    control.ptp = [70];
    pc = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 },
      system: { momentum: { value: 6 }, supply: { value: 0 }, debility: { unprepared: true }, iron: 1 } });
    const card = await battle();

    const picker = pickers().at(-1);
    expect(picker).toBeTruthy();
    expect(picker.flags[MODULE_ID].sufferPrompt).toMatchObject({ kind: "any", amount: 1, exclude: ["sacrifice_resources"] });
    expect(picker.flags[MODULE_ID].resolutionId).toBe(flags(card._id).resolutionId);

    await click(card, BURN);
    expect(flags(card._id).burn.consumed).toBe(true);
    expect(table.world.message(card._id).content).toMatch(/already rolled stands/);

    // Expected: the redirected loss is still owed, so its picker stays live.
    const after = flags(picker._id);
    expect(after.superseded).not.toBe(true);
    expect(after.resolved).toBe(false);
  }, 30_000);

  it("control: a burn to a strong hit reverts the price — health refunded — and retires the resist card", async () => {
    pc = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 },
      system: { momentum: { value: 9 }, health: { value: 1 }, iron: 1 } });
    const card = await battle();
    const [resist] = resistCards();
    expect(resist.flags[MODULE_ID].resolutionId).toBe(flags(card._id).resolutionId);
    expect(pc.system.health.value).toBe(0);

    await click(card, BURN);

    expect(flags(card._id).burn.consumed).toBe(true);
    expect(table.world.message(card._id).content).toMatch(/Burned → Strong Hit/);
    expect(pc.system.health.value).toBe(1);                      // the undone price is refunded
    expect(flags(resist._id).superseded).toBe(true);             // and its owed roll leaves with it (X15)
  }, 30_000);
});
