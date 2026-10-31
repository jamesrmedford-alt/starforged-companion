/**
 * PROBE (oracles audit) — a move resolved while `!lore` lands reverts the
 * new world-lore recap.
 *
 * generateLoreRecap (src/truths/generator.js) persists
 * `campaignState.loreRecap`, which the narrator injects as its World Lore
 * block (narrator.js buildNarratorExtras → extras.loreRecap). The move
 * pipeline reads campaignState before its confirm dialog and Claude calls and
 * persistResolution merges the latest store back per field — but only the
 * STORE_OWNED_FIELDS list keeps the store's value, and it names
 * `worldTruths`, `worldTruthsSet`, `worldTruthsJournalId` ("truths flows")
 * without `loreRecap`. "Every other field keeps the working copy", so the
 * pipeline's pre-move loreRecap overwrites the recap `!lore` just wrote: the
 * lore card is in chat, but the narrator keeps the old recap (or none).
 *
 * The recap is written by the real producer (generateLoreRecap, Claude
 * answered at api-proxy), then a pipeline snapshot taken before it persists.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../../src/api-proxy.js", () => ({
  apiPost: vi.fn(async () => ({ content: [{ type: "text", text: "The Forge forgives nothing. Every hull is borrowed." }] })),
}));

import { generateLoreRecap } from "../../../src/truths/generator.js";
import { persistResolution } from "../../../src/moves/persistResolution.js";

const MODULE_ID = "starforged-companion";
const KEY = `${MODULE_ID}.campaignState`;
const stored = () => game.settings._store.get(KEY);

beforeEach(() => {
  game.actors._reset();
  game.settings._store.clear();
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, "sk-ant-test");
  game.settings._store.set(KEY, {
    currentSessionId: "sess-1",
    sessionLogs:      { "sess-1": [] },
    pendingMove:      true,
    connectionIds:    [],
    loreRecap:        "",
    worldTruths:      { cataclysm: { categoryName: "Cataclysm", title: "We escaped the ravages of a catastrophic war." } },
  });
});

describe("PROBE: persistResolution keeps a lore recap written while the move resolved", () => {
  it("!lore during a move: the recap survives the move's persist", async () => {
    // The move pipeline's working copy, read before its narration await.
    const snapshot = JSON.parse(JSON.stringify(stored()));

    // Meanwhile the GM runs !lore (handleLoreCommand passes the live store).
    const recap = await generateLoreRecap(game.settings.get(MODULE_ID, "campaignState"));
    expect(recap).toMatch(/Forge forgives nothing/);
    expect(stored().loreRecap).toMatch(/Forge forgives nothing/);   // the recap landed

    await persistResolution({
      _id: "res-1", moveId: "face_danger", outcome: "strong_hit",
      consequences: { momentumChange: 0, healthChange: 0, spiritChange: 0, supplyChange: 0 },
    }, snapshot);

    expect(stored().loreRecap).toMatch(/Forge forgives nothing/);   // FAILS today: reverted to ""
  });
});
