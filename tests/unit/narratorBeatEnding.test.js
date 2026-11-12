/**
 * STARFORGED COMPANION
 * tests/unit/narratorBeatEnding.test.js
 *
 * Issue #348 (alpha 23 playtest), the prompt-side corrections:
 *   PT01 — the paced user message told the narrator it was "continuing the
 *          scene, not advancing it", so an arrival was pushed back on every
 *          ask ("not yet", "twenty minutes out"). It now keeps only "do not
 *          decide what a move would decide" and lets time the player's line
 *          implies pass; a time skip cuts to the next moment that needs them.
 *   PT02 — move_resolution, paced_narrative and round_resolution had no rule
 *          for how a beat ends; each now carries HOW A BEAT ENDS (change
 *          something; end on something unresolved in the story; a recurring
 *          motif changes or is dropped), beside the unchanged "depict, do not
 *          offer" clause.
 *   PT13 — Markdown emphasis in the prose ("*Savela*") showed as literal
 *          asterisks on the card; it is rendered as <em> / <strong>.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/api-proxy.js", () => ({ apiPost: vi.fn() }));

import {
  buildNarratorSystemPrompt,
  buildPacedNarrativeUserMessage,
} from "../../src/narration/narratorPrompt.js";
import { postNarrationCard } from "../../src/narration/narrator.js";
import { proseToHtml } from "../../src/audio/segments.js";

const MODULE_ID = "starforged-companion";

describe("PT02 — the everyday modes say how a beat ends", () => {
  for (const mode of ["move_resolution", "paced_narrative", "round_resolution"]) {
    it(`${mode} carries the beat-ending rule and keeps "depict, do not offer"`, () => {
      const prompt = buildNarratorSystemPrompt({}, {}, null, "", { mode });
      expect(prompt).toContain("### HOW A BEAT ENDS");
      expect(prompt).toContain("Each beat changes something");
      expect(prompt).toContain("Restating the mood does not count");
      expect(prompt).toContain("Each beat ends on something unresolved inside the story");
      expect(prompt).toContain("Never end on a reflective or atmospheric line");
      expect(prompt).toContain("A recurring motif must change, or be dropped");
      // The anti-suggestion clause stays, ahead of the new rule.
      expect(prompt).toContain("### DEPICT, DO NOT OFFER");
      expect(prompt).toContain("Depict, do not offer. Do not propose actions to the player");
      expect(prompt.indexOf("### DEPICT, DO NOT OFFER")).toBeLessThan(prompt.indexOf("### HOW A BEAT ENDS"));
    });
  }

  for (const mode of ["scene_interrogation", "campaign_recap", "session_vignette", "oracle_followup", "vow_swearing"]) {
    it(`${mode} — a mode with its own ending — does not get it`, () => {
      const prompt = buildNarratorSystemPrompt({}, {}, null, "", { mode });
      expect(prompt).not.toContain("### HOW A BEAT ENDS");
    });
  }
});

describe("PT01 — paced narration may move the story", () => {
  const msg = buildPacedNarrativeUserMessage("wake me when we get there", "", 3, null, "Isaac");

  it("no longer tells the narrator not to advance the scene", () => {
    expect(msg).not.toContain("continuing the scene, not advancing it");
    expect(msg).not.toContain("Do not introduce unestablished plot elements");
  });

  it("keeps what a move decides undecided, and lets implied time pass", () => {
    expect(msg).toContain("Do not decide what a move would decide");
    expect(msg).toContain("No move was rolled — stay in narration");
    expect(msg).toContain("the time the player's line implies passing");
  });

  it("a time skip cuts to the next moment that needs the player", () => {
    expect(msg).toContain("cut to the next moment that needs them, not to the middle of the wait");
  });
});

describe("PT13 — Markdown emphasis renders on the card", () => {
  beforeEach(() => { ChatMessage._reset(); });

  it("proseToHtml renders *italics* and **bold**, escapes the rest, leaves arithmetic alone", () => {
    expect(proseToHtml("The *Savela* drifts. **Now.**")).toBe("The <em>Savela</em> drifts. <strong>Now.</strong>");
    expect(proseToHtml("Five * three is <fifteen>")).toBe("Five * three is &lt;fifteen&gt;");
    expect(proseToHtml('<npc>"*Must* be nice."</npc>')).toBe("&quot;<em>Must</em> be nice.&quot;");
  });

  it("a move narration card shows the italics, not the asterisks; the store keeps the words", async () => {
    const prose = "Karthik snorts. *Must be nice.* The *Savela* hums on.";
    await postNarrationCard(prose, { moveId: "face_danger", outcome: "weak_hit", _id: "r1" }, { currentSessionId: "s1" });
    const card = ChatMessage._created.at(-1);
    expect(card.content).toContain("<em>Must be nice.</em>");
    expect(card.content).toContain("The <em>Savela</em> hums on.");
    expect(card.content).not.toContain("*Savela*");
    expect(card.flags[MODULE_ID].narrationText).toBe(prose);
  });
});
