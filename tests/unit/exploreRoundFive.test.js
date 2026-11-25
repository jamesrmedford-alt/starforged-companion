/**
 * STARFORGED COMPANION
 * tests/unit/exploreRoundFive.test.js
 *
 * What the long haul's fifth live run (2026-11-25,
 * explorations/long-haul-live-20261125-164201/) — the first on the one reader,
 * moves as contracts and overhaul 2's scenes and provenance — found wrong with
 * the checks, each mended and held here by the run's own words:
 *
 *   1. F4 scored "lost" at all three of its questions. The player promised to
 *      be back "before the next tide of cargo" (a15); the narration answered
 *      "Before the next cargo," and filed the player's line as "promised Tamsin
 *      Vey she would be back before the next cargo arrives", and every later
 *      answer gave that (a23, a52, a87). The same promise and the same
 *      deadline: the charter knew only the words with "tide" in them. "next
 *      cargo" is one of F4's words now.
 *   2. F7 scored "refused" on "The table renamed her from "Tamsin Vey," so
 *      Okoro is the surname the story holds." (a55) — an answer that tells the
 *      rename, not one that uses the old name as if it stood. A refusal with
 *      `former` is not raised by a sentence that holds the fact and gives the
 *      word as what it was before (lib/ledger.mjs FORMER_MARK). F6's
 *      correction has no `former`: a corrected value was never true.
 *   3. The scorecard's Plain lines row counted beat 22's own first line, "I
 *      rest aboard until the next morning." — the night-pass line the beat
 *      asks for in those words — as a recovery that went unread, and a58's "I
 *      Hearten myself with a quiet hour in the galley." as a miss, though the
 *      line reader said "Hearten cannot be made now: Mira's spirit is full and
 *      she is not shaken, so there is nothing to recover" and her sheet bore
 *      it out. Beat 22 now gives its night-pass line as `setupWords`, which
 *      want no move (`setupLines` would also have exempted the first line of
 *      the kept runs' beat 22, which was a real recovery), and a line-reader reading of
 *      nothing to recover is read right where the sheet it was shown holds
 *      the meter full (lib/review.mjs freeformOf, nothingToRecoverOf).
 *
 * Re-scored with both, the run's ledger is 4 recalled, 3 carried unasked, 0
 * lost, 0 refused, 1 not probed: every counted question recalled (7 of 7).
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { factIn } from '../../test/ci/playwright/lib/observer.mjs';
import { FORMER_MARK, refusalsIn, scoreLedger } from '../../test/ci/playwright/lib/ledger.mjs';
import { freeformOf } from '../../test/ci/playwright/lib/review.mjs';

const PLAYWRIGHT = path.resolve(__dirname, '../../test/ci/playwright');
const CHARTER = JSON.parse(fs.readFileSync(path.join(PLAYWRIGHT, 'charters/long-haul.json'), 'utf8'));
const fact = (id) => CHARTER.facts.find(f => f.id === id);

// The run's own lines and answers (its replay's recorded replies, prose only).
const PLANTED   = 'I promise Tamsin I\'ll be back before the next tide of cargo.';
const ECHO      = '"Before the next cargo," she says. "Everyone on these docks promises that, and then the water runs short."';
const FILED     = 'promised Tamsin Vey she would be back before the next cargo arrives';
const ANSWER_A  = '"Before the next cargo arrives," Tamsin says, not looking up from the ledger. "That\'s what you told me, and I wrote it down."';
const ANSWER_B  = 'You promised Tamsin Okoro you would be back at the Hollow Spire docks before the next cargo arrives. The story has not fixed that to a date or hour, so there is no more exact deadline.';
const ANSWER_C  = 'You promised Tamsin you would be back before the next cargo arrives. The story has not given that a date or an hour.';
const RENAME_TOLD = 'Her name is Tamsin Okoro. The table renamed her from "Tamsin Vey," so Okoro is the surname the story holds.';

describe('F4: the promise kept in the record\'s words — "before the next cargo arrives"', () => {
  const F4 = fact('F4');

  it('holds the player\'s line, the narration\'s echo, the truth it filed and the three answers', () => {
    for (const text of [PLANTED, ECHO, FILED, ANSWER_A, ANSWER_B, ANSWER_C]) expect(factIn(text, F4), text).toBe(true);
    expect(F4.variants).toEqual(['tide of cargo', 'next tide', 'cargo tide', 'next cargo']);
  });

  it('control: an answer that gives no deadline holds nothing, and "no more exact deadline" denies no promise', () => {
    expect(factIn('The story has not given that a date or an hour.', F4)).toBe(false);
    expect(factIn('You promised to come back to the docks.', F4)).toBe(false);
    expect(refusalsIn(ANSWER_B, F4)).toEqual([]);
    expect(refusalsIn('You made no promise to Tamsin about the next cargo.', F4).map(r => r.refusal)).toEqual(['the promise denied']);
  });

  // The run's three questions, one a session as the charter asks them, each answered as the run answered it.
  const line = (step, phase, text) => ({ step, phase, text, fromPlayer: true, narrator: false, vignette: null });
  const said = (step, phase, text) => ({ step, phase, text, fromPlayer: false, narrator: true, vignette: null });
  const messages = [
    line('a15', 'session-1', PLANTED), said('a15', 'session-1', ECHO),
    line('a23', 'session-2', 'By when did I promise to return?'), said('a23', 'session-2', ANSWER_A),
    line('a52', 'session-3', '@scene What deadline did I give for coming home to the docks?'), said('a52', 'session-3', ANSWER_B),
    line('a87', 'session-3', '@scene On what schedule did I swear to come back to her?'), said('a87', 'session-3', ANSWER_C),
  ];
  const marks = ['a15', 'a23', 'a52', 'a87'].map((step, i) => ({ step, phase: messages[i * 2].phase, stores: {}, helpers: {} }));
  const score = (f) => scoreLedger({ facts: [f], marks, messages, requests: [], probeSteps: { A: ['a23'], B: ['a52'], C: ['a87'] } }).facts[0];

  it('is recalled: its questions answered with the fact, the third after the second had restated it', () => {
    const scored = score(F4);
    expect(scored).toMatchObject({ verdict: 'recalled', plantedAt: 'a15', lostAt: [], refusals: [] });
    expect(scored.probes.map(p => [p.id, p.inAnswer, p.counted])).toEqual([['F4-A', true, true], ['F4-B', true, true], ['F4-C', true, false]]);
  });

  it('control: with the words the run was scored by, the same answers lose it — the run\'s alarm', () => {
    const scored = score({ ...F4, variants: ['tide of cargo', 'next tide', 'cargo tide'] });
    expect(scored).toMatchObject({ verdict: 'lost', lostAt: ['F4-A', 'F4-B', 'F4-C'] });
  });
});

describe('F7: an answer that tells the rename does not use the old name as if it stood', () => {
  const F7 = fact('F7');

  it('the run\'s a55 answer raises no refusal; its words are the rename told', () => {
    expect(F7.refusals[0]).toMatchObject({ id: 'the old name used as if current', anywhere: ['Tamsin Vey', 'Vey'], former: true });
    expect(FORMER_MARK.test('The table renamed her from "Tamsin Vey," so Okoro is the surname the story holds.')).toBe(true);
    expect(refusalsIn(RENAME_TOLD, F7)).toEqual([]);
    for (const told of ['Tamsin Okoro, formerly Tamsin Vey, keeps the ledger.', 'She no longer goes by Vey; she is Tamsin Okoro.', 'Her name is now Tamsin Okoro instead of Tamsin Vey.']) {
      expect(refusalsIn(told, F7), told).toEqual([]);
    }
  });

  it('control: the old name used as hers still refuses — alone, with the new name in another sentence, or "formerly" with no new name', () => {
    expect(refusalsIn('Her name is Tamsin Vey.', F7).map(r => r.word)).toEqual(['Tamsin Vey']);
    expect(refusalsIn('Tamsin Okoro is your friend. Vey keeps the ledger at the stall.', F7).map(r => r.word)).toEqual(['Vey']);
    expect(refusalsIn('Tamsin Okoro waves you over, and Tamsin Vey pours the tea.', F7).map(r => r.word)).toEqual(['Tamsin Vey']);
    expect(refusalsIn('She was formerly Tamsin Vey.', F7).map(r => r.word)).toEqual(['Tamsin Vey']);
  });

  it('control: a refusal without `former` — F6\'s corrected name — refuses the old value however it is told', () => {
    const F6 = fact('F6');
    expect(F6.refusals.some(r => r.former)).toBe(false);
    const strict = { ...F7, refusals: F7.refusals.map(({ former: _f, ...r }) => r) };
    expect(refusalsIn(RENAME_TOLD, strict).map(r => r.word)).toEqual(['Tamsin Vey']);
  });

  it('is scored without a refusal from the run\'s two questions', () => {
    const line = (step, text) => ({ step, phase: 'session-3', text, fromPlayer: true, narrator: false, vignette: null });
    const said = (step, text) => ({ step, phase: 'session-3', text, fromPlayer: false, narrator: true, vignette: null });
    const messages = [
      line('a55', '@scene What surname does my broker friend go by these days?'), said('a55', RENAME_TOLD),
      line('a90', '@scene What is my bonded friend\'s full name now?'), said('a90', 'Your bonded friend is Tamsin Okoro, the salvage broker whose ledger stall is on the Hollow Spire docks.'),
    ];
    const marks = [{ step: 'x19', phase: 'session-2', stores: {}, helpers: {} }, { step: 'a55', phase: 'session-3', stores: {}, helpers: {} }, { step: 'a90', phase: 'session-3', stores: {}, helpers: {} }];
    const scored = scoreLedger({ facts: [F7], marks, messages: [{ step: 'x19', phase: 'session-2', text: 'renamed', fromPlayer: false, narrator: false, vignette: null }, ...messages], requests: [], planted: { F7: 'x19' }, probeSteps: { B: ['a55'], C: ['a90'] } }).facts[0];
    expect(scored.refusals).toEqual([]);
    expect(scored.probes.map(p => [p.id, p.inAnswer, p.refused])).toEqual([['F7-B', true, false], ['F7-C', true, false]]);
    expect(scored.verdict).toBe('recalled');
  });
});

describe('beat 22: the night-pass line wants no move, and the line reader\'s "nothing to recover" is read right', () => {
  const B22 = CHARTER.beats.find(b => b.n === 22);
  // The run's sheet, as the reader was shown it at a56 and a58.
  const SHEET = (spirit = 'Spirit 5 of 5 (full, not shaken)') => 'MODE — READ THE LINE: say which move it sets about, if any.\n\n'
    + 'SITUATION — Mira Kestrel\'s sheet as it stands:\n'
    + `- Meters: Health 5 of 5 (full, not wounded); ${spirit}; Supply 5 of 5 (full, not unprepared).\n`
    + '- Command vehicle: "Kobayashi IV", integrity 5 of 5 (full, not battered).\n\nPLAYER LINE\n"…"';
  const reader = (step, reason, user = SHEET()) => ({ step, kind: 'callReaderAPI>readLine', user, response: { content: [{ type: 'text', text: JSON.stringify({ move: null, category: 'downtime', confidence: 'high', reason }) }] } });
  const say = (step, text) => ({ step, phase: 'session-3', text, fromPlayer: true, narrator: false, card: [] });
  const paced = (step) => ({ step, phase: 'session-3', text: '…', fromPlayer: false, narrator: true, card: ['narratorCard', 'pacedNarrative', 'suggestedMove'], suggestedMove: null });
  const REST = 'I rest aboard until the next morning.';
  const HEARTEN = 'I Hearten myself with a quiet hour in the galley.';
  const REST_READ = 'Resting aboard meets no trigger: every meter is full and nothing is at risk, so sojourn, heal and hearten are unavailable; it is passing time, which is narration.';
  const HEARTEN_READ = 'Hearten cannot be made now: Mira\'s spirit is full and she is not shaken, so there is nothing to recover; the line is a quiet moment of narration.';
  const charter = { facts: [], baits: [], beats: [B22] };
  const beats = [{ id: B22.id, n: 22, steps: ['a56', 'a58'] }];
  const messages = [say('a56', REST), paced('a56'), say('a58', HEARTEN), paced('a58')];

  it('the charter says so: its first line is the night\'s, in the words its tell gives', () => {
    expect(B22).toMatchObject({ id: 'b21', setupWords: [REST] });
    expect(B22).not.toHaveProperty('setupLines');
    expect(B22.tell).toContain(`"${REST}"`);
  });

  it('a56 wants nothing; a58 is narrated, rightly — nothing to recover, spirit full', () => {
    const f = freeformOf({ messages, exchanges: [reader('a56', REST_READ), reader('a58', HEARTEN_READ)], beats, charter });
    const at = (step) => f.lines.find(l => l.step === step);
    expect(at('a56')).toMatchObject({ became: 'narrated', wanted: [], right: null });
    expect(at('a58')).toMatchObject({ became: 'narrated', named: ['Hearten'], nothingToRecover: ['spirit'], right: true });
    expect(f.wanted).toMatchObject({ lines: 1, narrated: 0, nothingToRecover: 1 });
  });

  it('control: a recovery line in other words is still wanted — only the tell\'s own words set up', () => {
    const other = [say('a56', 'I rest aboard and patch myself up until morning.'), paced('a56')];
    const f = freeformOf({ messages: other, exchanges: [reader('a56', REST_READ)], beats, charter });
    expect(f.lines.find(l => l.step === 'a56').wanted).toEqual(B22.wants);
  });

  it('control: the same reading with spirit spent is a miss — the sheet must bear it out', () => {
    const f = freeformOf({ messages, exchanges: [reader('a56', REST_READ), reader('a58', HEARTEN_READ, SHEET('Spirit 3 of 5 (shaken)'))], beats, charter });
    expect(f.lines.find(l => l.step === 'a58')).toMatchObject({ became: 'narrated', right: false });
    expect(f.lines.find(l => l.step === 'a58')).not.toHaveProperty('nothingToRecover');
  });
});
