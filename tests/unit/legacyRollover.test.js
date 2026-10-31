/**
 * STARFORGED COMPANION
 * tests/unit/legacyRollover.test.js
 *
 * A legacy track clears and restarts at its tenth box (issue #316 T02), end to
 * end on a booted GM / player table (tests/helpers/multiClient.js): a player's
 * Make a Discovery goes through the GM's real move pipeline — its +2
 * discoveries mark on the working copy, persistResolution's merge onto the
 * store, the box XP award to the PC.
 *
 * The track used to cap at 40 ticks with nothing clearing it: from 38, the
 * first discovery filled the tenth box (2 XP) and every later one was lost —
 * 40 / 40 / 40, 2 XP for good. And the persist merge kept the higher tick
 * count, which would have undone a clear to 0 against the store's 38.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [] }));
vi.mock("../../src/pacing/router.js", async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE" })),
}));
vi.mock("../../src/moves/interpreter.js", async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({
    moveId: "make_a_discovery", moveName: "Make a Discovery", statUsed: null, adds: 0,
    playerNarration: text, inputMethod: "chat", rationale: "test", mischiefApplied: false,
  })),
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
    for (const n of control.dice) rng.mockReturnValueOnce(n);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

let table, pc;
const world = () => table.world.campaignState();
const discoveries = () => world().legacyTracks?.discoveries ?? null;

async function setLegacy(legacyTracks) {
  await table.client("gm-1").run(() => game.settings.set(MODULE_ID, "campaignState", { ...world(), legacyTracks }));
  await table.settle();
}

async function discover() {
  control.dice = [0.15, 0.25, 0.99];
  await table.client("pl-1").chat("I follow the signal to its source.", { speaker: { actor: pc.id } });
  await table.settle(); await table.drain();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "lr-s1", sessionNumber: 1,
      lastSessionTimestamp: new Date().toISOString(), currentSceneId: "lr-scene", sceneTruths: [], clocks: [],
      legacyTracks: {} },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  pc = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 } });
  scriptClaude(table, { fallback: () => 'The moment turns.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
});

describe("T02 — a legacy track clears at its tenth box and carries on", () => {
  it("from 38: three discoveries clear the track, keep marking it, and pay 2 then 1 XP", async () => {
    await setLegacy({ discoveries: { ticks: 38, cleared: false } });
    const states = [];
    for (let i = 0; i < 3; i++) {
      await discover();
      states.push({ ...discoveries(), xp: pc.system.xp });
    }
    expect(states).toEqual([
      { ticks: 0, cleared: true, cycles: 1, xp: 2 },
      { ticks: 2, cleared: true, cycles: 1, xp: 2 },
      { ticks: 4, cleared: true, cycles: 1, xp: 3 },
    ]);
    const xpCards = table.cards(f => f.legacyXpCard);
    expect(xpCards.map(m => m.flags[MODULE_ID].xp)).toEqual([2, 1]);
    expect(xpCards[0].content).toMatch(/filled and cleared/);
    expect(xpCards[1].content).not.toMatch(/filled and cleared/);
  });

  it("a track the old cap froze at 40 clears on the next discovery and marks the overflow", async () => {
    await setLegacy({ discoveries: { ticks: 40, cleared: false } });
    await discover();
    expect(discoveries()).toEqual({ ticks: 2, cleared: true, cycles: 1 });
    expect(pc.system.xp).toBe(0);   // the tenth box's XP was paid when it filled
  });

  it("control: short of the tenth box, a discovery marks its ticks and clears nothing", async () => {
    await setLegacy({ discoveries: { ticks: 34, cleared: false } });
    await discover();
    expect(discoveries()).toEqual({ ticks: 36, cleared: false, cycles: 0 });
    expect(pc.system.xp).toBe(2);
  });
});
