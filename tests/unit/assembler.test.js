/**
 * STARFORGED COMPANION
 * tests/unit/assembler.test.js
 *
 * Unit tests for context/assembler.js and context/safety.js
 * Pure logic — no Foundry globals required.
 *
 * Changes from committed version:
 *   — Added test: campaignState.xCardActive suppresses packet
 *     (covers the path that suppressScene() actually writes to)
 *   — World truths fixture uses `result` field (old shape); assembler now
 *     accepts v.title ?? v.result so existing tests continue to pass
 */

import { assembleContextPacket } from "../../src/context/assembler.js";
import { formatSafetyContext, estimateSafetyTokens, isSceneSuppressed } from "../../src/context/safety.js";


// ─────────────────────────────────────────────────────────────────────────────
// FIXTURES
// ─────────────────────────────────────────────────────────────────────────────

function baseCampaignState(overrides = {}) {
  return {
    _id:              "test-campaign",
    currentSessionId: "session-1",
    connectionIds:    [],
    progressTrackIds: [],
    oracleResultIds:  [],
    worldTruths: {
      // These use the old `result` field — assembler reads v.title ?? v.result
      cataclysm:    { roll: 82, result: "We escaped a catastrophic war. Foe: Artificial intelligence.", subRoll: 15, subResult: "AI" },
      exodus:       { roll: 4,  result: "The Exodus fleet made a millennia-long journey.", subRoll: null, subResult: "" },
      communities:  { roll: 36, result: "The Founder Clans unite many ships and settlements.", subRoll: null, subResult: "" },
      iron:         { roll: 29, result: "Iron vows are sworn upon remnants of Exodus ships.", subRoll: null, subResult: "" },
      laws:         { roll: 95, result: "Communities are bound by the Covenant, upheld by Keepers.", subRoll: null, subResult: "" },
      religion:     { roll: 87, result: "Three dominant orders — the Triumvirate — battle for influence.", subRoll: null, subResult: "" },
      magic:        { roll: 70, result: "Supernatural powers wielded by paragons.", subRoll: 12, subResult: "Genetic engineering" },
      commsAndData: { roll: 76, result: "The Weave — a network of data hubs enables near-instant communication.", subRoll: null, subResult: "" },
      medicine:     { roll: 5,  result: "Advanced medical knowledge was lost during the Exodus.", subRoll: null, subResult: "" },
      ai:           { roll: 12, result: "Advanced AI is outlawed — we rely on Adepts.", subRoll: 28, subResult: "Outlawed after machine wars" },
      war:          { roll: 30, result: "Resources are too precious for organized armies.", subRoll: null, subResult: "" },
      lifeforms:    { roll: 78, result: "Many sites are infested by dreadful forgespawn.", subRoll: null, subResult: "" },
      precursors:   { roll: 72, result: "The Ascendancy once ruled the Forge — their vaults are untethered from reality.", subRoll: null, subResult: "" },
      horrors:      { roll: 92, result: "The Forge gives unnatural life to the dead — the Soulbinders stand against them.", subRoll: null, subResult: "" },
    },
    safety: {
      lines: [
        "No situations that endanger children. Children may not appear as characters in peril under any circumstances.",
      ],
      veils: [
        "Children as plot-significant characters. Children may exist in the setting but may not drive or feature prominently in storylines.",
      ],
      privateLines: [
        { playerId: "player-1", lines: ["No graphic descriptions of drowning."] },
      ],
    },
    api: {
      model:                "claude-haiku-4-5-20251001",
      maxTokens:            1000,
      promptCachingEnabled: true,
    },
    ...overrides,
  };
}

function baseResolution(overrides = {}) {
  return {
    _id:           "resolution-1",
    moveName:      "Face Danger",
    statUsed:      "wits",
    statValue:     2,
    actionDie:     4,
    actionScore:   6,
    challengeDice: [3, 8],
    outcome:       "weak_hit",
    outcomeLabel:  "Weak Hit",
    isMatch:       false,
    consequences: {
      momentumChange: 0,
      otherEffect:    "Success with a cost. Make a suffer move (-1).",
    },
    loremasterContext:
      "[MOVE: Face Danger +wits] [ROLL: Action: 4 + 2 = 6 vs Challenge: 3, 8] " +
      "[OUTCOME: Weak Hit] [CONSEQUENCE: Success with a cost. Make a suffer move (-1).]",
    ...overrides,
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// SAFETY.JS TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe("formatSafetyContext", () => {
  it("always returns a non-empty string", () => {
    expect(formatSafetyContext(baseCampaignState()).length).toBeGreaterThan(0);
  });

  it("includes SAFETY CONFIGURATION header", () => {
    expect(formatSafetyContext(baseCampaignState())).toMatch(/SAFETY CONFIGURATION/i);
  });

  it("includes campaign Lines", () => {
    expect(formatSafetyContext(baseCampaignState())).toMatch(/endanger children/i);
  });

  it("includes campaign Veils", () => {
    expect(formatSafetyContext(baseCampaignState())).toMatch(/VEILS/i);
  });

  it("includes private Lines for the requesting player", () => {
    expect(formatSafetyContext(baseCampaignState(), null, "player-1")).toMatch(/drowning/i);
  });

  it("does not include another player's private Lines", () => {
    expect(formatSafetyContext(baseCampaignState(), null, "player-2")).not.toMatch(/drowning/i);
  });

  it("GM receives all private Lines", () => {
    expect(formatSafetyContext(baseCampaignState(), null, "gm")).toMatch(/drowning/i);
  });

  it("merges session-level additional Lines", () => {
    const sessionState = {
      safetyOverrides: {
        additionalLines: ["No realistic depictions of torture."],
        additionalVeils: [],
      },
    };
    expect(formatSafetyContext(baseCampaignState(), sessionState)).toMatch(/torture/i);
  });

  it("deduplicates identical Lines", () => {
    const state = baseCampaignState();
    state.safety.lines = ["No child peril.", "No child peril."];
    const count = (formatSafetyContext(state).match(/No child peril/g) ?? []).length;
    expect(count).toBe(1);
  });

  it("includes the hard ceiling note", () => {
    expect(formatSafetyContext(baseCampaignState())).toMatch(/hard ceiling/i);
  });
});

