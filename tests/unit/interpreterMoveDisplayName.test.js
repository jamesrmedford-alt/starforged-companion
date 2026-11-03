// tests/unit/interpreterMoveDisplayName.test.js
// interpretMove reads a move the model names by its display name (issue #326
// W38). parseInterpretation looked the model's moveId up in MOVES as-is, so
// "Gather Information" (or "gather-information") fell back to Face Danger
// +wits — "Fallback — API response could not be parsed." The id now goes
// through schemas.js toMoveId (issue #321 U45), as the pacing classifier's
// does. The Claude call is mocked via api-proxy.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/api-proxy.js", () => ({ apiPost: vi.fn() }));

import { interpretMove } from "../../src/moves/interpreter.js";
import { apiPost } from "../../src/api-proxy.js";
import { toMoveId } from "../../src/schemas.js";

function replyJson(obj) {
  apiPost.mockResolvedValue({ content: [{ type: "text", text: JSON.stringify({ rationale: "r", confidence: "high", statUsed: "wits", ...obj }) }] });
}
const OPTS = { campaignState: {}, mischiefLevel: "lawful", apiKey: "test-key" };
const SEARCH = "I comb the station archive for the courier's name.";

describe("interpretMove() — a move named by its display name (issue #326 W38)", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("control: toMoveId maps the display name to the key", () => {
    expect(toMoveId("Gather Information")).toBe("gather_information");
  });

  it('"Gather Information" is read as gather_information, not the Face Danger fallback', async () => {
    replyJson({ moveId: "Gather Information", moveName: "Gather Information" });
    const r = await interpretMove(SEARCH, OPTS);
    expect(r).toMatchObject({ moveId: "gather_information", moveName: "Gather Information", statUsed: "wits" });
  });

  it("a hyphenated or differently-cased name is read too", async () => {
    replyJson({ moveId: "gather-information" });
    expect((await interpretMove(SEARCH, OPTS)).moveId).toBe("gather_information");
    replyJson({ moveId: "SECURE AN ADVANTAGE", statUsed: "wits" });
    expect((await interpretMove("I scout the ridge first.", OPTS)).moveId).toBe("secure_an_advantage");
  });

  it("an unknown id with a known moveName is read by the name", async () => {
    replyJson({ moveId: "gather", moveName: "Gather Information" });
    expect((await interpretMove(SEARCH, OPTS)).moveId).toBe("gather_information");
  });

  it("control: a name that is no move still falls back to Face Danger", async () => {
    replyJson({ moveId: "Hack the Mainframe", moveName: "Hack the Mainframe" });
    expect((await interpretMove(SEARCH, OPTS)).moveId).toBe("face_danger");
  });
});
