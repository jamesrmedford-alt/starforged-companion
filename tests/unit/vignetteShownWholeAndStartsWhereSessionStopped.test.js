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
 *
 * Since issue #381 the opening is composed in one place (composeOpeningScene:
 * where the last session stopped, the scene's rolled material, its message),
 * and is set where the last session stopped — the sentence that moved a
 * character "back aboard" is gone. The opening's own tests are in
 * openingSceneFromMaterial.test.js.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { buildGalleyVignetteUserMessage, composeOpeningScene } from '../../src/session/galleyVignette.js';
import { buildEndSessionVignetteUserMessage } from '../../src/session/endSessionVignette.js';
import { earlierVignettes } from '../../src/session/vignetteHistory.js';
import { installJournalMock } from '../helpers/fullStateFixture.js';
import { seedLegacySessionPage, seedSessionRecord, playedBeats } from '../helpers/sessionRecordSeed.js';
import { _resetSummaryViewForTests } from '../../src/record/summaryView.js';

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

// Run 3, a76 — session 3's summary: LAST SESSION, read from its Session Log page (issue #382).
const SESSION_3_SUMMARY =
  'Mira Kestrel sits in the galley of the *Kobayashi IV*, which is grappled to the dead flank of the Cinder Wren off Bleakhold Station, not docked at Hollow Spire. ' +
  'She carries Ilse\'s brass star-compass, its needle now settled on north. ' +
  'The dry voice over the hatch, a speaker tied to the Cinder Wren, has asked to take back a slip it made. ' +
  'The question of whose name Mira has settled on for the seal remains unanswered.';

const actor = (name) => ({ id: `a-${name}`, name, type: 'character', system: { biography: '' } });
const mira = { active: [{ actor: actor('Mira Kestrel') }], absent: [] };
// The opening as Begin a Session composes it, its dice scripted.
const opening = async (campaignState) => (await composeOpeningScene(mira, campaignState, { draw: () => 50 })).userMessage;
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
  const minted = { currentSessionId: 's-4', sessionNumber: 4 };
  // LAST SESSION is read from the session record (issue #382): session 3's
  // page holds its story.
  let journals;
  beforeEach(async () => {
    journals = installJournalMock();
    _resetSummaryViewForTests();
    await seedLegacySessionPage('s-3', SESSION_3_SUMMARY, { number: 3 });
  });
  afterEach(() => journals.restore());

  it('it is told how the last session ended, from its summary', async () => {
    const msg = await opening(minted);
    expect(msg).toContain('WHERE THE LAST SESSION STOPPED (session 3, as its summary has it):');
    expect(msg).toContain('grappled to the dead flank of the Cinder Wren off Bleakhold Station');
    expect(msg).toContain('The question of whose name Mira has settled on for the seal remains unanswered.');
  });

  it('and that it picks up there: nothing of it is over, behind them, or a week old', async () => {
    const msg = await opening(minted);
    expect(msg).toMatch(/This opening picks the story up there, and nowhere later\./);
    expect(msg).toMatch(/whatever was still going on\s+when the session stopped is still going on/);
    expect(msg).toMatch(/Do not contradict it, do not\s+write as though it were over or behind them \("since the …"\)/);
    // Its example came back as a count — "a third time", "fifth time" (SET-PIECES-SHAPED-BY-THEIR-PROMPT).
    expect(msg).toMatch(/do not\s+let more time pass than it allows\./);
    expect(msg).not.toMatch(/third time this week/);
  });

  it('it is set where that leaves them: nobody is moved back aboard (issue #381 D1)', async () => {
    const msg = await opening(minted);
    expect(msg).toMatch(/The scene is set\s+where that leaves them/);
    expect(msg).not.toMatch(/first quiet moment\s+back aboard/);
    expect(msg).not.toMatch(/says nothing of how they got there/);
  });

  it('the block comes after who is in the scene, and before the material and the earlier openings', () => {
    const msg = buildGalleyVignetteUserMessage(mira, minted, {
      earlier: [{ text: FIRST_OPENING, title: null }],
      lastSession: { text: SESSION_3_SUMMARY, sessionNumber: 3 },
      seeds: [{ slot: 'moment', label: 'What Mira Kestrel is doing in this lull', from: 'oracle', result: 'Bolster Debt',
        tables: [{ id: 'action', name: 'Action', roll: 14, result: 'Bolster' }, { id: 'theme', name: 'Theme', roll: 20, result: 'Debt' }] }],
    });
    expect(msg.indexOf('Active players')).toBeLessThan(msg.indexOf('WHERE THE LAST SESSION STOPPED'));
    expect(msg.indexOf('WHERE THE LAST SESSION STOPPED')).toBeLessThan(msg.indexOf('MATERIAL — rolled for this scene'));
    expect(msg.indexOf('MATERIAL — rolled for this scene')).toBeLessThan(msg.indexOf('EARLIER OPENINGS'));
  });

  it('a session nobody began since is told after it, by what was played in it', async () => {
    await seedSessionRecord('s-prep', playedBeats('s-prep', ['I ask the oracle where the Wren drifted.'], { begun: false, number: null }));
    _resetSummaryViewForTests();
    const msg = await opening(minted);
    expect(msg).toContain('WHERE THE LAST SESSION STOPPED (session 3, as its summary has it):');
    expect(msg).toContain('Played between sessions, while no session was begun:');
    expect(msg).toContain('I ask the oracle where the Wren drifted.');
  });

  it('control: a campaign\'s first session has nothing to pick up, and says nothing', async () => {
    journals.restore();
    journals = installJournalMock();
    _resetSummaryViewForTests();
    const msg = await opening({ currentSessionId: 's-1', sessionNumber: 1 });
    expect(msg).not.toMatch(/WHERE THE LAST SESSION STOPPED/);
    expect(msg).not.toMatch(/picks the story up/);
  });

  it('control: a record that is this session\'s own is not "the last session"', async () => {
    const own = { currentSessionId: 's-3', sessionNumber: 3 };
    expect(await opening(own)).not.toMatch(/WHERE THE LAST SESSION STOPPED/);
  });
});
