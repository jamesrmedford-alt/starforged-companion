import { describe, it, expect } from "vitest";
import { stripMarkup, formatNpcDialogue } from "../../src/audio/segments.js";

// F9a / F22a regression: vignette (and main) cards must not leak <npc> markup,
// and NPC dialogue should be styled. The vignette card builders now run
// formatNpcDialogue(escapeHtml(stripMarkup(text))) — the same pipeline as the
// main narrator card.

const escapeHtml = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

describe("segments display pipeline (F9a)", () => {
  it("stripMarkup removes <npc> tags but keeps the inner text", () => {
    expect(stripMarkup('A <npc>"hi"</npc> B')).toBe('A "hi" B');
  });

  it("formatNpcDialogue wraps escaped quoted runs in a styled span", () => {
    expect(formatNpcDialogue("a &quot;hello&quot; b")).toBe(
      'a <span class="sf-npc-line">&quot;hello&quot;</span> b',
    );
  });

  it("formatNpcDialogue tolerates empty / nullish input", () => {
    expect(formatNpcDialogue("")).toBe("");
    expect(formatNpcDialogue(undefined)).toBe("");
  });

  it("full pipeline leaves no raw or escaped <npc> tags and styles the dialogue", () => {
    const out = formatNpcDialogue(
      escapeHtml(stripMarkup('He muttered <npc>"Paranoid,"</npc> to himself.')),
    );
    expect(out).not.toContain("<npc>");
    expect(out).not.toContain("&lt;npc&gt;");
    expect(out).toContain('<span class="sf-npc-line">&quot;Paranoid,&quot;</span>');
  });
});
