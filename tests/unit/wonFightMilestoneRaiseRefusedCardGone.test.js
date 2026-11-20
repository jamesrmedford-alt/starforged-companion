/* global structuredClone, silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/wonFightMilestoneRaiseRefusedCardGone.test.js
 *
 * Issue #364 FIGHT-MILESTONE-RAISE-REFUSED-CARD-GONE (found while fixing
 * FIGHT-MILESTONE-STAMP-REFUSED-UPGRADE, in the same function). A Battle won
 * on a weak hit and burned to a strong hit raises the victory card's ⚑ count;
 * a raise the world refused is a `milestoneUpgrade` step on the GMs' payoff
 * card, and its Retry decides again by the victory card as it stands.
 *
 * With the victory card deleted before the Retry, the step read "its ⚑ was
 * never pressed and the card is gone: nothing to add to" — unchecked. A ⚑
 * pressed at the card's old count before it was deleted had marked the vow
 * (the vow's payoff ledger says so, `milestone:<card>`), and the Retry
 * refused "victory-card-gone" onto a fresh card, again and again: the strong
 * hit's extra mark could never be paid.
 *
 * Now the refused raise's step keeps the marks a press at the card's count
 * lacks (`whenPressed`), and a Retry that finds the card gone reads the
 * ledger: pressed, it marks them, once; never pressed, it has nothing to add
 * to, as before.
 *
 * On a booted table: the player's Battle through the GM's real pipeline, the
 * Burn Momentum on its card with the raise refused, ⚑, the GMs' Retry.
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
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "i364-ms2", sessionNumber: 2,
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

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

describe("issue #364 FIGHT-MILESTONE-RAISE-REFUSED-CARD-GONE — a refused raise, the victory card deleted before the Retry", () => {
  it("⚑ pressed at ×1 before the card went: the Retry marks the one that press lacked", async () => {
    await seat();
    const report = await raiseRefused();
    await click("pl-1", fightCard(), MARK);
    expect(beacon.system.current, "the press marked the card's ×1 (setup)").toBe(PER_MARK);
    const victoryId = await deleteVictoryCard();

    await click("gm-1", report, RETRY);

    expect(beacon.system.current, "the strong hit's two marks").toBe(2 * PER_MARK);
    expect(ledger()[`milestone:${victoryId}:upgrade`], "claimed on the vow's payoff ledger").toBe(true);
    expect(failCards(), "nothing failed again").toHaveLength(1);
  }, 30_000);

  it("never twice: its steps run again mark nothing more", async () => {
    await seat();
    const report = await raiseRefused();
    await click("pl-1", fightCard(), MARK);
    await deleteVictoryCard();
    await click("gm-1", report, RETRY);

    expect(await rerun(report)).toEqual([]);
    expect(beacon.system.current).toBe(2 * PER_MARK);
  }, 30_000);

  it("the Retry's mark refused: a fresh card carries the mark owed, and its Retry marks it once", async () => {
    await seat();
    const report = await raiseRefused();
    await click("pl-1", fightCard(), MARK);
    const victoryId = await deleteVictoryCard();
    refuseMarks = 1;
    await click("gm-1", report, RETRY);

    expect(beacon.system.current).toBe(PER_MARK);
    expect(failCards()).toHaveLength(2);
    expect(failCards()[1].flags[MODULE_ID].steps).toMatchObject([{ step: "milestoneUpgrade", cardId: victoryId, marks: 2, lacking: 1 }]);

    await click("gm-1", failCards()[1], RETRY);
    expect(beacon.system.current).toBe(2 * PER_MARK);
    expect(failCards()).toHaveLength(2);
  }, 30_000);

  it("control: ⚑ never pressed — the Retry has no mark of this win to add to, and marks nothing", async () => {
    await seat();
    const report = await raiseRefused();
    await deleteVictoryCard();

    await click("gm-1", report, RETRY);

    expect(beacon.system.current).toBe(0);
    expect(ledger()).toEqual({});
  }, 30_000);
});
