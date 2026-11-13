/**
 * Issue #335 Y09 PRICE-STANDS-RETIRES-OWED-ROLL — a burn that keeps the Pay
 * the Price keeps the cards that price posted.
 *
 * Kira (health 1, momentum 6, iron 1) Battles and misses. The miss Pays the
 * Price, "You are harmed": Endure Harm -1 takes her to 0 and owes the resist
 * roll — the "🛡 Resist the harm" card, bound to the Battle's resolution
 * (issue #330 D3 / #331 X15). Momentum 6 beats one challenge die, so she
 * burns: the miss becomes a WEAK hit, which for Battle (and Clash) still
 * Pays the Price, so the burn keeps the price already rolled (`priceStands`,
 * issue #313 — health stays 0). But reconcileChoices retired every pending
 * card bound to the resolution, the resist card included ("◈ Consequence
 * superseded … Nothing on it was applied"): the mandatory resist roll was
 * cancelled with the harm kept. Same for the W16 redirect picker of a "You
 * waste resources" at 0 supply while unprepared. A card a move's price
 * posted is now stamped `priceCard`, and an upgrade whose price stands keeps
 * it — the upgraded outcome's card now (`upgraded`), still pressable — and
 * the move card says its roll or choice is still owed.
 *
 * (Converted from the tenth audit's probe
 * tests/probes/upgrades/priceStandsRetiresResistCard.probe.js.)
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], interpretation: null, ptp: [78] }));
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
// Challenge dice first (two d10), then the action die (d6), inside the REAL resolveMove.
vi.mock("../../src/moves/resolver.js", async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, "random");
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});
// The Pay the Price d100, scripted (78: "You are harmed" → Endure Harm -1; 70: "You waste resources").
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

// challenge 4 and 8; action die 1 — iron 1 → 2: a miss. Momentum 6 beats one
// die (a weak hit); momentum 9 beats both (a strong hit).
const MISS = [0.35, 0.75, 0.0];
const RESIST_DICE = [0.05, 0.05, 0.99];   // the resist roll: challenge 1, 1; die 6 — a strong hit

const resistCards = () => table.cards(f => f.sufferCard && f.sufferPrompt?.resist === "health");
const pickers     = () => table.cards(f => f.sufferCard && f.sufferPrompt?.kind === "any");

async function battle() {
  control.interpretation = { moveId: "battle", moveName: "Battle", statUsed: "iron", adds: 0, rationale: "test", mischiefApplied: false };
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
    // The price is paid and the result narrated at once, and an upgrade
    // undoes them — the flow these tests are about. (Asking first is the
    // default since issue #354 P2-10: heldResultBeforePrice.test.js.)
    holdResultForUpgrade: false,
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "ps-s1", sessionNumber: 1,
      currentSceneId: "ps-scene", sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  scriptClaude(table, { fallback: () => 'The fight turns.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  silenceConsoleErrors();
});

describe("issue #335 Y09 — a burn to a weak hit that still pays the price keeps the price's cards", () => {
  it("the resist card of a harm the burn kept stays pending, and pressing it rolls Endure Harm as Kira", async () => {
    pc = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 },
      system: { momentum: { value: 6 }, health: { value: 1 }, iron: 1 } });
    const card = await battle();

    // A miss whose price took the last health and owes the resist roll, bound to the move.
    expect(flags(card._id).burn).toMatchObject({ canBurn: true, originalApplied: true, originalOutcome: "miss", previewOutcome: "weak_hit" });
    expect(pc.system.health.value).toBe(0);
    const [resist] = resistCards();
    expect(resist.flags[MODULE_ID]).toMatchObject({ resolutionId: flags(card._id).resolutionId, priceCard: true, resolved: false });

    await click(card, BURN);

    // The burn landed on a weak hit, and the price stands: nothing refunded, the card says so — and says the roll is owed.
    expect(flags(card._id).burn.consumed).toBe(true);
    const moveCard = table.world.message(card._id).content;
    expect(moveCard).toMatch(/Burned → Weak Hit/);
    expect(moveCard).toMatch(/already rolled stands — this result pays it too, and the roll or choice its card asks for is still owed/);
    expect(pc.system.health.value).toBe(0);

    // The resist roll the kept harm owes is still on the table — the upgraded result's card now.
    const after = flags(resist._id);
    expect(after.superseded).not.toBe(true);
    expect(after.resolved).toBe(false);
    expect(after.upgraded).toBe(true);
    const content = table.world.message(resist._id).content;
    expect(content).not.toMatch(/superseded/i);
    expect(content).toMatch(/data-action="sf-suffer-pick"/);
    expect(content, "the spent upgrade's hint is gone").not.toMatch(/burn momentum/i);

    // Pressed, it rolls the resist roll as Kira — not refused as the superseded outcome's.
    control.dice = RESIST_DICE;
    await click(resist, '[data-action="sf-suffer-pick"][data-option-index="0"]');
    expect(flags(resist._id).resolved).toBe(true);
    const endure = table.cards(f => f.moveResolution).at(-1);
    expect(endure.content).toMatch(/Endure Harm/);
    expect(endure.flags[MODULE_ID].actorId).toBe("pc-kira");
  }, 30_000);

  it("same shape: the W16 redirect picker of a 'You waste resources' at 0 supply while unprepared stays live, and its pick applies", async () => {
    control.ptp = [70];
    pc = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 },
      system: { momentum: { value: 6 }, supply: { value: 0 }, health: { value: 5 }, debility: { unprepared: true }, iron: 1 } });
    const card = await battle();

    const picker = pickers().at(-1);
    expect(picker.flags[MODULE_ID].sufferPrompt).toMatchObject({ kind: "any", amount: 1, exclude: ["sacrifice_resources"] });
    expect(picker.flags[MODULE_ID]).toMatchObject({ resolutionId: flags(card._id).resolutionId, priceCard: true });

    await click(card, BURN);
    expect(flags(card._id).burn.consumed).toBe(true);
    expect(table.world.message(card._id).content).toMatch(/already rolled stands/);

    // The redirected loss is still owed, so its picker stays live — and its pick lands.
    const after = flags(picker._id);
    expect(after.superseded).not.toBe(true);
    expect(after.resolved).toBe(false);
    await click(picker, '[data-action="sf-suffer-pick"][data-suffer-id="endure_harm"]');
    expect(flags(picker._id).resolved).toBe(true);
    expect(pc.system.health.value).toBe(4);
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

describe("issue #335 Y09 — reconcileChoices keeps only the price's cards", () => {
  it("a price that stands keeps its card and retires the superseded outcome's own", async () => {
    pc = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, system: { health: { value: 3 } } });
    const gm = table.client("gm-1");
    const { postSufferChoiceCard } = await gm.import("../../src/moves/sufferCard.js");
    const { reconcileChoices } = await gm.import("../../src/moves/resultUpgrade.js");
    const prompt = { kind: "enumerated", options: [{ label: "-1 health", health: -1 }] };
    const own   = await gm.run(() => postSufferChoiceCard({ sufferPrompt: prompt, actor: pc, executorOpts: {}, resolutionId: "res-1" }));
    const price = await gm.run(() => postSufferChoiceCard({ sufferPrompt: prompt, actor: pc, executorOpts: { priceCard: true }, resolutionId: "res-1" }));
    await table.settle();

    const res = await gm.run(() => reconcileChoices({ resolutionId: "res-1", kind: "burn", actor: null, sufferPrompt: null, moveId: "battle", failures: [], priceStands: true }));
    await table.settle();

    expect(res).toEqual({ kept: 1 });
    expect(flags(own.id)).toMatchObject({ superseded: true, resolved: true });
    expect(flags(price.id)).toMatchObject({ upgraded: true, resolved: false });
    expect(flags(price.id).superseded).toBeUndefined();
  }, 30_000);

  it("control: a price that does not stand retires its card too", async () => {
    pc = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, system: { health: { value: 3 } } });
    const gm = table.client("gm-1");
    const { postSufferChoiceCard } = await gm.import("../../src/moves/sufferCard.js");
    const { reconcileChoices } = await gm.import("../../src/moves/resultUpgrade.js");
    const prompt = { kind: "enumerated", options: [{ label: "-1 health", health: -1 }] };
    const price = await gm.run(() => postSufferChoiceCard({ sufferPrompt: prompt, actor: pc, executorOpts: { priceCard: true }, resolutionId: "res-2" }));
    await table.settle();

    const res = await gm.run(() => reconcileChoices({ resolutionId: "res-2", kind: "burn", actor: null, sufferPrompt: null, moveId: "battle", failures: [] }));
    await table.settle();

    expect(res).toEqual({ kept: 0 });
    expect(flags(price.id)).toMatchObject({ superseded: true, resolved: true });
  }, 30_000);
});
