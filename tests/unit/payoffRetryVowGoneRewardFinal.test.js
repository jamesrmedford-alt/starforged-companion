/* global structuredClone, silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/payoffRetryVowGoneRewardFinal.test.js
 *
 * Issue #364 PAYOFF-RETRY-VOW-GONE-REWARD-LOOP.
 *
 * A won fight's promised reward is claimed on the vow before it is given; a
 * claim the world refused is a `reward` step on the GMs' payoff card, and a
 * refused claim of the strong hit's difference a `rewardUpgrade` step. With
 * the vow deleted from every sheet before the Retry there is no reward left
 * to claim: the step answers "no-vow", on that press and every later one —
 * but a Retry puts every step that fails again on a fresh card with its own
 * Retry, so each press posted another card whose Retry could not succeed.
 *
 * Now that answer is final, as a won fight's milestone mark on a vow gone
 * from every sheet already is (FIGHT-MILESTONE-RETRY-VOW-FULFILLED-LOOP): the
 * Retry resolves the card, posts no fresh Retry, and tells the GMs once, on a
 * card with no Retry, that the vow is on no character's sheet any more. A vow
 * fulfilled since is still on its sheet, and its reward is still paid.
 *
 * On a booted table, as tests/unit/wonFightRewardUpgradeRetry.test.js: the
 * real Battle, the refused claim, the GM's press of "Retry these steps".
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const control = vi.hoisted(() => ({ interpretation: null, dice: [], abilities: [] }));
vi.mock("../../src/pacing/router.js", async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../src/moves/interpreter.js", async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: "chat" })),
}));
vi.mock("../../src/moves/abilityScanner.js", async (importOriginal) => ({
  ...(await importOriginal()), scanForApplicableAbilities: vi.fn(async () => control.abilities),
}));
vi.mock("../../src/ui/settingsPanel.js", async (importOriginal) => ({
  ...(await importOriginal()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock("../../src/moves/resolver.js", async (importOriginal) => {
  const original = await importOriginal();
  return { ...original, resolveMove: vi.fn((...args) => {
    const dice = vi.spyOn(Math, "random");
    for (const d of control.dice) dice.mockReturnValueOnce(d);
    try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude, failWrites } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

const REPLY = 'The corsairs break.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
// challenge 3, 7; action die 4 + iron 2 = 6: a weak hit — momentum 9 burns it to a strong hit
const WEAK  = [0.25, 0.65, 0.5];
const BURN  = '[data-action="sf-burn-momentum"]';
const RETRY = '[data-action="sf-payoff-retry"]';
const GONE  = "the vow is on no character's sheet any more";

let table, kira, tracksStore, beacon;
/** How many of the reward's next claims at each scale the world refuses. */
const refuseClaims = { weak_hit: 0, strong_hit: 0 };

function vowItem(id, name, reward) {
  const item = {
    id, type: "progress", name, system: { subtype: "vow", rank: "dangerous", current: 0, completed: false },
    flags: { [MODULE_ID]: { vowId: id, reward: { status: "promised", ...reward } } },
    update: async (changes) => {
      if ("system.current" in changes) item.system.current = changes["system.current"];
      if ("system.completed" in changes) item.system.completed = changes["system.completed"];
      return item;
    },
    setFlag: async (mod, key, value) => {
      if (key === "reward" && refuseClaims[value?.grantedAt] > 0) {
        refuseClaims[value.grantedAt] -= 1;
        throw new Error("the world refused the write");
      }
      (item.flags[mod] ??= {})[key] = structuredClone(value);
    },
  };
  return item;
}

