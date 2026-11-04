/**
 * Issue #330 D12 — the session number counts the sessions a table began.
 *
 * Every world load after End a Session (or four idle hours) mints a new
 * session, and `mintSession` always bumped `sessionNumber`: a GM who opened
 * the world on Wednesday only to prepare burned a number, and Saturday's
 * play was "Session #5" after Tuesday's session 3 — on the panel, the
 * Session Log, `!recap session N` and every narrator card. Decided (option
 * A, narrowed): a closing session nobody began (no `sessionStartedId`) hands
 * its number on to the next; the id still changes.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/narration/narrator.js", async (orig) => ({
  ...(await orig()), finalizeSessionSummary: vi.fn(async () => {}),
}));

import { rollSessionIfDue, sessionNeedsMint, mintSession } from "../../src/session/lifecycle.js";

const HOUR = 3_600_000;
const T0 = Date.parse("2026-11-03T20:00:00Z");   // Tuesday's End a Session

function endedSessionThree() {
  return {
    currentSessionId: "S3", sessionNumber: 3, sessionStartedId: "S3", sessionEndedId: "S3",
    sessionActive: false, sessionActiveStartedAt: null,
    lastSessionTimestamp: new Date(T0).toISOString(),
    currentSceneId: null, sceneTruths: [], sceneState: { bySubject: {} },
  };
}

beforeEach(() => { game.settings._store.clear(); game.user.isGM = true; });

describe("issue #330 D12 — a world opened only to prepare does not burn a session number", () => {
  it("Wednesday's prep-only load mints session 4; Saturday's real session is still session 4", async () => {
    const cs = endedSessionThree();

    const wednesday = T0 + 16 * HOUR;
    expect(await rollSessionIfDue(cs, { now: wednesday })).toBe(true);
    expect(cs.sessionNumber).toBe(4);
    const wednesdayId = cs.currentSessionId;
    expect(cs.sessionActive).toBe(false);          // nobody begins it

    const saturday = wednesday + 3 * 24 * HOUR;
    expect(sessionNeedsMint(cs, saturday)).toBe(true);
    expect(await rollSessionIfDue(cs, { now: saturday })).toBe(true);
    expect(cs.sessionNumber).toBe(4);
    expect(cs.currentSessionId).not.toBe(wednesdayId);   // a new session all the same
  });

  it("any number of prep-only loads in a row keep the number", async () => {
    const cs = endedSessionThree();
    let now = T0;
    for (let i = 0; i < 4; i++) {
      now += 24 * HOUR;
      await rollSessionIfDue(cs, { now });
    }
    expect(cs.sessionNumber).toBe(4);
  });

  it("an unbegun session's summary is carried as LAST SESSION, with no number of its own", () => {
    const cs = {
      currentSessionId: "S4", sessionNumber: 4, sessionStartedId: "S3",
      sessionSummary: { sessionId: "S4", text: "The crew read the inciting incident.", updatedAt: null },
      previousSessionSummary: { sessionId: "S3", sessionNumber: 3, text: "Session three.", updatedAt: null },
    };
    mintSession(cs, T0);
    expect(cs.sessionNumber).toBe(4);
    expect(cs.previousSessionSummary).toMatchObject({ sessionId: "S4", sessionNumber: null });
  });

  it("control: a session that was begun and went idle is followed by the next number", async () => {
    const cs = { ...endedSessionThree(), currentSessionId: "S4", sessionNumber: 4, sessionStartedId: "S4", sessionEndedId: null,
      sessionActive: true, sessionActiveStartedAt: new Date(T0).toISOString() };
    await rollSessionIfDue(cs, { now: T0 + 30 * HOUR });
    expect(cs.sessionNumber).toBe(5);
    expect(cs.sessionActive).toBe(false);
  });

  it("control: a begun session's summary keeps its number", () => {
    const cs = {
      currentSessionId: "S3", sessionNumber: 3, sessionStartedId: "S3",
      sessionSummary: { sessionId: "S3", text: "Session three.", updatedAt: null },
    };
    mintSession(cs, T0);
    expect(cs.sessionNumber).toBe(4);
    expect(cs.previousSessionSummary).toMatchObject({ sessionId: "S3", sessionNumber: 3 });
  });

  it("control: a world's first session is session 1", () => {
    const cs = {};
    mintSession(cs, T0);
    expect(cs.sessionNumber).toBe(1);
  });
});

describe("issue #330 D12 — what counts as begun", () => {
  it("a session whose gate is open was begun, stamped or not (a world from before the stamp)", () => {
    const cs = { currentSessionId: "S4", sessionNumber: 4, sessionActive: true };
    mintSession(cs, T0);
    expect(cs.sessionNumber).toBe(5);
  });
});
