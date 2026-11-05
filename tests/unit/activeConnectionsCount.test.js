/**
 * STARFORGED COMPANION
 * tests/unit/activeConnectionsCount.test.js
 *
 * Issue #331 X29 (ACTIVE-CONNECTIONS-COUNTS-LOST). After `!sever` (or a lost
 * relationship) `loseConnection` sets `active: false` and leaves the id in
 * `campaignState.connectionIds`; the narrator prompt's legacy [7] block
 * rendered `connectionIds.length` as "N active connection(s) this campaign",
 * so every prompt after a severance told the narrator the lost connection was
 * one of the active ones — while the ACTIVE SECTOR roster lists the same NPC
 * as lost (issue #325 W37). The count-only block is retired: the roster and
 * CHARACTER STATE name the connections.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const RECORDS = {
  c1: { _id: "rec-1", name: "Vance Oduya", role: "Salvager", active: true },
  c2: { _id: "rec-2", name: "Mira Kell",   role: "Fixer",    active: false },
};

vi.mock("../../src/entities/connection.js", async () => {
  const actual = await vi.importActual("../../src/entities/connection.js");
  return {
    ...actual,
    getConnection:   vi.fn((id) => RECORDS[id] ?? null),
    listConnections: vi.fn((cs) => (cs?.connectionIds ?? []).map(id => RECORDS[id]).filter(Boolean)),
  };
});

import { buildNarratorSystemPrompt } from "../../src/narration/narratorPrompt.js";

beforeEach(() => {
  vi.clearAllMocks();
  game.settings._store.clear();
  global.game.user = { id: "gm-1", isGM: true };
});

describe("X29 — a severed connection is not counted as active", () => {
  it("the prompt never says two connections are active when one is lost", () => {
    const prompt = buildNarratorSystemPrompt({ connectionIds: ["c1", "c2"] }, {}, null, "", { mode: "move_resolution" });
    expect(prompt).not.toMatch(/\b2 active connection/);
    expect(prompt).not.toContain("## ACTIVE CONNECTIONS");
  });

  it("nor a count of any kind for the active ones alone", () => {
    const prompt = buildNarratorSystemPrompt({ connectionIds: ["c1"] }, {}, null, "", { mode: "move_resolution" });
    expect(prompt).not.toMatch(/active connection\(s\)/);
  });
});
