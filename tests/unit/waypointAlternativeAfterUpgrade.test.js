/**
 * STARFORGED COMPANION
 * tests/unit/waypointAlternativeAfterUpgrade.test.js
 *
 * WAYPOINT-ALT-AFTER-UPGRADE: an Explore a Waypoint miss with a match offers
 * 🌀 Confront Chaos instead of its price. A miss later burned (or improved) to
 * a hit kept that button live on the superseded card — only a claim closed
 * it — so the player could still take the miss's alternative on top of the
 * hit. The upgrade now stamps the alternative closed with the choice cards it
 * retires, and the alternative's handler refuses an upgraded card.
 *
 * End to end on a booted GM / player table (tests/helpers/multiClient.js),
 * as waypointRewardClaim.test.js.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [] }));
vi.mock("../../src/pacing/router.js", async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE" })),
}));
vi.mock("../../src/moves/interpreter.js", async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({
    moveId: "explore_a_waypoint", moveName: "Explore a Waypoint", statUsed: "wits", adds: 0,
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

const MISS_MATCH = [0.65, 0.65, 0];      // challenge 7 and 7, action die 1: a miss with a match
const CHAOS      = '[data-action="sf-waypoint-oracle"]';
const BURN       = '[data-action="sf-burn-momentum"]';

let table, pc;
const flags = (card) => table.world.message(card._id).flags[MODULE_ID];
const chaosPosts = () => table.world.messages().filter(m => m.flags?.[MODULE_ID]?.forcedMoveId === "confront_chaos");

async function exploreMissWithMatch() {
  control.dice = MISS_MATCH;
  await table.client("pl-1").chat("I search the derelict's hold.", { speaker: { actor: pc.id } });
  await table.settle(); await table.drain();
  return table.cards(f => f.waypointOracleCard).at(-1);
}

async function click(userId, card, selector) {
  await table.client(userId).click(card._id, selector);
  await table.settle(); await table.drain();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "wp-s1", sessionNumber: 1,
      lastSessionTimestamp: new Date().toISOString(), currentSceneId: "wp-scene", sceneTruths: [], clocks: [], legacyTracks: {} },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  // Momentum 9: a burn beats both 7s — the miss becomes a strong hit.
  pc = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, system: { momentum: { value: 9, max: 10, min: -6, resetValue: 2 } } });
  scriptClaude(table, { fallback: () => 'The hold yawns open.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
});

describe("WAYPOINT-ALT-AFTER-UPGRADE — the miss's alternative goes with the miss", () => {
  it("a miss with a match burned to a hit closes Confront Chaos: its button is disabled and a press posts nothing", async () => {
    const card = await exploreMissWithMatch();
    expect(card.flags[MODULE_ID].waypointOracleCard).toBe("confront_chaos");
    expect(card.flags[MODULE_ID].burn?.canBurn).toBe(true);

    await click("pl-1", card, BURN);
    expect(flags(card).burn?.consumed).toBe(true);
    expect(flags(card).waypointRewardClaimed).toBe("burn");

    const root = table.client("pl-1").render(card._id);
    expect(root.querySelector(CHAOS)?.disabled).toBe(true);
    await click("pl-1", card, CHAOS);
    expect(chaosPosts()).toHaveLength(0);
  }, 30_000);

  it("an upgraded card whose stamp did not land still refuses the alternative", async () => {
    const card = await exploreMissWithMatch();
    // As a card whose claim landed but whose alternative was never stamped.
    const gm = table.client("gm-1");
    await gm.run(() => game.messages.get(card._id).update({ [`flags.${MODULE_ID}.burn.consumed`]: true }));
    await table.settle();
    const { applyWaypointOraclePick } = await gm.import("../../src/moves/cardActions.js");
    const result = await table.client("gm-1").run(() => applyWaypointOraclePick({ messageId: card._id }, { requesterIsGM: true }));
    await table.settle(); await table.drain();
    expect(result).toMatchObject({ posted: false, reason: "upgraded" });
    expect(chaosPosts()).toHaveLength(0);
    expect(flags(card).waypointRewardClaimed).toBe("burn");
  }, 30_000);

  it("control: with no upgrade, Confront Chaos is taken", async () => {
    const card = await exploreMissWithMatch();
    await click("pl-1", card, CHAOS);
    expect(chaosPosts()).toHaveLength(1);
    expect(flags(card).waypointRewardClaimed).toBe("alternative");
  }, 30_000);
});
