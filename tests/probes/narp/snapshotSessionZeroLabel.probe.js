/**
 * NARP-05 · SNAPSHOT-SESSION-ZERO (WRONG-DETAIL)
 *
 * Scenario: a GM opens the world to prepare and has the narrator answer a
 * few `@scene` questions before any Begin a Session. That session was never
 * begun, so when the next one is minted its summary is kept as
 * `previousSessionSummary` with `sessionNumber: null` (lifecycle.js
 * mintSession: "an unbegun session's number passes to the next one, so its
 * summary carries none — LAST SESSION, not 'Session 4'"). The first narration
 * of the next session takes the world snapshot.
 *
 * Correct: the snapshot's EARLIER SESSIONS lists that summary with no session
 * number ("An earlier session: …"), as the per-beat LAST SESSION block does
 * ("## LAST SESSION", no number).
 *
 * Today: worldSnapshot.js memoryUnits reads the number with `Number(null)`,
 * which is 0 — a finite number — so the snapshot prints "- Session 0: …" (and
 * ranks the summary as the oldest session: order "000000").
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { collectWorldUnits, renderWorldSnapshot } from '../../../src/narration/worldSnapshot.js';
import { buildNarratorSystemBlocks } from '../../../src/narration/narratorPrompt.js';
import { mintSession } from '../../../src/session/lifecycle.js';

const SUMMARY = 'SENTINEL-PREP: Kira studied the charts of the Devil\'s Maw and hailed Bleakhold.';

/** A world opened to prepare: its session was never begun, has a summary, and is closed out by the next mint. */
function afterAPrepSession() {
  const cs = {
    currentSessionId: 'prep', sessionNumber: 1, sessionActive: false, sessionStartedId: null, sessionEndedId: null,
    sessionSummary: { sessionId: 'prep', text: SUMMARY }, previousSessionSummary: null,
  };
  mintSession(cs);
  return cs;
}

const memoryOf = (cs) => collectWorldUnits(cs, {}).filter(u => u.section === 'memory');

beforeEach(() => { game.settings._store.clear(); });

describe('NARP-05 — an earlier session with no number is not "Session 0" in the world snapshot', () => {
  it('control: the mint keeps an unbegun session\'s summary with no number', () => {
    const cs = afterAPrepSession();
    expect(cs.previousSessionSummary).toMatchObject({ sessionId: 'prep', sessionNumber: null, text: SUMMARY });
    expect(cs.sessionNumber).toBe(1);   // the number passed on to the session now starting
  });

  it('control: the per-beat LAST SESSION block heads it with no number', () => {
    const { beat } = buildNarratorSystemBlocks({ currentSessionId: 's-2' }, {}, null, '', {
      mode: 'paced_narrative', previousSessionSummary: { text: SUMMARY, sessionNumber: null, isLast: true },
    });
    expect(beat).toMatch(/^## LAST SESSION$/m);
    expect(beat).not.toMatch(/SESSION 0/i);
  });

  it('control: a begun session\'s summary keeps its number in the snapshot', () => {
    const units = memoryOf({ currentSessionId: 's-3', previousSessionSummary: { sessionId: 's-2', sessionNumber: 2, text: 'The crew paid Vex.' } });
    expect(units.map(u => u.text)).toEqual(['- Session 2: The crew paid Vex.']);
  });

  it('the snapshot lists the unnumbered summary without inventing "Session 0"', () => {
    const cs = afterAPrepSession();
    const units = memoryOf(cs);
    expect(units).toHaveLength(1);
    expect(units[0].text).toContain(SUMMARY);
    expect(units[0].text).not.toMatch(/Session 0\b/);
    expect(renderWorldSnapshot(units).text).not.toMatch(/Session 0\b/);
  });
});
