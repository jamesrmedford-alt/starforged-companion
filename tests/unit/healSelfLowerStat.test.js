/**
 * Issue #330 D4 — Heal: mending your own wounds rolls the lower of iron and
 * wits.
 *
 * The vendored Heal: "Mend your own wounds: Roll +iron or +wits, whichever
 * is lower" (`"Method": "Lowest"`). The pipeline had PICK_HIGHER_OF for
 * Endure Harm / Stress and no lower-of rule: a self-mend rolled whichever of
 * iron / wits the interpreter named, and nothing told a self-mend from
 * "Receive treatment from someone (not an ally): Roll +iron". Decided
 * (option A): the interpreter names the Heal situation (`healSituation`),
 * and "self" rolls the lower of the two, the card saying so.
 */

/* global silenceConsoleErrors, makeTestActor */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], interpretation: null }));
vi.mock("../../src/api-proxy.js", async (original) => ({ ...(await original()), apiPost: vi.fn() }));
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
    system: { momentum: { value: 8 }, iron: 3, wits: 1 }, items: { contents: [vow] } });
  scriptClaude(table, { fallback: () => 'The moment passes.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  silenceConsoleErrors();
});

import { enrichInterpretationStatValue } from "../../src/moves/statEnrichment.js";
import { apiPost } from "../../src/api-proxy.js";

const actorWith = (stats) => makeTestActor({ id: `pc-${Math.random().toString(36).slice(2, 8)}`, name: "Kira", system: stats });
const heal = (statUsed, healSituation, extra = {}) => ({ moveId: "heal", moveName: "Heal", statUsed, healSituation, isProgressMove: false, ...extra });

describe("issue #330 D4 — a self-mend rolls the lower of iron and wits", () => {
  it("iron 3, wits 1: the self-mend rolls +wits (1), whatever the interpreter named", () => {
    const i = heal("iron", "self");
    expect(enrichInterpretationStatValue(actorWith({ iron: 3, wits: 1 }), i, {})).toBe(1);
    expect(i).toMatchObject({ statUsed: "wits", statValue: 1, statRule: "lower of iron / wits" });
  });

  it("iron 1, wits 3: the self-mend rolls +iron (1)", () => {
    const i = heal("wits", "self");
    enrichInterpretationStatValue(actorWith({ iron: 1, wits: 3 }), i, {});
    expect(i).toMatchObject({ statUsed: "iron", statValue: 1 });
  });

  it("the other situations roll the stat named: treated +iron, providing care +wits, a companion +heart", () => {
    const actor = actorWith({ iron: 3, wits: 1, heart: 2 });
    for (const [stat, situation, value] of [["iron", "treated", 3], ["wits", "ally", 1], ["heart", "companion", 2]]) {
      const i = heal(stat, situation);
      enrichInterpretationStatValue(actor, i, {});
      expect(i, situation).toMatchObject({ statUsed: stat, statValue: value });
      expect(i.statRule, situation).toBeUndefined();
    }
  });

  it("a stat an asset substituted stands", () => {
    const i = heal("edge", "self", { statSubstitutedFrom: "iron" });
    enrichInterpretationStatValue(actorWith({ iron: 3, wits: 1, edge: 2 }), i, {});
    expect(i).toMatchObject({ statUsed: "edge", statValue: 2 });
  });
});

describe("issue #330 D4 — the interpreter names the Heal situation", () => {
  const reply = (obj) => vi.mocked(apiPost).mockResolvedValueOnce({ content: [{ type: "text", text: JSON.stringify(obj) }] });
  const OPTS = { campaignState: {}, mischiefLevel: "none", apiKey: "sk-ant-test" };

  it("a Heal keeps a known situation; an unknown one, or another move's, is dropped", async () => {
    // The real interpreter — this file's pipeline tests script it.
    const { interpretMove } = await vi.importActual("../../src/moves/interpreter.js");
    reply({ moveId: "heal", statUsed: "iron", healSituation: "self", rationale: "r" });
    expect((await interpretMove("I stitch my own arm.", OPTS)).healSituation).toBe("self");
    reply({ moveId: "heal", statUsed: "iron", healSituation: "nap", rationale: "r" });
    expect((await interpretMove("I rest.", OPTS)).healSituation).toBeNull();
    reply({ moveId: "face_danger", statUsed: "wits", healSituation: "self", rationale: "r" });
    expect((await interpretMove("I dodge.", OPTS)).healSituation).toBeNull();
  });
});

describe("issue #330 D4 — the move card shows the rule", () => {
  it("a self-mend's card reads +wits (1), lower of iron / wits", async () => {
    control.interpretation = { moveId: "heal", moveName: "Heal", statUsed: "iron", healSituation: "self",
      adds: 0, rationale: "test", mischiefApplied: false };
    control.dice = WEAK;
    await table.client("pl-1").chat("Kira stitches her own arm.", { speaker: { actor: kira.id } });
    await table.settle(); await table.drain();
    const card = table.cards(f => f.moveResolution).at(-1);
    expect(table.world.message(card._id).content).toContain("+wits (1), lower of iron / wits");
  }, 30_000);
});
