/**
 * STARFORGED COMPANION
 * tests/unit/interpreterContext.test.js
 *
 * buildContextSummary — the variable campaign context the move interpreter
 * sees. It used to read campaignState.progressTrackIds, which nothing ever
 * wrote, so the interpreter was never told about any open vow or track. It
 * now reads the live stores: vow Items on the player characters and the
 * "Starforged Progress Tracks" journal flag.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { buildContextSummary } from "../../src/moves/interpreter.js";
import { invalidateActorCache } from "../../src/character/actorBridge.js";

const MODULE_ID = "starforged-companion";

function vowItem(id, name, extra = {}) {
  return { id, name, type: "progress", system: { subtype: "vow", rank: 2, current: 0, completed: false, ...extra } };
}

function installPc(id, name, vows) {
  const pc = makeTestActor({ id, name, type: "character", items: { contents: vows } });
  game.actors._set(id, pc);
  invalidateActorCache(id);
  return pc;
}

function installTracksJournal(tracks) {
  const journal = {
    name: "Starforged Progress Tracks",
    getFlag: (mod, key) => (mod === MODULE_ID && key === "tracks" ? tracks : undefined),
  };
  game.journal.find = (fn) => ([journal].find(fn) ?? null);
}

let savedFind;
beforeEach(() => {
  game.actors._reset();
  savedFind = game.journal.find;
  game.journal.find = () => null;
});
afterEach(() => { game.journal.find = savedFind; });

describe("buildContextSummary", () => {
  it("falls back to the no-tracks line when nothing is open", () => {
    expect(buildContextSummary({})).toBe("No active tracks yet.");
  });

  it("names the open vows on the player character, skipping completed ones", () => {
    installPc("pc-1", "Kira", [
      vowItem("v1", "Find the Beacon"),
      vowItem("v2", "Avenge Dani", { completed: true }),
    ]);
    const out = buildContextSummary({});
    expect(out).toContain('Open vows: "Find the Beacon".');
    expect(out).not.toContain("Avenge Dani");
    expect(out).not.toContain("No active tracks");
  });

  it("tags each vow with its owner when several PCs are present", () => {
    installPc("pc-1", "Kira", [vowItem("v1", "Find the Beacon")]);
    installPc("pc-2", "Ash",  [vowItem("v2", "Guard the Hollow")]);
    const out = buildContextSummary({});
    expect(out).toContain('"Find the Beacon" (Kira)');
    expect(out).toContain('"Guard the Hollow" (Ash)');
  });

  it("ignores NPC connection cards (not player characters)", () => {
    const npc = makeTestActor({
      id: "npc-1", name: "Broker", type: "character",
      flags: { [MODULE_ID]: { entityType: "connection" } },
      items: { contents: [vowItem("v9", "NPC secret vow")] },
    });
    game.actors._set("npc-1", npc);
    expect(buildContextSummary({})).not.toContain("NPC secret vow");
  });

  it("lists open non-vow tracks from the Progress Tracks journal", () => {
    installTracksJournal([
      { id: "t1", type: "expedition", label: "Cross the Rift", completed: false },
      { id: "t2", type: "combat",     label: "Raiders",        completed: false },
      { id: "t3", type: "combat",     label: "Old fight",      completed: true },
      { id: "t4", type: "vow",        label: "Journal twin",   completed: false },
    ]);
    const out = buildContextSummary({ currentSessionId: "s1" });
    expect(out).toContain('Open progress tracks: expedition "Cross the Rift", combat "Raiders".');
    expect(out).not.toContain("Old fight");
    expect(out).not.toContain("Journal twin");
    expect(out).toContain("Session active.");
  });

  it("caps long lists", () => {
    installPc("pc-1", "Kira", Array.from({ length: 11 }, (_, i) => vowItem(`v${i}`, `Vow ${i}`)));
    expect(buildContextSummary({})).toContain("+3 more");
  });

  it("degrades to the no-tracks line (debug log) when a store read throws", () => {
    game.journal.find = () => { throw new Error("journal exploded"); };
    expect(buildContextSummary({})).toBe("No active tracks yet.");
    expect(getCapturedWarns()).toEqual([]);
  });

  it("no longer reads the vestigial campaignState.progressTrackIds", () => {
    expect(buildContextSummary({ progressTrackIds: ["j1", "j2"] })).toBe("No active tracks yet.");
  });
});
