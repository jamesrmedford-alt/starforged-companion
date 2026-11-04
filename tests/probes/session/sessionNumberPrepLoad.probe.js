/**
 * PROBE — SESSION-06 SESSION-NUMBER-BURNED-BY-PREP-LOAD (ninth audit, area session)
 * — filed under "Needs a decision".
 *
 * What the user does: the table ended session 3 on Tuesday (End a Session).
 * On Wednesday the GM opens the world to prepare — reads journals, edits an
 * NPC — and never presses Begin a Session. On Saturday the table plays.
 *
 * What happens: every world load mints when the session is over
 * (`rollSessionIfDue`, src/session/lifecycle.js:223-245: End marked it, or
 * four idle hours) and `mintSession` (:189-207) always bumps `sessionNumber`.
 * Wednesday's load mints session 4 (never begun, nothing posted); Saturday's
 * load finds session 4 idle and mints session 5. The table's first session
 * after the ended one is "Session #5" on the Session panel, in the Session
 * Log, in `!recap session N`, on the telemetry page and on every narrator
 * card's `sessionNumber`. Each prep-only open after a four-hour gap burns a
 * number; nothing in decisions.md ("A session ends at End Session or after
 * four idle hours") discusses the count.
 *
 * What should happen — two readings, so a decision:
 *   A. `sessionNumber` counts sessions that were begun (or played): a mint
 *      that closes a session nobody begun and nothing was posted in does not
 *      bump it (or reuses that session), so Saturday is "Session #4".
 *   B. The count is the mint count by design; document it in the help
 *      ("When a session starts") and on the panel.
 * This probe asserts reading A; it fails today.
 *
 * Control: a session that WAS begun and went idle is followed by the next
 * number (today: passes).
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/session/sessionNumberPrepLoad.probe.js
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/narration/narrator.js', async (orig) => ({
  ...(await orig()), finalizeSessionSummary: vi.fn(async () => {}),
}));

import { rollSessionIfDue, sessionNeedsMint } from '../../../src/session/lifecycle.js';

const HOUR = 3_600_000;
const T0 = Date.parse('2026-11-03T20:00:00Z');   // Tuesday's End a Session

function endedSessionThree() {
  return {
    currentSessionId: 'S3', sessionNumber: 3, sessionStartedId: 'S3', sessionEndedId: 'S3',
    sessionActive: false, sessionActiveStartedAt: null,
    lastSessionTimestamp: new Date(T0).toISOString(),
    currentSceneId: null, sceneTruths: [], sceneState: { bySubject: {} },
  };
}

beforeEach(() => { game.settings._store.clear(); game.user.isGM = true; });

describe('SESSION-06 a world opened only to prepare burns a session number', () => {
  it('Wednesday: prep-only load mints the next session; Saturday: the table\'s real session is the one after it', async () => {
    const cs = endedSessionThree();

    const wednesday = T0 + 16 * HOUR;
    expect(await rollSessionIfDue(cs, { now: wednesday })).toBe(true);   // the ended session is closed
    expect(cs.sessionNumber).toBe(4);
    expect(cs.sessionActive).toBe(false);                                 // nobody began it …
    // … and the GM closes Foundry without playing.

    const saturday = wednesday + 3 * 24 * HOUR;
    expect(sessionNeedsMint(cs, saturday)).toBe(true);                    // four idle hours: over again
    await rollSessionIfDue(cs, { now: saturday });
    // FAILS today (5): the unbegun Wednesday session counted as one played.
    expect(cs.sessionNumber).toBe(4);
  });

  it('control: a session that was begun and went idle is followed by the next number', async () => {
    const cs = { ...endedSessionThree(), currentSessionId: 'S4', sessionNumber: 4, sessionStartedId: 'S4', sessionEndedId: null,
      sessionActive: true, sessionActiveStartedAt: new Date(T0).toISOString() };
    await rollSessionIfDue(cs, { now: T0 + 30 * HOUR });
    expect(cs.sessionNumber).toBe(5);
    expect(cs.sessionActive).toBe(false);
  });
});
