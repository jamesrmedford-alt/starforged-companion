/* global structuredClone, silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/wonFightMilestoneStampRefusedUpgrade.test.js
 *
 * Issue #364 FIGHT-MILESTONE-STAMP-REFUSED-UPGRADE (left open by
 * WON-FIGHT-MILESTONE-UPGRADE-NO-RETRY; in the issue #362 D7 code before it).
 * A Battle won on a weak hit and burned or improved to a strong hit is paid
 * the difference of its milestone: the victory card's ⚑ count is raised while
 * it is still to press, or — once pressed — the marks its press lacked are
 * marked. "Pressed" was read from the card's stamp alone
 * (`resolvedActions.markMilestone`).
 *
 * A ⚑ whose mark landed and whose stamp the world refused (issue #336 Y24)
 * leaves the card unstamped, the press recorded on the vow's payoff ledger
 * (`milestone:<card>`). The upgrade read that card as unpressed and raised it
 * to ×2; the next press found the ledger entry, marked nothing and stamped —
 * so the vow kept the weak hit's one mark, and the strong hit's extra mark
 * was lost with nothing to retry.
 *
 * Now the ledger is read as well as the stamp: the marks the press lacked are
 * marked at the upgrade, once.
 *
 * On a booted table: the player's Battle through the GM's real pipeline, ⚑ on
 * the victory card with its stamp refused, the Burn Momentum on the move card.
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

const live = (card) => table.world.message(card._id);
const fightCard = () => table.cards(f => f.fightVowCard).at(-1) ?? null;
const failCards = () => table.cards(f => f.payoffFailureCard);
const ledger = () => beacon.flags[MODULE_ID].fulfilPayoff ?? {};
const stamped = () => fightCard().flags[MODULE_ID].resolvedActions?.markMilestone === true;
/** The ⚑ press's stamp on the victory card. */
const stampOf = (card) => (w) => w.kind === "message.update" && w.id === card._id
  && Object.keys(w.changes ?? {}).some(k => k.endsWith("resolvedActions.markMilestone"));
/** The raise of the victory card's ⚑ count: its `marks` flag written. */
const raiseOf = (card) => (w) => w.kind === "message.update" && w.id === card._id
  && Object.keys(w.changes ?? {}).some(k => k.endsWith(".marks"));

