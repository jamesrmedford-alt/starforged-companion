/**
 * STARFORGED COMPANION
 * tests/unit/interpreterNumbers.test.js
 *
 * Issue #322 V08 (the audit's interpreterNumbers probe, INTERP-NUMBERS-
 * TRUSTED): parseInterpretation copied the model's `adds` and `statValue`
 * onto the interpretation unchecked. The prompt never asked for adds, yet:
 *   - a string "1" in `adds` went into calcActionScore and concatenated
 *     (die 1 + stat 2 + "1" = "31", capped to 10) — a strong hit against
 *     anything but a 10; a number was added on top of the confirm dialog's
 *     asset adds;
 *   - for a progress move whose track / vow / connection enrichment resolved
 *     nothing, enrichProgressTicks warned "progress score will be 0" and left
 *     `statValue` alone, so the model's number was scored as the ticks.
 * The numbers are the module's now: the parse keeps none of the model's, and
 * an unresolved progress move scores 0.
 */

import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("../../src/api-proxy.js", () => ({ apiPost: vi.fn() }));
vi.mock("../../src/oracles/roller.js", () => ({
  rollOracle: vi.fn(() => ({ result: "—" })), rollPaired: vi.fn(() => ({})),
}));

import { interpretMove } from "../../src/moves/interpreter.js";
import { resolveMove } from "../../src/moves/resolver.js";
import { enrichProgressTicks } from "../../src/moves/statEnrichment.js";
import { apiPost } from "../../src/api-proxy.js";

afterEach(() => vi.restoreAllMocks());

function reply(obj) {
  apiPost.mockResolvedValueOnce({ content: [{ type: "text", text: JSON.stringify(obj) }] });
}

const OPTS = { campaignState: {}, mischiefLevel: "serious", apiKey: "sk-ant-test" };

describe("the interpreter's numbers are the module's (INTERP-NUMBERS-TRUSTED)", () => {
  it("a model-supplied string `adds` does not turn the roll into an automatic 10", async () => {
    reply({ moveId: "face_danger", statUsed: "wits", statValue: 0, adds: "1", rationale: "r" });
    const interp = await interpretMove("I thread the debris field.", OPTS);
    interp.statValue = 2;   // what enrichInterpretationStatValue fills from the sheet

    // challenge dice [5, 8] (0.45, 0.75); action die 1 (0.0)
    const seq = [0.45, 0.75, 0.0];
    let i = 0;
    vi.spyOn(Math, "random").mockImplementation(() => seq[i++] ?? 0);
    const r = resolveMove(interp, { currentSessionId: "s1" });

    expect(interp.adds).toBe(0);
    expect(r.actionScore).toBe(3);      // 1 + 2 — was "31" → 10
    expect(r.outcome).toBe("miss");     // was a strong hit
  });

  it("a number the model puts in adds, statValue or progressTicks is not kept", async () => {
    reply({ moveId: "fulfill_your_vow", statUsed: null, statValue: 28, adds: 3, progressTicks: 28, rationale: "r" });
    const interp = await interpretMove("I see the oath through.", OPTS);
    expect(interp).toMatchObject({ moveId: "fulfill_your_vow", statValue: 0, adds: 0, progressTicks: 0 });
  });

  it("the prompt's response format no longer offers an adds field", async () => {
    reply({ moveId: "face_danger", statUsed: "wits", rationale: "r" });
    await interpretMove("I thread the debris field.", OPTS);
    const system = JSON.stringify(apiPost.mock.calls.at(-1));
    expect(system).toContain('\\"statValue\\": 0');
    expect(system).not.toContain('\\"adds\\": 0');
  });

  it("a progress move that resolves no track scores 0, not the number it carried", async () => {
    const interp = {
      moveId: "fulfill_your_vow", isProgressMove: true, moveTarget: "a vow nobody swore",
      statValue: 28, progressTicks: 28,
    };
    const info = await enrichProgressTicks(interp, {
      readAllVows: async () => [], listTracks: async () => [],
    });
    expect(info.ticks).toBe(0);
    expect(interp.statValue).toBe(0);       // was 28 → progress score 7
    expect(interp.progressTicks).toBe(0);
  });

  it("control: a resolved track's ticks are the score", async () => {
    const interp = { moveId: "fulfill_your_vow", isProgressMove: true, moveTarget: "Avenge my sister", statValue: 0 };
    await enrichProgressTicks(interp, {
      readAllVows: async () => [{ id: "v1", name: "Avenge my sister", rank: "dangerous", ticks: 24, completed: false, actorId: "pc1", vowId: "v1" }],
      listTracks: async () => [],
      rollerActorId: "pc1",
    });
    expect(interp.statValue).toBe(24);
  });
});
