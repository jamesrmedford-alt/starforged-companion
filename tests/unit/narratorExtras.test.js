/**
 * STARFORGED COMPANION
 * tests/unit/narratorExtras.test.js
 *
 * buildNarratorExtras — the single assembly point for the narrator
 * system-prompt context packet. Every narrator call site routes through it, so
 * these tests lock the contract that makes the packet uniform:
 *   - EVERY mode receives the common context (campaign truths, location, sector,
 *     party, audio, mode, player text) — campaign truths used to reach only the
 *     move path; entity cards / party only three paths; the recap none.
 *   - relevance has two rules: move = the caller's FULL result (with the dynamic
 *     permission class + oracle seeds); every other mode = lexical (moveId null,
 *     no API call). No-text modes match nothing and lean on the sector roster.
 *
 * The heavy collaborators (campaign-truths digest, relevance resolver) are
 * mocked so we test the factory's wiring, not their internals.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/api-proxy.js", () => ({ apiPost: vi.fn() }));

vi.mock("../../src/system/campaignTruths.js", async () => {
  const actual = await vi.importActual("../../src/system/campaignTruths.js");
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => "## CAMPAIGN TRUTHS\nstub-truths") };
});

vi.mock("../../src/context/relevanceResolver.js", async () => {
  const actual = await vi.importActual("../../src/context/relevanceResolver.js");
  return { ...actual, resolveRelevance: vi.fn(async () => ({ entityIds: [], entityTypes: [] })) };
});

import { buildNarratorExtras } from "../../src/narration/narrator.js";
import { buildCampaignTruthsBlock } from "../../src/system/campaignTruths.js";
import { resolveRelevance } from "../../src/context/relevanceResolver.js";

const MODULE_ID = "starforged-companion";

const ALL_MODES = [
  "move_resolution",
  "paced_narrative",
  "scene_interrogation",
  "oracle_followup",
  "session_vignette",
  "inciting_incident",
  "campaign_recap",
];

function state() {
  return { activeSectorId: null, currentLocationId: null, sectors: [] };
}

beforeEach(() => {
  vi.clearAllMocks();
  game.actors?._reset?.();
  game.settings._store.delete(`${MODULE_ID}.audio.enabled`);
  buildCampaignTruthsBlock.mockResolvedValue("## CAMPAIGN TRUTHS\nstub-truths");
  resolveRelevance.mockResolvedValue({ entityIds: [], entityTypes: [] });
});

describe("buildNarratorExtras — uniform context packet", () => {
  it("delivers the common packet to EVERY mode (the unification win)", async () => {
    for (const mode of ALL_MODES) {
      const extras = await buildNarratorExtras(mode, state(), {
        playerNarration: "x",
        relevance: { resolvedClass: "discovery", entityIds: [], entityTypes: [] },
      });
      expect(extras.mode).toBe(mode);
      expect(extras.playerNarration).toBe("x");
      // Campaign truths now reach every path — this used to be move-only.
      expect(extras.campaignTruthsBlock).toContain("stub-truths");
      expect(extras).toHaveProperty("currentLocationCard");
      expect(extras).toHaveProperty("activeSectorBlock");
      expect(extras).toHaveProperty("party");
      expect(extras).toHaveProperty("audioMarkupEnabled");
    }
  });

  it("reflects the audio.enabled setting in audioMarkupEnabled", async () => {
    const off = await buildNarratorExtras("paced_narrative", state(), { playerNarration: "x" });
    expect(off.audioMarkupEnabled).toBe(false);

    game.settings._store.set(`${MODULE_ID}.audio.enabled`, true);
    const on = await buildNarratorExtras("paced_narrative", state(), { playerNarration: "x" });
    expect(on.audioMarkupEnabled).toBe(true);
  });
});

describe("buildNarratorExtras — relevance has two rules", () => {
  it("move_resolution uses the caller's FULL relevance result + oracle seeds, no lexical call", async () => {
    const extras = await buildNarratorExtras("move_resolution", state(), {
      relevance:   { resolvedClass: "interaction", entityIds: ["c1"], entityTypes: ["connection"] },
      oracleSeeds: { results: ["seed"], names: [] },
    });
    expect(extras.narratorClass).toBe("interaction");
    expect(extras.matchedEntityIds).toEqual(["c1"]);
    expect(extras.oracleSeeds).toEqual({ results: ["seed"], names: [] });
    // The move path never runs the lexical resolver — it owns its own relevance.
    expect(resolveRelevance).not.toHaveBeenCalled();
  });

  it("non-move modes resolve relevance lexically (moveId null) and set matchedEntityIds", async () => {
    resolveRelevance.mockResolvedValue({ entityIds: ["npc1"], entityTypes: ["connection"] });
    const extras = await buildNarratorExtras("paced_narrative", state(), { playerNarration: "I greet Nova" });

    expect(resolveRelevance).toHaveBeenCalledTimes(1);
    const args = resolveRelevance.mock.calls[0];
    expect(args[1]).toBeNull();   // moveId null → purely lexical, zero API cost
    expect(args[2]).toBeNull();   // outcome null
    expect(extras.matchedEntityIds).toEqual(["npc1"]);
    // The class for non-move modes is NOT set here — the prompt builder applies
    // the per-mode default. Oracle seeds belong to moves only.
    expect(extras.narratorClass).toBeUndefined();
    expect(extras.oracleSeeds).toBeUndefined();
  });

  it("no-text modes (vignette / inciting / recap) run the one uniform lexical path and match nothing", async () => {
    for (const mode of ["session_vignette", "inciting_incident", "campaign_recap"]) {
      vi.clearAllMocks();
      resolveRelevance.mockResolvedValue({ entityIds: [], entityTypes: [] });
      const extras = await buildNarratorExtras(mode, state(), {});
      expect(resolveRelevance).toHaveBeenCalledTimes(1);   // same code path as paced/scene
      expect(extras.entityCards).toEqual([]);
      expect(extras.matchedEntityIds).toEqual([]);
      expect(extras.narratorClass).toBeUndefined();
      expect(extras.oracleSeeds).toBeUndefined();
    }
  });
});
