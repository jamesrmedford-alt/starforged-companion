/**
 * Issue #331 X65 — a session nobody began never replaces LAST SESSION.
 *
 * A GM preparing between sessions can narrate while the gate is shut
 * (`@scene`, `!oracle yes`, `!pay-the-price`). When that session goes idle,
 * the next world load (or Begin a Session) forces a rolling summary of its
 * narration cards, and `mintSession` stored that summary as
 * `previousSessionSummary` — replacing the summary of the session the table
 * last played: the narrator's LAST SESSION held the prep scene, and what the
 * table last played was gone from its context. The summary of the session
 * before stays LAST SESSION under its own number, and the prep summary is
 * added to it (issue #330 D12 carries it; it no longer replaces).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/narration/narrator.js", async (orig) => ({
  ...(await orig()),
  // The forced refresh rollSessionIfDue runs for a session nobody ended: one
  // @scene answer is enough for a summary.
  finalizeSessionSummary: vi.fn(async (cs) => {
    cs.sessionSummary = { sessionId: cs.currentSessionId, text: "Asked about the station's hull markings.", updatedAt: "2026-11-04T10:00:00.000Z" };
  }),
}));

import { rollSessionIfDue, mintSession } from "../../src/session/lifecycle.js";

const HOUR = 3_600_000;
const T0 = Date.parse("2026-11-03T20:00:00Z");   // Tuesday's End a Session

beforeEach(() => { game.settings._store.clear(); game.user.isGM = true; });

/** Session 3 was played and ended; Wednesday's load minted session 4, which nobody began. */
function prepSessionAfterThree() {
  return {
    currentSessionId: "S4", sessionNumber: 4, sessionStartedId: "S3", sessionEndedId: null,
    sessionActive: false, sessionActiveStartedAt: null,
    lastSessionTimestamp: new Date(T0 + 16 * HOUR).toISOString(),
    currentSceneId: null, sceneTruths: [], sceneState: { bySubject: {} },
    sessionSummary: null,
    previousSessionSummary: { sessionId: "S3", sessionNumber: 3, text: "The crew escaped the derelict with the archive core.", updatedAt: "2026-11-03T20:00:00.000Z" },
  };
}

describe("issue #331 X65 — the prep session's summary is added to LAST SESSION, never in its place", () => {
  it("Saturday's load keeps session 3's summary, under its number, with the prep narration added", async () => {
    const cs = prepSessionAfterThree();
    expect(await rollSessionIfDue(cs, { now: T0 + 4 * 24 * HOUR })).toBe(true);
    expect(cs.sessionNumber).toBe(4);                               // D12: the number is handed on
    expect(cs.previousSessionSummary).toMatchObject({ sessionId: "S3", sessionNumber: 3 });
    expect(cs.previousSessionSummary.text).toMatch(/^The crew escaped the derelict with the archive core\./);
    expect(cs.previousSessionSummary.text).toMatch(/Narrated between sessions, while no session was begun: Asked about the station's hull markings\.$/);
  });

  it("two prep loads in a row add both, in order", () => {
    const cs = prepSessionAfterThree();
    cs.sessionSummary = { sessionId: "S4", text: "First prep.", updatedAt: null };
    mintSession(cs, T0 + 20 * HOUR);
    cs.sessionSummary = { sessionId: cs.currentSessionId, text: "Second prep.", updatedAt: null };
    mintSession(cs, T0 + 40 * HOUR);
    expect(cs.sessionNumber).toBe(4);
    expect(cs.previousSessionSummary.sessionNumber).toBe(3);
    expect(cs.previousSessionSummary.text.indexOf("First prep.")).toBeLessThan(cs.previousSessionSummary.text.indexOf("Second prep."));
  });

  it("control: a world with no earlier summary carries the prep summary alone, with no number (issue #330 D12)", () => {
    const cs = { currentSessionId: "S1", sessionNumber: 1, sessionStartedId: null, sessionActive: false,
      sessionSummary: { sessionId: "S1", text: "Read the inciting incident.", updatedAt: null } };
    mintSession(cs, T0);
    expect(cs.previousSessionSummary).toMatchObject({ sessionId: "S1", sessionNumber: null, text: "Read the inciting incident." });
  });

  it("control: a begun session's summary replaces the one before it", () => {
    const cs = { ...prepSessionAfterThree(), sessionStartedId: "S4",
      sessionSummary: { sessionId: "S4", text: "Session four.", updatedAt: null } };
    mintSession(cs, T0 + 30 * HOUR);
    expect(cs.previousSessionSummary).toMatchObject({ sessionId: "S4", sessionNumber: 4, text: "Session four." });
  });
});
