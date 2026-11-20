/* global structuredClone, silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/wonFightNoVowIdCardAsksWhichVow.test.js
 *
 * Issue #364 NO-VOW-ID-CARD-MARKS-WRONG-VOW.
 *
 * A won fight's victory card finds its vow by the vow id it carries; a card
 * with no vow id has the vow's name alone. Current code still posts such a
 * card: a fight linked by name (its threshold card) whose vow is on no sheet
 * at the win, and a fight linked by id whose vow was deleted from every sheet
 * before the win — the payoff found no copy by the id and dropped it. On such
 * a card a deleted vow and a renamed one look the same: the ⚑ press (and the
 * GMs' Retry of a refused mark) fell through the name ladder's sole-open-vow
 * rung and marked the holder's only other open vow — and when that vow was
 * the table's only open vow, the card was built on it, carrying its id.
 *
 * Now a fight linked by id keeps that id on its card, whatever became of the
 * vow (a deleted vow retires ⚑: nothing is marked). A card with no vow id is
 * never built on a vow its name does not name, and its ⚑ / Retry posts the
 * "Which vow advances?" picker instead of marking a vow the name does not
 * name — a person chooses, and a deleted vow is answered by choosing none. A
 * name that still names the vow (exactly, or as whole words) marks it as
 * before.
 *
 * On a booted table: the pipeline's own Battle win, the GM's own poster, and
 * the player's real ⚑ press and the GM's real Retry press.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ interpretation: null, dice: [] }));
vi.mock("../../src/pacing/router.js", async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../src/moves/interpreter.js", async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: "chat" })),
}));
vi.mock("../../src/moves/abilityScanner.js", async (importOriginal) => ({
  ...(await importOriginal()), scanForApplicableAbilities: vi.fn(async () => []),
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

const REPLY  = 'The corsairs break.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const STRONG = [0.25, 0.45, 0.9];   // challenge 3, 5; action die 6 + iron 2 = 8: a strong hit
const MARK   = '[data-action="sf-mark-milestone"]';
const RETRY  = '[data-action="sf-payoff-retry"]';
const PICKER = '[data-action="sf-milestone-pick"]';
const STEP   = { step: "milestoneUpgrade", cardId: "victory-gone", marks: 2, lacking: 1 };

let table, gm, index, kira, tracksStore;

function vowItem(id, name) {
  const item = {
    id, type: "progress", name, system: { subtype: "vow", rank: "dangerous", current: 0, completed: false },
    flags: { [MODULE_ID]: { vowId: id } },
    update: async (changes) => {
      if ("system.current" in changes) item.system.current = changes["system.current"];
      if ("system.completed" in changes) item.system.completed = changes["system.completed"];
      return item;
    },
    setFlag: async (mod, key, value) => { (item.flags[mod] ??= {})[key] = structuredClone(value); },
  };
  return item;
}
const vowOf   = (actor, id) => actor.items.contents.find(i => i.id === id);
const dropVow = (actor, id) => { const at = actor.items.contents.findIndex(i => i.id === id); actor.items.contents.splice(at, 1); };
const victory = () => table.cards(f => f.fightVowCard).at(-1) ?? null;
const pickers = () => table.cards(f => f.milestonePicker);
const fails   = () => table.cards(f => f.payoffFailureCard);

async function post(vowName) {
  await gm.run(() => index.postFightVowMilestoneCard(vowName, 2, "pc-kira", {}));
  await table.settle(); await table.drain();
  return victory();
}
async function pressMark(card) {
  await table.client("pl-1").click(card._id, MARK);
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
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "nvi-s1", sessionNumber: 1,
      currentSceneId: "sc-1", sceneTruths: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  scriptClaude(table, { fallback: () => REPLY });
  silenceConsoleErrors();
  // Kira's vow the fight served ("Bring the beacon home") and her other vow.
  kira = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, system: { iron: 2 },
    items: { contents: [vowItem("v-beacon", "Bring the beacon home"), vowItem("v-guard", "Guard the Ship")] } });
  tracksStore = { [`${MODULE_ID}.tracks`]: [] };
  table.journal._set({
    id: "tracks-journal", name: "Starforged Progress Tracks",
    getFlag: (mod, key) => tracksStore[`${mod}.${key}`],
    setFlag: async (mod, key, value) => { tracksStore[`${mod}.${key}`] = structuredClone(value); },
  });
});

describe("issue #364 NO-VOW-ID-CARD-MARKS-WRONG-VOW — a fight linked by id, its vow deleted before the win", () => {
  it("the victory card keeps the fight's vow id: ⚑ is retired, and a press marks no other vow", async () => {
    tracksStore[`${MODULE_ID}.tracks`].push({ id: "fight-1", label: "Corsairs", type: "combat", rank: "formidable",
      ticks: 16, completed: false, combatState: "in_control", positions: { "pc-kira": "in_control" },
      linkedVowId: "v-beacon", linkedVowName: "Bring the beacon home", createdAt: 1 });
    dropVow(kira, "v-beacon");

    control.interpretation = { adds: 0, rationale: "test", mischiefApplied: false,
      moveId: "battle", moveName: "Battle", statUsed: "iron", moveTarget: "Corsairs", moveTargetId: "fight-1" };
    control.dice = STRONG;
    await table.client("pl-1").chat("We throw everything we have at the corsairs.", { speaker: { actor: "pc-kira" } });
    await table.settle(); await table.drain();

    const card = victory();
    expect(card, "the win posted its victory card").toBeTruthy();
    expect(card.flags[MODULE_ID].vowId).toBe("v-beacon");
    expect(table.client("pl-1").render(card._id).querySelector(MARK).disabled).toBe(true);

    await gm.run(() => index.markFightVowMilestoneOnce({ cardId: card._id, ...card.flags[MODULE_ID] }));
    await table.settle(); await table.drain();
    expect(vowOf(kira, "v-guard").system.current, "the other vow is not marked").toBe(0);
    expect(pickers()).toEqual([]);
  }, 30_000);
});

describe("issue #364 NO-VOW-ID-CARD-MARKS-WRONG-VOW — a card with no vow id, its vow deleted", () => {
  it("⚑ posts the 'Which vow advances?' picker for the holder's other open vow — it marks nothing by itself", async () => {
    table.addActor({ id: "pc-ash", name: "Ash", ownership: { "pl-2": 3 }, items: { contents: [vowItem("v-oath", "Keep the Oath")] } });
    dropVow(kira, "v-beacon");
    const card = await post("Bring the beacon home");
    expect(card.flags[MODULE_ID].vowId ?? null).toBeNull();

    await pressMark(card);

    expect(vowOf(kira, "v-guard").system.current, "the other vow is not marked by itself").toBe(0);
    expect(pickers()).toHaveLength(1);
    const choices = pickers()[0].flags[MODULE_ID].choices;
    expect(choices).toEqual([{ vowId: "v-guard", actorId: "pc-kira", marks: 2 }]);
    expect(table.client("pl-1").render(pickers()[0]._id).querySelectorAll(PICKER)).toHaveLength(1);
  }, 30_000);

  it("the table's only open vow: the card is not built on it — it carries no vow id, and ⚑ asks", async () => {
    dropVow(kira, "v-beacon");
    const card = await post("Bring the beacon home");

    expect(card.flags[MODULE_ID].vowId ?? null, "not the other vow's id").toBeNull();
    expect(card.flags[MODULE_ID].vowRank ?? null).toBeNull();

    await pressMark(card);

    expect(vowOf(kira, "v-guard").system.current).toBe(0);
    expect(pickers()).toHaveLength(1);
  }, 30_000);

  it("the GMs' Retry of a refused mark on such a card asks too — it marks no other vow", async () => {
    table.addActor({ id: "pc-ash", name: "Ash", ownership: { "pl-2": 3 }, items: { contents: [vowItem("v-oath", "Keep the Oath")] } });
    await gm.run(() => index.postPayoffFailureCard({ source: "fight", vowName: "Bring the beacon home", vowId: null,
      actorId: "pc-kira", outcome: "strong_hit", failures: [{ ...STEP, reason: "refused" }] }));
    await table.settle(); await table.drain();
    const report = fails().at(-1);
    dropVow(kira, "v-beacon");

    await gm.click(report._id, RETRY);
    await table.settle(); await table.drain();

    expect(vowOf(kira, "v-guard").system.current).toBe(0);
    expect(pickers()).toHaveLength(1);
    expect(pickers()[0].flags[MODULE_ID].choices.map(c => c.vowId)).toEqual(["v-guard"]);
  }, 30_000);

  it("control: a card whose name names its vow marks it, with no picker", async () => {
    const card = await post("Bring the beacon home");
    await pressMark(card);
    expect(vowOf(kira, "v-beacon").system.current).toBeGreaterThan(0);
    expect(vowOf(kira, "v-guard").system.current).toBe(0);
    expect(pickers()).toEqual([]);
  }, 30_000);

  it("control: the Retry on a card with no vow id, its vow renamed to a name that holds the old one — it marks that vow, with no picker", async () => {
    table.addActor({ id: "pc-ash", name: "Ash", ownership: { "pl-2": 3 }, items: { contents: [vowItem("v-oath", "Keep the Oath")] } });
    await gm.run(() => index.postPayoffFailureCard({ source: "fight", vowName: "Bring the beacon home", vowId: null,
      actorId: "pc-kira", outcome: "strong_hit", failures: [{ ...STEP, reason: "refused" }] }));
    await table.settle(); await table.drain();
    vowOf(kira, "v-beacon").name = "Bring the beacon home at last";

    await gm.click(fails().at(-1)._id, RETRY);
    await table.settle(); await table.drain();

    expect(vowOf(kira, "v-beacon").system.current).toBeGreaterThan(0);
    expect(vowOf(kira, "v-guard").system.current).toBe(0);
    expect(pickers()).toEqual([]);
  }, 30_000);
});
