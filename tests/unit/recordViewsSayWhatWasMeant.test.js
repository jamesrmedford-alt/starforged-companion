/**
 * STARFORGED COMPANION
 * tests/unit/recordViewsSayWhatWasMeant.test.js
 *
 * Known-issues RECORD-VIEW-SMALLER — three smaller defects in the session
 * record's views, from the long haul's fourth live run (issue #383,
 * `explorations/long-haul-live-20261124-213912/`) and its free rehearsal:
 *
 *   (a) a card's option id printed as the choice — "chose “enum”", "chose
 *       “any”", "chose “fray”" on the Session Log pages and in the recap's and
 *       the summary's sources (10, 8 and 9 prompts): gmRelay.js recordChoice
 *       recorded the press's own pick key. A choice is recorded by the words
 *       of the button pressed, read off its card as it was pressed.
 *   (b) a scene labelled where it ended: session 2's opening, in the cockpit,
 *       was filed under "A new scene — Bleakhold Station docking ring" — read.js
 *       gave the scene each frame's Where in turn. A scene is labelled where it
 *       began, and a move of place within it is a line of its own.
 *   (c) a summary citing question beats as facts — a87 cited [3], [4] and [31]
 *       ("Asked the narrator…") for what happened. A question is listed for
 *       what it is, with no number: never a beat a sentence can cite.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/moves/sufferCard.js', async (importOriginal) => ({
  ...(await importOriginal()),
  // The pick applied as the real handler does it: the card resolved — written over — first.
  applySufferPickFromRelay: vi.fn(async (payload) => {
    const card = globalThis.game.messages.get(payload.messageId);
    if (card) card.content = '<div class="sf-card sf-suffer-choice-card sf-suffer-resolved"><div class="sf-card-header">◈ Consequence resolved</div></div>';
    return { applied: true };
  }),
}));
vi.mock('../../src/moves/cardActions.js', async (importOriginal) => ({
  ...(await importOriginal()),
  applyCombatThresholdChoice: vi.fn(async () => ({ applied: true })),
}));

import { runGmAction } from '../../src/multiplayer/gmRelay.js';
import { renderSufferCard } from '../../src/moves/sufferCard.js';
import { buildCombatThresholdHtml } from '../../src/moves/combatThreshold.js';
import { recordSettled, _resetRecordForTests } from '../../src/record/record.js';
import { readRecord } from '../../src/record/read.js';
import { renderSessionLogBody } from '../../src/record/sessionLogView.js';
import { summarySource, SESSION_SUMMARY_SYSTEM_PROMPT } from '../../src/record/summaryView.js';
import { citedRecap } from '../../src/record/recapView.js';
import { JOURNAL_NAMES } from '../../src/world/worldJournal.js';
import { installJournalMock } from '../helpers/fullStateFixture.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const SESSION = 'sess-2';

// ─────────────────────────────────────────────────────────────────────────────
// (a) a choice is the words of the button pressed
// ─────────────────────────────────────────────────────────────────────────────

describe('(a) a card\'s choice is recorded by the words of the button pressed, not its option id', () => {
  let journals;
  const cards = new Map();
  const stored = () => Object.values(journals.journals.get(JOURNAL_NAMES.sessionLog)?.pages.contents
    .find(p => p.flags?.[MODULE_ID]?.sessionLogPage?.sessionId === SESSION)?.flags?.[MODULE_ID]?.sessionRecord?.events ?? {})
    .sort((a, b) => a.seq - b.seq);
  const choices = () => stored().filter(e => e.k === 'choice').map(e => e.d);

  beforeEach(() => {
    journals = installJournalMock();
    _resetRecordForTests();
    cards.clear();
    game.user = { isGM: true, id: 'test-user-gm' };
    game.users._set([{ id: 'test-user-gm', isGM: true, active: true }, { id: 'pl-1', isGM: false, active: true }]);
    game.messages = { contents: [], get: (id) => cards.get(id) ?? null };
    game.settings._store.set(KEY, { currentSessionId: SESSION, sessionNumber: 2, currentSceneId: 'sc-1', sceneTruths: [], clocks: [] });
  });
  afterEach(() => {
    journals.restore();
    game.settings._store.delete(KEY);
    delete game.messages;
  });

  /** The run's a25–a27 and a40: Undertake an Expedition's weak hit, its suffer card, Begin the fight. */
  it('the run\'s presses: "One suffer move (-2)", "Endure Stress (-2)", "Begin the fight" — never "enum", "any", "fray"', async () => {
    const weak = { kind: 'enumerated', options: [
      { label: 'One suffer move (-2)',       kind: 'any', amount: 2, count: 1 },
      { label: 'Two suffer moves (-1 each)', kind: 'any', amount: 1, count: 2 },
      { label: 'Peril at the waypoint',      complication: true, scope: 'waypoint' },
    ] };
    cards.set('card-enum', { id: 'card-enum', content: renderSufferCard(weak, null), flags: { [MODULE_ID]: { sufferCard: true, resolutionId: 'res-25' } } });
    cards.set('card-any', { id: 'card-any', content: renderSufferCard({ kind: 'any', amount: 2, count: 1 }, null), flags: { [MODULE_ID]: { sufferCard: true } } });
    cards.set('card-fray', { id: 'card-fray', content: buildCombatThresholdHtml({ label: 'The Ashen Wake', suggestedRank: 'dangerous' }),
      flags: { [MODULE_ID]: { combatThresholdCard: true, resolutionId: 'res-38' } } });

    await runGmAction('suffer.pick', { messageId: 'card-enum', pickKind: 'enum', sufferId: null, optionIndex: '0', trackId: null }, { requesterId: 'pl-1' });
    await runGmAction('suffer.pick', { messageId: 'card-any', pickKind: 'any', sufferId: 'endure_stress', optionIndex: null, trackId: null }, { requesterId: 'pl-1' });
    await runGmAction('combat.threshold', { messageId: 'card-fray', choice: 'fray', rank: 'dangerous', vowName: '', objective: '' }, { requesterId: 'pl-1' });
    await new Promise(r => setTimeout(r, 0));
    await recordSettled();

    expect(choices()).toEqual([
      { action: 'suffer.pick', picked: 'One suffer move (-2)' },
      { action: 'suffer.pick', picked: 'Endure Stress (-2)' },
      { action: 'combat.threshold', picked: 'Begin the fight' },
    ]);
    // The beat that read "chose “enum”" now says what was chosen.
    const [session] = readRecord({ session: SESSION }).sessions;
    expect(renderSessionLogBody(session)).toContain('chose “One suffer move (-2)”');
    expect(JSON.stringify(stored())).not.toMatch(/"picked":"(?:enum|any|fray)"/);
  });

  it('a press its card does not show — the card gone, or no button it names — records no option id as a choice', async () => {
    await runGmAction('suffer.pick', { messageId: 'card-gone', pickKind: 'enum', optionIndex: '1' }, { requesterId: 'pl-1' });
    await new Promise(r => setTimeout(r, 0));
    await recordSettled();
    expect(choices()).toEqual([{ action: 'suffer.pick', picked: null }]);
    const [session] = readRecord({ session: SESSION }).sessions;
    expect(renderSessionLogBody(session)).not.toMatch(/chose/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// (b) a scene is labelled where it began; a move of place is its own line
// ─────────────────────────────────────────────────────────────────────────────

let n = 0;
const ev = (k, { who = {}, ref = {}, d = {}, text, scene = 'sc-2' } = {}) => {
  n += 1;
  return { id: `e${String(n).padStart(3, '0')}`, k, at: n * 1000, seq: n, s: SESSION, scene,
    who: { user: who.user ?? null, actor: who.actor ?? null }, ref, d, ...(text !== undefined ? { text } : {}) };
};
const page = (events) => ({
  pageId: `p-${SESSION}`, sessionId: SESSION, number: 2, name: 'Session 2', createdAt: 2, story: '',
  record: { v: 1, sessionId: SESSION, seq: events.length, events: Object.fromEntries(events.map(e => [e.id, e])) },
});
const read = (events) => readRecord({ session: SESSION }, {
  pages: [page(events)], currentSessionId: SESSION, nameOf: (id) => (id === 'pc-mira' ? 'Mira Kestrel' : null), otherNames: ['Mira Kestrel'],
});
const MIRA = { user: 'pl-1', actor: 'pc-mira' };

describe('(b) a scene is labelled where it began, and a move of place within it is a line of its own', () => {
  /** Session 2's opening scene: the cockpit, then docked at Bleakhold Station's ring. */
  const events = () => [
    ev('session.begun', { d: { number: 2 }, scene: null }),
    ev('scene.started', { d: { sceneId: 'sc-2', reason: 'narration' } }),
    ev('frame', { ref: { nar: 'n-open' }, d: { location: 'Kobayashi IV, cockpit', present: ['Mira Kestrel'], situation: 'Mira studies the dock-fee slip' } }),
    ev('narration', { ref: { nar: 'n-open', card: 'c-open' }, d: { mode: 'vignette_open' }, text: 'Mira has taken the one chair.' }),
    ev('line', { who: MIRA, ref: { line: 'm1' }, d: { via: 'typed' }, text: 'I go over the dock-fee slip once more.' }),
    ev('narration', { who: MIRA, ref: { nar: 'n-1' }, d: { mode: 'paced', actorId: 'pc-mira' }, text: 'The slip says what it said.' }),
    ev('line', { who: MIRA, ref: { line: 'm2' }, d: { via: 'typed' }, text: 'I set a course for Bleakhold Station.' }),
    ev('move.resolved', { who: MIRA, ref: { res: 'res-2' }, d: { moveId: 'set_a_course', moveName: 'Set a Course', statUsed: 'supply', outcome: 'weak_hit' } }),
    ev('frame', { ref: { nar: 'n-2' }, d: { location: 'Bleakhold Station docking ring', present: ['Mira Kestrel'], situation: 'Docked' } }),
    ev('narration', { who: MIRA, ref: { nar: 'n-2', res: 'res-2' }, d: { mode: 'move', actorId: 'pc-mira' }, text: 'The station takes hold of her with a hard clunk.' }),
    ev('line', { who: MIRA, ref: { line: 'm3' }, d: { via: 'typed' }, text: 'I look for the dockmaster\'s runner.' }),
    ev('narration', { who: MIRA, ref: { nar: 'n-3' }, d: { mode: 'paced', actorId: 'pc-mira' }, text: 'He is already at the lock.' }),
  ];

  it('the read keeps the scene where it began', () => {
    const [session] = read(events()).sessions;
    expect(session.scenes).toHaveLength(1);
    expect(session.scenes[0].where.location).toBe('Kobayashi IV, cockpit');
  });

  it('the page: "A new scene — Kobayashi IV, cockpit", then "The scene moves — Bleakhold Station docking ring" before the beat set there', () => {
    const [session] = read(events()).sessions;
    const body = renderSessionLogBody(session);
    const opened = body.indexOf('<li><em>A new scene — Kobayashi IV, cockpit.</em></li>');
    const moved  = body.indexOf('<li><em>The scene moves — Bleakhold Station docking ring.</em></li>');
    expect(opened).toBeGreaterThan(-1);
    expect(moved).toBeGreaterThan(opened);
    expect(body).not.toContain('A new scene — Bleakhold Station docking ring');
    // The move of place comes after the move that made it, before the beat set there.
    expect(body.indexOf('Set a Course')).toBeLessThan(moved);
    expect(body.indexOf('look for the dockmaster')).toBeGreaterThan(moved);
    expect(body.match(/The scene moves/g)).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// (c) a question is not a beat the summary may cite
// ─────────────────────────────────────────────────────────────────────────────

describe('(c) a question asked of the narrator is listed for what it is — no beat number a summary can cite', () => {
  const events = () => [
    ev('session.begun', { d: { number: 3 }, scene: null }),
    ev('line', { who: MIRA, ref: { line: 'm1' }, d: { via: 'typed' }, text: 'I leave the cargo manifest with Tamsin for safekeeping.' }),
    ev('narration', { who: MIRA, ref: { nar: 'n-1' }, d: { mode: 'paced', actorId: 'pc-mira' }, text: 'Tamsin slides it under her ledger.' }),
    // a87's [3]: "Whose hands is the manifest in these days?"
    ev('question', { who: MIRA, ref: { nar: 'n-q', card: 'c-q' }, text: 'Whose hands is the manifest in these days?' }),
    ev('narration', { who: MIRA, ref: { nar: 'n-q', card: 'c-q' }, d: { mode: 'scene_answer' }, text: 'Tamsin Vey holds your cargo manifest.' }),
  ];

  it('the source numbers the beats alone; the question is listed with its answer, unnumbered, and is no id a sentence may cite', () => {
    const [session] = read(events()).sessions;
    const source = summarySource(session);
    expect(source.ids).toEqual(['1']);
    expect(source.text).toMatch(/## THE SESSION \(oldest first\)\n\n\[1\] Mira Kestrel — the player wrote “I leave the cargo manifest/);
    const questions = source.text.slice(source.text.indexOf('## QUESTIONS'));
    expect(questions).toContain('- Mira Kestrel asked the narrator “Whose hands is the manifest in these days?”');
    expect(questions).toContain('ANSWERED: “Tamsin Vey holds your cargo manifest.”');
    expect(questions).not.toMatch(/\[\d+\]/);
  });

  it('a sentence that rests on a question alone is not kept; one citing a beat beside it keeps the beat', () => {
    const [session] = read(events()).sessions;
    const source = summarySource(session);
    const reply = JSON.stringify([
      { text: 'Tamsin Vey holds the manifest.', because: ['2'] },
      { text: 'Mira left her cargo manifest with Tamsin for safekeeping.', because: ['1', '2'] },
    ]);
    const kept = citedRecap(reply, { ids: source.ids });
    const sentences = (kept?.paragraphs ?? []).flat().map(s => s.text);
    expect(sentences).toEqual(['Mira left her cargo manifest with Tamsin for safekeeping.']);
  });

  it('the rule says so', () => {
    expect(SESSION_SUMMARY_SYSTEM_PROMPT).toMatch(/QUESTIONS are no beats: never cite one/);
  });

  it('a session of questions alone has nothing to summarise', () => {
    const [session] = read([
      ev('session.begun', { d: { number: 4 }, scene: null }),
      ev('question', { who: MIRA, ref: { nar: 'n-q2', card: 'c-q2' }, text: 'Where is my ship berthed?' }),
      ev('narration', { who: MIRA, ref: { nar: 'n-q2', card: 'c-q2' }, d: { mode: 'scene_answer' }, text: 'At Bleakhold Station.' }),
    ]).sessions;
    expect(summarySource(session)).toMatchObject({ ids: [], empty: true });
  });
});
