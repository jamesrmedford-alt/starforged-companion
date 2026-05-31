import { describe, it, expect } from "vitest";
import { stripMarkup } from "../../src/audio/segments.js";

// F9a / F22a regression: the session vignette cards (galley + closing) post
// their prose via escapeHtml(stripMarkup(text)), so the audio voice-split
// markers <npc>…</npc> must not survive into the rendered card.

describe("stripMarkup — vignette display (F9a / F22a)", () => {
  it("removes <npc> tags but keeps the inner dialogue", () => {
    expect(stripMarkup('He muttered <npc>"Paranoid,"</npc> to himself.')).toBe(
      'He muttered "Paranoid," to himself.',
    );
  });

  it("strips multiple tags and is case / newline insensitive", () => {
    expect(stripMarkup('<npc>"A"</npc> x <NPC>"B"</NPC>')).toBe('"A" x "B"');
    expect(stripMarkup("a <npc>line\nbreak</npc> b")).toBe("a line\nbreak b");
  });

  it("leaves tag-free prose unchanged and tolerates empty input", () => {
    expect(stripMarkup("plain prose")).toBe("plain prose");
    expect(stripMarkup("")).toBe("");
  });
});
