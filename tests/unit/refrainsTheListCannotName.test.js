/**
 * STARFORGED COMPANION
 * tests/unit/refrainsTheListCannotName.test.js
 *
 * THE-REFRAINS-THE-LIST-CANNOT-NAME (the long haul's eighth live round,
 * 2026-11-26, explorations/long-haul-live-20261126-184225/): DETAILS ALREADY
 * WORN brought the refrain count from 39 to 25, and what was left it could
 * not reach —
 *   - a line said twice: a92 gave Tamsin a84's "Then you're in it as deep as
 *     I am", word for word — now NOT SO [quote], a certain check;
 *   - the list's own noise: filler ("you're", "decided", "stops"), names the
 *     record does not hold ("ashen wake", "cinder wren", set by `!truth
 *     set`), the scene's own actors — now left out;
 *   - a three-letter prop: Tamsin's pen, in 14 of session 3's 27 narrations,
 *     which the scorecard's refrain table never counted — now counted apart;
 *   - and a71's "Momentum drains out of you" — a meter named as the game
 *     names it — now an [apparatus] breach.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { quotedLinesOf, linesAlreadySaid, wornDetails } from '../../src/narration/proseVariety.js';
import { obligationsFor } from '../../src/moves/contracts/obligations.js';
import { certainViolations } from '../../src/moves/contracts/checks.js';
import { refrainsOf } from '../../test/ci/playwright/lib/review.mjs';

const FOLDER = path.resolve(__dirname, '../../test/ci/playwright/explorations/long-haul-live-20261126-184225');
const RUN = JSON.parse(fs.readFileSync(path.join(FOLDER, 'replay.json'), 'utf8'));
const prose = (step) => RUN.recording.exchanges.filter(x => x.step === step && /narratePacedInput|narrateResolution/.test(x.kind))
  .map(x => x.response.content.map(c => c.text ?? '').join('').split('```')[0].trim()).join('\n');
const tags = (text, lines) => certainViolations(text, lines).map(v => v.tag);

describe('[quote] — a line of speech is not said again, word for word', () => {
  it('a92 says a84\'s line again, and the session\'s lines hold it', () => {
    const line = 'then you\'re in it as deep as i am';
    expect(quotedLinesOf(prose('a84'))).toContain(line);
    expect(quotedLinesOf(prose('a92'))).toContain(line);
    const said = linesAlreadySaid(['a71', 'a74', 'a75', 'a76', 'a77', 'a80', 'a82', 'a84'].map(prose));
    expect(said).toContain(line);
    const lines = obligationsFor({ mode: 'move', resolution: { moveId: 'develop_your_relationship', outcome: 'strong_hit' }, quotes: said });
    expect(lines.find(l => l.kind === 'quote')).toMatchObject({ list: 'NOT SO' });
    expect(tags(prose('a92'), lines)).toContain('quote');
    // Control: a85, between them, says nothing said before.
    expect(tags(prose('a85'), lines)).not.toContain('quote');
  });

  it('a short line is no repeat, nor one the player\'s own line holds, nor the fact block\'s', () => {
    expect(quotedLinesOf('"Close enough," the stranger says. "Not here. Not yet."')).toEqual([]);
    const said = linesAlreadySaid(['"Before the next tide of cargo, you said," Tamsin reminds you.'],
      { line: 'I promise Tamsin I\'ll be back before the next tide of cargo, you said.' });
    expect(said).toEqual([]);
    expect(quotedLinesOf('You wait.\n```json\n{ "newTruths": [{ "subject": "Tamsin", "fact": "wrote the name on a fresh line beside hers" }] }\n```')).toEqual([]);
  });

  it('given on the beats of play, and only with lines to hold', () => {
    expect(obligationsFor({ mode: 'paced', quotes: ['a line of speech said before once'] }).map(l => l.kind)).toContain('quote');
    expect(obligationsFor({ mode: 'paced' }).map(l => l.kind)).not.toContain('quote');
  });
});

describe('the worn list leaves out names, filler and the scene\'s actors', () => {
  it('round 8\'s session 3 before a91: no "cinder wren", no "you\'re" or "stops"', () => {
    const before = ['a84', 'a85', 'a86', 'a87', 'a88'].map(prose);
    const worn = wornDetails(before, {});
    expect(worn.some(w => /cinder|wren/.test(w))).toBe(false);
    expect(worn).not.toContain('you\'re');
    expect(worn).not.toContain('stops');
  });

  it('the scene\'s actors, kept, are not listed', () => {
    const texts = ['The stowaway coughs behind you.', 'The stowaway swears at the seam.', 'Behind you, the stowaway laughs.'];
    expect(wornDetails(texts, {})).toContain('stowaway');
    expect(wornDetails(texts, { keep: ['the stowaway'] })).not.toContain('stowaway');
  });
});

describe('[apparatus] — a meter named as the game names it', () => {
  it('a71\'s "and Momentum drains out of you" is caught; a sentence that opens on the word is not', () => {
    const lines = obligationsFor({ mode: 'paced' });
    expect(prose('a71')).toContain('Momentum drains out of you');
    expect(tags(prose('a71'), lines)).toContain('apparatus');
    expect(tags('Momentum carries the hulk past the berth. You watch it go.', lines)).toEqual([]);
  });
});

describe('the scorecard counts three-letter words apart', () => {
  it('Tamsin\'s pen in session 3 of round 8 — and the series above is the one every round was measured by', () => {
    const messages = [];
    const T = fs.readFileSync(path.join(FOLDER, 'transcript.md'), 'utf8');
    for (const block of T.split(/\n---\n/)) {
      const head = /\*(a\d+) · (session-\d+)\*/.exec(block);
      if (!head) continue;
      // The player's line first: an @scene question sets its answer apart (review.mjs sceneAnswerTest).
      for (const m of block.matchAll(/\*\*PLAYER — Playthrough Player\*\*\n\n([^\n]+)/g)) messages.push({ step: head[1], phase: head[2], fromPlayer: true, text: m[1] });
      for (const m of block.matchAll(/\*\*NARRATOR — Gamemaster\*\*\n\n([^\n]+)/g)) messages.push({ step: head[1], phase: head[2], narrator: true, vignette: null, text: m[1] });
    }
    const s3 = refrainsOf(messages).sessions.find(x => x.phase === 'session-3');
    // About the run's own 27 narrations of play (the transcript, read here, is near enough).
    expect(s3.narrations).toBeGreaterThanOrEqual(25);
    expect(s3.short.find(r => r.what === 'pen')).toMatchObject({ of: s3.narrations });
    expect(s3.short.find(r => r.what === 'pen').in).toBeGreaterThanOrEqual(9);
    expect(s3.refrains.words.find(r => r.what === 'pen')).toBeUndefined();
  });
});
