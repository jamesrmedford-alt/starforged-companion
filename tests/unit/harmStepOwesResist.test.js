/**
 * Issue #330 D3 — a harm or stress step at 0 owes the resist roll; that
 * roll's miss offers the mark-or-table choice.
 *
 * The vendored Endure Harm: suffer the harm; "If your health is 0, Lose
 * Momentum equal to any remaining harm. Then, if your health is 0 or you
 * choose to resist the harm, roll +health or +iron" — and only that roll's
 * miss reads "If your health is 0, you must also mark wounded or permanently
 * harmed, or roll on the table below". Every Pay the Price route ran the
 * executor as a miss ("Pay the Price always implies a miss context"), so a
 * Face Danger miss at 1 health offered the mark-or-table choice — or, before
 * issue #329 X03, marked wounded and rolled "Face Death" — with no Endure
 * Harm rolled; a weak hit's pick at 0 marked wounded. Decided (option A):
 * the step takes the meter and the overflow; at 0 a card asks for the
 * resist roll (Endure Harm through the pipeline, as the PC), and that roll's
 * miss card carries the choice.
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
    system: { momentum: { value: 5 }, health: { value: 1 }, iron: 1 }, items: { contents: [vow] } });
  scriptClaude(table, { fallback: () => 'The moment passes.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  silenceConsoleErrors();
});

import { endureHarm, endureStress } from "../../src/moves/sufferExecutor.js";
import { applyPayThePriceSufferFromRelay } from "../../src/index.js";

const resistCards = (meter) => table.cards(f => f.sufferCard && f.sufferPrompt?.resist === meter);
const atZeroCards = (meter) => table.cards(f => f.sufferCard && f.sufferPrompt?.atZero === meter);

describe("issue #330 D3 — the harm step at 0 owes the resist roll", () => {
  it("a Pay the Price 'You are harmed' at 1 health: health 0, nothing marked, nothing rolled — a resist card", async () => {
    const gm = table.client("gm-1");
    const res = await gm.run(() => applyPayThePriceSufferFromRelay({ routes: [{ move: "endure_harm", amount: 1 }], actorId: kira.id },
      { requesterId: "gm-1", requesterIsGM: true }));
    await table.settle(); await table.drain();
    expect(res.landed[0]).toMatchObject({ after: 0, woundedMarked: false, mortalWound: null, impactChoice: false, resistOwed: true });
    expect(kira.system.debility.wounded).toBe(false);
    expect(resistCards("health")).toHaveLength(1);
    expect(atZeroCards("health")).toHaveLength(0);
  }, 30_000);

  it("the resist card rolls Endure Harm as the PC; its miss's -1 health at 0 offers the mark-or-table choice", async () => {
    const gm = table.client("gm-1");
    await gm.run(() => applyPayThePriceSufferFromRelay({ routes: [{ move: "endure_harm", amount: 1 }], actorId: kira.id },
      { requesterId: "gm-1", requesterIsGM: true }));
    await table.settle(); await table.drain();
    const [resist] = resistCards("health");

    // The forced Endure Harm: +iron 1 (health 0), d6 2 against 5 and 7 — a miss.
    control.interpretation = null;   // a forced move skips the interpreter
    control.dice = [0.45, 0.65, 0.2];
    await click(resist, '[data-action="sf-suffer-pick"][data-option-index="0"]');
    const endure = table.cards(f => f.moveResolution).at(-1);
    expect(endure).toBeTruthy();
    expect(table.world.message(endure._id).content).toMatch(/Endure Harm/);
    expect(table.world.message(endure._id).content).toMatch(/Miss/);
    const [post] = table.cards(f => f.forcedMoveId === "endure_harm");
    expect(table.world.message(post._id).speaker?.actor).toBe(kira.id);

    // The miss card: "-1 health" — at 0 now the choice, not a second resist card.
    const missCard = table.cards(f => f.sufferCard && f.moveId === "endure_harm" && f.sufferPrompt?.options?.some(o => o.suffer === "endure_harm")).at(-1);
    expect(missCard).toBeTruthy();
    await click(missCard, '[data-action="sf-suffer-pick"][data-option-index="0"]');
    expect(atZeroCards("health")).toHaveLength(1);
    expect(resistCards("health")).toHaveLength(1);
    expect(kira.system.debility.wounded).toBe(false);
  }, 30_000);
});

describe("issue #330 D3 — the executor's two at-0 paths", () => {
  it("a harm step at 0 owes the resist roll; the resist roll's own miss offers the choice", async () => {
    const gm = table.client("gm-1");
    const step = await gm.run(() => endureHarm(kira, 1, {}));
    expect(step).toMatchObject({ atZero: true, resistOwed: true, impactChoice: false, woundedMarked: false });
    const miss = await gm.run(() => endureHarm(kira, 1, { resistMiss: true }));
    expect(miss).toMatchObject({ atZero: true, resistOwed: false, impactChoice: true });
  }, 30_000);

  it("Endure Stress the same: the stress step at 0 owes Endure Stress", async () => {
    kira.system.spirit = { value: 1, max: 5, min: 0 };
    const gm = table.client("gm-1");
    const step = await gm.run(() => endureStress(kira, 1, {}));
    expect(step).toMatchObject({ atZero: true, resistOwed: true, shakenMarked: false });
    await table.settle(); await table.drain();
    expect(table.cards(f => f.sufferCard && f.sufferPrompt?.resist === "spirit")).toHaveLength(1);
  }, 30_000);

  it("control: harm that leaves health above 0 owes nothing", async () => {
    kira.system.health.value = 3;
    const gm = table.client("gm-1");
    const r = await gm.run(() => endureHarm(kira, 1, {}));
    expect(r).toMatchObject({ atZero: false, resistOwed: false, impactChoice: false });
  }, 30_000);
});
