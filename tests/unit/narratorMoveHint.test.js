// tests/unit/narratorMoveHint.test.js
// Coverage for the paced-narrative move-hint reconciliation (finding J):
// the Roll button must reflect the move the narrator actually invited in its
// closing italic sentence, not the move the pacing classifier nominated before
// the narrator ran. Pure helpers — no API/Foundry boundary needed.

import { describe, it, expect } from "vitest";
import {
  extractMoveFromNarrationHint,
  reconcileSuggestedMove,
  inputNamesOtherPlayerCharacter,
  suppressPcDirectedSocialMove,
} from "../../src/narration/narrator.js";

const PCS = [{ name: "Kylar Nazari" }, { name: "Mave Takara" }];

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

// ---------------------------------------------------------------------------
// inputNamesOtherPlayerCharacter — detect a fellow PC named in the input
// ---------------------------------------------------------------------------

describe("inputNamesOtherPlayerCharacter()", () => {
  it("matches another PC by first name", () => {
    expect(inputNamesOtherPlayerCharacter("Kylar, let him go", "Mave Takara", PCS)).toBe(true);
  });

  it("matches another PC by full name", () => {
    expect(inputNamesOtherPlayerCharacter("I trust Mave Takara on this", "Kylar Nazari", PCS)).toBe(true);
  });

  it("excludes the speaker's own name", () => {
    // Only the speaker is named — not a fellow PC.
    expect(inputNamesOtherPlayerCharacter("Kylar steadies himself", "Kylar Nazari", PCS)).toBe(false);
  });

  it("requires a whole-word match (no substring false-positives)", () => {
    expect(inputNamesOtherPlayerCharacter("docking at the Kylarian outpost", "Mave Takara", PCS)).toBe(false);
  });

  it("returns false for empty input", () => {
    expect(inputNamesOtherPlayerCharacter("", "Mave Takara", PCS)).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(inputNamesOtherPlayerCharacter("KYLAR, stand down", "Mave Takara", PCS)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// suppressPcDirectedSocialMove — no Compel against a fellow PC (finding G)
// ---------------------------------------------------------------------------

describe("suppressPcDirectedSocialMove()", () => {
  it("suppresses Compel aimed at a fellow PC", () => {
    expect(suppressPcDirectedSocialMove("compel", "Kylar, let him go", "Mave Takara", PCS)).toBeNull();
  });

  it("suppresses relationship moves aimed at a fellow PC", () => {
    expect(suppressPcDirectedSocialMove("develop_your_relationship", "Mave, we need to talk", "Kylar Nazari", PCS)).toBeNull();
    expect(suppressPcDirectedSocialMove("test_your_relationship", "Mave, can I count on you?", "Kylar Nazari", PCS)).toBeNull();
  });

  it("keeps Compel when the target is not a PC", () => {
    expect(suppressPcDirectedSocialMove("compel", "I lean on the dock official", "Mave Takara", PCS)).toBe("compel");
  });

  it("passes non-social moves through even when a PC is named", () => {
    expect(suppressPcDirectedSocialMove("gather_information", "Kylar, what did you see?", "Mave Takara", PCS)).toBe("gather_information");
    expect(suppressPcDirectedSocialMove("face_danger", "Kylar, catch me!", "Mave Takara", PCS)).toBe("face_danger");
  });

  it("returns null/passthrough for an empty nomination", () => {
    expect(suppressPcDirectedSocialMove(null, "Kylar, stop", "Mave Takara", PCS)).toBeNull();
  });

  it("keeps Compel when only the speaker's own name appears", () => {
    expect(suppressPcDirectedSocialMove("compel", "Kylar grits his teeth", "Kylar Nazari", PCS)).toBe("compel");
  });
});
