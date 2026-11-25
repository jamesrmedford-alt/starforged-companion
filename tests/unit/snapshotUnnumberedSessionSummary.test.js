/**
 * STARFORGED COMPANION
 * tests/unit/snapshotUnnumberedSessionSummary.test.js
 *
 * Issue #362 AC71 SNAPSHOT-SESSION-ZERO. A GM opens the world to prepare and
 * has the narrator answer a few `@scene` questions before any Begin a
 * Session. That session was never begun, and its number passes to the next
 * one. The world snapshot's EARLIER SESSIONS read a missing number with
 * `Number(null)`, which is 0 — finite — so it printed "- Session 0: …", and
 * ranked the session as the oldest, so with three numbered sessions on the
 * Session Log the newest one was the one the snapshot's newest three left out.
 *
 * Now a missing number is no number ("An earlier session: …", as the per-beat
 * LAST SESSION block heads it with none), and the session that closed last is
 * the newest earlier session whether or not it has a number. Since issue #382
 * slice 3 the earlier sessions are read from the session record
 * (record/summaryView.js earlierSessionStories): what a session nobody began
 * played is told after LAST SESSION, as facts.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { collectWorldUnits, renderWorldSnapshot } from '../../src/narration/worldSnapshot.js';
import { buildNarratorSystemBlocks } from '../../src/narration/narratorPrompt.js';
import { installJournalMock } from '../helpers/fullStateFixture.js';
import { seedLegacySessionPage, seedSessionRecord, playedBeats } from '../helpers/sessionRecordSeed.js';
import { _resetSummaryViewForTests } from '../../src/record/summaryView.js';

const PREP_LINE = 'SENTINEL-PREP: I study the charts of the Devil\'s Maw.';

/** A world opened to prepare: its session was never begun; something was played in it. */
const prepSession = (createdAt) => seedSessionRecord('prep', playedBeats('prep', [PREP_LINE], { begun: false, number: null }), { number: null, createdAt });

const memoryOf = (cs) => collectWorldUnits(cs, {}).filter(u => u.section === 'memory');

let journals;
beforeEach(() => {
  game.settings._store.clear();
  journals = installJournalMock();
  _resetSummaryViewForTests();
});
afterEach(() => journals.restore());

describe('issue #362 AC71 — an earlier session with no number is not "Session 0" in the world snapshot', () => {
  it('control: the per-beat LAST SESSION block heads it with no number', () => {
    const { beat } = buildNarratorSystemBlocks({ currentSessionId: 's-2' }, {}, null, '', {
      mode: 'paced_narrative', previousSessionSummary: { text: PREP_LINE, sessionNumber: null, isLast: true },
    });
    expect(beat).toMatch(/^## LAST SESSION$/m);
    expect(beat).not.toMatch(/SESSION 0/i);
  });

  it('control: a begun session\'s summary keeps its number in the snapshot', async () => {
    await seedLegacySessionPage('s-2', 'The crew paid Vex.', { number: 2 });
    expect(memoryOf({ currentSessionId: 's-3' }).map(u => u.text)).toEqual(['- Session 2: The crew paid Vex.']);
  });

  it('what a session nobody began played, with nothing begun before it, is "An earlier session", not "Session 0"', async () => {
    await prepSession(Date.now() - 1000);
    const units = memoryOf({ currentSessionId: 's-next', sessionNumber: 4 });
    expect(units).toHaveLength(1);
    expect(units[0].text).toMatch(/^- An earlier session: Played between sessions, while no session was begun: /);
    expect(units[0].text).toContain(PREP_LINE);
    expect(renderWorldSnapshot(units).text).not.toMatch(/Session 0\b/);
  });

  it('a Session Log page stored with no number is not "Session 0" either', async () => {
    await seedLegacySessionPage('s-old', 'The crew found the derelict.', { number: null });
    expect(memoryOf({ currentSessionId: 's-9' }).map(u => u.text)).toEqual(['- An earlier session: The crew found the derelict.']);
  });

  it('what a session nobody began played is told with the session that closed last, among the newest three', async () => {
    await seedLegacySessionPage('s-1', 'Session one.', { number: 1, createdAt: 1000 });
    await seedLegacySessionPage('s-2', 'Session two.', { number: 2, createdAt: 2000 });
    await seedLegacySessionPage('s-3', 'Session three.', { number: 3, createdAt: 3000 });
    await prepSession(4000);
    const texts = memoryOf({ currentSessionId: 's-next', sessionNumber: 4 }).map(u => u.text);
    expect(texts).toHaveLength(3);
    const rendered = renderWorldSnapshot(memoryOf({ currentSessionId: 's-next', sessionNumber: 4 })).text;
    expect(rendered).toContain('Session three. Played between sessions, while no session was begun:');
    expect(rendered).toContain(PREP_LINE);
    expect(rendered).not.toMatch(/Session 0\b/);
    expect(rendered.indexOf('Session two.')).toBeLessThan(rendered.indexOf('Session three.'));
  });

  it('control: an unnumbered Session Log page that is not the last session still ranks below the numbered ones', async () => {
    await seedLegacySessionPage('s-a', 'An old unnumbered one.', { number: null, createdAt: 500 });
    await seedLegacySessionPage('s-1', 'Session one.', { number: 1, createdAt: 1000 });
    await seedLegacySessionPage('s-2', 'Session two.', { number: 2, createdAt: 2000 });
    await seedLegacySessionPage('s-3', 'Session three.', { number: 3, createdAt: 3000 });
    const texts = memoryOf({ currentSessionId: 's-4' }).map(u => u.text);
    expect(texts).toHaveLength(3);
    expect(texts.join('\n')).not.toContain('An old unnumbered one.');
  });
});
