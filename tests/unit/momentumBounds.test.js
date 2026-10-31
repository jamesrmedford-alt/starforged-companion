/**
 * STARFORGED COMPANION
 * tests/unit/momentumBounds.test.js
 *
 * The momentum bases are the sheet's (issue #316 T01), end to end on a booted
 * GM / player table (tests/helpers/multiClient.js): a player's Face Danger
 * strong hits go through the GM's real move pipeline — resolver, persist,
 * applyMeterChanges — and the PC carries the vendor's computed getters, which
 * derive the effective maximum and reset from `system.momentum.max` /
 * `resetValue` less the marked impacts.
 *
 * The module wrote the effective values back into those base fields on every
 * momentum write and on every impact recalculation, so the system deducted
 * the impacts again from an already-deducted base: with one impact, three
 * successful moves took the maximum from 9 to 6 and the reset to 0, and
 * clearing the impact left the character at 7 / 0 for good. The bases are
 * never written now; the effective bounds are read for the clamp.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [] }));
vi.mock("../../src/pacing/router.js", async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE" })),
}));
vi.mock("../../src/moves/interpreter.js", async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({
    moveId: "face_danger", moveName: "Face Danger", statUsed: "iron", adds: 0,
    playerNarration: text, inputMethod: "chat", rationale: "test", mischiefApplied: false,
  })),
}));
vi.mock("../../src/moves/abilityScanner.js", async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock("../../src/ui/settingsPanel.js", async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
// Challenge dice first (two d10), then the action die (d6), inside the REAL resolveMove.
vi.mock("../../src/moves/resolver.js", async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, "random");
    for (const n of control.dice) rng.mockReturnValueOnce(n);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

// Challenge 2 and 3, action die 6: a strong hit, +1 momentum.
const STRONG_HIT = [0.15, 0.25, 0.99];

let table, pc;
const gm = () => table.client("gm-1");

/** foundry-ironsworn's CharacterModel getters: the bases less the marked impacts. */
function withVendorGetters(actor) {
  const sys = actor.system;
  const impacts = () => Object.values(sys.debility).filter(v => v === true).length;
  Object.defineProperties(sys, {
    momentumMax:   { configurable: true, get: () => Math.min(10, Math.max(-6, sys.momentum.max - impacts())) },
    momentumReset: { configurable: true, get: () => Math.min(sys.momentum.max, Math.max(0, sys.momentum.resetValue - impacts())) },
  });
  return actor;
}

const bounds = () => ({ max: pc.system.momentumMax, reset: pc.system.momentumReset });

async function faceDanger() {
  control.dice = STRONG_HIT;
  await table.client("pl-1").chat("I slip past the sentry drones.", { speaker: { actor: pc.id } });
  await table.settle(); await table.drain();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "mb-s1", sessionNumber: 1,
      lastSessionTimestamp: new Date().toISOString(), currentSceneId: "mb-scene", sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  pc = withVendorGetters(table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 } }));
  scriptClaude(table, { fallback: () => 'The moment turns.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
});

describe("T01 — the pipeline's momentum writes leave the sheet's bases alone", () => {
  it("one impact: three strong hits keep the maximum at 9 and the reset at +1; clearing it restores 10 / +2", async () => {
    pc.system.debility.wounded = true;
    pc.system.health.value = 0;
    const seen = [bounds()];
    for (let i = 0; i < 3; i++) {
      await faceDanger();
      seen.push(bounds());
    }
    expect(seen).toEqual([{ max: 9, reset: 1 }, { max: 9, reset: 1 }, { max: 9, reset: 1 }, { max: 9, reset: 1 }]);
    expect(pc.system.momentum).toMatchObject({ value: 5, max: 10, resetValue: 2 });

    const bridge = await gm().import("../../src/character/actorBridge.js");
    await gm().run(() => bridge.setDebility(pc, "wounded", false));
    await table.settle();
    expect(bounds()).toEqual({ max: 10, reset: 2 });
    expect(pc.system.momentum).toMatchObject({ value: 5, max: 10, resetValue: 2 });
  });

  it("a gain is clamped to the impact-reduced maximum, not the base", async () => {
    pc.system.debility.wounded = true;
    pc.system.momentum.value = 9;
    await faceDanger();
    expect(pc.system.momentum.value).toBe(9);
    expect(pc.system.momentum.max).toBe(10);
  });

  it("control: no impacts — three strong hits leave the bounds at 10 / +2", async () => {
    for (let i = 0; i < 3; i++) await faceDanger();
    expect(bounds()).toEqual({ max: 10, reset: 2 });
    expect(pc.system.momentum).toMatchObject({ value: 5, max: 10, resetValue: 2 });
  });
});
