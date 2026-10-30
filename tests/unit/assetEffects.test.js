/**
 * STARFORGED COMPANION
 * tests/unit/assetEffects.test.js
 *
 * Asset effects after a move (consequence riders, issue #217) and the move
 * lock around their prompt, end to end on a booted GM / two-player table
 * (tests/helpers/multiClient.js): a player's narration goes through the GM's
 * real move pipeline — resolver, persist, the early lock release, the rider
 * prompt (riderDialog.js) and the effects' writes. The interpretation, the
 * applicable abilities, the extracted riders (contract-valid extractor
 * output) and the dice are scripted at their boundaries.
 *
 *   S01 — a move's finally never releases a lock a later move holds (issue #315).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";

// `riders` is the extractor's output for the next move; a narration containing
// "HOLD" waits in the interpreter on `hold` (after resolving `arrived`).
const control = vi.hoisted(() => ({ riders: [], entered: [], hold: null, arrived: null, choice: null }));
vi.mock("../../src/pacing/router.js", async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../src/moves/interpreter.js", async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => {
    control.entered.push(text);
    if (text.includes("HOLD") && control.hold) { control.arrived.resolve(); await control.hold.promise; }
    return { moveId: "face_danger", moveName: "Face Danger", statUsed: "iron", adds: 0,
      playerNarration: text, inputMethod: "chat", rationale: "test", mischiefApplied: false };
  }),
}));
vi.mock("../../src/moves/abilityScanner.js", async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => control.riders.length
    ? [{ key: "kit:0", assetId: "kit", assetName: "Field Kit", abilityIndex: 0, text: "An asset ability with an effect on the outcome." }]
    : []),
}));
vi.mock("../../src/moves/consequenceRiders.js", async (original) => ({
  ...(await original()), extractRiders: vi.fn(async () => structuredClone(control.riders)),
}));
vi.mock("../../src/ui/settingsPanel.js", async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
// Challenge dice 2 and 3, action die 6, inside the REAL resolveMove: a strong hit, no match.
vi.mock("../../src/moves/resolver.js", async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, "random").mockReturnValueOnce(0.15).mockReturnValueOnce(0.25).mockReturnValueOnce(0.99);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS } from "../helpers/multiClient.js";
import { scriptClaude, deferred, failWrites, campaignStateWrite } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

let table, pc;
const world   = () => table.world.campaignState();
const gm      = () => table.client("gm-1");
const moves   = () => table.cards(f => f.moveResolution);
const entered = (text) => control.entered.some(t => t.includes(text));
const notices = (userId) => table.client(userId).notifications.map(n => `${n.level}: ${n.message}`);

/** The firing riders of one asset ability (a strong hit fires `strong_hit`). */
function riders(...rows) {
  control.riders = [{ key: "kit:0", assetName: "Field Kit", abilityName: "",
    riders: rows.map(r => ({ condition: "strong_hit", optional: false, choiceGroup: null, ...r })) }];
}

/** The player narrates a move; the canonical GM's pipeline runs it. */
async function say(text) {
  await table.client("pl-1").chat(`I attempt ${text}.`, { speaker: { actor: pc.id } });
  await table.settle();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  control.riders = []; control.entered = []; control.hold = null; control.arrived = null; control.choice = null;
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "fx-s1", sessionNumber: 1,
      currentSceneId: "fx-scene", sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-gina");
  pc = table.addActor({ id: "pc-a", name: "Kira", ownership: { "pl-1": 3 } });
  scriptClaude(table, { fallback: () => 'The moment turns.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
});
// A move a failed test left waiting must not run into the next test.
afterEach(async () => {
  control.hold?.resolve();
  control.choice?.resolve({ apply: [], progress: [] });
  gm().answerDialogs(d => d.close());
  await table.drain().catch(() => {});
});

// ─────────────────────────────────────────────────────────────────────────────
// S01 — the lock is released before the rider prompt, so a later move may hold
// it by the time the prompt closes: the earlier move's finally must not clear it.
// ─────────────────────────────────────────────────────────────────────────────

describe("S01 — a move's finally never releases a later move's lock", () => {
  it("A's prompt is open, B holds the lock, A finishes: B keeps it, so C is refused until B is done", async () => {
    const choice = control.choice = deferred(), choiceArrived = deferred();
    riders({ resource: "momentum", amount: 1, optional: true, label: "+1 momentum" });
    gm().answerDialogs(async d => {
      if (d.title.includes("Apply asset effects")) { choiceArrived.resolve(); return choice.promise; }
      return d.close();
    });
    await say("MOVE A");
    await choiceArrived.promise;
    expect(world().pendingMove).toBe(false);          // released before the prompt

    control.riders = []; control.hold = deferred(); control.arrived = deferred();
    await say("HOLD B");
    await control.arrived.promise;
    expect(world().pendingMove).toBe(true);           // B's lock

    choice.resolve({ apply: [], progress: [] });      // A's prompt closes: skip
    await table.settle();
    expect(world().pendingMove).toBe(true);           // still B's

    await say("MOVE C");
    expect(entered("MOVE C")).toBe(false);
    expect(notices("gm-1")).toContainEqual(expect.stringMatching(/A move is already being resolved/));

    control.hold.resolve();
    await table.drain();
    expect(world().pendingMove).toBe(false);          // B released its own lock
    expect(moves()).toHaveLength(2);

    await say("MOVE D");                              // and play goes on
    await table.drain();
    expect(entered("MOVE D")).toBe(true);
    expect(moves()).toHaveLength(3);
    expect(world().pendingMove).toBe(false);
  });

  it("an early release that is refused holds the lock through the prompt; the finally then releases it", async () => {
    expectConsoleError(/Failed to release pendingMove lock/);
    const choice = control.choice = deferred(), choiceArrived = deferred();
    riders({ resource: "momentum", amount: 1, optional: true, label: "+1 momentum" });
    gm().answerDialogs(async d => {
      if (d.title.includes("Apply asset effects")) { choiceArrived.resolve(); return choice.promise; }
      return d.close();
    });
    const refused = failWrites(table, w => campaignStateWrite("gm-1")(w) && w.value?.pendingMove === false);

    await say("MOVE A");
    await choiceArrived.promise;
    expect(refused.refused).toBe(1);
    expect(world().pendingMove).toBe(true);           // the early release did not land

    control.riders = [];
    await say("MOVE B");
    expect(entered("MOVE B")).toBe(false);            // still A's lock

    choice.resolve({ apply: [], progress: [] });
    await table.drain();
    expect(world().pendingMove).toBe(false);          // A's finally retried the release

    await say("MOVE C");
    await table.drain();
    expect(entered("MOVE C")).toBe(true);
    expect(moves()).toHaveLength(2);
  });
});