async function seat() {
  control.abilities = [];
  refuseClaims.weak_hit = 0;
  refuseClaims.strong_hit = 0;
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "i364-vg1", sessionNumber: 2,
      currentSceneId: "sc-1", sceneTruths: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-gina");
  beacon = vowItem("v-beacon", "Bring the beacon home", { description: "Fuel cells", form: "supply" });
  kira = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 },
    system: { momentum: { value: 9, max: 10, min: -6, resetValue: 2 }, iron: 2 },
    items: { contents: [beacon] } });
  kira.system.supply.value = 1;
  tracksStore = { [`${MODULE_ID}.tracks`]: [
    { id: "fight-1", label: "Corsairs", type: "combat", rank: "formidable", ticks: 16, completed: false,
      combatState: "in_control", positions: { "pc-kira": "in_control" },
      linkedVowId: "v-beacon", linkedVowName: "Bring the beacon home", createdAt: 1 },
  ] };
  table.journal._set({
    id: "tracks-journal", name: "Starforged Progress Tracks",
    getFlag: (mod, key) => tracksStore[`${mod}.${key}`],
    setFlag: async (mod, key, value) => { tracksStore[`${mod}.${key}`] = structuredClone(value); },
  });
  scriptClaude(table, { fallback: () => REPLY });
  silenceConsoleErrors();
}

/** Kira's Battle against the fight, a weak hit: it ends the fight and pays the win at the weak hit's scale. */
async function battleWeak() {
  control.interpretation = { adds: 0, rationale: "test", mischiefApplied: false,
    moveId: "battle", moveName: "Battle", statUsed: "iron", moveTarget: "Corsairs", moveTargetId: "fight-1" };
  control.dice = WEAK;
  await table.client("pl-1").chat("We throw everything we have at the corsairs.", { speaker: { actor: "pc-kira" } });
  await table.settle(); await table.drain();
  return table.cards(f => f.moveResolution).at(-1);
}

async function click(userId, card, selector) {
  await table.client(userId).click(card._id, selector);
  await table.settle(); await table.drain();
}

const live = (card) => table.world.message(card._id);
const failCards  = () => table.cards(f => f.payoffFailureCard);
const retryCards = () => failCards().filter(c => c.flags[MODULE_ID].retryable !== false);
const finalCards = () => failCards().filter(c => c.flags[MODULE_ID].retryable === false);
/** The GM deletes the vow from the only sheet that holds it. */
const deleteVow = () => kira.items.contents.splice(0);

/** The weak hit's reward claim refused: the GMs' card, its one step the reward. */
async function rewardClaimRefused() {
  refuseClaims.weak_hit = 1;
  await battleWeak();
  const [report] = failCards();
  expect(report.flags[MODULE_ID], "setup: the reward's claim refused").toMatchObject({ source: "fight", vowId: "v-beacon",
    retryable: true, steps: [{ step: "reward" }] });
  expect(kira.system.supply.value, "setup: nothing given").toBe(1);
  return report;
}

/** The win burned to a strong hit, the claim of the reward's difference refused: its one step the upgrade. */
async function rewardUpgradeRefused() {
  const card = await battleWeak();
  refuseClaims.strong_hit = 1;
  await click("pl-1", card, BURN);
  const [report] = failCards();
  expect(report.flags[MODULE_ID], "setup: the upgrade's claim refused").toMatchObject({ source: "fight", vowId: "v-beacon",
    retryable: true, steps: [{ step: "rewardUpgrade", rewardDescription: "Fuel cells" }] });
  expect(kira.system.supply.value, "setup: the weak hit's point only").toBe(2);
  return report;
}

