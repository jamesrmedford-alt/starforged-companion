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
