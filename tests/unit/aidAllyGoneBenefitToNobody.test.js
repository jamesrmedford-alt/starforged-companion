/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/aidAllyGoneBenefitToNobody.test.js
 *
 * Issue #364 AID-ALLY-GONE-BENEFIT-TO-ROLLER.
 *
 * Aid Your Ally's benefits are the ally's ("they (instead of you) take the
 * benefits of the move"), a Heal's care the patient's — each named by Actor id
 * on the move's choice card (`allyActorId` / `patientActorId`) and on the GMs'
 * payoff card a refused write leaves. When that character was deleted before
 * the pick, or before the GMs' Retry, the runner fell back to the roller: the
 * momentum, the +1 on the next roll, the health and the wound clear went to
 * the character who rolled.
 *
 * Now a named ally or patient who is gone gets nothing, and nobody else does:
 * the call answers "no-pc". On a Retry that is final — the card is settled,
 * the GMs are told once in plain words on a card with no Retry, and its line
 * names no one else as the recipient. On the choice card the pick says it was
 * not applied, in words. A call that names no ally behaves as before.
 *
 * On a booted table: the payoff cards are posted by the GM's own poster with
 * the record a refused write leaves and retried by the GM's real press; the
 * choice cards are posted by the real move pipeline (interpretation and dice
 * scripted at their boundaries) and picked by the roller's player.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], interpretation: null }));
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

import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

const RETRY  = '[data-action="sf-payoff-retry"]';
const PICK   = '[data-action="sf-suffer-pick"]';
const GONE   = "the character's sheet is gone from the world, so there is no one left to receive it";
const STRONG = [0.25, 0.45, 0.9];   // challenge 3, 5; die 6 — stat 2 → 8: a strong hit
const WEAK   = [0.25, 0.75, 0.6];   // challenge 3, 8; die 4 — stat 2 → 6: a weak hit

let table, gm, index, ash, kira;
const live       = (card) => table.world.message(card._id);
const failCards  = () => table.cards(f => f.payoffFailureCard);
const retryCards = () => failCards().filter(c => c.flags[MODULE_ID].retryable !== false);
const finalCards = () => failCards().filter(c => c.flags[MODULE_ID].retryable === false);
const bonuses    = () => table.world.campaignState().nextMoveBonuses ?? {};

// Ash rolled; the step names Kira (the ally Ash aided, or Ash's patient).
async function post(call, opts) {
  await gm.run(() => index.postPayoffFailureCard({ source: "suffer", actorId: "pc-ash",
    failures: [{ step: "suffer", call, opts, reason: "refused" }] }));
  await table.settle(); await table.drain();
  return failCards().at(-1);
}
async function retry(card) {
  await gm.click(card._id, RETRY);
  await table.settle(); await table.drain();
}
async function ashRolls(interpretation, dice, text) {
  control.interpretation = { adds: 0, rationale: "test", mischiefApplied: false, ...interpretation };
  control.dice = dice;
  await table.client("pl-1").chat(text, { speaker: { actor: ash.id } });
  await table.settle(); await table.drain();
  return table.cards(f => f.sufferCard && f.sufferPrompt).at(-1);
}
async function pick(card, index) {
  await table.client("pl-1").click(card._id, PICK, { index });
  await table.settle(); await table.drain();
}

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
  gm = table.client("gm-1");
  index = await gm.import("../../src/index.js");
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "aag-s1", sessionNumber: 1,
      currentSceneId: "aag-scene", sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  scriptClaude(table, { fallback: () => 'The moment passes.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  silenceConsoleErrors();
  ash  = table.addActor({ id: "pc-ash",  name: "Ash",  ownership: { "pl-1": 3 },
    system: { edge: 2, wits: 2, health: { value: 2 }, momentum: { value: 2 }, debility: { wounded: true } } });
  kira = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-2": 3 },
    system: { health: { value: 1 }, momentum: { value: 2 }, debility: { wounded: true } } });
});

