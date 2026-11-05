/**
 * Issue #331 X64 — a session End a Session closed counts as begun.
 *
 * Issue #330 D12 made a closing session nobody began (no `sessionStartedId`
 * stamp, its gate shut) hand its number on to the next. A session begun
 * without the stamp and then ended read as unbegun at the next mint: one
 * ended before the stamp existed (issue #300 F11), or one begun by ✦ Campaign
 * Start before it stamped. The next session took its number — two sessions
 * shared it, and the count stayed one behind from then on. End a Session
 * closes a session the table played (the panel's End is disabled while the
 * gate is shut), so a session it ended is begun.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/narration/narrator.js", async (orig) => ({
  ...(await orig()), finalizeSessionSummary: vi.fn(async () => {}),
}));

import { rollSessionIfDue, mintSession } from "../../src/session/lifecycle.js";

const HOUR = 3_600_000;
const T0 = Date.parse("2026-11-03T20:00:00Z");

beforeEach(() => { game.settings._store.clear(); game.user.isGM = true; });

describe("issue #331 X64 — a session ended at the table is never renumbered", () => {
  it("a Campaign Start session played and ended before the stamp: the next session is session 2", async () => {
    // Its Begin did not stamp sessionStartedId; End a Session closed it.
    const cs = {
      currentSessionId: "S1", sessionNumber: 1, sessionStartedId: null, sessionEndedId: "S1",
      sessionActive: false, sessionActiveStartedAt: null,
      lastSessionTimestamp: new Date(T0).toISOString(),
      currentSceneId: null, sceneTruths: [], sceneState: { bySubject: {} },
    };
    expect(await rollSessionIfDue(cs, { now: T0 + 20 * HOUR })).toBe(true);
    expect(cs.sessionNumber).toBe(2);
  });

  it("a session ended before the stamp existed, while an older session holds the stamp: the next one follows it", () => {
    const cs = { currentSessionId: "S5", sessionNumber: 5, sessionStartedId: "S2", sessionEndedId: "S5", sessionActive: false };
    mintSession(cs, T0);
    expect(cs.sessionNumber).toBe(6);
  });

  it("its summary keeps its number as LAST SESSION", () => {
    const cs = {
      currentSessionId: "S1", sessionNumber: 1, sessionStartedId: null, sessionEndedId: "S1", sessionActive: false,
      sessionSummary: { sessionId: "S1", text: "The crew left Bleakhold.", updatedAt: null },
    };
    mintSession(cs, T0);
    expect(cs.previousSessionSummary).toMatchObject({ sessionId: "S1", sessionNumber: 1 });
  });

  it("control: a session nobody began or ended still hands its number on (issue #330 D12)", () => {
    const cs = { currentSessionId: "S4", sessionNumber: 4, sessionStartedId: "S3", sessionEndedId: null, sessionActive: false };
    mintSession(cs, T0);
    expect(cs.sessionNumber).toBe(4);
  });
});
