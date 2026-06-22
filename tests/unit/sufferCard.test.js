/**
 * STARFORGED COMPANION
 * tests/unit/sufferCard.test.js
 *
 * Non-blocking suffer-choice card. The apply logic (resolveSufferSelection /
 * runSufferResolution) is covered in sufferDialog.test.js; here we pin the
 * card-specific rendering, the multi-select cap, the call summary, and that
 * posting stashes the flags the click handler needs.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  sufferMultiCap,
  renderSufferCard,
  summarizeSufferCalls,
  postSufferChoiceCard,
} from "../../src/moves/sufferCard.js";

const MODULE_ID = "starforged-companion";

// ── sufferMultiCap ────────────────────────────────────────────────────────────

describe("sufferMultiCap", () => {
  it("returns 1 for single-select and B1 'any' prompts", () => {
    expect(sufferMultiCap({ kind: "enumerated", options: [{}, {}] })).toBe(1);
    expect(sufferMultiCap({ kind: "any", amount: 1 })).toBe(1);
  });

  it("returns the numeric multi value", () => {
    expect(sufferMultiCap({ kind: "enumerated", multi: 2, options: [{}, {}, {}] })).toBe(2);
  });

  it("caps multi:true at the option count", () => {
    expect(sufferMultiCap({ kind: "enumerated", multi: true, options: [{}, {}, {}, {}] })).toBe(4);
  });
});

// ── renderSufferCard ──────────────────────────────────────────────────────────

describe("renderSufferCard", () => {
  it("renders the six suffer moves for a B1 'any' prompt", () => {
    const html = renderSufferCard({ kind: "any", amount: 1, count: 1 }, null);
    expect(html).toContain("Make a suffer move (-1)");
    for (const label of ["Endure Harm", "Endure Stress", "Lose Momentum",
      "Sacrifice Resources", "Withstand Damage", "Companion Takes a Hit"]) {
      expect(html).toContain(label);
    }
    expect(html).toContain('data-pick-kind="any"');
  });

  it("disables a requires-gated option that is not available", () => {
    const prompt = { kind: "enumerated", options: [
      { label: "+1 health (if not wounded)", health: 1, requires: "!wounded" },
      { label: "+1 momentum", momentum: 1 },
    ]};
    const woundedActor = { system: { debility: { wounded: true } } };
    const html = renderSufferCard(prompt, woundedActor);
    // Option 0 unavailable → disabled + "(unavailable)"; option 1 enabled.
    expect(html).toMatch(/data-option-index="0"[^>]*disabled/);
    expect(html).toContain("(unavailable)");
    expect(html).not.toMatch(/data-option-index="1"[^>]*disabled/);
  });

  it("marks an already-picked option (multi-select) as done and disabled", () => {
    const prompt = { kind: "enumerated", multi: 2, options: [
      { label: "Mark progress", combatProgress: 1 },
      { label: "+2 momentum", momentum: 2 },
      { label: "+1 next move", nextBonus: 1 },
    ]};
    const html = renderSufferCard(prompt, null, [0]);
    expect(html).toContain("Choose 2:");
    expect(html).toMatch(/data-option-index="0"[^>]*disabled/);
    expect(html).toContain("✓ Mark progress");
    expect(html).not.toMatch(/data-option-index="1"[^>]*disabled/);
  });

  it("escapes option labels", () => {
    const html = renderSufferCard({ kind: "enumerated", options: [{ label: "<b>x</b>", momentum: 1 }] }, null);
    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });
});

// ── summarizeSufferCalls ──────────────────────────────────────────────────────

describe("summarizeSufferCalls", () => {
  it("summarises meter and suffer calls", () => {
    expect(summarizeSufferCalls([{ kind: "meter", meterKey: "momentum", delta: 2 }]))
      .toBe("momentum +2");
    expect(summarizeSufferCalls([{ kind: "suffer", sufferId: "lose_momentum", amount: 1 }]))
      .toBe("Lose Momentum (-1)");
    expect(summarizeSufferCalls([])).toBe("no change");
  });
});

// ── postSufferChoiceCard ──────────────────────────────────────────────────────

describe("postSufferChoiceCard", () => {
  beforeEach(() => { global.ChatMessage._reset(); });

  it("posts a card carrying the prompt, actor, opts, and resolved=false", async () => {
    const prompt = { kind: "any", amount: 1, count: 1 };
    await postSufferChoiceCard({
      sufferPrompt: prompt,
      actor: { id: "actor-1" },
      executorOpts: { isMiss: true },
      moveId: "face_danger",
    });
    expect(ChatMessage._created).toHaveLength(1);
    const flags = ChatMessage._created[0].flags[MODULE_ID];
    expect(flags.sufferCard).toBe(true);
    expect(flags.sufferPrompt).toEqual(prompt);
    expect(flags.actorId).toBe("actor-1");
    expect(flags.executorOpts).toEqual({ isMiss: true });
    expect(flags.moveId).toBe("face_danger");
    expect(flags.resolved).toBe(false);
    expect(flags.pickedIndices).toEqual([]);
  });

  it("no-ops without a prompt", async () => {
    const result = await postSufferChoiceCard({ sufferPrompt: null, actor: { id: "a" } });
    expect(result).toBeNull();
    expect(ChatMessage._created).toHaveLength(0);
  });
});
