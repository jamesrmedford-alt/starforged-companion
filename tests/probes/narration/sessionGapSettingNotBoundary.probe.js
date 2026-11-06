/**
 * NARR-D3 (decision) SESSION-GAP-SETTING-NOT-THE-BOUNDARY (eleventh audit, narration) —
 * the "Session gap (hours)" setting the Narrator panel offers ("Hours of
 * inactivity before a world load is treated as a new session", 1–48) decides
 * only whether the world load posts the "Previously On" recap
 * (index.js isNewSessionStart). Whether the load starts a new session is
 * src/session/lifecycle.js sessionNeedsMint — the constant
 * SESSION_IDLE_HOURS (4), which no setting reaches (decisions.md, "A session
 * ends at End Session or after four idle hours").
 *
 * A GM who sets it to 12 so a long break stays one session still gets a new
 * session after 4 idle hours — the ring, the rolling summary and recent
 * oracles reset, the scene closes — and no recap card; one who sets it to 2
 * gets a "Previously On" card mid-session on a reload after 3 idle hours.
 *
 * Both failing tests assert what either option gives: the "Previously On"
 * card and the session boundary agree.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isNewSessionStart } from '../../../src/index.js';
import { sessionNeedsMint } from '../../../src/session/lifecycle.js';

const MODULE_ID = 'starforged-companion';
const hoursAgo = (h) => new Date(Date.now() - h * 3_600_000).toISOString();
const state = (idleHours) => ({ currentSessionId: 'sess-7', sessionNumber: 7, lastSessionTimestamp: hoursAgo(idleHours) });

beforeEach(() => { game.settings._store.clear(); });

describe('NARR-D3 (decision) — the Session gap setting and the session boundary', () => {
  it('set to 12 hours, a reload after 5 idle hours: the recap and the session boundary agree', () => {
    game.settings._store.set(`${MODULE_ID}.sessionGapHours`, 12);
    const cs = state(5);
    expect(sessionNeedsMint(cs)).toBe(true);                    // control: minted at 4 h regardless of the setting
    expect(isNewSessionStart(cs)).toBe(sessionNeedsMint(cs));   // today: no "Previously On" card (false) for the new session (true)
  });

  it('set to 2 hours, a reload after 3 idle hours: the recap and the session boundary agree', () => {
    game.settings._store.set(`${MODULE_ID}.sessionGapHours`, 2);
    const cs = state(3);
    expect(isNewSessionStart(cs)).toBe(sessionNeedsMint(cs));   // today: a "Previously On" card (true) in the same session (false)
  });

  it('control: at the default (4 hours) the two agree on an idle gap', () => {
    game.settings._store.set(`${MODULE_ID}.sessionGapHours`, 4);
    expect(isNewSessionStart(state(5))).toBe(true);
    expect(sessionNeedsMint(state(5))).toBe(true);
    expect(isNewSessionStart(state(2))).toBe(false);
    expect(sessionNeedsMint(state(2))).toBe(false);
  });

  it('control: the panel says the setting decides when a world load is a new session', () => {
    const panel = readFileSync(fileURLToPath(new URL('../../../src/ui/settingsPanel.js', import.meta.url)), 'utf8');
    expect(panel).toMatch(/Hours of inactivity before a world load is treated as a new session/);
  });
});
