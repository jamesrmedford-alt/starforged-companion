/**
 * STARFORGED COMPANION
 * tests/unit/vignetteShownWholeAndStartsWhereSessionStopped.test.js
 *
 * The long haul's third live run (explorations/long-haul-live-20261124-0321),
 * known-issues GALLEY-VIGNETTE-REPEATS and CLOSING-SCENE-REPEATS.
 *
 *   - An opening was shown each earlier opening's first 700 characters. The
 *     run's first opening (a2) ends "…and the comm panel by the hatch gives a
 *     single, apologetic chirp." — past the cut — and its fourth (a78) ended
 *     "Then the comm panel by the hatch chirps once, soft and apologetic".
 *     The sentence it repeated was the one its "already used" list had lost.
 *   - No opening was told where the last session stopped. The third (a50)
 *     soaked apricots "for the third time this week" with a raider's boarding
 *     lock standing open beside the ship; the fourth wrote "stuck half-open
 *     since the Wren" of a ship still grappled alongside.
 *
 * The texts below are the run's own.
 */

import { describe, it, expect } from 'vitest';

import { buildGalleyVignetteUserMessage } from '../../src/session/galleyVignette.js';
import { buildEndSessionVignetteUserMessage } from '../../src/session/endSessionVignette.js';
import { earlierVignettes } from '../../src/session/vignetteHistory.js';

const MODULE_ID = 'starforged-companion';

// Run 3, a2 — the first opening, as narrated (861 characters).
const FIRST_OPENING =
  'The galley kettle has been working on the same cup of tea for twenty minutes, and the *Kobayashi IV* has opinions about it. ' +
  'Somewhere behind the bulkhead, a pipe knocks twice, pauses, and knocks once more, like a neighbor who has heard you start something and wants it known. ' +
  'You sit at the fold-down table with a bowl of reconstituted noodles gone gluey at the edges, and you eat them anyway, because the ship\'s one dependable talent is making a bad meal feel like a choice. ' +
  'The lights dim for exactly as long as the heater takes to cycle, then return, and neither of you mentions it. ' +
  'You stir the broth and catch your reflection in the spoon, upside down and unimpressed. ' +
  'Out past the hull the Cinder Expanse sits black and patient, and the comm panel by the hatch gives a single, apologetic chirp.';
const ITS_LAST_BEAT = 'the comm panel by the hatch gives a single, apologetic chirp.';

// Run 3, a76 — session 3's summary, which the mint keeps as LAST SESSION.
const SESSION_3_SUMMARY =
  'Mira Kestrel sits in the galley of the *Kobayashi IV*, which is grappled to the dead flank of the Cinder Wren off Bleakhold Station, not docked at Hollow Spire. ' +
  'She carries Ilse\'s brass star-compass, its needle now settled on north. ' +
  'The dry voice over the hatch, a speaker tied to the Cinder Wren, has asked to take back a slip it made. ' +
  'The question of whose name Mira has settled on for the seal remains unanswered.';

const actor = (name) => ({ id: `a-${name}`, name, type: 'character', system: { biography: '' } });
const mira = { active: [{ actor: actor('Mira Kestrel') }], absent: [] };
const card = (kind, text, extra = {}) => ({
  flags: { [MODULE_ID]: { sessionVignetteCard: true, vignetteKind: kind, narrationText: text, ...extra } },
});