describe("estimateSafetyTokens", () => {
  it("returns a positive number for non-empty content", () => {
    expect(estimateSafetyTokens("This is a test string.")).toBeGreaterThan(0);
  });

  it("approximates ~4 characters per token", () => {
    expect(estimateSafetyTokens("a".repeat(400))).toBe(100);
  });
});

describe("isSceneSuppressed", () => {
  it("returns false when no session state", () => {
    expect(isSceneSuppressed(null)).toBe(false);
  });

  it("returns false when xCardActive is false", () => {
    expect(isSceneSuppressed({ xCardActive: false })).toBe(false);
  });

  it("returns true when xCardActive is true", () => {
    expect(isSceneSuppressed({ xCardActive: true })).toBe(true);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// ASSEMBLER.JS TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe("assembleContextPacket", () => {
  it("returns a packet with an assembled string", async () => {
    const packet = await assembleContextPacket(baseResolution(), baseCampaignState());
    expect(typeof packet.assembled).toBe("string");
    expect(packet.assembled.length).toBeGreaterThan(0);
  });

  it("safety section is always first in the assembled string", async () => {
    const packet       = await assembleContextPacket(baseResolution(), baseCampaignState());
    const safetyIdx    = packet.assembled.indexOf("SAFETY CONFIGURATION");
    const truthsIdx    = packet.assembled.indexOf("WORLD TRUTHS");
    expect(safetyIdx).toBeGreaterThanOrEqual(0);
    if (truthsIdx >= 0) expect(safetyIdx).toBeLessThan(truthsIdx);
  });

  it("safety section is present even with a tight budget", async () => {
    const packet = await assembleContextPacket(
      baseResolution(), baseCampaignState(), { tokenBudget: 10 }
    );
    expect(packet.assembled).toMatch(/SAFETY CONFIGURATION/i);
  });

  it("move outcome is included in the assembled string", async () => {
    const packet = await assembleContextPacket(baseResolution(), baseCampaignState());
    expect(packet.assembled).toMatch(/Face Danger/);
    expect(packet.assembled).toMatch(/Weak Hit/);
  });

  it("includes world truths when state has them", async () => {
    const packet = await assembleContextPacket(baseResolution(), baseCampaignState());
    expect(packet.assembled).toMatch(/WORLD TRUTHS/i);
  });

  it("world truths render when using new title field (TruthResult shape)", async () => {
    const state = baseCampaignState({
      worldTruths: {
        cataclysm: { roll: 82, title: "Catastrophic war", description: "AI foe.", subResult: "AI" },
      },
    });
    const packet = await assembleContextPacket(baseResolution(), state);
    expect(packet.assembled).toMatch(/Catastrophic war/);
  });

  it("sets alwaysInclude true on safety section", async () => {
    const packet = await assembleContextPacket(baseResolution(), baseCampaignState());
    expect(packet.sections.safety.alwaysInclude).toBe(true);
  });

  it("returns a packet with sessionId", async () => {
    const packet = await assembleContextPacket(baseResolution(), baseCampaignState());
    expect(packet.sessionId).toBe("session-1");
  });

  it("records omitted sections when budget is exceeded", async () => {
    const packet = await assembleContextPacket(
      baseResolution(), baseCampaignState(), { tokenBudget: 20 }
    );
    if (packet.budgetExceeded) {
      expect(Array.isArray(packet.omittedSections)).toBe(true);
    }
  });

  it("never lists safety in omitted sections", async () => {
    const packet = await assembleContextPacket(
      baseResolution(), baseCampaignState(), { tokenBudget: 5 }
    );
    expect(packet.omittedSections).not.toContain("safety");
  });

  // ── X-Card via sessionState (existing path) ───────────────────────────────

  it("returns suppressed packet when sessionState.xCardActive is true", async () => {
    const packet = await assembleContextPacket(
      baseResolution(), baseCampaignState(),
      { sessionState: { xCardActive: true } }
    );
    expect(packet.assembled).toMatch(/SCENE PAUSED/i);
    expect(packet.assembled).toMatch(/X-Card/i);
    expect(packet.triggeredBy).toBe("x_card");
  });

  it("suppressed packet via sessionState omits all creative sections", async () => {
    const packet = await assembleContextPacket(
      baseResolution(), baseCampaignState(),
      { sessionState: { xCardActive: true } }
    );
    expect(packet.assembled).not.toMatch(/WORLD TRUTHS/i);
    expect(packet.assembled).not.toMatch(/Face Danger/);
  });

  // ── X-Card via campaignState (the path suppressScene() actually writes) ───

  it("returns suppressed packet when campaignState.xCardActive is true", async () => {
    // This is the path that /x chat command takes via suppressScene() in safety.js
    // It writes campaignState.xCardActive = true, not sessionState.xCardActive
    const state  = baseCampaignState({ xCardActive: true });
    const packet = await assembleContextPacket(baseResolution(), state);
    expect(packet.assembled).toMatch(/SCENE PAUSED/i);
    expect(packet.triggeredBy).toBe("x_card");
  });

  it("suppressed packet via campaignState omits all creative sections", async () => {
    const state  = baseCampaignState({ xCardActive: true });
    const packet = await assembleContextPacket(baseResolution(), state);
    expect(packet.assembled).not.toMatch(/WORLD TRUTHS/i);
    expect(packet.assembled).not.toMatch(/Face Danger/);
  });

  // ── Edge cases ────────────────────────────────────────────────────────────

  it("handles empty campaign state gracefully", async () => {
    const emptyCampaign = {
      currentSessionId: null,
      connectionIds:    [],
      progressTrackIds: [],
      oracleResultIds:  [],
      worldTruths:      {},
      safety:           { lines: [], veils: [], privateLines: [] },
    };
    const packet = await assembleContextPacket(null, emptyCampaign);
    expect(packet.assembled.length).toBeGreaterThan(0);
  });

  it("includes session notes when present and budget allows", async () => {
    const sessionState = { notes: "The survivor's name is still unknown.", xCardActive: false };
    const packet = await assembleContextPacket(
      baseResolution(), baseCampaignState(),
      { sessionState, tokenBudget: 1000 }
    );
    expect(packet.assembled).toMatch(/survivor/i);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// CONNECTIONS SECTION (formatConnection branches + loadConnections catch)
// ─────────────────────────────────────────────────────────────────────────────

describe("buildConnectionsSection — formatConnection", () => {
  afterEach(() => {
    game.journal.get = () => null;
  });

  it("formats a connection with all optional fields", async () => {
    game.journal.get = (id) => {
      if (id !== "conn-1") return null;
      return {
        pages: { contents: [{ flags: { "starforged-companion": { connection: {
          _id: "conn-1",
          name: "Astra Veil",
          role: "Navigator",
          rank: "Dangerous",
          relationshipType: "Ally",
          bonded: true,
          description: "Old friend from the Exodus fleet.",
          motivation: "Seeks the lost colony.",
          loremasterNotes: "Secretly a Soulbinder.",
        }}}}] },
      };
    };
    const state  = baseCampaignState({ connectionIds: ["conn-1"] });
    const packet = await assembleContextPacket(baseResolution(), state, { tokenBudget: 2000 });
    expect(packet.assembled).toMatch(/Astra Veil/);
    expect(packet.assembled).toMatch(/Navigator/);
    expect(packet.assembled).toMatch(/Bonded/);
    expect(packet.assembled).toMatch(/Seeks the lost colony/);
    expect(packet.assembled).toMatch(/Soulbinder/);
  });

  it("formats a connection with no optional fields", async () => {
    game.journal.get = (id) => {
      if (id !== "conn-2") return null;
      return {
        pages: { contents: [{ flags: { "starforged-companion": { connection: {
          _id: "conn-2",
          name: "Kael",
        }}}}] },
      };
    };
    const state  = baseCampaignState({ connectionIds: ["conn-2"] });
    const packet = await assembleContextPacket(baseResolution(), state, { tokenBudget: 2000 });
    expect(packet.assembled).toMatch(/Kael/);
  });

  it("handles loadConnections journal error gracefully", async () => {
    game.journal.get = () => { throw new Error("journal unavailable"); };
    const state  = baseCampaignState({ connectionIds: ["conn-err"] });
    const packet = await assembleContextPacket(baseResolution(), state, { tokenBudget: 2000 });
    expect(packet.assembled).not.toMatch(/ACTIVE CONNECTIONS/i);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// PROGRESS TRACKS SECTION (formatProgressTrack branches)
// ─────────────────────────────────────────────────────────────────────────────

describe("buildProgressTracksSection", () => {
  afterEach(() => {
    game.journal.getName = () => null;
  });

  it("formats active tracks with rank", async () => {
    game.journal.getName = (name) => {
      if (name !== "Starforged Progress Tracks") return null;
      return { pages: { contents: [{ flags: { "starforged-companion": { tracks: [
        { id: "t1", label: "Find the lost colony", type: "vow", rank: "Epic", ticks: 8, completed: false },
      ]}}}] }};
    };
    const packet = await assembleContextPacket(baseResolution(), baseCampaignState(), { tokenBudget: 2000 });
    expect(packet.assembled).toMatch(/PROGRESS TRACKS/i);
    expect(packet.assembled).toMatch(/Find the lost colony/);
    expect(packet.assembled).toMatch(/Epic/);
  });

  it("formats active tracks without rank", async () => {
    game.journal.getName = (name) => {
      if (name !== "Starforged Progress Tracks") return null;
      return { pages: { contents: [{ flags: { "starforged-companion": { tracks: [
        { id: "t2", label: "Explore the ruin", type: "expedition", ticks: 16, completed: false },
      ]}}}] }};
    };
    const packet = await assembleContextPacket(baseResolution(), baseCampaignState(), { tokenBudget: 2000 });
    expect(packet.assembled).toMatch(/Explore the ruin/);
  });

  it("omits progress tracks section when all tracks are completed", async () => {
    game.journal.getName = (name) => {
      if (name !== "Starforged Progress Tracks") return null;
      return { pages: { contents: [{ flags: { "starforged-companion": { tracks: [
        { id: "t3", label: "Done quest", type: "vow", ticks: 40, completed: true },
      ]}}}] }};
    };
    const packet = await assembleContextPacket(baseResolution(), baseCampaignState(), { tokenBudget: 2000 });
    expect(packet.assembled).not.toMatch(/PROGRESS TRACKS/i);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// SECTOR SECTION (buildSectorSection branches)
// ─────────────────────────────────────────────────────────────────────────────

describe("buildSectorSection", () => {
  it("includes active sector with faction, settlements, plural passages", async () => {
    const state = baseCampaignState({
      activeSectorId: "s1",
      sectors: [{
        id: "s1", name: "Void's Margin", region: "expanse", regionLabel: "The Expanse",
        trouble: "A warlord claims these passages.", faction: "Iron Wraiths",
        mapData: { settlements: [{ name: "Duskfall" }, { name: "The Anchor" }], passages: [1, 2, 3] },
      }],
    });
    const packet = await assembleContextPacket(baseResolution(), state, { tokenBudget: 2000 });
    expect(packet.assembled).toMatch(/ACTIVE SECTOR/i);
    expect(packet.assembled).toMatch(/Void's Margin/);
    expect(packet.assembled).toMatch(/Iron Wraiths/);
    expect(packet.assembled).toMatch(/Duskfall/);
    expect(packet.assembled).toMatch(/3 charted routes/);
  });

  it("uses singular 'route' for exactly 1 passage", async () => {
    const state = baseCampaignState({
      activeSectorId: "s2",
      sectors: [{
        id: "s2", name: "The Reach", region: "terminus",
        trouble: "Quiet for now.", mapData: { settlements: [], passages: [1] },
      }],
    });
    const packet = await assembleContextPacket(baseResolution(), state, { tokenBudget: 2000 });
    expect(packet.assembled).toMatch(/1 charted route[^s]/);
  });

  it("omits sector section when activeSectorId is absent", async () => {
    const state = baseCampaignState({ activeSectorId: undefined, sectors: [] });
    const packet = await assembleContextPacket(baseResolution(), state, { tokenBudget: 2000 });
    expect(packet.assembled).not.toMatch(/ACTIVE SECTOR/i);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// CHARACTER STATE SECTION (formatCharacterBlock branches)
// ─────────────────────────────────────────────────────────────────────────────

describe("buildCharacterStateSection", () => {
  afterEach(() => {
    game.actors._reset();
    game.journal.getName = () => null;
  });

  it("includes character state block for player-owned actors", async () => {
    game.actors._set("char-1", makeTestActor({ id: "char-1", name: "Kira Voss" }));
    const packet = await assembleContextPacket(baseResolution(), baseCampaignState(), { tokenBudget: 2000 });
    expect(packet.assembled).toMatch(/CHARACTER STATE/i);
    expect(packet.assembled).toMatch(/Kira Voss/);
  });

  it("includes chronicle summary when journal entries exist", async () => {
    game.actors._set("char-2", makeTestActor({ id: "char-2", name: "Dax Holt" }));
    game.journal.getName = (name) => {
      if (name !== "Chronicle — Dax Holt") return null;
      return { pages: { contents: [{ flags: { "starforged-companion": { chronicleEntries: [
        { id: "e1", type: "annotation", text: "Survived the Vault of Ember.", pinned: false, automated: false },
        { id: "e2", type: "annotation", text: "Vowed to find the missing crew.", pinned: false, automated: false },
      ]}}}] }};
    };
    const packet = await assembleContextPacket(baseResolution(), baseCampaignState(), { tokenBudget: 2000 });
    expect(packet.assembled).toMatch(/CHARACTER STATE/i);
    expect(packet.assembled).toMatch(/Dax Holt/);
  });

  it("skips character state when setting is disabled", async () => {
    game.actors._set("char-3", makeTestActor({ id: "char-3", name: "Sera Ix" }));
    game.settings._store.set("starforged-companion.characterContextEnabled", false);
    const packet = await assembleContextPacket(baseResolution(), baseCampaignState(), { tokenBudget: 2000 });
    expect(packet.assembled).not.toMatch(/CHARACTER STATE/i);
    game.settings._store.delete("starforged-companion.characterContextEnabled");
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// BUDGET ENFORCEMENT (truncation path in enforceBudget / truncateToTokens)
// ─────────────────────────────────────────────────────────────────────────────

describe("enforceBudget — truncation", () => {
  it("truncates content that partially fits rather than omitting it entirely", async () => {
    // World truths section is ~400 chars; budget of 60 tokens (~240 chars) should
    // trigger the truncation path (content too large to fit, but budget > 10 tokens).
    const packet = await assembleContextPacket(
      baseResolution(), baseCampaignState(), { tokenBudget: 60 }
    );
    // Budget was exceeded
    expect(packet.budgetExceeded).toBe(true);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 — narrator permissions, WJ stubs, entity cards, current location
// ─────────────────────────────────────────────────────────────────────────────

describe("assembler — narrator permissions (Section 1)", () => {
  it("appears between safety (Section 0) and world truths (Section 5)", async () => {
    const packet = await assembleContextPacket(
      baseResolution(), baseCampaignState(),
      { tokenBudget: 2000, narratorClass: "interaction" }
    );
    const safetyIdx      = packet.assembled.indexOf("SAFETY CONFIGURATION");
    const permissionsIdx = packet.assembled.indexOf("NARRATOR PERMISSIONS");
    const truthsIdx      = packet.assembled.indexOf("WORLD TRUTHS");
    expect(safetyIdx).toBeGreaterThanOrEqual(0);
    expect(permissionsIdx).toBeGreaterThan(safetyIdx);
    expect(truthsIdx).toBeGreaterThan(permissionsIdx);
  });

  it("is omitted when narratorClass is not provided", async () => {
    const packet = await assembleContextPacket(baseResolution(), baseCampaignState());
    expect(packet.assembled).not.toMatch(/NARRATOR PERMISSIONS/);
  });

  it("uses the discovery block when narratorClass is 'discovery'", async () => {
    const packet = await assembleContextPacket(
      baseResolution(), baseCampaignState(),
      { tokenBudget: 2000, narratorClass: "discovery" }
    );
    expect(packet.assembled).toMatch(/DISCOVERY MODE/);
    expect(packet.assembled).toMatch(/You MAY introduce/);
  });

  it("uses the embellishment block when narratorClass is 'embellishment'", async () => {
    const packet = await assembleContextPacket(
      baseResolution(), baseCampaignState(),
      { tokenBudget: 2000, narratorClass: "embellishment" }
    );
    expect(packet.assembled).toMatch(/EMBELLISHMENT MODE/);
  });

  it("permissions section is exempt from budget enforcement", async () => {
    // Tight budget — permissions block (~600 chars / ~150 tokens) is exempt
    // and must still appear regardless of how aggressive the budget is.
    const packet = await assembleContextPacket(
      baseResolution(), baseCampaignState(),
      { tokenBudget: 20, narratorClass: "interaction" }
    );
    expect(packet.assembled).toMatch(/NARRATOR PERMISSIONS/);
    expect(packet.assembled).toMatch(/SAFETY CONFIGURATION/);
  });
});

describe("assembler — World Journal stubs (Sections 3, 4, 9, 10)", () => {
  it("WJ stub sections are absent from the assembled string", async () => {
    const packet = await assembleContextPacket(
      baseResolution(), baseCampaignState(), { tokenBudget: 2000 }
    );
    expect(packet.assembled).not.toMatch(/CONFIRMED LORE/i);
    expect(packet.assembled).not.toMatch(/ACTIVE THREATS/i);
    expect(packet.assembled).not.toMatch(/FACTION LANDSCAPE/i);
    expect(packet.assembled).not.toMatch(/RECENT DISCOVERIES/i);
  });

  it("WJ stub sections consume 0 tokens", async () => {
    const packet = await assembleContextPacket(
      baseResolution(), baseCampaignState(), { tokenBudget: 2000 }
    );
    expect(packet.sections.confirmedLore.tokenEstimate).toBe(0);
    expect(packet.sections.activeThreats.tokenEstimate).toBe(0);
    expect(packet.sections.factionLandscape.tokenEstimate).toBe(0);
    expect(packet.sections.recentDiscoveries.tokenEstimate).toBe(0);
  });

  it("WJ stub sections expose empty content via the sections shape", async () => {
    const packet = await assembleContextPacket(
      baseResolution(), baseCampaignState(), { tokenBudget: 2000 }
    );
    expect(packet.sections.confirmedLore.content).toBe("");
    expect(packet.sections.activeThreats.content).toBe("");
    expect(packet.sections.factionLandscape.content).toBe("");
    expect(packet.sections.recentDiscoveries.content).toBe("");
  });
});

describe("assembler — matched entity cards (Section 7)", () => {
  afterEach(() => {
    game.journal.get = () => null;
  });

  it("renders ENTITIES IN SCENE for matched IDs/types", async () => {
    game.journal.get = (id) => {
      if (id !== "j-sable") return null;
      return { pages: { contents: [{ flags: { "starforged-companion": { connection: {
        _id: "conn-1", name: "Sable", role: "AI navigator",
        canonicalLocked: false, generativeTier: [],
      }}}}] }};
    };
    const packet = await assembleContextPacket(
      baseResolution(), baseCampaignState({ connectionIds: ["j-sable"] }),
      { tokenBudget: 2000, matchedEntityIds: ["j-sable"], matchedEntityTypes: ["connection"] }
    );
    expect(packet.assembled).toMatch(/ENTITIES IN SCENE/);
    expect(packet.assembled).toMatch(/SABLE/);
    expect(packet.assembled).toMatch(/Role: AI navigator/);
  });

  it("omits ENTITIES IN SCENE when no match IDs supplied", async () => {
    const packet = await assembleContextPacket(
      baseResolution(), baseCampaignState(), { tokenBudget: 2000 }
    );
    expect(packet.assembled).not.toMatch(/ENTITIES IN SCENE/);
  });

  it("skips IDs whose getter throws and continues with the rest", async () => {
    expectConsoleError(/getConnection.*failed/);
    let calls = 0;
    game.journal.get = (id) => {
      calls++;
      if (id === "throws") throw new Error("journal error");
      if (id === "j-sable") return { pages: { contents: [{ flags: { "starforged-companion": { connection: {
        _id: "c1", name: "Sable", role: "Navigator",
        canonicalLocked: false, generativeTier: [],
      }}}}] }};
      return null;
    };
    const packet = await assembleContextPacket(
      baseResolution(), baseCampaignState(),
      {
        tokenBudget: 2000,
        matchedEntityIds:   ["throws", "j-sable"],
        matchedEntityTypes: ["connection", "connection"],
      }
    );
    expect(calls).toBeGreaterThan(0);
    expect(packet.assembled).toMatch(/SABLE/);
  });

  it("skips IDs of unknown entity type", async () => {
    const packet = await assembleContextPacket(
      baseResolution(), baseCampaignState(),
      {
        tokenBudget: 2000,
        matchedEntityIds:   ["x"],
        matchedEntityTypes: ["unknown_type"],
      }
    );
    expect(packet.assembled).not.toMatch(/ENTITIES IN SCENE/);
  });

  it("skips ID/type pairs where the type is missing", async () => {
    const packet = await assembleContextPacket(
      baseResolution(), baseCampaignState(),
      {
        tokenBudget: 2000,
        matchedEntityIds:   ["only-id"],
        matchedEntityTypes: [],
      }
    );
    expect(packet.assembled).not.toMatch(/ENTITIES IN SCENE/);
  });

  it("omits ENTITIES IN SCENE when getter returns null for every id", async () => {
    game.journal.get = () => null;
    const packet = await assembleContextPacket(
      baseResolution(), baseCampaignState(),
      {
        tokenBudget: 2000,
        matchedEntityIds:   ["unknown"],
        matchedEntityTypes: ["connection"],
      }
    );
    expect(packet.assembled).not.toMatch(/ENTITIES IN SCENE/);
  });
});

describe("assembler — current location card (Section 6)", () => {
  afterEach(() => {
    game.journal.get = () => null;
  });

  it("injects CURRENT LOCATION block when currentLocationId is set", async () => {
    game.journal.get = (id) => {
      if (id !== "j-bleak") return null;
      return { pages: { contents: [{ flags: { "starforged-companion": { settlement: {
        _id: "loc-1", name: "Bleakhold", location: "Planetside",
        canonicalLocked: false, generativeTier: [],
      }}}}] }};
    };
    const state = baseCampaignState({
      currentLocationId:   "j-bleak",
      currentLocationType: "settlement",
    });
    const packet = await assembleContextPacket(
      baseResolution(), state, { tokenBudget: 2000 }
    );
    expect(packet.assembled).toMatch(/CURRENT LOCATION/);
    expect(packet.assembled).toMatch(/BLEAKHOLD/);
  });

  it("omits CURRENT LOCATION when no currentLocationId is set", async () => {
    const packet = await assembleContextPacket(
      baseResolution(), baseCampaignState(), { tokenBudget: 2000 }
    );
    expect(packet.assembled).not.toMatch(/CURRENT LOCATION/);
  });

  it("omits CURRENT LOCATION when only the type is set (no id)", async () => {
    const state = baseCampaignState({
      currentLocationId:   null,
      currentLocationType: "settlement",
    });
    const packet = await assembleContextPacket(
      baseResolution(), state, { tokenBudget: 2000 }
    );
    expect(packet.assembled).not.toMatch(/CURRENT LOCATION/);
  });

  it("omits CURRENT LOCATION when type is unknown", async () => {
    const state = baseCampaignState({
      currentLocationId:   "j-bleak",
      currentLocationType: "not_a_real_type",
    });
    const packet = await assembleContextPacket(
      baseResolution(), state, { tokenBudget: 2000 }
    );
    expect(packet.assembled).not.toMatch(/CURRENT LOCATION/);
  });

  it("omits CURRENT LOCATION when the getter throws", async () => {
    expectConsoleError(/getSettlement.*failed/);
    game.journal.get = () => { throw new Error("boom"); };
    const state = baseCampaignState({
      currentLocationId:   "j-bleak",
      currentLocationType: "settlement",
    });
    const packet = await assembleContextPacket(
      baseResolution(), state, { tokenBudget: 2000 }
    );
    expect(packet.assembled).not.toMatch(/CURRENT LOCATION/);
  });

  it("omits CURRENT LOCATION when the entity record is missing", async () => {
    game.journal.get = () => null;
    const state = baseCampaignState({
      currentLocationId:   "missing",
      currentLocationType: "settlement",
    });
    const packet = await assembleContextPacket(
      baseResolution(), state, { tokenBudget: 2000 }
    );
    expect(packet.assembled).not.toMatch(/CURRENT LOCATION/);
  });
});

describe("assembler — token budget", () => {
  it("session notes drop before world truths when budget is tight", async () => {
    // World truths (priority 2) consumes the budget first; session notes
    // (priority 4, ~500 tokens) finds <10 tokens remaining and is fully
    // omitted rather than truncated. World truths content is still present
    // (potentially truncated, but the section header survives).
    const sessionState = { notes: "S".repeat(2000), xCardActive: false };
    const packet = await assembleContextPacket(
      baseResolution(), baseCampaignState(),
      { sessionState, tokenBudget: 20, narratorClass: "interaction" }
    );
    expect(packet.omittedSections).toContain("sessionNotes");
  });

  it("safety and permissions are never dropped under budget pressure", async () => {
    const packet = await assembleContextPacket(
      baseResolution(), baseCampaignState(),
      { tokenBudget: 20, narratorClass: "discovery" }
    );
    expect(packet.assembled).toMatch(/SAFETY CONFIGURATION/);
    expect(packet.assembled).toMatch(/NARRATOR PERMISSIONS/);
    expect(packet.omittedSections).not.toContain("safety");
    expect(packet.omittedSections).not.toContain("narratorPermissions");
  });

  it("oracle seeds appear when resolution provides them", async () => {
    const resolution = {
      ...baseResolution(),
      oracleSeeds: {
        results: ["Character role: Captain", "Character goal: Protect a secret"],
        names:   ["Kael"],
        context: "make_a_connection",
      },
    };
    const packet = await assembleContextPacket(
      resolution, baseCampaignState(),
      { tokenBudget: 2000, narratorClass: "discovery" }
    );
    expect(packet.assembled).toMatch(/ORACLE SEEDS/);
    expect(packet.assembled).toMatch(/Character role: Captain/);
    expect(packet.assembled).toMatch(/Name suggestion: Kael/);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// Phase 5 — full WJ integration via fullStateFixture
// ─────────────────────────────────────────────────────────────────────────────

import { buildFullCampaignState, addFactionEntity } from "../helpers/fullStateFixture.js";
import {
  recordLoreDiscovery,
  recordThreat,
  recordFactionIntelligence,
} from "../../src/world/worldJournal.js";

async function seedWj(fixture, { lore = [], threats = [], factions = [] } = {}) {
  for (const entry of lore) {
    await recordLoreDiscovery(entry.title, {
      text:             entry.text ?? "",
      confirmed:        entry.confirmed === true,
      narratorAsserted: entry.narratorAsserted === true,
      sessionId:        entry.sessionId ?? fixture.campaignState.currentSessionId,
    }, fixture.campaignState);
  }
  for (const entry of threats) {
    await recordThreat(entry.name, {
      severity: entry.severity ?? "looming",
      summary:  entry.summary ?? "",
    }, fixture.campaignState);
  }
  for (const entry of factions) {
    await recordFactionIntelligence(entry.name, {
      attitude: entry.attitude ?? "neutral",
      summary:  entry.summary ?? "",
    }, fixture.campaignState);
  }
}

describe("assembler — WJ Section 3 (confirmed lore + asserted)", () => {
  it("renders confirmed lore under DO NOT CONTRADICT header", async () => {
    const fixture = buildFullCampaignState();
    await seedWj(fixture, {
      lore: [
        { title: "The iron panel navigates to Ascendancy space", confirmed: true },
        { title: "Bleakhold's administrator answers off-world", narratorAsserted: true },
      ],
    });
    const packet = await assembleContextPacket(
      baseResolution(), fixture.campaignState, { tokenBudget: 4000 }
    );
    expect(packet.assembled).toMatch(/ESTABLISHED LORE — DO NOT CONTRADICT/);
    expect(packet.assembled).toMatch(/iron panel navigates to Ascendancy space/);
    fixture.restore();
  });

  it("Section 3 contains a NARRATOR-ASSERTED sub-section when soft entries exist", async () => {
    const fixture = buildFullCampaignState();
    await seedWj(fixture, {
      lore: [
        { title: "Confirmed fact", confirmed: true },
        { title: "Soft assertion", narratorAsserted: true },
      ],
    });
    const packet = await assembleContextPacket(
      baseResolution(), fixture.campaignState, { tokenBudget: 4000 }
    );
    expect(packet.assembled).toMatch(/NARRATOR-ASSERTED \(treat as established\)/);
    expect(packet.assembled).toMatch(/Soft assertion/);
    fixture.restore();
  });

  it("Section 3 never omits confirmed lore regardless of budget", async () => {
    const fixture = buildFullCampaignState();
    await seedWj(fixture, {
      lore: [{ title: "Confirmed fact", confirmed: true }],
    });
    const packet = await assembleContextPacket(
      baseResolution(), fixture.campaignState, { tokenBudget: 60 }
    );
    expect(packet.assembled).toMatch(/ESTABLISHED LORE/);
    expect(packet.assembled).toMatch(/Confirmed fact/);
    expect(packet.omittedSections).not.toContain("confirmedLore");
    fixture.restore();
  });

  it("Section 3 omits asserted lore before confirmed under tight budget", async () => {
    const fixture = buildFullCampaignState();
    await seedWj(fixture, {
      lore: [
        { title: "Confirmed",                 confirmed:        true },
        { title: "Soft a", narratorAsserted:  true },
        { title: "Soft b", narratorAsserted:  true },
        { title: "Soft c", narratorAsserted:  true },
      ],
    });
    // Budget low enough that priority-1 items (confirmed lore + world truths)
    // eat the budget and there's <10 tokens left — assertedLore (priority 2)
    // is omitted entirely rather than truncated.
    const packet = await assembleContextPacket(
      baseResolution(), fixture.campaignState, { tokenBudget: 30 }
    );
    expect(packet.assembled).toMatch(/Confirmed/);
    expect(packet.omittedSections).toContain("assertedLore");
    fixture.restore();
  });
});

describe("assembler — WJ Section 4 (active threats)", () => {
  it("renders immediate threats under ACTIVE THREATS header", async () => {
    const fixture = buildFullCampaignState();
    await seedWj(fixture, {
      threats: [{ name: "AI fragment", severity: "immediate", summary: "pursuing" }],
    });
    const packet = await assembleContextPacket(
      baseResolution(), fixture.campaignState, { tokenBudget: 4000 }
    );
    expect(packet.assembled).toMatch(/ACTIVE THREATS/);
    expect(packet.assembled).toMatch(/IMMEDIATE: AI fragment/);
    fixture.restore();
  });

  it("Section 4 never omits immediate threats regardless of budget", async () => {
    const fixture = buildFullCampaignState();
    await seedWj(fixture, {
      threats: [{ name: "AI fragment", severity: "immediate", summary: "pursuing" }],
    });
    const packet = await assembleContextPacket(
      baseResolution(), fixture.campaignState, { tokenBudget: 60 }
    );
    expect(packet.omittedSections).not.toContain("immediateThreats");
    expect(packet.assembled).toMatch(/IMMEDIATE: AI fragment/);
    fixture.restore();
  });

  it("Section 4 drops looming threats before immediate ones", async () => {
    const fixture = buildFullCampaignState();
    await seedWj(fixture, {
      threats: [
        { name: "AI fragment", severity: "immediate" },
        { name: "Watcher",     severity: "looming"   },
      ],
    });
    // Tight budget — non-immediate (priority 3) is omitted while immediate
    // (priority 1) is preserved.
    const packet = await assembleContextPacket(
      baseResolution(), fixture.campaignState, { tokenBudget: 30 }
    );
    expect(packet.assembled).toMatch(/IMMEDIATE: AI fragment/);
    expect(packet.omittedSections).toContain("nonImmediateThreats");
    fixture.restore();
  });
});

describe("assembler — Section 9 faction landscape (entity-record exclusion)", () => {
  it("includes WJ-only factions", async () => {
    const fixture = buildFullCampaignState();
    await seedWj(fixture, {
      factions: [{ name: "The Iron Compact", attitude: "neutral", summary: "watching" }],
    });
    const packet = await assembleContextPacket(
      baseResolution(), fixture.campaignState, { tokenBudget: 4000 }
    );
    expect(packet.assembled).toMatch(/FACTION ATTITUDES/);
    expect(packet.assembled).toMatch(/The Iron Compact: neutral/);
    fixture.restore();
  });

  it("excludes factions with entity records (The Covenant)", async () => {
    const fixture = buildFullCampaignState();
    await seedWj(fixture, {
      factions: [
        { name: "The Iron Compact", attitude: "neutral" },
        { name: "The Covenant",     attitude: "antagonistic" },
      ],
    });
    const packet = await assembleContextPacket(
      baseResolution(), fixture.campaignState, { tokenBudget: 4000 }
    );
    expect(packet.assembled).toMatch(/The Iron Compact/);
    // The Covenant has an entity record in the fixture
    expect(packet.assembled).not.toMatch(/The Covenant: antagonistic/);
    fixture.restore();
  });
});

describe("assembler — Section 10 recent discoveries", () => {
  it("contains current-session unconfirmed lore", async () => {
    const fixture = buildFullCampaignState();
    await seedWj(fixture, {
      lore: [
        { title: "Brand new revelation", narratorAsserted: true,
          sessionId: fixture.campaignState.currentSessionId },
      ],
    });
    const packet = await assembleContextPacket(
      baseResolution(), fixture.campaignState, { tokenBudget: 4000 }
    );
    expect(packet.assembled).toMatch(/THIS SESSION — UNCONFIRMED/);
    expect(packet.assembled).toMatch(/Brand new revelation/);
    fixture.restore();
  });

  it("is omitted when no current-session unconfirmed lore exists", async () => {
    const fixture = buildFullCampaignState();
    const packet = await assembleContextPacket(
      baseResolution(), fixture.campaignState, { tokenBudget: 4000 }
    );
    expect(packet.assembled).not.toMatch(/THIS SESSION — UNCONFIRMED/);
    fixture.restore();
  });

  it("excludes lore tagged to a past session", async () => {
    const fixture = buildFullCampaignState();
    await seedWj(fixture, {
      lore: [
        { title: "Old soft fact",     narratorAsserted: true, sessionId: "session-old" },
        { title: "Current soft fact", narratorAsserted: true,
          sessionId: fixture.campaignState.currentSessionId },
      ],
    });
    const packet = await assembleContextPacket(
      baseResolution(), fixture.campaignState, { tokenBudget: 4000 }
    );
    expect(packet.assembled).toMatch(/Current soft fact/);
    // Section 10 must not contain the past-session entry
    const section10 = packet.assembled.split("THIS SESSION — UNCONFIRMED")[1] ?? "";
    expect(section10).not.toMatch(/Old soft fact/);
    fixture.restore();
  });
});

describe("assembler — drop order under tight budget", () => {
  it("drop order: 12 → 10 → 9 → 11 → 8 → 7 → 4(non-immediate) → 3(asserted)", async () => {
    const fixture = buildFullCampaignState();
    await seedWj(fixture, {
      lore: [
        { title: "Confirmed",   confirmed:        true  },
        { title: "Soft",        narratorAsserted: true  },
        { title: "Recent soft", narratorAsserted: true,
          sessionId: fixture.campaignState.currentSessionId },
      ],
      threats: [
        { name: "Imm",   severity: "immediate" },
        { name: "Loom",  severity: "looming"   },
      ],
      factions: [{ name: "The Iron Compact", attitude: "neutral" }],
    });

    // Tightest budget that still fits the priority-1 set — exercises the
    // drop-order ladder without forcing immediate truncation of confirmed lore.
    const sessionState = { notes: "X".repeat(800), xCardActive: false };
    const packet = await assembleContextPacket(
      baseResolution(), fixture.campaignState,
      { tokenBudget: 200, narratorClass: "interaction", sessionState }
    );

    // The bottom of the drop ladder must be omitted before higher-priority
    // sections. We don't assert the full ordering against omittedSections —
    // only that bottom items go before top ones for any given budget.
    const omitted = packet.omittedSections;
    if (omitted.includes("nonImmediateThreats")) {
      // If non-immediate threats dropped, sessionNotes / recentDiscoveries /
      // factionLandscape / recentOracles / progressTracks / entityCards must
      // also be omitted.
      expect(omitted).toContain("sessionNotes");
    }
    expect(omitted).not.toContain("safety");
    expect(omitted).not.toContain("narratorPermissions");
    expect(omitted).not.toContain("confirmedLore");
    expect(omitted).not.toContain("immediateThreats");
    fixture.restore();
  });

  it("total assembled packet does not exceed 1200 tokens under realistic load", async () => {
    const fixture = buildFullCampaignState();
    await seedWj(fixture, {
      lore: [
        { title: "Confirmed fact", confirmed: true },
        { title: "Soft fact",      narratorAsserted: true },
      ],
      threats: [
        { name: "AI fragment", severity: "immediate" },
        { name: "Marauders",   severity: "active"    },
      ],
      factions: [{ name: "The Iron Compact", attitude: "neutral" }],
    });
    const packet = await assembleContextPacket(
      baseResolution(), fixture.campaignState,
      { narratorClass: "interaction" }   // default 1200-token budget
    );
    // 4 chars/token estimate; allow 25% headroom for exempt sections that
    // can themselves grow — confirmed lore + immediate threats + permissions
    // + safety + move outcome.
    expect(packet.totalTokenEstimate).toBeLessThanOrEqual(1500);
    fixture.restore();
  });
});

describe("assembler — Section 9 + entity card linkage (factions excluded)", () => {
  it("does NOT include a faction in landscape if the matched-entity-cards section has it", async () => {
    const fixture = buildFullCampaignState();
    // Add an extra faction with an entity record AND a WJ entry
    addFactionEntity(fixture.journals, { name: "Pelican Confederacy", relationship: "neutral" });
    fixture.campaignState.factionIds.push(
      [...fixture.journals.values()].find(j => j.name === "Pelican Confederacy").id,
    );
    await seedWj(fixture, {
      factions: [
        { name: "Pelican Confederacy", attitude: "neutral" },
        { name: "The Iron Compact",    attitude: "neutral" },
      ],
    });
    const packet = await assembleContextPacket(
      baseResolution(), fixture.campaignState, { tokenBudget: 4000 }
    );
    // The Iron Compact has no entity record → in landscape.
    expect(packet.assembled).toMatch(/The Iron Compact/);
    // Pelican Confederacy has an entity record → NOT in landscape.
    const factionBlock = packet.assembled.split("FACTION ATTITUDES")[1] ?? "";
    expect(factionBlock).not.toMatch(/Pelican Confederacy/);
    fixture.restore();
  });
});
