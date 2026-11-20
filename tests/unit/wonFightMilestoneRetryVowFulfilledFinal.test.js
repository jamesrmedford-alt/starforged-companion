/* global structuredClone, silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/wonFightMilestoneRetryVowFulfilledFinal.test.js
 *
 * Issue #364 FIGHT-MILESTONE-RETRY-VOW-FULFILLED-LOOP (found while fixing
 * FIGHT-MILESTONE-CARD-GONE-UNPRESSED-RETRY-LOOP, in the same function and of
 * the same kind).
 *
 * A Battle won on a weak hit and burned to a strong hit owes the marks a
 * pressed ⚑ lacked; a mark the world refused is a `milestoneUpgrade` step on
 * the GMs' payoff card. A vow fulfilled — or gone from every sheet — before
 * the Retry has nothing left to mark: the first payment says so on the move
 * card and offers no Retry. The Retry got the same answer (no step), but a
 * Retry puts everything that fails again on a fresh card with its own Retry,
 * under the step's old name — so each press posted another card whose Retry
 * found the vow fulfilled again.
 *
 * Now that answer is final on the Retry too: the card is resolved, no fresh
 * Retry is posted, and the GMs are told once, on a card with no Retry, that
 * the vow is fulfilled (or on no sheet) and nothing is owed.
 *
 * On a booted table, through the real Retry.
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
import { scriptClaude } from "../helpers/faults.js";
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
    setFlag: async (mod, key, value) => { (item.flags[mod] ??= {})[key] = structuredClone(value); },
  };
  return item;
}

async function seat() {
  control.abilities = [];
  refuseMarks = 0;
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "i364-ms4", sessionNumber: 2,
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
/** The failure card's steps run again as the GM's Retry runs them — past the card's own once-only claim. */
async function rerun(report) {
  const { retryPayoffSteps } = await table.client("gm-1").import("../../src/index.js");
  const failed = await table.client("gm-1").run(() => retryPayoffSteps(report.flags[MODULE_ID]));
  await table.settle(); await table.drain();
  return failed;
}

const live = (card) => table.world.message(card._id);
const retryCards = () => failCards().filter(c => c.flags[MODULE_ID].retryable !== false);
const finalCards = () => failCards().filter(c => c.flags[MODULE_ID].retryable === false);

/** ⚑ pressed at ×1, then the Burn's extra mark refused: the GMs' payoff card, its one step the mark owed. */
async function markRefusedAfterPress() {
  const card = await battleWeak();
  await click("pl-1", fightCard(), MARK);
  expect(beacon.system.current, "setup: the weak hit's one mark").toBe(PER_MARK);
  refuseMarks = 1;
  await click("pl-1", card, BURN);
  const [report] = failCards();
  expect(report.flags[MODULE_ID].steps, "setup: one refused mark").toMatchObject([{ step: "milestoneUpgrade", marks: 2, lacking: 1 }]);
  return report;
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

describe("issue #364 FIGHT-MILESTONE-RETRY-VOW-FULFILLED-LOOP — a refused mark, nothing left to mark by the time of the Retry", () => {
  it("the vow fulfilled since: the Retry resolves the card — no fresh Retry, the GMs told once that it is fulfilled", async () => {
    await seat();
    const report = await markRefusedAfterPress();
    beacon.system.completed = true;

    await click("gm-1", report, RETRY);

    expect(live(report).flags[MODULE_ID].resolved).toBe(true);
    expect(retryCards().map(c => c._id), "no fresh card with a Retry").toEqual([report._id]);
    expect(finalCards(), "one card saying why").toHaveLength(1);
    expect(String(finalCards()[0].content)).toContain("the vow is fulfilled — nothing to mark");
    expect(String(finalCards()[0].content)).toContain("no longer owed");
    expect(table.client("gm-1").render(finalCards()[0]._id).querySelector(RETRY)).toBeNull();
    expect(beacon.system.current, "nothing more marked").toBe(PER_MARK);
    expect(ledger()[`milestone:${fightCard()._id}:upgrade`]).toBeUndefined();
    expect(await rerun(report), "and its steps run again fail no step again").toEqual([]);
  }, 30_000);

  it("the vow gone from every sheet since: the same, saying so", async () => {
    await seat();
    const report = await markRefusedAfterPress();
    kira.items.contents.splice(0);

    await click("gm-1", report, RETRY);

    expect(live(report).flags[MODULE_ID].resolved).toBe(true);
    expect(retryCards().map(c => c._id)).toEqual([report._id]);
    expect(finalCards()).toHaveLength(1);
    expect(String(finalCards()[0].content)).toContain("the vow is on no character's sheet any more");
  }, 30_000);

  it("control: the vow still open — the Retry marks the one it lacked, and says nothing more", async () => {
    await seat();
    const report = await markRefusedAfterPress();

    await click("gm-1", report, RETRY);

    expect(beacon.system.current).toBe(2 * PER_MARK);
    expect(failCards()).toHaveLength(1);
  }, 30_000);

  it("control: refused again with the vow still open — a fresh card with its own Retry", async () => {
    await seat();
    const report = await markRefusedAfterPress();
    refuseMarks = 1;

    await click("gm-1", report, RETRY);

    expect(finalCards()).toEqual([]);
    expect(retryCards()).toHaveLength(2);
    expect(beacon.system.current).toBe(PER_MARK);
  }, 30_000);
});
