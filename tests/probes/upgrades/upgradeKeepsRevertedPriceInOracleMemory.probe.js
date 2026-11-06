/**
 * Eleventh audit — UPG-2 UPGRADE-KEEPS-REVERTED-PRICE-IN-ORACLE-MEMORY.
 *
 * A booted table (tests/helpers/multiClient.js), the real move pipeline on the
 * canonical GM. Kira's Face Danger misses; its Pay the Price lands "You are
 * harmed" (health 5 → 4). The price card carries `oracleMemory` (index.js
 * postMovePayThePriceCard), which the canonical GM's capture hook ledgers into
 * `campaignState.recentOracles` — rendered to every narration this session as
 * RECENT ORACLE RESULTS: "The dice established these outcomes. Your narration
 * must not contradict them".
 *
 * Kira burns momentum: the miss becomes a strong hit, and the burn reverts the
 * price — health refunded to 5, its clocks rewound (resultUpgrade.js
 * revertPayThePrice): "A burn upgrades the outcome to a hit, so the price was
 * never actually paid" (decisions.md → "Burn Momentum reverses Pay-the-Price
 * side effects"). Its superseded narration leaves the scene ledgers (issue
 * #338 D8). But the price's oracle memory stays: the re-narration of the
 * strong hit — and every later narration this session — is told the price the
 * burn undid is an outcome the dice established, which it must not contradict.
 * An Improve Result does the same.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/upgrades/upgradeKeepsRevertedPriceInOracleMemory.probe.js
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], interpretation: null, abilities: [], ptp: 78 }));
vi.mock("../../../src/pacing/router.js", async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../../src/moves/interpreter.js", async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: "chat" })),
}));
vi.mock("../../../src/moves/abilityScanner.js", async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => control.abilities),
}));
vi.mock("../../../src/ui/settingsPanel.js", async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock("../../../src/moves/resolver.js", async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, "random");
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});
// Pay the Price 78: "You are harmed" — Endure Harm (-1).
vi.mock("../../../src/oracles/roller.js", async (original) => {
  const real = await original();
  return { ...real, rollOracle: (...args) => {
    if (args[0] !== "pay_the_price") return real.rollOracle(...args);
    const rng = vi.spyOn(Math, "random").mockReturnValueOnce((control.ptp - 0.5) / 100);
    try { return real.rollOracle(...args); } finally { rng.mockRestore(); }
  } };
});

import { simulateTable, USERS, MODULE_ID } from "../../helpers/multiClient.js";
import { scriptClaude } from "../../helpers/faults.js";
import { CampaignStateSchema } from "../../../src/schemas.js";

let table, pc;
const world = () => table.world.campaignState();
const flags = (id) => table.world.message(id).flags[MODULE_ID];
const pricesRemembered = () => (world().recentOracles ?? []).filter(o => o.name === "Pay the Price" && /You are harmed/.test(o.answer));
// A prompt sent to Claude that hands the narrator the price as established.
const toldEstablished = (call) => /RECENT ORACLE RESULTS[\s\S]*Pay the Price[^\n]*You are harmed/.test(`${call.system ?? ""}\n${call.userText ?? ""}`);

// challenge 6, 7; action die 1 — iron 3 + 1 misses.
const MISS = [0.55, 0.65, 0.1];
const FUGITIVE = [{ assetId: null, abilityIndex: null, assetName: "Fugitive",
  text: "improve the result to a strong hit", resultImprovement: { improveTo: "strong_hit" }, hasClock: false }];

async function faceDangerMiss() {
  control.interpretation = { moveId: "face_danger", moveName: "Face Danger", statUsed: "iron", adds: 0, rationale: "probe", mischiefApplied: false };
  control.dice = MISS;
  await table.client("pl-1").chat("Kira dives for the breach controls.", { speaker: { actor: pc.id } });
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
  control.abilities = [];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "upg2-s1", sessionNumber: 1,
      currentSceneId: "upg2-scene", sceneTruths: [], clocks: [], recentOracles: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  pc = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, system: { momentum: { value: 9 } } });
  scriptClaude(table, { fallback: () => 'The breach seals behind Kira.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
});

describe("UPG-2 — an upgrade that reverts the price leaves it in the narrator's oracle memory", () => {
  it("control: the miss's price lands and is remembered as established", async () => {
    await faceDangerMiss();
    expect(pc.system.health.value).toBe(4);
    expect(pricesRemembered()).toHaveLength(1);
  }, 30_000);

  it("Burn Momentum refunds the harm — and the narrator is no longer told the price was established", async () => {
    const card = await faceDangerMiss();
    const before = table.claude.calls.length;

    await click(card, '[data-action="sf-burn-momentum"]');

    expect(flags(card._id).burn.consumed).toBe(true);
    expect(pc.system.health.value).toBe(5);                       // the price was reverted …
    const after = table.claude.calls.slice(before);
    expect(after.length).toBeGreaterThan(0);                      // the strong hit was re-narrated
    expect(after.filter(toldEstablished)).toEqual([]);            // … so no narration is told it stands
    expect(pricesRemembered()).toEqual([]);
  }, 30_000);

  it("Improve Result does the same", async () => {
    control.abilities = FUGITIVE;
    const card = await faceDangerMiss();
    const before = table.claude.calls.length;

    await click(card, '[data-action="sf-improve-result"]');

    expect(flags(card._id).improve.consumed).toBe(true);
    expect(pc.system.health.value).toBe(5);
    expect(table.claude.calls.slice(before).filter(toldEstablished)).toEqual([]);
    expect(pricesRemembered()).toEqual([]);
  }, 30_000);
});
