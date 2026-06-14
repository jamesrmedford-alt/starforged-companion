// tests/unit/narratorMoveHint.test.js
// Coverage for the paced-narrative move-hint reconciliation (finding J):
// the Roll button must reflect the move the narrator actually invited in its
// closing italic sentence, not the move the pacing classifier nominated before
// the narrator ran. Pure helpers — no API/Foundry boundary needed.

import { describe, it, expect } from "vitest";
import {
  extractMoveFromNarrationHint,
  reconcileSuggestedMove,
} from "../../src/narration/narrator.js";

// ---------------------------------------------------------------------------
// extractMoveFromNarrationHint — reads the move named in the closing hint
// ---------------------------------------------------------------------------

describe("extractMoveFromNarrationHint()", () => {
  it("matches a multi-word move in a markdown italic hint", () => {
    const text =
      "He shifts, eyes flicking to the airlock. " +
      "*If you want to draw out what he's running from, this could be a Gather Information.*";
    expect(extractMoveFromNarrationHint(text)).toBe("gather_information");
  });

  it("matches a single-word move in a markdown italic hint", () => {
    const text = "The silence stretches. *Pressing further here would be a Compel.*";
    expect(extractMoveFromNarrationHint(text)).toBe("compel");
  });

  it("matches inside an HTML <em> hint", () => {
    const text = "Smoke curls overhead. <em>You could Secure an Advantage before they regroup.</em>";
    expect(extractMoveFromNarrationHint(text)).toBe("secure_an_advantage");
  });

  it("matches inside an HTML <i> hint", () => {
    const text = "The hull groans. <i>This might be the moment to Face Danger.</i>";
    expect(extractMoveFromNarrationHint(text)).toBe("face_danger");
  });

  it("is case-insensitive", () => {
    const text = "*if you want answers, this could be a gather information.*";
    expect(extractMoveFromNarrationHint(text)).toBe("gather_information");
  });

  it("returns null when there is no italic span", () => {
    expect(extractMoveFromNarrationHint("Just plain prose with no hint.")).toBeNull();
  });

  it("returns null when the italic hint names no recognised move", () => {
    const text = "She nods slowly. *Perhaps there is more to learn here.*";
    expect(extractMoveFromNarrationHint(text)).toBeNull();
  });

  it("does NOT match a single-word move name that appears only in the prose body", () => {
    // "strike" in the body must not false-match; only the final italic span is read.
    const text = "The first strike landed clean and the deck shuddered. No hint here.";
    expect(extractMoveFromNarrationHint(text)).toBeNull();
  });

  it("reads the LAST italic span when several are present", () => {
    const text =
      "*the Kestrel* drifts past the viewport. " +
      "Later: *if you press him now, this could be a Compel.*";
    expect(extractMoveFromNarrationHint(text)).toBe("compel");
  });

  it("distinguishes face_death from face_danger", () => {
    const text = "Blood pools beneath him. *Holding on through this would be Face Death.*";
    expect(extractMoveFromNarrationHint(text)).toBe("face_death");
  });

  it("tolerates null / empty input", () => {
    expect(extractMoveFromNarrationHint(null)).toBeNull();
    expect(extractMoveFromNarrationHint("")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// reconcileSuggestedMove — prose hint wins over the classifier nomination
// ---------------------------------------------------------------------------

describe("reconcileSuggestedMove()", () => {
  it("overrides the classifier when the prose hint names a different move (finding J)", () => {
    const text = "*If you want to read him for tells, this could be a Gather Information.*";
    expect(reconcileSuggestedMove(text, "compel")).toBe("gather_information");
  });

  it("keeps the move when the classifier and the hint agree", () => {
    const text = "*Pressing further here would be a Compel.*";
    expect(reconcileSuggestedMove(text, "compel")).toBe("compel");
  });

  it("falls back to the classifier move when the hint names no recognised move", () => {
    const text = "*Perhaps there is more to learn here.*";
    expect(reconcileSuggestedMove(text, "gather_information")).toBe("gather_information");
  });

  it("falls back to the classifier move when there is no hint at all", () => {
    expect(reconcileSuggestedMove("Plain closing prose.", "compel")).toBe("compel");
  });

  it("returns null when the classifier nominated nothing (no button rendered)", () => {
    const text = "*Pressing further here would be a Compel.*";
    expect(reconcileSuggestedMove(text, null)).toBeNull();
    expect(reconcileSuggestedMove(text, undefined)).toBeNull();
  });
});
