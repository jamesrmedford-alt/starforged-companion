/**
 * Envision an Inciting Incident — pure helpers. The narrator call + ChatMessage
 * post are integration-tested live (Quench); here we cover the spark roll, the
 * narrator user-message builder, the suggested-vow splitter, and the card
 * renderer (full + oracle-only fallback).
 */

import { describe, it, expect } from "vitest";
import {
  rollIncitingSpark,
  buildIncitingIncidentUserMessage,
  splitSuggestedVow,
  renderIncitingIncidentCard,
} from "../../src/session/incitingIncident.js";

describe("rollIncitingSpark", () => {
  it("returns an Action + Theme pair of strings", () => {
    const spark = rollIncitingSpark();
    expect(typeof spark.action).toBe("string");
    expect(typeof spark.theme).toBe("string");
    expect(spark.action.length).toBeGreaterThan(0);
    expect(spark.theme.length).toBeGreaterThan(0);
  });
});

describe("buildIncitingIncidentUserMessage", () => {
  it("carries the spark and frames the inciting-incident task", () => {
    const msg = buildIncitingIncidentUserMessage({ action: "Defend", theme: "Secret" });
    expect(msg).toMatch(/inciting incident/i);
    expect(msg).toMatch(/Action: Defend/);
    expect(msg).toMatch(/Theme: Secret/);
    expect(msg).toMatch(/first vow/i);
  });
  it("degrades gracefully on an empty spark", () => {
    const msg = buildIncitingIncidentUserMessage({});
    expect(msg).toMatch(/Action: —/);
    expect(msg).toMatch(/Theme: —/);
  });
});

describe("splitSuggestedVow", () => {
  it("splits a trailing 'Suggested vow' line and parses the rank", () => {
    const text = "The hold burns behind you.\n\nSuggested vow: Recover the stolen reactor core (dangerous)";
    const { prose, vow } = splitSuggestedVow(text);
    expect(prose).toBe("The hold burns behind you.");
    expect(vow.statement).toBe("Recover the stolen reactor core");
    expect(vow.rank).toBe("dangerous");
  });
  it("returns vow:null when there is no suggested-vow line", () => {
    const { prose, vow } = splitSuggestedVow("Just opening prose, no vow.");
    expect(prose).toBe("Just opening prose, no vow.");
    expect(vow).toBe(null);
  });
  it("handles a vow line with no parenthetical rank", () => {
    const { vow } = splitSuggestedVow("x\n\nSuggested vow: Find the missing freighter");
    expect(vow.statement).toBe("Find the missing freighter");
    expect(vow.rank).toBe(null);
  });
});

describe("renderIncitingIncidentCard", () => {
  const spark = { action: "Defend", theme: "Secret" };

  it("renders the spark, prose, and suggested vow when narrated text is present", () => {
    const text = "Klaxons wail across the dock.\n\nSuggested vow: Expose the saboteur (formidable)";
    const html = renderIncitingIncidentCard({ spark, text });
    expect(html).toContain("Inciting Incident");
    expect(html).toContain("Defend / Secret");
    expect(html).toContain("Klaxons wail across the dock.");
    expect(html).toContain("Suggested vow:");
    expect(html).toContain("Expose the saboteur");
    expect(html).toContain("formidable");
  });

  it("falls back to an oracle-spark-only prompt when there is no narrated text", () => {
    const html = renderIncitingIncidentCard({ spark, text: null, fallback: true });
    expect(html).toContain("Defend / Secret");
    expect(html).toMatch(/Envision an inciting incident/i);
    expect(html).not.toContain("Suggested vow:");
  });

  it("escapes HTML in the spark and prose", () => {
    const html = renderIncitingIncidentCard({
      spark: { action: "<b>", theme: "&x" },
      text: "Danger <script>",
    });
    expect(html).toContain("&lt;b&gt;");
    expect(html).toContain("&amp;x");
    expect(html).toContain("Danger &lt;script&gt;");
  });
});

describe("postIncitingIncidentCard — narrator-prose feed flags (A1)", () => {
  async function captureCard(args) {
    const created = [];
    const prev = globalThis.ChatMessage;
    globalThis.ChatMessage = { create: async (data) => { created.push(data); return data; } };
    try {
      const { postIncitingIncidentCard } = await import("../../src/session/incitingIncident.js");
      await postIncitingIncidentCard(args);
    } finally {
      globalThis.ChatMessage = prev;
    }
    return created[0];
  }

  it("carries narratorCard + prose-only narrationText + sessionId when text is present", async () => {
    const text = "The beacon cuts through the haze.\n\nSuggested vow: I will reach Vance (dangerous)";
    const card = await captureCard({
      spark: { action: "Lose", theme: "Relationship" },
      text,
      fallback:  false,
      sessionId: "ssn-42",
    });
    const flags = card.flags["starforged-companion"];
    expect(flags.incitingIncidentCard).toBe(true);
    expect(flags.narratorCard).toBe(true);
    expect(flags.sessionId).toBe("ssn-42");
    expect(flags.narrationText).toContain("beacon cuts through the haze");
    expect(flags.narrationText).not.toMatch(/Suggested vow/);
  });

  it("omits the narrator-card flags on the oracle-only fallback", async () => {
    const card = await captureCard({
      spark: { action: "Lose", theme: "Relationship" },
      text: null,
      fallback: true,
      sessionId: "ssn-42",
    });
    const flags = card.flags["starforged-companion"];
    expect(flags.incitingIncidentCard).toBe(true);
    expect(flags.narratorCard).toBeUndefined();
    expect(flags.narrationText).toBeUndefined();
  });
});
