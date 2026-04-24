/**
 * STARFORGED COMPANION
 * tests/unit/assembler.test.js
 *
 * Unit tests for context/assembler.js and context/safety.js
 * Pure logic — no Foundry globals required.
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
      cataclysm:   { roll: 82, result: "We escaped a catastrophic war. Foe: Artificial intelligence.", subRoll: 15, subResult: "AI" },
      exodus:      { roll: 4,  result: "The Exodus fleet made a millennia-long journey.", subRoll: null, subResult: "" },
      communities: { roll: 36, result: "The Founder Clans unite many ships and settlements.", subRoll: null, subResult: "" },
      iron:        { roll: 29, result: "Iron vows are sworn upon remnants of Exodus ships.", subRoll: null, subResult: "" },
      laws:        { roll: 95, result: "Communities are bound by the Covenant, upheld by Keepers.", subRoll: null, subResult: "" },
      religion:    { roll: 87, result: "Three dominant orders — the Triumvirate — battle for influence.", subRoll: null, subResult: "" },
      magic:       { roll: 70, result: "Supernatural powers wielded by paragons.", subRoll: 12, subResult: "Genetic engineering" },
      commsAndData:{ roll: 76, result: "The Weave — a network of data hubs enables near-instant communication.", subRoll: null, subResult: "" },
      medicine:    { roll: 5,  result: "Advanced medical knowledge was lost during the Exodus.", subRoll: null, subResult: "" },
      ai:          { roll: 12, result: "Advanced AI is outlawed — we rely on Adepts.", subRoll: 28, subResult: "Outlawed after machine wars" },
      war:         { roll: 30, result: "Resources are too precious for organized armies.", subRoll: null, subResult: "" },
      lifeforms:   { roll: 78, result: "Many sites are infested by dreadful forgespawn.", subRoll: null, subResult: "" },
      precursors:  { roll: 72, result: "The Ascendancy once ruled the Forge — their vaults are untethered from reality.", subRoll: null, subResult: "" },
      horrors:     { roll: 92, result: "The Forge gives unnatural life to the dead — the Soulbinders stand against them.", subRoll: null, subResult: "" },
    },
    safety: {
      lines: [
        "No situations that endanger children. Children may not appear as characters in peril under any circumstances."
      ],
      veils: [
        "Children as plot-significant characters. Children may exist in the setting but may not drive or feature prominently in storylines."
      ],
      privateLines: [
        { playerId: "player-1", lines: ["No graphic descriptions of drowning."] },
      ],
    },
    api: {
      model: "claude-haiku-4-5-20251001",
      maxTokens: 1000,
      promptCachingEnabled: true,
    },
    ...overrides,
  };
}

function baseResolution(overrides = {}) {
  return {
    _id:              "resolution-1",
    moveName:         "Face Danger",
    statUsed:         "wits",
    statValue:        2,
    actionDie:        4,
    actionScore:      6,
    challengeDice:    [3, 8],
    outcome:          "weak_hit",
    outcomeLabel:     "Weak Hit",
    isMatch:          false,
    consequences: {
      momentumChange: 0,
      otherEffect:    "Success with a cost. Make a suffer move (-1).",
    },
    loremasterContext: "[MOVE: Face Danger +wits] [ROLL: Action: 4 + 2 = 6 vs Challenge: 3, 8] [OUTCOME: Weak Hit] [CONSEQUENCE: Success with a cost. Make a suffer move (-1).]",
    ...overrides,
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// SAFETY.JS TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe("formatSafetyContext", () => {
  it("always returns a non-empty string", () => {
    const result = formatSafetyContext(baseCampaignState());
    expect(result.length).toBeGreaterThan(0);
  });

  it("includes SAFETY CONFIGURATION header", () => {
    const result = formatSafetyContext(baseCampaignState());
    expect(result).toMatch(/SAFETY CONFIGURATION/i);
  });

  it("includes campaign Lines", () => {
    const result = formatSafetyContext(baseCampaignState());
    expect(result).toMatch(/endanger children/i);
  });

  it("includes campaign Veils", () => {
    const result = formatSafetyContext(baseCampaignState());
    expect(result).toMatch(/VEILS/i);
  });

  it("includes private Lines for the requesting player", () => {
    const result = formatSafetyContext(baseCampaignState(), null, "player-1");
    expect(result).toMatch(/drowning/i);
  });

  it("does not include another player's private Lines", () => {
    const result = formatSafetyContext(baseCampaignState(), null, "player-2");
    expect(result).not.toMatch(/drowning/i);
  });

  it("GM receives all private Lines", () => {
    const result = formatSafetyContext(baseCampaignState(), null, "gm");
    expect(result).toMatch(/drowning/i);
  });

  it("merges session-level additional Lines", () => {
    const sessionState = {
      safetyOverrides: {
        additionalLines: ["No realistic depictions of torture."],
        additionalVeils: [],
      },
    };
    const result = formatSafetyContext(baseCampaignState(), sessionState);
    expect(result).toMatch(/torture/i);
  });

  it("deduplicates identical Lines", () => {
    const state = baseCampaignState();
    state.safety.lines = ["No child peril.", "No child peril."];
    const result = formatSafetyContext(state);
    const count = (result.match(/No child peril/g) ?? []).length;
    expect(count).toBe(1);
  });

  it("includes the hard ceiling note", () => {
    const result = formatSafetyContext(baseCampaignState());
    expect(result).toMatch(/hard ceiling/i);
  });
});

describe("estimateSafetyTokens", () => {
  it("returns a positive number for non-empty content", () => {
    const tokens = estimateSafetyTokens("This is a test string.");
    expect(tokens).toBeGreaterThan(0);
  });

  it("approximates ~4 characters per token", () => {
    const str    = "a".repeat(400);
    const tokens = estimateSafetyTokens(str);
    expect(tokens).toBe(100);
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
    const packet = await assembleContextPacket(baseResolution(), baseCampaignState());
    const safetyIdx     = packet.assembled.indexOf("SAFETY CONFIGURATION");
    const worldTruthIdx = packet.assembled.indexOf("WORLD TRUTHS");
    expect(safetyIdx).toBeGreaterThanOrEqual(0);
    if (worldTruthIdx >= 0) {
      expect(safetyIdx).toBeLessThan(worldTruthIdx);
    }
  });

  it("safety section is always present even with a tight budget", async () => {
    const packet = await assembleContextPacket(
      baseResolution(),
      baseCampaignState(),
      { tokenBudget: 10 }   // Extremely tight — should still include safety
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
      baseResolution(),
      baseCampaignState(),
      { tokenBudget: 20 }
    );
    if (packet.budgetExceeded) {
      expect(Array.isArray(packet.omittedSections)).toBe(true);
    }
  });

  it("never lists safety in omitted sections", async () => {
    const packet = await assembleContextPacket(
      baseResolution(),
      baseCampaignState(),
      { tokenBudget: 5 }
    );
    expect(packet.omittedSections).not.toContain("safety");
  });

  it("returns suppressed packet when X-Card is active", async () => {
    const packet = await assembleContextPacket(
      baseResolution(),
      baseCampaignState(),
      { sessionState: { xCardActive: true } }
    );
    expect(packet.assembled).toMatch(/SCENE PAUSED/i);
    expect(packet.assembled).toMatch(/X-Card/i);
    expect(packet.triggeredBy).toBe("x_card");
  });

  it("suppressed packet omits all creative sections", async () => {
    const packet = await assembleContextPacket(
      baseResolution(),
      baseCampaignState(),
      { sessionState: { xCardActive: true } }
    );
    expect(packet.assembled).not.toMatch(/WORLD TRUTHS/i);
    expect(packet.assembled).not.toMatch(/Face Danger/);
  });

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
      baseResolution(),
      baseCampaignState(),
      { sessionState, tokenBudget: 1000 }
    );
    expect(packet.assembled).toMatch(/survivor/i);
  });
});
