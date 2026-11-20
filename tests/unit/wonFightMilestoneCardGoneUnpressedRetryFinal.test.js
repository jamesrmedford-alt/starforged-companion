/* global structuredClone, silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/wonFightMilestoneCardGoneUnpressedRetryFinal.test.js
 *
 * Issue #364 FIGHT-MILESTONE-CARD-GONE-UNPRESSED-RETRY-LOOP (read from the
 * code while fixing FIGHT-MILESTONE-RAISE-REFUSED-CARD-GONE; reproduced here).
 *
 * A Battle won on a weak hit and burned to a strong hit raises the victory
 * card's ⚑ count; a raise the world refused is a `milestoneUpgrade` step on
 * the GMs' payoff card. With the victory card deleted before the Retry and
 * its ⚑ never pressed, no milestone of the win was marked from that card and
 * none can be: there is nothing to raise and nothing to add to. The Retry
 * answered "victory-card-gone" as a step all the same, and a Retry puts
 * every step that fails again on a fresh card with its own Retry — so each
 * press posted another card whose Retry could never succeed.
 *
 * Now that outcome is final: the Retry resolves the card, posts no fresh
 * Retry, and tells the GMs once — on a card with no Retry — that nothing is
 * owed and why. The pressed case (the vow's ledger says the ⚑ landed before
 * the card went) is still paid, once, and a mark refused again still gets
 * its fresh Retry.
 *
 * On a booted table, through the real Retry: the player's Battle through the
 * GM's pipeline, the Burn Momentum on its card with the raise refused, the
 * victory card deleted, the GM's press of "Retry these steps".
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
import { milestoneTicks } from "../../src/moves/milestone.js";

const REPLY = 'The corsairs break.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
// challenge 3, 7; action die 4 + iron 2 = 6: a weak hit — momentum 9 burns it to a strong hit
const WEAK  = [0.25, 0.65, 0.5];
const BURN  = '[data-action="sf-burn-momentum"]';
const MARK  = '[data-action="sf-mark-milestone"]';
const RETRY = '[data-action="sf-payoff-retry"]';
const PER_MARK = milestoneTicks("dangerous");   // the vow's rank sets each mark's ticks

let table, kira, tracksStore, beacon;
/** How many of the vow's next progress writes the world refuses. */
let refuseMarks = 0;
/** How many of the reward's next claims at the strong hit's scale the world refuses. */
let refuseStrongClaims = 0;

function vowItem(id, name, reward) {
  const item = {
    id, type: "progress", name, system: { subtype: "vow", rank: "dangerous", current: 0, completed: false },
    flags: { [MODULE_ID]: { vowId: id, reward: { status: "promised", ...reward } } },
    update: async (changes) => {
      if ("system.current" in changes && refuseMarks > 0) {
        refuseMarks -= 1;
        throw new Error("the world refused the write");
      }
      if ("system.current" in changes) item.system.current = changes["system.current"];
      if ("system.completed" in changes) item.system.completed = changes["system.completed"];
      return item;
    },
    setFlag: async (mod, key, value) => {
      if (key === "reward" && value?.grantedAt === "strong_hit" && refuseStrongClaims > 0) {
        refuseStrongClaims -= 1;
        throw new Error("the world refused the write");
      }
      (item.flags[mod] ??= {})[key] = structuredClone(value);
    },
  };
  return item;
}

