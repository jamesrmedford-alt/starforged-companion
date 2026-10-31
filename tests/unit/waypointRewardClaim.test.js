/**
 * STARFORGED COMPANION
 * tests/unit/waypointRewardClaim.test.js
 *
 * One reward per matched waypoint (issue #316 T06), end to end on a booted
 * GM / player table (tests/helpers/multiClient.js): a player's Explore a
 * Waypoint comes up a strong hit with a match — the ordinary choice card
 * (expedition progress or +2 momentum) and the result card's "🔭 Make a
 * Discovery", which the rule offers *instead*. Picks and clicks go through
 * the real cards on the players' clients and relay to the canonical GM.
 *
 * The button used to post the forced move from the clicker's client and
 * disable only its own DOM button: the +2 momentum was taken, then the
 * discovery on top of it, then — after a chat re-render rebuilt the button
 * from the unchanged flags — the discovery again (4 ticks, 2 XP). The card
 * now carries one durable claim (`waypointRewardClaimed`): the ordinary pick
 * closes the alternative, the alternative retires the ordinary choice, a
 * re-render or another client finds the claim, and only the roller's owner
 * or a GM may take it, as the roller.
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

const STRONG_MATCH = [0.15, 0.15, 0.99];   // challenge 2 and 2, action die 6 (+wits)
const MISS_MATCH   = [0.65, 0.65, 0];      // challenge 7 and 7, action die 1

let table, pc;
const world = () => table.world.campaignState();
const ticks = () => world().legacyTracks?.discoveries?.ticks ?? 0;
const momentum = () => pc.system.momentum.value;
const parentFlags = (card) => table.world.message(card._id).flags[MODULE_ID];
const BUTTON = '[data-action="sf-waypoint-oracle"]';
const PLUS_TWO = '[data-action="sf-suffer-pick"][data-option-index="1"]';

async function explore(dice = STRONG_MATCH) {
  control.dice = dice;
  await table.client("pl-1").chat("I search the derelict's hold.", { speaker: { actor: pc.id } });
  await table.settle(); await table.drain();
  return {
    parent: table.cards(f => f.waypointOracleCard).at(-1),
    choice: table.cards(f => f.sufferCard && f.moveId === "explore_a_waypoint").at(-1) ?? null,
  };
}

async function click(userId, card, selector) {
  await table.client(userId).click(card._id, selector);
  await table.settle(); await table.drain();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "wp-s1", sessionNumber: 1,
      lastSessionTimestamp: new Date().toISOString(), currentSceneId: "wp-scene", sceneTruths: [], clocks: [], legacyTracks: {} },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  pc = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, system: { momentum: { value: 2 } } });
  table.addActor({ id: "pc-ren", name: "Ren", ownership: { "pl-2": 3 } });
  scriptClaude(table, { fallback: () => 'The hold yawns open.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
});

describe("T06 — a matched waypoint has one reward", () => {
  it("the ordinary +2 momentum taken, the discovery is refused and its button closed — on a re-render too", async () => {
    const { parent, choice } = await explore();
    expect(parent.flags[MODULE_ID]).toMatchObject({ waypointOracleCard: "make_a_discovery", actorId: pc.id });

    await click("pl-1", choice, PLUS_TWO);
    expect(momentum()).toBe(4);
    expect(parentFlags(parent).waypointRewardClaimed).toBe("ordinary");

    await click("pl-1", parent, BUTTON);
    expect(ticks()).toBe(0);
    expect(momentum()).toBe(4);
    expect(table.world.messages().filter(m => m.flags?.[MODULE_ID]?.forcedMoveId === "make_a_discovery")).toHaveLength(0);

    const root = table.client("pl-1").render(parent._id);
    expect(root.querySelector(BUTTON).disabled).toBe(true);
    await click("pl-1", parent, BUTTON);
    expect(ticks()).toBe(0);
  });

  it("the discovery taken first: 2 ticks once, the ordinary choice retired and its pick refused, a re-render finds the claim", async () => {
    const { parent, choice } = await explore();

    await click("pl-1", parent, BUTTON);
    expect(ticks()).toBe(2);
    expect(momentum()).toBe(2);
    expect(parentFlags(parent).waypointRewardClaimed).toBe("alternative");
    const forced = table.world.messages().filter(m => m.flags?.[MODULE_ID]?.forcedMoveId === "make_a_discovery");
    expect(forced).toHaveLength(1);
    expect(forced[0].speaker?.actor).toBe(pc.id);

    const retired = table.world.message(choice._id);
    expect(retired.flags[MODULE_ID]).toMatchObject({ resolved: true, superseded: true });
    expect(retired.content).toMatch(/Make a Discovery — so this choice no longer applies/);
    // Its buttons are gone; a pick relayed from a stale render is refused on the GM.
    expect(table.client("pl-1").render(choice._id).querySelectorAll('[data-action="sf-suffer-pick"]')).toHaveLength(0);
    const relay = await table.client("pl-1").import("../../src/multiplayer/gmRelay.js");
    await table.client("pl-1").run(() => relay.requestGmAction("suffer.pick", { messageId: choice._id, pickKind: "enum", optionIndex: "1" }));
    await table.settle(); await table.drain();
    expect(momentum()).toBe(2);

    // A chat re-render rebuilds the button from the card's flags: claimed.
    const root = table.client("pl-1").render(parent._id);
    expect(root.querySelector(BUTTON).disabled).toBe(true);
    await click("pl-1", parent, BUTTON);
    expect(ticks()).toBe(2);
    expect(pc.system.xp).toBe(0);
  });

  it("another player's click is refused; a GM's takes it as the roller", async () => {
    const { parent } = await explore();

    await click("pl-2", parent, BUTTON);
    expect(ticks()).toBe(0);
    expect(parentFlags(parent).waypointRewardClaimed).toBeUndefined();

    await click("gm-1", parent, BUTTON);
    expect(ticks()).toBe(2);
    const forced = table.world.messages().filter(m => m.flags?.[MODULE_ID]?.forcedMoveId === "make_a_discovery");
    expect(forced).toHaveLength(1);
    expect(forced[0].speaker?.actor).toBe(pc.id);
  });

  it("a miss with a match: Confront Chaos is taken once", async () => {
    const { parent } = await explore(MISS_MATCH);
    expect(parent.flags[MODULE_ID].waypointOracleCard).toBe("confront_chaos");
    await click("pl-1", parent, BUTTON);
    expect(ticks()).toBe(1);
    table.client("pl-1").render(parent._id);
    await click("pl-1", parent, BUTTON);
    expect(ticks()).toBe(1);
    expect(table.world.messages().filter(m => m.flags?.[MODULE_ID]?.forcedMoveId === "confront_chaos")).toHaveLength(1);
  });
});
