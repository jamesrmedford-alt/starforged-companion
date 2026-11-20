/* global structuredClone, silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/upgradedMoveCardReasonInWords.test.js
 *
 * Issue #364 MOVE-CARD-RAW-REASON-CODE.
 *
 * A move upgraded by Burn Momentum lists on its card what the upgrade could
 * not apply. Two of those lines printed a raw reason code: a won fight's
 * strong-hit milestone whose vow was fulfilled since read "(vow-completed)",
 * and a companion's health change whose companion is gone read
 * "(no-companion)" — on the card and in the warning beside it.
 *
 * Now each says why in plain words, from the reason tables the GMs' payoff
 * card uses, with a plain fallback for a code that has no text.
 *
 * On a booted table: the pipeline's own roll (interpretation and dice
 * scripted at their boundaries) and the player's real Burn Momentum press.
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

const REPLY = 'It is done.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
// challenge 3, 7; action die 4 + 2 or 3 = 6 or 7: a weak hit — momentum 9 burns it to a strong hit
const WEAK = [0.25, 0.65, 0.5];
// challenge 3, 9; action die 4 + 3 or 5 = 7 or 9: a weak hit — momentum 10 burns it to a strong hit
const WEAK_HIGH = [0.25, 0.85, 0.5];
const BURN = '[data-action="sf-burn-momentum"]';
const MARK = '[data-action="sf-mark-milestone"]';
const RAW  = /\((vow-completed|vow-gone|victory-card-gone|no-companion|refused)\)/;

let table, kira, tracksStore, beacon;

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
function companion(id, name, value) {
  const item = { id, name, type: "asset",
    system: { category: "Companion", abilities: [], track: { enabled: true, name: "Health", value, min: 0, max: 5 } },
    update: async (changes) => {
      if ("system.track.value" in changes) item.system.track.value = changes["system.track.value"];
      return item;
    } };
  return item;
}

async function roll(interpretation, text, dice = WEAK) {
  control.interpretation = { adds: 0, rationale: "test", mischiefApplied: false, ...interpretation };
  control.dice = dice;
  await table.client("pl-1").chat(text, { speaker: { actor: "pc-kira" } });
  await table.settle(); await table.drain();
  return table.cards(f => f.moveResolution).at(-1);
}
async function click(card, selector) {
  await table.client("pl-1").click(card._id, selector);
  await table.settle(); await table.drain();
}
const content = (card) => String(table.world.message(card._id).content);

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "rcw-s1", sessionNumber: 1,
      currentSceneId: "sc-1", sceneTruths: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  beacon = vowItem("v-beacon", "Bring the beacon home");
  kira = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 },
    system: { momentum: { value: 9, max: 10, min: -6, resetValue: 2 }, iron: 2 },
    items: { contents: [beacon, companion("c-rock", "Rockhorn", 3)] } });
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
});

describe("issue #364 MOVE-CARD-RAW-REASON-CODE — what a burned-up move could not apply, in words", () => {
  it("a won fight's strong-hit milestone, its vow fulfilled since ⚑ was pressed: the move card says why in words", async () => {
    const card = await roll({ moveId: "battle", moveName: "Battle", statUsed: "iron", moveTarget: "Corsairs", moveTargetId: "fight-1" },
      "We throw everything we have at the corsairs.");
    await click(table.cards(f => f.fightVowCard).at(-1), MARK);
    beacon.system.completed = true;

    await click(card, BURN);

    expect(content(card)).toContain("1 more milestone mark toward Bring the beacon home — the vow is fulfilled — nothing to mark");
    expect(content(card)).not.toMatch(RAW);
  }, 30_000);

  it("a companion's health, its companion gone since the roll: the move card and the warning say why in words", async () => {
    kira.system.momentum.value = 10;
    const card = await roll({ moveId: "companion_takes_a_hit", moveName: "Companion Takes a Hit", statUsed: "health",
      moveTarget: "Rockhorn" }, "Rockhorn takes the blow meant for me.", WEAK_HIGH);
    expect(content(card), "setup: a weak hit").toContain("sf-weak-hit");
    kira.items.contents.splice(kira.items.contents.findIndex(i => i.id === "c-rock"), 1);

    await click(card, BURN);

    expect(content(card)).toContain("companion health +1 — no companion to change");
    expect(content(card)).not.toMatch(RAW);
    // The GM's client applies the upgrade, and warns there.
    const said = table.client("gm-1").notifications.filter(n => n.level === "warn" && n.message.includes("companion's health change"));
    expect(said).toHaveLength(1);
    expect(said[0].message).toContain("(no companion to change)");
    expect(said[0].message).not.toContain("no-companion");
  }, 30_000);
});
