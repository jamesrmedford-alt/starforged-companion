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
  splitSuggestedClock,
  splitVowTarget,
  splitIncitingMeta,
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

describe("splitSuggestedClock (F4)", () => {
  it("parses label + segments and strips the line from prose", () => {
    const { prose, clock } = (function(){
      const text = "Prose body here.\nSuggested clock: Vance's life support (6 segments)";
      return splitSuggestedClock(text);
    })();
    expect(clock).toEqual({ label: "Vance's life support", segments: 6 });
    expect(prose).toBe("Prose body here.");
  });

  it("snaps unsupported segment counts to the nearest sheet size", () => {
    expect(splitSuggestedClock("x\nSuggested clock: A (5 segments)").clock.segments).toBe(4);
    expect(splitSuggestedClock("x\nSuggested clock: A (9 segments)").clock.segments).toBe(8);
    expect(splitSuggestedClock("x\nSuggested clock: A (20 segments)").clock.segments).toBe(12);
    expect(splitSuggestedClock("x\nSuggested clock: A (1 segment)").clock.segments).toBe(4);
  });

  it("returns null clock when the line has no parseable segment count", () => {
    const out = splitSuggestedClock("x\nSuggested clock: act before it is too late");
    expect(out.clock).toBeNull();
    expect(out.prose).toBe("x");
  });

  it("returns null clock when the line has a count but no label", () => {
    expect(splitSuggestedClock("x\nSuggested clock: (6 segments)").clock).toBeNull();
  });

  it("returns null clock when no line is present", () => {
    const out = splitSuggestedClock("Just prose.");
    expect(out.clock).toBeNull();
    expect(out.prose).toBe("Just prose.");
  });
});

describe("splitVowTarget (F3)", () => {
  it("parses name and description across an em dash", () => {
    const { target, prose } = splitVowTarget(
      "Prose.\nVow target: Vance — Your estranged mentor; falling-out over the Sepulcher job. Wounded, hiding in the graveyard.",
    );
    expect(target.name).toBe("Vance");
    expect(target.description).toMatch(/estranged mentor/);
    expect(target.description).toMatch(/hiding in the graveyard/);
    expect(prose).toBe("Prose.");
  });

  it("accepts a spaced hyphen and a colon as dividers", () => {
    expect(splitVowTarget("x\nVow target: Kira - Salvage broker").target)
      .toEqual({ name: "Kira", description: "Salvage broker" });
    expect(splitVowTarget("x\nVow target: Kira: Salvage broker").target)
      .toEqual({ name: "Kira", description: "Salvage broker" });
  });

  it("keeps later dashes inside the description", () => {
    const { target } = splitVowTarget("x\nVow target: Vance — old friend — now a stranger");
    expect(target.name).toBe("Vance");
    expect(target.description).toBe("old friend — now a stranger");
  });

  it("treats a bare name as a target with empty description", () => {
    expect(splitVowTarget("x\nVow target: Vance").target)
      .toEqual({ name: "Vance", description: "" });
  });

  it("returns null target when no line is present", () => {
    expect(splitVowTarget("Just prose.").target).toBeNull();
  });
});

describe("splitIncitingMeta", () => {
  const FULL = [
    "The distress beacon cuts through the methane haze.",
    "",
    "Suggested vow: I will reach Vance before his life support fails (dangerous)",
    "Suggested clock: Vance's life support (6 segments)",
    "Vow target: Vance — Your estranged mentor, wounded aboard his shuttle.",
  ].join("\n");

  it("extracts all three trailing lines and clean prose", () => {
    const meta = splitIncitingMeta(FULL);
    expect(meta.vow.statement).toBe("I will reach Vance before his life support fails");
    expect(meta.vow.rank).toBe("dangerous");
    expect(meta.clock).toEqual({ label: "Vance's life support", segments: 6 });
    expect(meta.target.name).toBe("Vance");
    expect(meta.prose).toBe("The distress beacon cuts through the methane haze.");
  });

  it("handles vow-only output (clock and target omitted)", () => {
    const meta = splitIncitingMeta("Prose.\nSuggested vow: I will find the truth (formidable)");
    expect(meta.vow.statement).toBe("I will find the truth");
    expect(meta.clock).toBeNull();
    expect(meta.target).toBeNull();
  });

  it("returns nulls and full prose when no structured lines exist", () => {
    const meta = splitIncitingMeta("Only prose here.");
    expect(meta.vow).toBeNull();
    expect(meta.clock).toBeNull();
    expect(meta.target).toBeNull();
    expect(meta.prose).toBe("Only prose here.");
  });
});

describe("renderIncitingIncidentCard — swear-vow affordance (Cluster B)", () => {
  const TEXT = [
    "The beacon cuts through the haze.",
    "Suggested vow: I will reach Vance (dangerous)",
    "Suggested clock: Life support (6 segments)",
    "Vow target: Vance — Estranged mentor.",
  ].join("\n");
  const SPARK = { action: "Lose", theme: "Relationship" };

  it("renders the button, the clock line, and a hint naming the target", () => {
    const html = renderIncitingIncidentCard({ spark: SPARK, text: TEXT });
    expect(html).toContain('data-action="sf-swear-vow"');
    expect(html).toContain("6-segment clock");
    expect(html).toContain("Vance");
    expect(html).not.toContain("Vow target:");          // meta line never renders raw
    expect(html).not.toContain("Suggested clock:");
  });

  it("renders the sworn state instead of the button when sworn", () => {
    const html = renderIncitingIncidentCard({ spark: SPARK, text: TEXT, sworn: true });
    expect(html).not.toContain('data-action="sf-swear-vow"');
    expect(html).toContain("Vow sworn");
  });

  it("renders no button on the oracle-only fallback", () => {
    const html = renderIncitingIncidentCard({ spark: SPARK, text: null, fallback: true });
    expect(html).not.toContain('data-action="sf-swear-vow"');
  });

  it("renders no button when the narrator omitted the vow line", () => {
    const html = renderIncitingIncidentCard({ spark: SPARK, text: "Prose only." });
    expect(html).not.toContain('data-action="sf-swear-vow"');
  });
});

describe("postIncitingIncidentCard — incitingMeta flags (Cluster B)", () => {
  it("stores the parsed vow/clock/target for the click handler", async () => {
    const created = [];
    const prev = globalThis.ChatMessage;
    globalThis.ChatMessage = { create: async (d) => { created.push(d); return d; } };
    try {
      const { postIncitingIncidentCard } = await import("../../src/session/incitingIncident.js");
      await postIncitingIncidentCard({
        spark: { action: "Lose", theme: "Relationship" },
        text: [
          "Prose.",
          "Suggested vow: I will reach Vance (dangerous)",
          "Suggested clock: Life support (6 segments)",
          "Vow target: Vance — Estranged mentor.",
        ].join("\n"),
        fallback: false, sessionId: "ssn-1",
      });
    } finally {
      globalThis.ChatMessage = prev;
    }
    const flags = created[0].flags["starforged-companion"];
    expect(flags.incitingMeta.vow.statement).toBe("I will reach Vance");
    expect(flags.incitingMeta.clock).toEqual({ label: "Life support", segments: 6 });
    expect(flags.incitingMeta.target).toEqual({ name: "Vance", description: "Estranged mentor." });
    expect(flags.narrationText).toBe("Prose.");          // meta lines stripped from ring text
  });
});
