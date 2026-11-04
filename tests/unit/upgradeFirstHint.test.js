/**
 * Issue #330 D2 — a move card's follow-ups say to burn or improve first.
 *
 * A weak Face Danger's card offers 🔥 Burn Momentum and ⚑ Mark Progress on
 * Vow (and 🤝 / 🔗). Taking ⚑ first posts a forced Reach a Milestone as the
 * roller; after its persist the card's burn is stamped `laterMove` and
 * refused — issue #326 D4's letter ("once the same roller's next move has
 * resolved"), but the card gave no hint that its own follow-up spends its
 * upgrade. Decided (option B): D4 stands; the follow-up buttons and the
 * help say to burn or improve first.
 */

/* global silenceConsoleErrors */
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

let table, kira, vow;
const flags = (id) => table.world.message(id).flags[MODULE_ID];

const WEAK = [0.25, 0.65, 0.5];   // challenge 3, 7; die 4 — edge 2 → 6: a weak hit; momentum 8 burns it to a strong hit

function makeVow() {
  const item = {
    id: "vow-1", type: "progress", name: "Find Chen", flags: {},
    system: { subtype: "vow", rank: "dangerous", current: 0, completed: false },
    async update(changes) { for (const [k, v] of Object.entries(changes)) if (k === "system.current") item.system.current = v; return item; },
    async setFlag(scope, key, value) { (item.flags[scope] ??= {})[key] = value; return item; },
  };
  return item;
}

async function roll(moveId, statUsed, dice) {
  control.interpretation = { moveId, moveName: moveId, statUsed, adds: 0, rationale: "test", mischiefApplied: false };
  control.dice = dice;
  await table.client("pl-1").chat(`Kira attempts ${moveId}.`, { speaker: { actor: kira.id } });
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
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "own-s1", sessionNumber: 1,
      currentSceneId: "own-scene", sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  vow  = makeVow();
  kira = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 },
    system: { momentum: { value: 8 } }, items: { contents: [vow] } });
  scriptClaude(table, { fallback: () => 'The moment passes.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  silenceConsoleErrors();
});

const HINT = /Burn momentum or improve the result first/;

describe("issue #330 D2 — a card's follow-ups say to take its upgrades first", () => {
  it("a weak hit offering a burn and a milestone: the card says to burn first, beside ⚑ and in its titles", async () => {
    const card = await roll("face_danger", "edge", WEAK);
    expect(flags(card._id).burn?.canBurn).toBe(true);
    expect(flags(card._id).milestoneSuggestion?.eligible).toBe(true);
    const html = table.world.message(card._id).content;
    expect(html).toMatch(HINT);
    expect(html).toMatch(/data-action="sf-reach-milestone" title="[^"]*burn momentum or improve the result first/);
    expect(html).toMatch(/data-action="sf-attempt-fulfill-vow" title="[^"]*burn momentum or improve the result first/);
  }, 30_000);

  it("D4 stands: the ⚑ taken first is the roller's next move, and closes the burn", async () => {
    const card = await roll("face_danger", "edge", WEAK);
    await click(card, '[data-action="sf-reach-milestone"]');
    expect(vow.system.current).toBe(8);
    expect(flags(card._id).burn.laterMove).toBe(true);
  }, 30_000);

  it("control: burned before the ⚑, the weak hit becomes a strong hit and the milestone still marks", async () => {
    const card = await roll("face_danger", "edge", WEAK);
    await click(card, '[data-action="sf-burn-momentum"]');
    expect(flags(card._id).burn.consumed).toBe(true);
    expect(kira.system.momentum.value).toBe(3);

    await click(card, '[data-action="sf-reach-milestone"]');
    expect(vow.system.current).toBe(8);
  }, 30_000);

  it("control: a card with nothing to burn or improve carries no hint", async () => {
    kira.system.momentum.value = 0;
    const card = await roll("face_danger", "edge", WEAK);
    expect(flags(card._id).burn?.canBurn ?? false).toBe(false);
    expect(table.world.message(card._id).content).not.toMatch(HINT);
  }, 30_000);
});
