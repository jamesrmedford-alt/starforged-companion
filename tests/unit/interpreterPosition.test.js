// tests/unit/interpreterPosition.test.js
// Combat-position constraint on the move interpreter: the interpreter is fed
// the active combat track's position so it only proposes position-legal combat
// moves, and a wrong-position attack/maneuver is deterministically remapped to
// its same-position counterpart. The Claude call is mocked via api-proxy.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/api-proxy.js", () => ({
  apiPost: vi.fn(),
}));

import {
  buildCombatPositionDirective,
  constrainMoveToPosition,
  interpretMove,
} from "../../src/moves/interpreter.js";
import { apiPost } from "../../src/api-proxy.js";

// ---------------------------------------------------------------------------
// constrainMoveToPosition — the deterministic guarantee
// ---------------------------------------------------------------------------

describe("constrainMoveToPosition()", () => {
  it("passes everything through when position is null/neutral", () => {
    for (const pos of [null, undefined, "neutral", ""]) {
      expect(constrainMoveToPosition("strike", pos)).toBe("strike");
      expect(constrainMoveToPosition("clash", pos)).toBe("clash");
      expect(constrainMoveToPosition("gain_ground", pos)).toBe("gain_ground");
      expect(constrainMoveToPosition("react_under_fire", pos)).toBe("react_under_fire");
    }
  });

  describe("in control", () => {
    it("remaps bad-spot moves to their in-control counterparts", () => {
      expect(constrainMoveToPosition("clash", "in_control")).toBe("strike");
      expect(constrainMoveToPosition("react_under_fire", "in_control")).toBe("gain_ground");
    });

    it("leaves in-control and position-agnostic combat moves unchanged", () => {
      expect(constrainMoveToPosition("strike", "in_control")).toBe("strike");
      expect(constrainMoveToPosition("gain_ground", "in_control")).toBe("gain_ground");
      expect(constrainMoveToPosition("take_decisive_action", "in_control")).toBe("take_decisive_action");
      expect(constrainMoveToPosition("face_defeat", "in_control")).toBe("face_defeat");
      expect(constrainMoveToPosition("enter_the_fray", "in_control")).toBe("enter_the_fray");
    });
  });

  describe("in a bad spot", () => {
    it("remaps in-control moves to their bad-spot counterparts", () => {
      expect(constrainMoveToPosition("strike", "bad_spot")).toBe("clash");
      expect(constrainMoveToPosition("gain_ground", "bad_spot")).toBe("react_under_fire");
    });

    it("leaves bad-spot and position-agnostic combat moves unchanged", () => {
      expect(constrainMoveToPosition("clash", "bad_spot")).toBe("clash");
      expect(constrainMoveToPosition("react_under_fire", "bad_spot")).toBe("react_under_fire");
      expect(constrainMoveToPosition("take_decisive_action", "bad_spot")).toBe("take_decisive_action");
      expect(constrainMoveToPosition("face_defeat", "bad_spot")).toBe("face_defeat");
    });
  });

  it("never touches non-combat moves regardless of position", () => {
    for (const pos of ["in_control", "bad_spot"]) {
      expect(constrainMoveToPosition("face_danger", pos)).toBe("face_danger");
      expect(constrainMoveToPosition("ask_the_oracle", pos)).toBe("ask_the_oracle");
      expect(constrainMoveToPosition("compel", pos)).toBe("compel");
    }
  });
});

// ---------------------------------------------------------------------------
// buildCombatPositionDirective — the soft steer in the user message
// ---------------------------------------------------------------------------

describe("buildCombatPositionDirective()", () => {
  it("returns '' when there is no active combat position", () => {
    expect(buildCombatPositionDirective(null)).toBe("");
    expect(buildCombatPositionDirective(undefined)).toBe("");
    expect(buildCombatPositionDirective("neutral")).toBe("");
  });

  it("describes the in-control move set and forbids bad-spot moves", () => {
    const d = buildCombatPositionDirective("in_control");
    expect(d).toContain("IN CONTROL");
    expect(d).toContain("strike");
    expect(d).toContain("gain_ground");
    expect(d).toContain("take_decisive_action");
    expect(d).toMatch(/Do NOT choose clash or react_under_fire/);
  });

  it("describes the bad-spot move set and forbids in-control moves", () => {
    const d = buildCombatPositionDirective("bad_spot");
    expect(d).toContain("IN A BAD SPOT");
    expect(d).toContain("clash");
    expect(d).toContain("react_under_fire");
    expect(d).toContain("face_defeat");
    expect(d).toMatch(/Do NOT choose strike or gain_ground/);
  });
});

// ---------------------------------------------------------------------------
// interpretMove — directive injected + result forced legal end-to-end
// ---------------------------------------------------------------------------

function mockMove(moveId, statUsed = "iron") {
  apiPost.mockResolvedValue({
    content: [{
      type: "text",
      text: JSON.stringify({
        moveId,
        statUsed,
        confidence: "high",
        rationale: "Test rationale.",
      }),
    }],
  });
}

const BASE_OPTS = { campaignState: {}, mischiefLevel: "balanced", apiKey: "test-key" };

describe("interpretMove() — combat position", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("injects the COMBAT POSITION directive into the user message when in a bad spot", async () => {
    mockMove("clash");
    await interpretMove("I fight back against the raider", { ...BASE_OPTS, combatPosition: "bad_spot" });

    const body = apiPost.mock.calls[0][2];
    const userMessage = body.messages[0].content;
    expect(userMessage).toContain("IN A BAD SPOT");
  });

  it("omits the directive entirely when out of combat", async () => {
    mockMove("face_danger", "wits");
    await interpretMove("I thread the ship through the debris", { ...BASE_OPTS, combatPosition: null });

    const userMessage = apiPost.mock.calls[0][2].messages[0].content;
    expect(userMessage).not.toContain("COMBAT POSITION");
  });

  it("remaps a model-proposed Strike to Clash when in a bad spot", async () => {
    mockMove("strike");
    const result = await interpretMove("I attack the foe", { ...BASE_OPTS, combatPosition: "bad_spot" });

    expect(result.moveId).toBe("clash");
    expect(result.moveName).toBe("Clash");
    expect(result.positionConstraintApplied).toBe(true);
    expect(result.rationale).toContain("in a bad spot");
    // Stat options are identical across the pair, so the chosen stat survives.
    expect(result.statUsed).toBe("iron");
  });

  it("remaps a model-proposed React Under Fire to Gain Ground when in control", async () => {
    mockMove("react_under_fire", "wits");
    const result = await interpretMove("I press my advantage", { ...BASE_OPTS, combatPosition: "in_control" });

    expect(result.moveId).toBe("gain_ground");
    expect(result.positionConstraintApplied).toBe(true);
    expect(result.rationale).toContain("in control");
  });

  it("leaves a position-correct move untouched and flags no constraint", async () => {
    mockMove("clash");
    const result = await interpretMove("I fight back", { ...BASE_OPTS, combatPosition: "bad_spot" });

    expect(result.moveId).toBe("clash");
    expect(result.positionConstraintApplied).toBe(false);
    expect(result.rationale).toBe("Test rationale.");
  });

  it("does not remap non-combat moves chosen mid-combat", async () => {
    mockMove("ask_the_oracle", null);
    const result = await interpretMove("Is the airlock sealed?", { ...BASE_OPTS, combatPosition: "in_control" });

    expect(result.moveId).toBe("ask_the_oracle");
    expect(result.positionConstraintApplied).toBe(false);
  });
});
