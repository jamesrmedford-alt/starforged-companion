/**
 * STARFORGED COMPANION
 * tests/unit/shipMapArt.test.js
 *
 * Deck-plan background prompt builder. The IO path (generateShipMapBackground)
 * is exercised via Quench against a live OpenRouter; here we only pin the pure
 * prompt shape so a prompt regression is caught in CI.
 */

import { describe, it, expect } from "vitest";
import { buildShipMapBackgroundPrompt } from "../../src/moves/shipMapArt.js";

describe("buildShipMapBackgroundPrompt()", () => {
  it("asks for a top-down orthographic deck plan with no text/labels", () => {
    const { prompt, size } = buildShipMapBackgroundPrompt({});
    expect(prompt).toMatch(/top-down/i);
    expect(prompt).toMatch(/deck plan/i);
    expect(prompt).toMatch(/no text/i);
    expect(prompt).toMatch(/no labels/i);
    expect(size).toBe("1792x1024");
  });

  it("seeds the prompt from the ship's type and first look when present", () => {
    const { prompt } = buildShipMapBackgroundPrompt({ type: "Corvette", firstLook: "scorched hull plating" });
    expect(prompt).toMatch(/Corvette/);
    expect(prompt).toMatch(/scorched hull plating/);
  });

  it("omits the seed clause cleanly when no oracle details exist", () => {
    const { prompt } = buildShipMapBackgroundPrompt({});
    expect(prompt).not.toMatch(/The vessel is:/);
  });
});