async function seat() {
  control.abilities = [];
  refuseMarks = 0;
  refuseStrongClaims = 0;
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "i364-ms3", sessionNumber: 2,
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

const fightCard = () => table.cards(f => f.fightVowCard).at(-1) ?? null;
const failCards = () => table.cards(f => f.payoffFailureCard);
const ledger = () => beacon.flags[MODULE_ID].fulfilPayoff ?? {};
/** The raise of the victory card's ⚑ count: its `marks` flag written. */
const raiseOf = (card) => (w) => w.kind === "message.update" && w.id === card._id
  && Object.keys(w.changes ?? {}).some(k => k.endsWith(".marks"));

/** The failure card's steps run again as the GM's Retry runs them — past the card's own once-only claim. */
async function rerun(report) {
  const { retryPayoffSteps } = await table.client("gm-1").import("../../src/index.js");
  const failed = await table.client("gm-1").run(() => retryPayoffSteps(report.flags[MODULE_ID]));
  await table.settle(); await table.drain();
  return failed;
}

/** The Burn's raise of the victory card refused: the GMs' payoff card, its one step a raise. */
async function raiseRefused() {
  const card = await battleWeak();
  failWrites(table, raiseOf(fightCard()));
  await click("pl-1", card, BURN);
  const [report] = failCards();
  expect(report.flags[MODULE_ID].steps, "setup: one refused raise").toMatchObject([{ step: "milestoneUpgrade", marks: 2, lacking: null }]);
  return report;
}

async function deleteVictoryCard() {
  const victoryId = fightCard()._id;
  await table.client("gm-1").run(() => globalThis.game.messages.get(victoryId).delete());
  await table.settle(); await table.drain();
  expect(fightCard(), "the victory card is gone (setup)").toBeNull();
  return victoryId;
}

const live = (card) => table.world.message(card._id);
/** The GMs' payoff cards that carry a Retry, and the ones that say what is final. */
const retryCards = () => failCards().filter(c => c.flags[MODULE_ID].retryable !== false);
const finalCards = () => failCards().filter(c => c.flags[MODULE_ID].retryable === false);
const NEVER_PRESSED = "the victory card is no longer in chat, and its ⚑ was never pressed";

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

describe("issue #364 FIGHT-MILESTONE-CARD-GONE-UNPRESSED-RETRY-LOOP — a refused raise, the victory card deleted with its ⚑ never pressed", () => {
  it("the Retry resolves the card: no fresh Retry card, and the GMs are told once why nothing is owed", async () => {
    await seat();
    const report = await raiseRefused();
    await deleteVictoryCard();

    await click("gm-1", report, RETRY);

    expect(live(report).flags[MODULE_ID].resolved, "the card is resolved").toBe(true);
    expect(retryCards().map(c => c._id), "no fresh card with a Retry").toEqual([report._id]);
    expect(finalCards(), "one card saying why").toHaveLength(1);
    const [told] = finalCards();
    expect(told.flags[MODULE_ID]).toMatchObject({ payoffFailureCard: true, retryable: false, source: "fight", vowName: "Bring the beacon home" });
    expect(String(told.content)).toContain("no longer owed");
    expect(String(told.content)).toContain(NEVER_PRESSED);
    expect(String(told.content), "it offers no Retry").not.toContain("sf-payoff-retry");
    expect(table.client("gm-1").render(told._id).querySelector(RETRY)).toBeNull();
    expect(told.whisper, "the GMs alone").toEqual(["gm-1"]);
    // Nothing was marked, and nothing claimed: no milestone of this win is on the vow.
    expect(beacon.system.current).toBe(0);
    expect(ledger()).toEqual({});
  }, 30_000);

  it("its card cannot be retried: a press on it applies nothing and posts nothing", async () => {
    await seat();
    const report = await raiseRefused();
    await deleteVictoryCard();
    await click("gm-1", report, RETRY);
    const [told] = finalCards();
    expect(told, "setup: the card saying why").toBeTruthy();
    const cards = failCards().length;

    const { applyPayoffRetry } = await table.client("gm-1").import("../../src/moves/cardActions.js");
    const res = await table.client("gm-1").run(() => applyPayoffRetry({ messageId: told._id }, { requesterId: "gm-1", requesterIsGM: true }));
    await table.settle(); await table.drain();

    expect(res).toMatchObject({ applied: false, reason: "not-a-payoff-card" });
    expect(failCards()).toHaveLength(cards);
    expect(beacon.system.current).toBe(0);
  }, 30_000);

  it("the steps run again fail no step again", async () => {
    await seat();
    const report = await raiseRefused();
    await deleteVictoryCard();
    await click("gm-1", report, RETRY);

    expect(await rerun(report), "nothing left that a Retry could apply").toEqual([]);
    expect(retryCards().map(c => c._id)).toEqual([report._id]);
    expect(beacon.system.current).toBe(0);
  }, 30_000);

  it("beside a step refused again: that step alone goes on the fresh Retry card, and its Retry pays it", async () => {
    await seat();
    const card = await battleWeak();
    failWrites(table, raiseOf(fightCard()));
    refuseStrongClaims = 2;                       // the Burn's claim of the reward, and the Retry's
    await click("pl-1", card, BURN);
    const [report] = failCards();
    expect(report.flags[MODULE_ID].steps, "setup: the raise and the reward's claim refused").toMatchObject([
      { step: "milestoneUpgrade", lacking: null }, { step: "rewardUpgrade" }]);
    await deleteVictoryCard();

    await click("gm-1", report, RETRY);

    expect(finalCards()).toHaveLength(1);
    expect(String(finalCards()[0].content)).toContain(NEVER_PRESSED);
    const fresh = retryCards().filter(c => c._id !== report._id);
    expect(fresh, "one fresh Retry card").toHaveLength(1);
    expect(fresh[0].flags[MODULE_ID].steps, "the reward's claim alone").toMatchObject([{ step: "rewardUpgrade" }]);
    expect(fresh[0].flags[MODULE_ID].steps).toHaveLength(1);

    const supply = kira.system.supply.value;
    await click("gm-1", fresh[0], RETRY);
    expect(kira.system.supply.value, "the reward's strong-hit difference").toBe(supply + 1);
    expect(retryCards()).toHaveLength(2);
    expect(finalCards()).toHaveLength(1);
    expect(beacon.system.current).toBe(0);
  }, 30_000);
});

describe("issue #364 FIGHT-MILESTONE-CARD-GONE-UNPRESSED-RETRY-LOOP — control: ⚑ pressed before the card went (FIGHT-MILESTONE-RAISE-REFUSED-CARD-GONE)", () => {
  it("the Retry marks the one that press lacked, from the vow's ledger — nothing final is said", async () => {
    await seat();
    const report = await raiseRefused();
    await click("pl-1", fightCard(), MARK);
    expect(beacon.system.current, "the press marked the card's ×1 (setup)").toBe(PER_MARK);
    const victoryId = await deleteVictoryCard();

    await click("gm-1", report, RETRY);

    expect(beacon.system.current, "the strong hit's two marks").toBe(2 * PER_MARK);
    expect(ledger()[`milestone:${victoryId}:upgrade`]).toBe(true);
    expect(failCards(), "no card of either kind").toHaveLength(1);
  }, 30_000);

  it("a mark refused again still goes on a fresh card with its own Retry, which marks it once", async () => {
    await seat();
    const report = await raiseRefused();
    await click("pl-1", fightCard(), MARK);
    const victoryId = await deleteVictoryCard();
    refuseMarks = 1;
    await click("gm-1", report, RETRY);

    expect(finalCards()).toEqual([]);
    expect(retryCards()).toHaveLength(2);
    expect(retryCards()[1].flags[MODULE_ID].steps).toMatchObject([{ step: "milestoneUpgrade", cardId: victoryId, marks: 2, lacking: 1 }]);

    await click("gm-1", retryCards()[1], RETRY);
    expect(beacon.system.current).toBe(2 * PER_MARK);
    expect(failCards()).toHaveLength(2);
  }, 30_000);
});
