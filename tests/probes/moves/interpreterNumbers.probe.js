/**
 * PROBE (moves audit) — INTERP-NUMBERS-TRUSTED.
 *
 * parseInterpretation (interpreter.js) copies the model's `adds` and
 * `statValue` onto the interpretation unvalidated (`parsed.adds ?? 0`,
 * `parsed.statValue ?? 0`). The prompt never asks for adds (only "ALWAYS
 * leave statValue / progressTicks as 0"), yet:
 *   - `adds` goes straight into calcActionScore: a string "1" concatenates
 *     (die 1 + stat 2 + "1" = "31" → capped 10), so the roll is a 10 — a
 *     strong hit against anything but a 10; a number is added on top of the
 *     asset adds the player ticks on the confirm dialog (no 0..3 bound).
 *   - for a progress move whose track/vow/connection enrichment resolves
 *     nothing, enrichProgressTicks warns "progress score will be 0" but leaves
 *     `statValue` untouched, so the model's number is scored as the ticks.
 */

import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("../../../src/api-proxy.js", () => ({ apiPost: vi.fn() }));
vi.mock("../../../src/oracles/roller.js", () => ({
  rollOracle: vi.fn(() => ({ result: "—" })), rollPaired: vi.fn(() => ({})),
}));

import { interpretMove } from "../../../src/moves/interpreter.js";
import { resolveMove } from "../../../src/moves/resolver.js";
import { enrichProgressTicks } from "../../../src/moves/statEnrichment.js";
import { apiPost } from "../../../src/api-proxy.js";

afterEach(() => vi.restoreAllMocks());

function reply(obj) {
  apiPost.mockResolvedValueOnce({ content: [{ type: "text", text: JSON.stringify(obj) }] });
}

describe("INTERP-NUMBERS-TRUSTED", () => {
  it("a model-supplied string `adds` does not turn the roll into an automatic 10", async () => {
    reply({ moveId: "face_danger", statUsed: "wits", statValue: 0, adds: "1", rationale: "r" });
    const interp = await interpretMove("I thread the debris field.", {
      campaignState: {}, mischiefLevel: "serious", apiKey: "sk-ant-test",
    });
    interp.statValue = 2;   // what enrichInterpretationStatValue fills from the sheet

    // challenge dice [5, 8] (0.45, 0.75); action die 1 (0.0)
    const seq = [0.45, 0.75, 0.0];
    let i = 0;
    vi.spyOn(Math, "random").mockImplementation(() => seq[i++] ?? 0);
    const r = resolveMove(interp, { currentSessionId: "s1" });

    expect(typeof interp.adds).toBe("number");
    expect(r.actionScore).toBeLessThanOrEqual(4);   // 1 + 2 (+ at most the 1) — a miss vs [5, 8]
    expect(r.outcome).toBe("miss");                 // today: actionScore 10, strong hit
  });

  it("a progress move that resolves no track scores 0, not the model's statValue", async () => {
    const interp = {
      moveId: "fulfill_your_vow", isProgressMove: true, moveTarget: "a vow nobody swore",
      statValue: 28,   // the model ignored "ALWAYS leave as 0"
    };
    const info = await enrichProgressTicks(interp, {
      readAllVows: async () => [], listTracks: async () => [],
    });
    expect(info.ticks).toBe(0);            // it says so…
    expect(interp.statValue).toBe(0);      // …but the resolver will read 28 → progress score 7
  });
});