/** ⚑ pressed at the weak hit's ×1: the mark lands, its stamp is refused — the button stays live (issue #336 Y24). */
async function pressWithStampRefused() {
  const fault = failWrites(table, stampOf(fightCard()));
  await click("pl-1", fightCard(), MARK);
  expect(fault.refused, "the stamp was refused (setup)").toBe(1);
  expect(beacon.system.current, "the press marked the card's ×1 (setup)").toBe(PER_MARK);
  expect(stamped(), "the card is unstamped (setup)").toBe(false);
  expect(ledger()[`milestone:${fightCard()._id}`], "the press is on the vow's payoff ledger (setup)").toBe(true);
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

describe("issue #364 FIGHT-MILESTONE-STAMP-REFUSED-UPGRADE — a ⚑ whose stamp was refused is still a pressed ⚑ to the upgrade", () => {
  it("the Burn marks the one the press lacked — the card's count is not raised over a mark already made", async () => {
    await seat();
    const card = await battleWeak();
    await pressWithStampRefused();

    await click("pl-1", card, BURN);

    expect(live(card).flags[MODULE_ID].burn.consumed).toBe(true);
    expect(beacon.system.current, "the strong hit's two marks, the second at the upgrade").toBe(2 * PER_MARK);
    expect(ledger()[`milestone:${fightCard()._id}:upgrade`], "claimed on the vow's payoff ledger").toBe(true);
    expect(fightCard().flags[MODULE_ID].marks, "a pressed card's count is left").toBe(1);
    expect(fightCard().content).toContain("⚑ Mark milestone (×1)");
    expect(String(live(card).content)).toContain("1 more milestone mark toward Bring the beacon home");
    expect(failCards()).toEqual([]);
  }, 30_000);

  it("the next press of the still-live ⚑ marks nothing more, and its stamp lands", async () => {
    await seat();
    const card = await battleWeak();
    await pressWithStampRefused();
    await click("pl-1", card, BURN);

    // The presser's own button stays spent until the card re-renders; the
    // GM's is live — the unstamped card's next press is theirs.
    await click("gm-1", fightCard(), MARK);
    expect(beacon.system.current, "never a third mark").toBe(2 * PER_MARK);
    expect(stamped()).toBe(true);
    expect(failCards()).toEqual([]);
  }, 30_000);

  it("the upgrade's mark refused: the GMs' card carries the mark it lacks, and its Retry marks it once", async () => {
    await seat();
    const card = await battleWeak();
    await pressWithStampRefused();
    refuseMarks = 1;
    await click("pl-1", card, BURN);

    expect(beacon.system.current).toBe(PER_MARK);
    expect(fightCard().flags[MODULE_ID].marks, "not raised: its ⚑ was pressed").toBe(1);
    expect(failCards()).toHaveLength(1);
    const [report] = failCards();
    expect(report.flags[MODULE_ID]).toMatchObject({ source: "fight", vowId: "v-beacon", retryable: true,
      steps: [{ step: "milestoneUpgrade", cardId: fightCard()._id, marks: 2, lacking: 1 }] });

    await click("gm-1", report, RETRY);
    expect(beacon.system.current).toBe(2 * PER_MARK);
    await click("gm-1", fightCard(), MARK);
    expect(beacon.system.current, "never twice").toBe(2 * PER_MARK);
    expect(stamped()).toBe(true);
    expect(failCards()).toHaveLength(1);
  }, 30_000);

  it("a raise refused, then ⚑ pressed with its stamp refused: the GMs' Retry marks the one it lacked, not a raise", async () => {
    await seat();
    const card = await battleWeak();
    failWrites(table, raiseOf(fightCard()));
    await click("pl-1", card, BURN);
    const [report] = failCards();
    expect(report.flags[MODULE_ID].steps).toMatchObject([{ step: "milestoneUpgrade", marks: 2, lacking: null }]);
    await pressWithStampRefused();

    await click("gm-1", report, RETRY);
    expect(beacon.system.current).toBe(2 * PER_MARK);
    expect(fightCard().flags[MODULE_ID].marks).toBe(1);
    expect(failCards()).toHaveLength(1);

    await click("gm-1", fightCard(), MARK);
    expect(beacon.system.current, "never twice").toBe(2 * PER_MARK);
    expect(stamped()).toBe(true);
  }, 30_000);
});

describe("issue #364 FIGHT-MILESTONE-STAMP-REFUSED-UPGRADE — controls: only this card's own press counts", () => {
  it("a card never pressed is raised to ×2, and one press marks both", async () => {
    await seat();
    const card = await battleWeak();
    await click("pl-1", card, BURN);

    expect(beacon.system.current, "a raise marks nothing by itself").toBe(0);
    expect(fightCard().flags[MODULE_ID].marks).toBe(2);
    await click("pl-1", fightCard(), MARK);
    expect(beacon.system.current).toBe(2 * PER_MARK);
    expect(ledger()[`milestone:${fightCard()._id}:upgrade`]).toBeUndefined();
  }, 30_000);

  it("another won fight's ⚑ on the same vow's ledger does not make this card pressed", async () => {
    await seat();
    beacon.flags[MODULE_ID].fulfilPayoff = { "milestone:an-earlier-fights-card": true };
    const card = await battleWeak();
    await click("pl-1", card, BURN);

    expect(fightCard().flags[MODULE_ID].marks, "raised: this card's ⚑ is still to press").toBe(2);
    expect(beacon.system.current).toBe(0);
    await click("pl-1", fightCard(), MARK);
    expect(beacon.system.current).toBe(2 * PER_MARK);
  }, 30_000);

  it("a stamped press (the stamp landed) is paid the one it lacked, as before", async () => {
    await seat();
    const card = await battleWeak();
    await click("pl-1", fightCard(), MARK);
    expect(stamped(), "stamped (setup)").toBe(true);
    await click("pl-1", card, BURN);

    expect(beacon.system.current).toBe(2 * PER_MARK);
    expect(fightCard().flags[MODULE_ID].marks).toBe(1);
  }, 30_000);
});
