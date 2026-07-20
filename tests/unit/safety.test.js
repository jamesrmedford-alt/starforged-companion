/**
 * STARFORGED COMPANION
 * tests/unit/safety.test.js
 *
 * Dedicated units for src/context/safety.js (2026-07 test-suite review).
 * This module's only unit coverage previously lived in assembler.test.js,
 * which was deleted with the assembler retirement (#271) — leaving the
 * X-Card write paths at 55% branch coverage. Safety is the one surface the
 * module promises is never omitted or overridden, so it gets its own suite.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { formatSafetyContext, suppressScene, clearXCard } from "../../src/context/safety.js";

const MODULE_ID = "starforged-companion";

function campaign(overrides = {}) {
  return {
    safety: {
      lines: [],
      veils: [],
      privateLines: [],
      ...overrides,
    },
  };
}

describe("formatSafetyContext", () => {
  it("always produces the hard-ceiling header, even for an empty campaign", () => {
    for (const state of [undefined, null, {}, campaign()]) {
      const out = formatSafetyContext(state);
      expect(out).toMatch(/^SAFETY CONFIGURATION/);
      expect(out).toContain("hard ceiling");
      expect(out.length).toBeGreaterThan(0);
    }
  });

  it("renders campaign lines and veils under their headers", () => {
    const out = formatSafetyContext(campaign({
      lines: ["No harm to children"],
      veils: ["Torture happens off-screen"],
    }));
    expect(out).toMatch(/### LINES[\s\S]*- No harm to children/);
    expect(out).toMatch(/### VEILS[\s\S]*- Torture happens off-screen/);
  });

  it("omits the LINES/VEILS sections entirely when empty (no empty headers)", () => {
    const out = formatSafetyContext(campaign());
    expect(out).not.toContain("### LINES");
    expect(out).not.toContain("### VEILS");
    expect(out).not.toContain("### PRIVATE LINES");
  });

  it("merges session-level overrides and deduplicates", () => {
    const session = {
      safetyOverrides: {
        additionalLines: ["No harm to children", "No spiders"],
        additionalVeils: ["Plague detail"],
      },
    };
    const out = formatSafetyContext(
      campaign({ lines: ["No harm to children"], veils: [] }),
      session,
    );
    // deduped: the shared line appears exactly once
    expect(out.match(/No harm to children/g)).toHaveLength(1);
    expect(out).toContain("- No spiders");
    expect(out).toMatch(/### VEILS[\s\S]*- Plague detail/);
  });

  describe("private lines visibility", () => {
    const state = campaign({
      privateLines: [
        { playerId: "user-a", lines: ["No dogs harmed"] },
        { playerId: "user-b", lines: ["No body horror"] },
      ],
    });

    it("system calls (no user) see no private lines", () => {
      expect(formatSafetyContext(state, null, null)).not.toContain("PRIVATE LINES");
    });

    it("a player sees exactly their own private lines", () => {
      const out = formatSafetyContext(state, null, "user-a");
      expect(out).toContain("- No dogs harmed");
      expect(out).not.toContain("No body horror");
    });

    it("the GM sees every player's private lines", () => {
      const out = formatSafetyContext(state, null, "gm");
      expect(out).toContain("- No dogs harmed");
      expect(out).toContain("- No body horror");
    });
  });
});

describe("X-Card write paths (suppressScene / clearXCard)", () => {
  beforeEach(() => {
    game.settings._store.set(`${MODULE_ID}.campaignState`, { xCardActive: false });
  });
  afterEach(() => {
    game.settings._store.delete(`${MODULE_ID}.campaignState`);
    vi.restoreAllMocks();
  });

  it("suppressScene persists xCardActive = true", async () => {
    await suppressScene();
    expect(game.settings.get(MODULE_ID, "campaignState").xCardActive).toBe(true);
  });

  it("clearXCard persists xCardActive = false", async () => {
    game.settings._store.set(`${MODULE_ID}.campaignState`, { xCardActive: true });
    await clearXCard();
    expect(game.settings.get(MODULE_ID, "campaignState").xCardActive).toBe(false);
  });

  it("both fail open (warn, no throw) when settings are unavailable", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(game.settings, "get").mockImplementation(() => { throw new Error("no settings"); });
    await expect(suppressScene()).resolves.toBeUndefined();
    await expect(clearXCard()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
