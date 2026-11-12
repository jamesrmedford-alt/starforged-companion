// tests/unit/interpreterUnchartedCourse.test.js
// Issue #348 PT06 — the interpreter's own reading of travel. Its move
// reference described Set a Course as "a known route" and Undertake an
// Expedition as "perilous or unknown space", with no word on whether the
// destination is charted, so an explicit "set a course" to an unknown place
// stayed Set a Course. It is told now that Set a Course is a known route to a
// charted, known place and that any journey toward one that is not is
// Undertake an Expedition, even when the player says "set a course"; and a
// destination the story refers to without a proper name gets a working label
// (the PT07 location's name). The pipeline's deterministic check (travel.js)
// holds the line whatever the model reads. The Claude call is mocked via
// api-proxy.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/api-proxy.js", () => ({ apiPost: vi.fn() }));

import { interpretMove } from "../../src/moves/interpreter.js";
import { apiPost } from "../../src/api-proxy.js";

const systemText = () => apiPost.mock.calls[0][2].system.map(b => b.text).join("\n");

describe("the interpreter's travel moves (PT06)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiPost.mockResolvedValue({ content: [{ type: "text", text: JSON.stringify({ moveId: "undertake_an_expedition", statUsed: "wits", moveTarget: "Archer's rendezvous — the gap" }) }] });
  });

  it("Set a Course is a known route to a charted place; a journey anywhere else is an expedition", async () => {
    await interpretMove("Please set a course.", { campaignState: {}, mischiefLevel: "balanced", apiKey: "k" });
    const text = systemText();
    expect(text).toContain("**set_a_course** — When you follow a known route to a charted, known place");
    expect(text).toMatch(/\*\*undertake_an_expedition\*\* — [^\n]*destination that is not a charted, known place[^\n]*even when the player says "set a course"/);
  });

  it("names an unnamed destination by a working label", async () => {
    const result = await interpretMove("Please set a course.", { campaignState: {}, mischiefLevel: "balanced", apiKey: "k" });
    expect(systemText()).toMatch(/working label[^\n]*\("Archer's rendezvous — the gap"\)/);
    expect(result.moveTarget).toBe("Archer's rendezvous — the gap");
  });
});