describe('GALLEY-VIGNETTE-REPEATS — an earlier scene is shown whole', () => {
  it('the first opening is longer than the old 700-character cut, and its last beat lay past it', () => {
    expect(FIRST_OPENING.length).toBeGreaterThan(700);
    expect(FIRST_OPENING.slice(0, 699)).not.toContain('apologetic chirp');
  });

  it('earlierVignettes returns it whole — the beat it ends on with it', () => {
    const [earlier] = earlierVignettes(['galley_begin'], { messages: [card('galley_begin', FIRST_OPENING)] });
    expect(earlier.text).toBe(FIRST_OPENING);
    expect(earlier.text.endsWith(ITS_LAST_BEAT)).toBe(true);
    expect(earlier.text).not.toMatch(/…$/);
  });

  it('the opening\'s "already used" list holds that last sentence, and names endings as used', () => {
    const earlier = earlierVignettes(['galley_begin'], { messages: [card('galley_begin', FIRST_OPENING)] });
    const msg = buildGalleyVignetteUserMessage(mira, {}, { earlier, lastSession: null });
    expect(msg).toContain(ITS_LAST_BEAT);
    expect(msg).toMatch(/EARLIER OPENINGS — already used, oldest first\.[^\n]*not the beat any of them ends on/);
  });

  it('a closing is shown the earlier closings whole too', () => {
    const long = `${'She peels an orange at the ledger stall, one long strip. '.repeat(14)}She switches the lamp off with her elbow.`;
    expect(long.length).toBeGreaterThan(700);
    const earlier = earlierVignettes(['npc_end'], { messages: [card('npc_end', long, { vignetteNpc: 'the architect of Cinder Expanse' })] });
    const msg = buildEndSessionVignetteUserMessage({ kind: 'sector_trouble', name: 'the architect of Cinder Expanse', hint: 'Pirates raid the lanes' }, {}, { earlier });
    expect(msg).toContain('She switches the lamp off with her elbow.');
    expect(msg).toMatch(/EARLIER CLOSINGS — already used[^\n]*not the gesture any of them ends on/);
  });
});

describe('an opening starts from where the last session stopped', () => {
  const minted = {
    currentSessionId: 's-4', sessionNumber: 4,
    previousSessionSummary: { text: SESSION_3_SUMMARY, sessionId: 's-3', sessionNumber: 3 },
  };

  it('it is told how the last session ended, from the summary the mint kept', () => {
    const msg = buildGalleyVignetteUserMessage(mira, minted, { earlier: [] });
    expect(msg).toContain('WHERE THE LAST SESSION STOPPED (session 3, as its summary has it):');
    expect(msg).toContain('grappled to the dead flank of the Cinder Wren off Bleakhold Station');
    expect(msg).toContain('The question of whose name Mira has settled on for the seal remains unanswered.');
  });

  it('and that it picks up there: nothing of it is over, behind them, or a week old', () => {
    const msg = buildGalleyVignetteUserMessage(mira, minted, { earlier: [] });
    expect(msg).toMatch(/This opening picks the story up there, and nowhere later\./);
    expect(msg).toMatch(/whatever was still going on\s+when the session stopped is still going on/);
    expect(msg).toMatch(/Do not contradict it, do not\s+write as though it were over or behind them \("since the …"\)/);
    expect(msg).toMatch(/do not\s+let more time pass than it allows \("for the third time this week"\)/);
  });

  it('the block comes before the list of earlier openings, after the scene\'s own instructions', () => {
    const msg = buildGalleyVignetteUserMessage(mira, minted, { earlier: [{ text: FIRST_OPENING, title: null }] });
    expect(msg.indexOf('Render a 4-6 sentence opening vignette')).toBeLessThan(msg.indexOf('WHERE THE LAST SESSION STOPPED'));
    expect(msg.indexOf('WHERE THE LAST SESSION STOPPED')).toBeLessThan(msg.indexOf('EARLIER OPENINGS'));
  });

  it('a mint\'s record still waiting for its text tells the one it stands in front of', () => {
    const waiting = { ...minted, previousSessionSummary: { text: '', sessionId: 's-3', sessionNumber: 3,
      displaced: { text: 'Mira left Hollow Spire with her manifest in Tamsin Vey\'s keeping.', sessionId: 's-2', sessionNumber: 2 } } };
    const msg = buildGalleyVignetteUserMessage(mira, waiting, { earlier: [] });
    expect(msg).toContain('WHERE THE LAST SESSION STOPPED (session 2, as its summary has it):');
    expect(msg).toContain('her manifest in Tamsin Vey\'s keeping');
  });

  it('control: a campaign\'s first session has nothing to pick up, and says nothing', () => {
    const msg = buildGalleyVignetteUserMessage(mira, { currentSessionId: 's-1', sessionNumber: 1 }, { earlier: [] });
    expect(msg).not.toMatch(/WHERE THE LAST SESSION STOPPED/);
    expect(msg).not.toMatch(/picks the story up/);
  });

  it('control: a record that is this session\'s own is not "the last session"', () => {
    const own = { currentSessionId: 's-3', previousSessionSummary: { text: SESSION_3_SUMMARY, sessionId: 's-3', sessionNumber: 3 } };
    expect(buildGalleyVignetteUserMessage(mira, own, { earlier: [] })).not.toMatch(/WHERE THE LAST SESSION STOPPED/);
  });
});
