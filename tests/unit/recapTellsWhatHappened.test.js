/**
 * STARFORGED COMPANION
 * tests/unit/recapTellsWhatHappened.test.js
 *
 * Known-issues RECAP-TELLS-THE-DICE — the long haul's fourth live run
 * (issue #383, `explorations/long-haul-live-20261124-213912/`): its four
 * recaps, the first written from the session record, held 2 unsupported
 * sentences of 64 (run 3: 14) — and 13 of the 64 named an outcome ("it
 * landed as a weak hit", a18; "Your search near the wreck missed", a52; "on a
 * miss", a76; "again a weak hit", "landed a strong hit", a87), and about a
 * dozen read a sheet's numbers aloud. The record's lines give each move's
 * outcome ("Gather Information (+wits), weak hit — Momentum 4 → 5"), and the
 * recap's rule — "Every sentence restates what a line it cites states" — had
 * no word against saying it as the dice say it, where the move narration's
 * role has one (NARRATION-NAMES-THE-OUTCOME, which held in the same run).
 *
 * The recap's role now has that rule, worded for a recap: what happened,
 * never the dice or a sheet's numbers; and its user message ends on it. To be
 * measured by the next live run (baseline: 13 of 64 sentences with an outcome
 * word, about 12 with a number). The record's own lines keep the outcome —
 * the Session Log page shows it, and the recap's sentences still cite them.
 */

import { describe, it, expect } from 'vitest';
import { buildNarratorSystemPrompt, buildCampaignRecapUserMessage } from '../../src/narration/narratorPrompt.js';
import { citedRecap } from '../../src/record/recapView.js';

const STATE = { currentSessionId: 's-2', sessionNumber: 2 };
const recapPrompt = () => buildNarratorSystemPrompt(STATE, {}, null, '', { mode: 'campaign_recap' });

// a18's source, as the recap was given it: the record's lines, outcomes and numbers in them.
const SOURCE = {
  text: '## THE RECORD\n\n### Session 1 — the latest session, in full\n\n' +
    '[s1-22] Mira Kestrel — the player wrote “I step off from her stall and ask the dockhands and haulers along the Spire who saw the raiders last.” — Gather Information (+wits), weak hit — Momentum 4 → 5\n\n' +
    '## WHERE THINGS STAND — read from the sheets and tracks as play stopped\n\n[now-1] Mira Kestrel — health 5, spirit 5, supply 5, momentum 6.',
  ids: ['s1-22', 'now-1'],
  lasting: [],
};

describe('the campaign recap tells what happened, not the dice or the numbers (RECAP-TELLS-THE-DICE)', () => {
  it('its role names the outcome words and a sheet\'s numbers as the table\'s, never the recap\'s', () => {
    const prompt = recapPrompt();
    expect(prompt).toMatch(/Tell what happened, not the dice or the numbers\./);
    expect(prompt).toMatch(/"strong hit", "weak hit", "miss" and "match" are the table's words, never the recap's/);
    expect(prompt).toMatch(/"it landed as a weak hit", "on a miss"/);
    expect(prompt).toMatch(/Nor is a number from a sheet or a track/);
    // A rank is a track's, not a word for whoever the track is about ("rated dangerous").
    expect(prompt).toMatch(/A rank — troublesome, dangerous, formidable, extreme, epic — is how hard a vow, a tie or a fight is/);
  });

  it('its user message ends on it, after what a recap covers', () => {
    const msg = buildCampaignRecapUserMessage(SOURCE);
    expect(msg).toMatch(/what came of each line — never its outcome's word or a number from a sheet/);
    expect(msg.indexOf('never its outcome\'s word')).toBeGreaterThan(msg.indexOf('Write a campaign recap'));
  });

  it('the citations still work: a reply cites the record\'s lines as before', () => {
    const reply = JSON.stringify({ paragraphs: [[
      { text: 'You asked the dockhands who had seen the raiders, and learned something, though not cleanly.', because: ['s1-22'] },
      { text: 'You are hale, and your nerve is high.', because: ['now-1'] },
    ]] });
    const kept = citedRecap(reply, SOURCE);
    expect(kept).toMatchObject({ ok: true, dropped: 0 });
    expect(kept.paragraphs.flat().map(s => s.because)).toEqual([['s1-22'], ['now-1']]);
  });

  it('control: the move narration keeps its own rule, and a prose mode is not given the recap\'s', () => {
    const move = buildNarratorSystemPrompt(STATE, {}, null, '', { mode: 'move_resolution' });
    expect(move).toMatch(/The outcome's own words are the table's, never the story's/);
    expect(move).not.toMatch(/Tell what happened, not the dice or the numbers/);
  });
});
