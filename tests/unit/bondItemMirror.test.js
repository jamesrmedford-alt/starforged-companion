/**
 * STARFORGED COMPANION
 * tests/unit/bondItemMirror.test.js
 *
 * The PC's bond Items mirror one connection each, by its record's `_id`
 * (issue #314 Q04). On a booted table (tests/helpers/multiClient.js), through
 * the real connection writers, the GM's real move pipeline (the interpretation
 * and the dice scripted at their boundaries) and `!bond`:
 *
 *   - developing one of two same-named connections writes its Item alone
 *     (the name used to override a different explicit key);
 *   - a renamed connection's rank raise reaches its Item, from the pipeline's
 *     Develop Your Relationship and from `!bond` (both passed the host Actor
 *     id, which no Item carries — the name fallback hid it until a rename).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

// [challenge, challenge, action] Math.random values for the pipeline's roll;
// `bondDice` = [action, challenge, challenge] for `!bond`'s own roll.
const control = vi.hoisted(() => ({ dice: [], interpretation: null, bondDice: null }));
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
  return {
    ...real,
    rollActionDie:     () => (control.bondDice ? control.bondDice[0] : real.rollActionDie()),
    rollChallengeDice: () => (control.bondDice ? control.bondDice.slice(1) : real.rollChallengeDice()),
    resolveMove: vi.fn((...args) => {
      const rng = vi.spyOn(Math, "random");
      for (const value of control.dice) rng.mockReturnValueOnce(value);
      try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

let table, pc;
const world = () => table.world.campaignState();
const STRONG_MATCH = [0.15, 0.15, 0.99];   // challenge 2 and 2 — a match; action die 6: a strong hit at any rank

/** A bond Item on the PC, keyed by a connection record's `_id`, with an update that applies dot paths. */
function bondItem({ id, name, connectionId, rank = "dangerous", ticks = 0 }) {
  const doc = {
    id, name, type: "progress",
    flags: { [MODULE_ID]: { connectionId } },
    system: { subtype: "bond", rank, current: ticks, completed: false, hasClock: false },
    writes: [],
    async update(changes) {
      this.writes.push({ ...changes });
      for (const [path, value] of Object.entries(changes)) {
        const parts = path.split(".");
        let node = this;
        for (const k of parts.slice(0, -1)) node = node[k] ??= {};
        node[parts.at(-1)] = value;
      }
      return this;
    },
  };
  return doc;
}

/** A connection NPC card whose record `_id` is `rec-<id>`. */
function npc(id, { name = "Sable", rank = "dangerous", bonded = false, relationshipTicks = 0 } = {}) {
  return table.addActor({ id, name, hasPlayerOwner: false, flags: { [MODULE_ID]: {
    entityType: "connection", entityId: `rec-${id}`,
    connection: { _id: `rec-${id}`, name, rank, bonded, active: true, relationshipTicks, history: [] },
  } } });
}
const recordOf = (hostId) => table.actors.get(hostId).flags[MODULE_ID].connection;

async function asGM(fn) { return table.client("gm-1").run(fn); }
async function setState(patch) {
  await asGM(() => game.settings.set(MODULE_ID, "campaignState", { ...world(), ...patch }));
  await table.settle();
}

/** The player develops a connection: the move the picker forces, with the connection's host id. */
async function develop(hostId, name, dice = STRONG_MATCH) {
  control.interpretation = { moveId: "develop_your_relationship", moveName: "Develop Your Relationship", statUsed: null,
    adds: 0, rationale: "test", mischiefApplied: false, moveTarget: name, moveTargetId: hostId };
  control.dice = dice;
  await table.client("pl-1").chat(`I spend time with ${name}.`, { speaker: { actor: pc.id } });
  await table.settle(); await table.drain();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  control.bondDice = null;
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "bond-s1", sessionNumber: 1,
      currentSceneId: "bond-scene", sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  pc = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, system: { momentum: { value: 5 } } });
  scriptClaude(table, { fallback: () => 'The moment turns.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
});

