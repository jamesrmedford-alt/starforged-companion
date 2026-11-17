/**
 * STARFORGED COMPANION
 * tests/unit/snapshotUnnumberedSessionSummary.test.js
 *
 * Issue #362 AC71 SNAPSHOT-SESSION-ZERO. A GM opens the world to prepare and
 * has the narrator answer a few `@scene` questions before any Begin a
 * Session. That session was never begun, so when the next one is minted its
 * summary is kept as `previousSessionSummary` with `sessionNumber: null`
 * (lifecycle.js mintSession: an unbegun session's number passes to the next
 * one — LAST SESSION, not "Session 4"). The world snapshot's EARLIER SESSIONS
 * read the number with `Number(null)`, which is 0 — finite — so it printed
 * "- Session 0: …", and ranked the summary as the oldest session, so with
 * three numbered sessions on the Session Log the newest summary was the one
 * the snapshot's newest three left out.
 *
 * Now a missing number is no number ("An earlier session: …", as the per-beat
 * LAST SESSION block heads it with none), and the session that closed last is
 * the newest earlier session whether or not it has a number.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const sessionLog = vi.hoisted(() => ({ entries: [] }));
vi.mock('../../src/world/worldJournal.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    listWorldJournalEntries: (category) => (category === 'sessionLog'
      ? sessionLog.entries.map((entry, i) => ({ pageId: `log-${i}`, entry }))
      : actual.listWorldJournalEntries(category)),
  };
});

import { collectWorldUnits, renderWorldSnapshot } from '../../src/narration/worldSnapshot.js';
import { buildNarratorSystemBlocks } from '../../src/narration/narratorPrompt.js';
import { mintSession } from '../../src/session/lifecycle.js';

const SUMMARY = 'SENTINEL-PREP: Kira studied the charts of the Devil\'s Maw and hailed Bleakhold.';

/** A world opened to prepare: its session was never begun, has a summary, and is closed out by the next mint. */
function afterAPrepSession() {
  const cs = {
    currentSessionId: 'prep', sessionNumber: 4, sessionActive: false, sessionStartedId: null, sessionEndedId: null,
    sessionSummary: { sessionId: 'prep', text: SUMMARY }, previousSessionSummary: null,
  };
  mintSession(cs);
  return cs;
}

/** A Session Log page's record, as the World Journal stores it. */
const logPage = (sessionId, sessionNumber, narrative) => ({ sessionId, sessionNumber, summary: { narrative } });

const memoryOf = (cs) => collectWorldUnits(cs, {}).filter(u => u.section === 'memory');

beforeEach(() => {
  game.settings._store.clear();
  sessionLog.entries = [];
});

describe('issue #362 AC71 — an earlier session with no number is not "Session 0" in the world snapshot', () => {
  it('control: the mint keeps an unbegun session\'s summary with no number, passing its number on', () => {
    const cs = afterAPrepSession();
    expect(cs.previousSessionSummary).toMatchObject({ sessionId: 'prep', sessionNumber: null, text: SUMMARY });
    expect(cs.sessionNumber).toBe(4);
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

  it('the snapshot lists the unnumbered summary as "An earlier session", not "Session 0"', () => {
    const units = memoryOf(afterAPrepSession());
    expect(units).toHaveLength(1);
    expect(units[0].text).toBe(`- An earlier session: ${SUMMARY}`);
    expect(renderWorldSnapshot(units).text).not.toMatch(/Session 0\b/);
  });

  it('a Session Log page stored with no number is not "Session 0" either', () => {
    sessionLog.entries = [logPage('s-old', null, 'The crew found the derelict.')];
    const units = memoryOf({ currentSessionId: 's-9' });
    expect(units.map(u => u.text)).toEqual(['- An earlier session: The crew found the derelict.']);
  });

  it('the unnumbered summary of the session that closed last is among the newest three, listed after the numbered ones', () => {
    sessionLog.entries = [
      logPage('s-1', 1, 'Session one.'), logPage('s-2', 2, 'Session two.'), logPage('s-3', 3, 'Session three.'),
    ];
    const units = memoryOf(afterAPrepSession());
    expect(units.map(u => u.text).sort()).toEqual([
      `- An earlier session: ${SUMMARY}`, '- Session 2: Session two.', '- Session 3: Session three.',
    ].sort());
    const rendered = renderWorldSnapshot(units).text;
    expect(rendered).not.toContain('Session one.');
    expect(rendered.indexOf('Session three.')).toBeLessThan(rendered.indexOf(SUMMARY));
    expect(rendered.indexOf('Session two.')).toBeLessThan(rendered.indexOf('Session three.'));
  });

  it('control: an unnumbered Session Log page that is not the last session still ranks below the numbered ones', () => {
    sessionLog.entries = [
      logPage('s-a', null, 'An old unnumbered one.'), logPage('s-1', 1, 'Session one.'),
      logPage('s-2', 2, 'Session two.'), logPage('s-3', 3, 'Session three.'),
    ];
    const texts = memoryOf({ currentSessionId: 's-4' }).map(u => u.text);
    expect(texts).toHaveLength(3);
    expect(texts.join('\n')).not.toContain('An old unnumbered one.');
  });
});