/** The card is settled by the one closing note: resolved, no fresh Retry, the GMs told once why. */
function expectSettled(report) {
  expect(live(report).flags[MODULE_ID].resolved).toBe(true);
  expect(retryCards().map(c => c._id), "no fresh card with a Retry").toEqual([report._id]);
  expect(finalCards(), "one card saying why").toHaveLength(1);
  const [told] = finalCards();
  expect(String(told.content)).toContain("Not applied — and no longer owed:");
  expect(table.client("gm-1").render(told._id).querySelector(RETRY)).toBeNull();
  expect(told.whisper).toEqual(["gm-1"]);
  return told;
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

describe("issue #364 PAYOFF-RETRY-VOW-GONE-REWARD-LOOP — a refused reward claim, its vow deleted from every sheet before the GMs' Retry", () => {
  it("the reward's claim: the Retry resolves the card — no fresh Retry, the GMs told once that the vow is on no sheet", async () => {
    await seat();
    const report = await rewardClaimRefused();
    deleteVow();

    await click("gm-1", report, RETRY);

    const told = expectSettled(report);
    expect(String(told.content)).toContain(`The promised reward — ${GONE}; nothing was given.`);
    expect(kira.system.supply.value, "nothing given").toBe(1);
  }, 30_000);

  it("the strong hit's difference: the same, saying so", async () => {
    await seat();
    const report = await rewardUpgradeRefused();
    deleteVow();

    await click("gm-1", report, RETRY);

    const told = expectSettled(report);
    expect(String(told.content)).toContain(`The strong hit's share of the promised reward “Fuel cells”, for a win upgraded from a weak hit — ${GONE}.`);
    expect(kira.system.supply.value, "no second point").toBe(2);
  }, 30_000);

  it("a step refused again beside it still gets its own fresh Retry card, which applies it", async () => {
    await seat();
    const first = await rewardClaimRefused();
    deleteVow();
    // The GMs' card with the reward and a momentum award the world keeps refusing.
    const gm = table.client("gm-1");
    const { postPayoffFailureCard } = await gm.import("../../src/index.js");
    await gm.run(() => postPayoffFailureCard({ source: "fight", vowName: "Bring the beacon home", vowId: "v-beacon",
      actorId: "pc-kira", outcome: "weak_hit", failures: [
        { step: "reward", reason: "refused" },
        { step: "momentum", pcId: "pc-kira", amount: 1, reason: "refused" },
      ] }));
    await table.settle(); await table.drain();
    const both = failCards().at(-1);
    const refusal = failWrites(table, w => w.kind === "actor.update" && w.id === "pc-kira", { times: 1 });

    await click("gm-1", both, RETRY);

    expect(refusal.refused).toBe(1);
    expect(live(both).flags[MODULE_ID].resolved).toBe(true);
    const [told] = finalCards();
    expect(finalCards()).toHaveLength(1);
    expect(told.flags[MODULE_ID].steps).toEqual([{ step: "reward" }]);
    expect(String(told.content)).toContain(GONE);
    expect(String(told.content)).not.toContain("momentum");
    const fresh = retryCards().at(-1);
    expect(retryCards().map(c => c._id)).toEqual([first._id, both._id, fresh._id]);
    expect(fresh.flags[MODULE_ID]).toMatchObject({ retryable: true, resolved: false, steps: [{ step: "momentum", pcId: "pc-kira", amount: 1 }] });

    await click("gm-1", fresh, RETRY);
    expect(kira.system.momentum.value).toBe(10);
    expect(failCards()).toHaveLength(4);
  }, 30_000);

  it("control: the vow fulfilled since, still on its sheet — the Retry gives the reward's difference, and no card follows", async () => {
    await seat();
    const report = await rewardUpgradeRefused();
    beacon.system.completed = true;

    await click("gm-1", report, RETRY);

    expect(kira.system.supply.value).toBe(3);
    expect(beacon.flags[MODULE_ID].reward).toMatchObject({ status: "granted", grantedAt: "strong_hit" });
    expect(failCards()).toHaveLength(1);
  }, 30_000);

  it("control: the claim refused again with the vow still there — a fresh card with its own Retry", async () => {
    await seat();
    const report = await rewardClaimRefused();
    refuseClaims.weak_hit = 1;

    await click("gm-1", report, RETRY);

    expect(finalCards()).toEqual([]);
    expect(retryCards()).toHaveLength(2);
    expect(retryCards()[1].flags[MODULE_ID].steps).toMatchObject([{ step: "reward" }]);
    expect(kira.system.supply.value).toBe(1);
  }, 30_000);
});
