/**
 * STARFORGED COMPANION
 * tests/unit/sessionLifecycle.test.js
 *
 * Pure-logic coverage of the session-active gate state machine in
 * src/session/lifecycle.js. Quench live-context coverage of the gate
 * effect on the chat hook lives in the sessionPanel batch.
 */

import { describe, it, expect } from "vitest";

import {
  isSessionActive,
  beginSession,
  endSession,
  sessionMinutesActive,
} from "../../src/session/lifecycle.js";


describe("isSessionActive", () => {
  it("returns false for null / undefined campaignState", () => {
    expect(isSessionActive(null)).toBe(false);
    expect(isSessionActive(undefined)).toBe(false);
  });

  it("returns false when sessionActive is missing", () => {
    expect(isSessionActive({})).toBe(false);
  });

  it("returns false when sessionActive is explicitly false", () => {
    expect(isSessionActive({ sessionActive: false })).toBe(false);
  });

  it("returns true only when sessionActive === true (strict)", () => {
    expect(isSessionActive({ sessionActive: true })).toBe(true);
    // Defensive: truthy-but-not-true values do not count
    expect(isSessionActive({ sessionActive: 1 })).toBe(false);
    expect(isSessionActive({ sessionActive: "yes" })).toBe(false);
  });
});


describe("beginSession", () => {
  it("flips sessionActive to true and stamps sessionActiveStartedAt", () => {
    const cs = { sessionActive: false, sessionActiveStartedAt: null };
    const ret = beginSession(cs);
    expect(ret).toBe(cs);
    expect(cs.sessionActive).toBe(true);
    expect(typeof cs.sessionActiveStartedAt).toBe("string");
    expect(Date.parse(cs.sessionActiveStartedAt)).toBeGreaterThan(0);
  });

  it("is idempotent — calling on an already-active session preserves the stamp", () => {
    const stamp = "2026-01-01T12:00:00.000Z";
    const cs = { sessionActive: true, sessionActiveStartedAt: stamp };
    beginSession(cs);
    expect(cs.sessionActive).toBe(true);
    expect(cs.sessionActiveStartedAt).toBe(stamp);
  });

  it("throws when called without a campaignState", () => {
    expect(() => beginSession(null)).toThrow(/requires/i);
    expect(() => beginSession(undefined)).toThrow(/requires/i);
  });
});


describe("endSession", () => {
  it("flips sessionActive to false and clears sessionActiveStartedAt", () => {
    const cs = { sessionActive: true, sessionActiveStartedAt: "2026-01-01T12:00:00.000Z" };
    const ret = endSession(cs);
    expect(ret).toBe(cs);
    expect(cs.sessionActive).toBe(false);
    expect(cs.sessionActiveStartedAt).toBeNull();
  });

  it("is idempotent on already-inactive sessions", () => {
    const cs = { sessionActive: false, sessionActiveStartedAt: null };
    endSession(cs);
    expect(cs.sessionActive).toBe(false);
    expect(cs.sessionActiveStartedAt).toBeNull();
  });

  it("self-heals a half-broken packet (false flag + stale stamp)", () => {
    const cs = { sessionActive: false, sessionActiveStartedAt: "2026-01-01T12:00:00.000Z" };
    endSession(cs);
    expect(cs.sessionActive).toBe(false);
    expect(cs.sessionActiveStartedAt).toBeNull();
  });

  it("throws when called without a campaignState", () => {
    expect(() => endSession(null)).toThrow(/requires/i);
    expect(() => endSession(undefined)).toThrow(/requires/i);
  });
});


describe("sessionMinutesActive", () => {
  it("returns 0 when the session is inactive", () => {
    expect(sessionMinutesActive({ sessionActive: false })).toBe(0);
    expect(sessionMinutesActive(null)).toBe(0);
  });

  it("returns 0 when the stamp is missing on an active session", () => {
    expect(sessionMinutesActive({ sessionActive: true, sessionActiveStartedAt: null })).toBe(0);
  });

  it("returns 0 when the stamp is unparseable", () => {
    expect(sessionMinutesActive({
      sessionActive: true,
      sessionActiveStartedAt: "not-a-date",
    })).toBe(0);
  });

  it("returns the floor of minutes since the stamp", () => {
    const now    = new Date("2026-05-29T13:30:00.000Z");
    const started = new Date("2026-05-29T13:00:00.000Z").toISOString();
    expect(sessionMinutesActive({
      sessionActive: true,
      sessionActiveStartedAt: started,
    }, now)).toBe(30);
  });

  it("returns 0 (not negative) when the stamp is in the future", () => {
    const now = new Date("2026-05-29T13:00:00.000Z");
    const future = new Date("2026-05-29T13:30:00.000Z").toISOString();
    expect(sessionMinutesActive({
      sessionActive: true,
      sessionActiveStartedAt: future,
    }, now)).toBe(0);
  });
});
