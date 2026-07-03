/**
 * STARFORGED COMPANION
 * tests/unit/characterDetail.test.js
 *
 * Character-detail drift fixes (2026-07 audit). The headline defect
 * (CHAR-PC-BLOCK-STARVED) lived in the UNTESTED composition between
 * getActiveCharacter and buildCharacterBlock — unit tests handed the block
 * full character objects while the live pipeline starved it. These tests
 * exercise the real composition end to end so it cannot silently regress.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/api-proxy.js", () => ({ apiPost: vi.fn() }));

vi.mock("../../src/system/campaignTruths.js", async () => {
  const actual = await vi.importActual("../../src/system/campaignTruths.js");
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => "") };
});

vi.mock("../../src/context/relevanceResolver.js", async () => {
  const actual = await vi.importActual("../../src/context/relevanceResolver.js");
  return { ...actual, resolveRelevance: vi.fn(async () => ({ entityIds: [], entityTypes: [] })) };
});

import { getActiveCharacter, buildNarratorExtras } from "../../src/narration/narrator.js";
import { buildNarratorSystemPrompt } from "../../src/narration/narratorPrompt.js";
import { invalidateActorCache } from "../../src/character/actorBridge.js";

function kiraActor(overrides = {}) {
  return makeTestActor({
    id:   "pc-cd-1",
    name: "Kira Vex",
    system: {
      pronouns:  "she/her",
      callsign:  "Ghost",
      biography: "Raised on a rustbucket hauler.",
      debility:  { wounded: true },
    },
    ...overrides,
  });
}

beforeEach(() => {
  game.actors?._reset?.();
  invalidateActorCache();
});

describe("getActiveCharacter — full snapshot (CHAR-PC-BLOCK-STARVED)", () => {
  it("returns the complete snapshot, not a narrowed subset", () => {
    game.actors._setAll([kiraActor()]);
    const c = getActiveCharacter({ characterIds: ["pc-cd-1"] });
    expect(c).not.toBeNull();
    expect(c.name).toBe("Kira Vex");
    expect(c.pronouns).toBe("she/her");
    expect(c.callsign).toBe("Ghost");
    expect(c.biography).toMatch(/rustbucket hauler/);
    expect(c.stats).toBeTruthy();
    expect(c.meters).toBeTruthy();
    expect(c.debilities?.wounded).toBe(true);
    expect(Array.isArray(c.assets)).toBe(true);
    expect(Array.isArray(c.vows)).toBe(true);
  });

  it("keeps narratorNotes flag-only (no biography double-render source)", () => {
    game.actors._setAll([kiraActor()]);
    const c = getActiveCharacter({ characterIds: ["pc-cd-1"] });
    expect(c.narratorNotes).toBe("");
  });
});

describe("live composition — getActiveCharacter → CHARACTER block", () => {
  it("renders pronouns, callsign, biography, and impacts in the system prompt", () => {
    game.actors._setAll([kiraActor()]);
    const cs = { safety: { lines: [], veils: [], privateLines: [] }, worldTruths: {}, connectionIds: [], characterIds: ["pc-cd-1"] };
    const character = getActiveCharacter(cs);
    const prompt = buildNarratorSystemPrompt(
      cs,
      { narrationTone: "wry", narrationPerspective: "second_person", narrationLength: 3 },
      character,
      "",
      { mode: "paced_narrative" },
    );
    expect(prompt).toMatch(/Name: Kira Vex \("Ghost", she\/her\)/);
    expect(prompt).toMatch(/Biography: Raised on a rustbucket hauler\./);
    expect(prompt).toMatch(/Impacts: wounded/);
    expect(prompt).toMatch(/Stats: Edge/);
  });
});

describe("party context — pronouns for every member (CHAR-PARTY-NAMES-ONLY)", () => {
  it("buildNarratorExtras carries members with pronouns and callsigns", async () => {
    game.actors._setAll([
      kiraActor(),
      makeTestActor({ id: "pc-cd-2", name: "Dane Okoye", system: { pronouns: "he/him" } }),
    ]);
    const extras = await buildNarratorExtras("paced_narrative", { characterIds: [] }, {
      playerNarration: "We move.",
    });
    expect(extras.party).not.toBeNull();
    expect(extras.party.members).toEqual([
      { name: "Kira Vex",   pronouns: "she/her", callsign: "Ghost" },
      { name: "Dane Okoye", pronouns: "he/him",  callsign: "" },
    ]);
    // Legacy names shape preserved for existing consumers.
    expect(extras.party.names).toEqual(["Kira Vex", "Dane Okoye"]);
  });

  it("stays null for solo play", async () => {
    game.actors._setAll([kiraActor()]);
    const extras = await buildNarratorExtras("paced_narrative", { characterIds: [] }, {});
    expect(extras.party).toBeNull();
  });
});