describe("issue #364 AID-ALLY-GONE-BENEFIT-TO-ROLLER — the GMs' Retry of a benefit whose ally or patient is gone", () => {
  it.each([
    ["Aid Your Ally's momentum", { kind: "meter", meterKey: "momentum", delta: 1 }, { allyActorId: "pc-kira" },
      () => expect(ash.system.momentum.value).toBe(2)],
    ["Aid Your Ally's +1 on the next roll", { kind: "next-bonus", amount: 1 }, { allyActorId: "pc-kira" },
      () => expect(bonuses()["pc-ash"]).toBeUndefined()],
    ["a Heal's health for the patient", { kind: "meter", meterKey: "health", delta: 2 }, { patientActorId: "pc-kira" },
      () => expect(ash.system.health.value).toBe(2)],
    ["a Heal's wound cleared for the patient", { kind: "clear-impact", debility: "wounded" }, { patientActorId: "pc-kira" },
      () => expect(ash.system.debility.wounded).toBe(true)],
  ])("%s: the roller gets nothing — settled, told once in plain words, no fresh Retry", async (_what, call, opts, rollerUntouched) => {
    const card = await post(call, opts);
    table.actors.delete("pc-kira");

    await retry(card);

    rollerUntouched();
    expect(live(card).flags[MODULE_ID].resolved).toBe(true);
    expect(retryCards().map(c => c._id), "no fresh card with a Retry").toEqual([card._id]);
    expect(finalCards(), "one card saying why").toHaveLength(1);
    const [told] = finalCards();
    expect(String(told.content)).toContain("Not applied — and no longer owed:");
    expect(String(told.content)).toContain(`— ${GONE}.`);
    expect(String(told.content), "the line names no one else as the recipient").not.toContain("for Ash");
    expect(gm.render(told._id).querySelector(RETRY)).toBeNull();
  }, 30_000);

  it("control: the ally still there — the Retry gives them the momentum, the roller nothing, and the line names them", async () => {
    const card = await post({ kind: "meter", meterKey: "momentum", delta: 1 }, { allyActorId: "pc-kira" });
    expect(String(card.content)).toContain("for Kira");

    await retry(card);

    expect(kira.system.momentum.value).toBe(3);
    expect(ash.system.momentum.value).toBe(2);
    expect(failCards()).toHaveLength(1);
  }, 30_000);

  it("control: the patient still there — the Retry heals them, and the line names the patient, not the healer", async () => {
    const card = await post({ kind: "meter", meterKey: "health", delta: 2 }, { patientActorId: "pc-kira" });
    expect(String(card.content)).toContain("for Kira");
    expect(String(card.content)).toContain("Kira's health stands at 1 now.");

    await retry(card);

    expect(kira.system.health.value).toBe(3);
    expect(ash.system.health.value).toBe(2);
    expect(failCards()).toHaveLength(1);
  }, 30_000);

  it("control: a step that names no ally — the Retry raises the roller's own momentum, as before", async () => {
    const card = await post({ kind: "meter", meterKey: "momentum", delta: 1 }, {});
    table.actors.delete("pc-kira");

    await retry(card);

    expect(ash.system.momentum.value).toBe(3);
    expect(failCards()).toHaveLength(1);
  }, 30_000);
});

describe("issue #364 AID-ALLY-GONE-BENEFIT-TO-ROLLER — a late pick on the move's own choice card", () => {
  it("Aid Your Ally's weak hit, Kira deleted before the pick: Ash's momentum is untouched and the card says why", async () => {
    const card = await ashRolls({ moveId: "aid_your_ally", moveName: "Aid Your Ally", statUsed: "edge", moveTarget: "Kira" },
      WEAK, "I draw their fire so Kira can slip past.");
    expect(card.flags[MODULE_ID].executorOpts.allyActorId).toBe("pc-kira");
    table.actors.delete("pc-kira");

    await pick(card, 0);

    expect(ash.system.momentum.value).toBe(2);
    expect(live(card).flags[MODULE_ID].resolved).toBe(true);
    expect(String(live(card).content)).toContain("the character it was for is no longer in the world");
    expect(String(live(card).content)).not.toContain("no-pc");
    expect(failCards(), "nothing for the GMs to retry").toEqual([]);
  }, 30_000);

  it("Heal's strong hit on Kira, Kira deleted before the pick: Ash's health and wound are untouched", async () => {
    const card = await ashRolls({ moveId: "heal", moveName: "Heal", statUsed: "wits", moveTarget: "Kira" },
      STRONG, "I patch up Kira's wounds.");
    expect(card.flags[MODULE_ID].executorOpts.patientActorId).toBe("pc-kira");
    table.actors.delete("pc-kira");

    await pick(card, 0);   // "Clear wounded + take/give +2 health" — Ash is wounded too

    expect(ash.system.health.value).toBe(2);
    expect(ash.system.debility.wounded).toBe(true);
    expect(String(live(card).content)).toContain("the character it was for is no longer in the world");
    expect(failCards()).toEqual([]);
  }, 30_000);
});
