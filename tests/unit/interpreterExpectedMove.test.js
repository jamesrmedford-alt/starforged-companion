// tests/unit/interpreterExpectedMove.test.js
// interpretMove with expectedMoveSlug — a move already chosen (issue #321
// U04). A forced move (the pacing "Roll ⟨move⟩" button, the way-out and
// Battle buttons) skipped the interpreter and rolled its first listed stat;
// the pipeline now reads the stat with interpretMove({ expectedMoveSlug }).
// The model is told the move is fixed and which stats it lists; the result is
// that move, with a stat it lists. The Claude call is mocked via api-proxy.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/api-proxy.js", () => ({
  apiPost: vi.fn(),
}));

import { interpretMove } from "../../src/moves/interpreter.js";
import { apiPost } from "../../src/api-proxy.js";

function reply(text) {
  apiPost.mockResolvedValue({ content: [{ type: "text", text }] });
}
function replyJson(obj) {
  reply(JSON.stringify({ confidence: "high", rationale: "Stealth fits.", ...obj }));
}
const userMessage = () => apiPost.mock.calls[0][2].messages[0].content;

const OPTS = { campaignState: {}, mischiefLevel: "chaotic", apiKey: "test-key" };
const SNEAK = "I melt into the shadows and slip past the sentries.";

describe("interpretMove() — a move already chosen (expectedMoveSlug)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("tells the model the move is fixed and which stats it lists, with no mischief and no position steer", async () => {
    replyJson({ moveId: "face_danger", statUsed: "shadow" });
    await interpretMove(SNEAK, { ...OPTS, expectedMoveSlug: "face_danger", combatPosition: "bad_spot" });

    const text = userMessage();
    expect(text).toContain('MOVE ALREADY CHOSEN: the player chose Face Danger. Return moveId "face_danger"');
    expect(text).toContain("Choose statUsed from edge, heart, iron, shadow, wits");
    expect(text).not.toContain("INTERPRETATION NOTE");   // the chaotic mischief framing
    expect(text).not.toContain("COMBAT POSITION");
  });

  it("control: a reading for the chosen move, with a stat it lists, comes back as read", async () => {
    replyJson({ moveId: "face_danger", statUsed: "shadow" });
    const result = await interpretMove(SNEAK, { ...OPTS, expectedMoveSlug: "face_danger" });
    expect(result).toMatchObject({ moveId: "face_danger", moveName: "Face Danger", statUsed: "shadow", rationale: "Stealth fits." });
  });

  it("keeps the chosen move when the model names another — its stat stands when the chosen move lists it", async () => {
    replyJson({ moveId: "secure_an_advantage", statUsed: "wits" });
    const result = await interpretMove("I scan the debris for a way through.", { ...OPTS, expectedMoveSlug: "battle" });
    expect(result).toMatchObject({ moveId: "battle", moveName: "Battle", statUsed: "wits", isProgressMove: false });
  });

  it("a stat the chosen move does not list gives way to its first", async () => {
    replyJson({ moveId: "compel", statUsed: "wits" });
    const result = await interpretMove("I talk the guard down.", { ...OPTS, expectedMoveSlug: "compel" });
    expect(result.statUsed).toBe("heart");
  });

  it("an unreadable reply keeps the chosen move and its first listed stat", async () => {
    expectConsoleError(/Failed to parse API response/);
    reply("not json at all");
    const result = await interpretMove(SNEAK, { ...OPTS, expectedMoveSlug: "heal" });
    expect(result).toMatchObject({ moveId: "heal", moveName: "Heal", statUsed: "iron", confidence: "low" });
  });

  it("control: without a chosen move the model still picks the move, under mischief", async () => {
    replyJson({ moveId: "secure_an_advantage", statUsed: "wits" });
    const result = await interpretMove("I scan the debris for a way through.", OPTS);
    expect(result.moveId).toBe("secure_an_advantage");
    expect(userMessage()).toContain("INTERPRETATION NOTE");
    expect(userMessage()).not.toContain("MOVE ALREADY CHOSEN");
  });
});