describe("Q04 — two connections named Sable", () => {
  let a, b, itemA, itemB;
  beforeEach(async () => {
    a = npc("npc-a");
    b = npc("npc-b", { relationshipTicks: 20 });
    await setState({ connectionIds: [a.id, b.id] });
    itemA = bondItem({ id: "bond-a", name: "Sable", connectionId: "rec-npc-a" });
    itemB = bondItem({ id: "bond-b", name: "Sable", connectionId: "rec-npc-b", ticks: 20 });
    pc.items.contents.splice(0, pc.items.contents.length, itemA, itemB);
  });

  it("marking one's relationship progress writes its Item alone", async () => {
    const conn = await table.client("gm-1").import("../../src/entities/connection.js");
    await asGM(() => conn.markRelationshipProgress(a.id, 1));

    expect([recordOf(a.id).relationshipTicks, recordOf(b.id).relationshipTicks]).toEqual([8, 20]);
    expect([itemA.system.current, itemB.system.current]).toEqual([8, 20]);
    expect(itemB.writes).toEqual([]);
  });

  it("a strong hit with a match on one's Develop raises its record and its Item — the other Sable keeps its rank", async () => {
    const conn = await table.client("gm-1").import("../../src/entities/connection.js");
    await asGM(() => conn.updateConnection(a.id, { bonded: true }));

    await develop(a.id, "Sable");

    expect(recordOf(a.id).rank).toBe("formidable");
    expect(recordOf(b.id).rank).toBe("dangerous");
    expect([itemA.system.rank, itemB.system.rank]).toEqual(["formidable", "dangerous"]);
    expect(itemB.writes).toEqual([]);
  });
});

describe("Q04 — a renamed connection", () => {
  it("the pipeline's rank raise reaches the Item keyed by the record's _id, though the Item still bears the old name", async () => {
    const a = npc("renamed-npc", { name: "Old Name", bonded: true });
    await setState({ connectionIds: [a.id] });
    const item = bondItem({ id: "bond-renamed", name: "Old Name", connectionId: "rec-renamed-npc" });
    pc.items.contents.splice(0, pc.items.contents.length, item);
    const conn = await table.client("gm-1").import("../../src/entities/connection.js");
    await asGM(() => conn.updateConnection(a.id, { name: "New Name" }));
    expect(table.actors.get(a.id).name).toBe("New Name");

    await develop(a.id, "New Name");

    expect(recordOf(a.id).rank).toBe("formidable");
    expect(item.system.rank).toBe("formidable");
  });

  it("`!bond` raises the renamed connection's Item too, and not a same-named sibling's", async () => {
    const a = npc("bond-npc",  { name: "Old Name", bonded: true });
    const b = npc("other-npc", { name: "New Name" });
    await setState({ connectionIds: [a.id, b.id] });
    const item    = bondItem({ id: "bond-a", name: "Old Name", connectionId: "rec-bond-npc" });
    const sibling = bondItem({ id: "bond-b", name: "New Name", connectionId: "rec-other-npc" });
    pc.items.contents.splice(0, pc.items.contents.length, item, sibling);
    const conn = await table.client("gm-1").import("../../src/entities/connection.js");
    await asGM(() => conn.updateConnection(a.id, { name: "New Name" }));

    control.bondDice = [6, 3, 3];   // 6 + 2 against 3 and 3: a strong hit with a match
    await table.client("pl-1").chat("!bond New Name", { speaker: { actor: pc.id } });
    await table.settle(); await table.drain();

    expect(table.cards(f => f.bondCommandCard).at(-1)?.content).toContain("rank rises to <strong>formidable</strong>");
    expect(recordOf(a.id).rank).toBe("formidable");
    expect(recordOf(b.id).rank).toBe("dangerous");
    expect(item.system.rank).toBe("formidable");
    expect(sibling.system.rank).toBe("dangerous");
    expect(sibling.writes).toEqual([]);
  });
});
