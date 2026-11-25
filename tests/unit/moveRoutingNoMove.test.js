/**
 * STARFORGED COMPANION
 * tests/unit/moveRoutingNoMove.test.js
 *
 * Issue #354 section A (alpha 23 playtest part 2) — dialogue is not forced
 * into moves. The reading stages, one by one:
 *
 * P2-01  the interpreter can answer that no move is being made. Every reply
 *        carried a move, so "Tell us the whole story" came back as Ask the
 *        Oracle with "this is a narrative exchange" in its rationale, and the
 *        roll dialog opened all the same.
 * P2-02  the classifier's move reaches the interpreter (the router dropped
 *        it), and a Balanced Mischief misread stays inside what the line is
 *        doing — "we've come this far…" spoken to an NPC was read as
 *        Undertake an Expedition.
 * P2-04  the classifier leans toward a roll only for a pressing or testing
 *        line to one of the speaker's own connections (the classifier-context
 *        half is in pacing.test.js).
 * P2-06  the interpreter is told who is speaking, and a social move against a
 *        fellow player character is narrated on a MOVE decision too.
 *
 * The pipeline half — the line narrated, the confirm dialog's third button,
 * the "Not rolled" notice's — is in moveRoutingNoMovePipeline.test.js.
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/api-proxy.js", () => ({ apiPost: vi.fn() }));
vi.mock("../../src/pacing/telemetry.js", () => ({ logPacingDecision: vi.fn(async () => {}) }));
vi.mock("../../src/ui/progressTracks.js", async (importOriginal) => ({
  ...(await importOriginal()),
  listProgressTracks: vi.fn(async () => []),
  getActiveCombatPosition: vi.fn(async () => null),
}));
vi.mock("../../src/moves/abilityScanner.js", async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));

import { apiPost } from "../../src/api-proxy.js";
import { interpretMove, keepMischiefInKind } from "../../src/moves/interpreter.js";
import { buildMischiefFraming } from "../../src/moves/mischief.js";
import { decidePacing, getRecentMoveDensity, recordRecentDecision, resetRecentDensity, reviseLastDecision } from "../../src/pacing/router.js";
import { lineIsToAFellowPlayerCharacter } from "../../src/narration/narrator.js";
import { readMove, readAction, configureMovePipeline } from "../../src/moves/movePipeline.js";
import { getActiveCombatPosition, listProgressTracks } from "../../src/ui/progressTracks.js";

const MODULE_ID = "starforged-companion";
const OPTS = { campaignState: {}, mischiefLevel: "lawful", apiKey: "test-key" };

/**
 * Answer each line-reader call (issue #384, slice 2 — one reader since the
 * switch) as the two readers' scripts said: a line's open reading is the
 * classifier's decision with the interpreter's move (a MOVE is asked for, an
 * offer is slight, a narration is no move); a roll or a chosen move is the
 * interpreter's reply.
 */
function scriptCalls({ classifier = null, interpreter = null } = {}) {
  apiPost.mockImplementation(async (_url, _headers, body) => {
    const user = String(body.messages?.[0]?.content ?? "");
    let reply = interpreter;
    if (/^MODE — READ THE LINE/.test(user) && classifier) {
      const move = interpreter?.noMove ? null : (interpreter?.moveId ?? classifier.suggestedMove ?? null);
      reply = classifier.decision === "NARRATIVE" || !move ? { move: null, category: classifier.category ?? "social", confidence: "high", reason: classifier.reasoning ?? "r" }
        : { ...(interpreter ?? {}), move, asked: classifier.decision === "MOVE", risk: "slight", category: classifier.category ?? "social", confidence: "high" };
    }
    return { content: [{ type: "text", text: JSON.stringify(reply ?? {}) }] };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  game.settings._store.clear();
  game.actors._reset();
  global.game.user = { id: "gm-1", isGM: true };
  game.actors._set("pc-isaac", makeTestActor({ id: "pc-isaac", name: "Isaac Sutton" }));
  game.actors._set("pc-karthik", makeTestActor({ id: "pc-karthik", name: "Karthik Shepherd" }));
  getActiveCombatPosition.mockResolvedValue(null);
  listProgressTracks.mockResolvedValue([]);
  resetRecentDensity();
});

// ─────────────────────────────────────────────────────────────────────────────
// P2-01 — the interpreter can answer "no move"
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// P2-06 / P2-02 — what the interpreter is told
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// P2-04 — the classifier's rules
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// P2-06 — a social move against a fellow PC, on a MOVE decision
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// The pipeline's reading — readMove / readAction
// ─────────────────────────────────────────────────────────────────────────────

describe("issue #354 P2-01 — a line narrated after all does not count as a recent move", () => {
  it("reviseLastDecision rewrites the newest entry of the density window", () => {
    recordRecentDecision({ decision: "MOVE", sceneTag: "s" });
    recordRecentDecision({ decision: "MOVE", sceneTag: "s" });
    expect(getRecentMoveDensity(5).count).toBe(2);
    reviseLastDecision("NARRATIVE");
    expect(getRecentMoveDensity(5).count).toBe(1);
    resetRecentDensity();
    expect(() => reviseLastDecision("NARRATIVE")).not.toThrow();
  });
});
