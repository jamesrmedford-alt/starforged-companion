// tests/unit/cachedStateRefusedWrites.test.js
// A refused world write leaves this client's cached campaignState as the
// world holds it (issue #326 W51; rules/foundry-api.md: game.settings.get
// returns an object setting's cached value by reference — set nothing on it
// before a write that can fail). Nine writers set their change on the
// cached value first, so the GM's client kept a change the world refused —
// and the GM's next whole-object write carried it into the world after all:
//   - !pace / !roll (router.js applyPaceCommand / markForceNextAsMove), whose
//     card then claimed the change;
//   - Take a Break's clear (nextMoveAdd.js — since issue #342 Z52 the claim,
//     consumeNextMoveAdd, before the +1 is added);
//   - !oracle-add's save and remove (customOracles.js), which registered the
//     table locally before the write;
//   - bond.apply's legacy ticks (bondCommand.js).
// Each now writes a copy. (The table-level cases — the oracle-memory capture,
// !reveal-site / !clear-site, !lore and the cards — are in
// cachedStateRefusedWritesTable.test.js.)

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { applyPaceCommand, markForceNextAsMove } from "../../src/pacing/router.js";
import { consumeNextMoveAdd } from "../../src/moves/nextMoveAdd.js";
import { saveCustomOracle, removeCustomOracle, _resetCustomOracleSyncHookForTests } from "../../src/oracles/customOracles.js";
import { ORACLE_TABLES, unregisterOracleTable } from "../../src/oracles/roller.js";
import { CampaignStateSchema } from "../../src/schemas.js";

const MODULE_ID = "starforged-companion";
const KEY = `${MODULE_ID}.campaignState`;
const cached = () => game.settings.get(MODULE_ID, "campaignState");
const refuseNextWrite = () =>
  vi.spyOn(game.settings, "set").mockRejectedValueOnce(new Error("Setting [campaignState] could not be saved: the server refused the write"));

beforeEach(() => {
  game.settings._store.clear();
  ChatMessage._reset();
  silenceConsoleErrors();
});
afterEach(() => {
  vi.restoreAllMocks();
  _resetCustomOracleSyncHookForTests?.();
});

describe("!pace / !roll: a refused write changes nothing and says so (issue #326 W51)", () => {
  beforeEach(() => {
    game.settings._store.set(KEY, { currentSessionId: "s1", pacing: { sceneOverride: null } });
  });

  it("`!pace hot` refused: the cached state keeps no override, and it is not reported set", async () => {
    refuseNextWrite();
    const result = await applyPaceCommand(cached(), "hot");      // what handlePaceCommand passes
    expect(cached().pacing.sceneOverride).toBeNull();
    expect(result).toMatchObject({ persisted: false, refused: true });
    expect(result.status).toMatch(/not set/);
  });

  it("`!pace clear` refused: the override stays, in the cache as in the world", async () => {
    game.settings._store.set(KEY, { currentSessionId: "s1", pacing: { sceneOverride: { modifier: 3, label: "hot" } } });
    refuseNextWrite();
    const result = await applyPaceCommand(cached(), "clear");
    expect(cached().pacing.sceneOverride).toEqual({ modifier: 3, label: "hot" });
    expect(result.status).toMatch(/not cleared/);
  });

  it("`!roll` refused: the cached state does not force the next input", async () => {
    refuseNextWrite();
    expect(await markForceNextAsMove(cached())).toBe(false);     // what handleRollCommand passes
    expect(cached().pacing.forceNextAsMove).not.toBe(true);
  });

  it("control: an accepted write sets the override and the force flag", async () => {
    const result = await applyPaceCommand(cached(), "hot");
    expect(cached().pacing.sceneOverride).toEqual({ modifier: 3, label: "hot" });
    expect(result.persisted).toBe(true);
    expect(await markForceNextAsMove(cached())).toBe(true);
    expect(cached().pacing).toMatchObject({ forceNextAsMove: true, sceneOverride: { modifier: 3, label: "hot" } });
  });
});

describe("Take a Break's clear and the custom oracles: a refused write leaves the cache as the world (issue #326 W51)", () => {
  it("Take a Break +1: a refused claim leaves the grant pending in the cache", async () => {
    game.settings._store.set(KEY, { ...CampaignStateSchema, nextMoveAdd: { value: 1, source: "take_a_break" } });
    refuseNextWrite();
    expect(await consumeNextMoveAdd({}, "face_danger")).toBe(0);
    expect(cached().nextMoveAdd).toEqual({ value: 1, source: "take_a_break" });
  });

  it("control: a landed claim removes it from the store", async () => {
    game.settings._store.set(KEY, { ...CampaignStateSchema, nextMoveAdd: { value: 1, source: "take_a_break" } });
    expect(await consumeNextMoveAdd({}, "face_danger")).toBe(1);
    expect(cached().nextMoveAdd).toBeUndefined();
  });

  it("custom oracle save refused: no table in the cache, none registered, and the card says it was not saved", async () => {
    game.settings._store.set(KEY, { currentSessionId: "s1" });
    refuseNextWrite();
    const saved = await saveCustomOracle("refused_table", "Refused", [{ min: 1, max: 3, result: "A" }, { min: 4, max: 6, result: "B" }]);
    expect(saved).toBe(false);
    expect(cached().customOracles?.refused_table).toBeUndefined();
    expect(ORACLE_TABLES.refused_table).toBeUndefined();
    const card = ChatMessage._created.at(-1);
    expect(card.content).toMatch(/not saved/);
    expect(card.content).not.toMatch(/registered/);
  });

  it("control: a landed save stores and registers the table", async () => {
    game.settings._store.set(KEY, { currentSessionId: "s1" });
    expect(await saveCustomOracle("kept_table", "Kept", [{ min: 1, max: 6, result: "Z" }])).toBe(true);
    expect(cached().customOracles?.kept_table?.name).toBe("Kept");
    expect(ORACLE_TABLES.kept_table?.name).toBe("Kept");
    unregisterOracleTable("kept_table");
  });

  it("a built-in id is still refused before anything is written", async () => {
    game.settings._store.set(KEY, { currentSessionId: "s1" });
    const set = vi.spyOn(game.settings, "set");
    expect(await saveCustomOracle("action", "Mine", [{ min: 1, max: 6, result: "Z" }])).toBe(false);
    expect(set).not.toHaveBeenCalled();
    expect(ChatMessage._created.at(-1).content).toMatch(/built-in/);
  });

  it("custom oracle remove refused: the table stays in the cache and stays registered", async () => {
    const entries = [{ min: 1, max: 6, result: "X" }];
    game.settings._store.set(KEY, { currentSessionId: "s1", customOracles: { probe_keep: { name: "Keep", entries } } });
    ORACLE_TABLES.probe_keep = { name: "Keep", table: entries, category: "custom", die: 6 };
    refuseNextWrite();
    await expect(removeCustomOracle("probe_keep")).rejects.toThrow(/refused/);
    expect(cached().customOracles?.probe_keep).toEqual({ name: "Keep", entries });
    expect(ORACLE_TABLES.probe_keep).toBeDefined();
    delete ORACLE_TABLES.probe_keep;
  });
});
