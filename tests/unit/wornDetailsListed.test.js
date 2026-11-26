/**
 * STARFORGED COMPANION
 * tests/unit/wornDetailsListed.test.js
 *
 * NARRATION-REFRAINS-RISING — every cold read since round 3 found the
 * narrations coming back to the same details, and the long haul's count rose:
 * 19 words and phrases in a third or more of a session's narrations in round
 * 4, 25, 22, then 39 in round 7 ("Tamsin's pen stops, scratches or hangs in
 * almost every beat she appears in", "the ledger boy has stopped counting",
 * the data chit "face down" on the sill). Nothing in the module acted on them.
 *
 * The details the recent narrations kept coming back to — a word or a pair of
 * words in three of the last six, names, the scene's own words and the
 * player's line apart — are listed in THIS BEAT'S PROSE as worn, to reach
 * past (proseVariety.js wornDetails).
 */

/* global makeTestActor */
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { wornDetails, WORN_IN_CARDS, WORN_SOURCE_CARDS } from '../../src/narration/proseVariety.js';
import { formatBeatProseBlock } from '../../src/narration/narratorPrompt.js';
import { buildNarratorExtras } from '../../src/narration/narrator.js';

const MODULE_ID = 'starforged-companion';
const ROUND_7 = JSON.parse(fs.readFileSync(path.resolve(__dirname,
  '../../test/ci/playwright/explorations/long-haul-live-20261126-030646/replay.json'), 'utf8'));
const prose = (x) => x.response.content.map(c => c.text ?? '').join('').split('```')[0];
const PLAY = ROUND_7.recording.exchanges.filter(x => /narratePacedInput$|narrateResolution$/.test(x.kind));
/** The narrations of play before a step, oldest first. */
const before = (step) => PLAY.slice(0, PLAY.findIndex(x => x.step === step)).map(prose);
const NAMES = ['Mira Kestrel', 'Tamsin Okoro', 'Kobayashi IV', 'Hollow Spire', 'Bleakhold Station', 'Cinder Wren', 'Ashen Wake'];

describe('the details the recent narrations kept coming back to', () => {
  it('round 7, before a61: the data chit and the gantry hand — and no name, and not the offer line\'s move', () => {
    const worn = wornDetails(before('a61'), { names: NAMES });
    expect(worn).toEqual(expect.arrayContaining(['data chit', 'gantry hand']));
    for (const w of worn) expect(w, w).not.toMatch(/tamsin|mira|kestrel|okoro|kobayashi|develop|relationship/);
  });
  it('round 7, before a70: the cold read\'s own three — the folded strip, the ledger boy, Tamsin\'s pen', () => {
    expect(wornDetails(before('a70'), { names: NAMES })).toEqual(expect.arrayContaining(['folded strip', 'ledger boy', 'pen']));
  });
  it('the scene\'s own words and the player\'s line are never worn', () => {
    const keep = ['Tamsin Okoro\'s ledger stall, Hollow Spire docks', 'I slide the data chit across to her.'];
    const worn = wornDetails(before('a63'), { names: NAMES, keep });
    for (const w of ['ledger', 'stall', 'data chit']) expect(worn, w).not.toContain(w);
  });
  it(`a pair before the words it holds; nothing in fewer than ${WORN_IN_CARDS} of the last ${WORN_SOURCE_CARDS}`, () => {
    const pen = (i) => `Her pen hovers over the page ${i}. The lamp hums.`;
    expect(wornDetails([pen(1), pen(2), pen(3)])).toEqual(['pen hovers', 'lamp hums', 'page']);
    expect(wornDetails([pen(1), pen(2)])).toEqual([]);
    expect(wornDetails([pen(1), 'The cargo bay is cold.', 'Rain on the hull.', 'A door shuts.', 'Engines idle.', 'Gulls cry.', pen(2)])).toEqual([]);
  });
});

describe('THIS BEAT\'S PROSE lists them', () => {
  it('as worn, to reach past', () => {
    const block = formatBeatProseBlock({ wornDetails: ['data chit', 'gantry hand'] });
    expect(block).toContain('### DETAILS ALREADY WORN');
    expect(block).toContain('Reach for something else this beat');
    expect(block).toContain('- data chit\n- gantry hand');
    expect(formatBeatProseBlock({ wornDetails: [] })).toBe('');
  });

  it('a beat of play is handed them from the session\'s last narrator cards', async () => {
    ChatMessage._reset();
    game.actors._reset();
    game.actors._set('pc-mira', makeTestActor({ id: 'pc-mira', name: 'Mira Kestrel' }));
    global.game.messages = { contents: before('a61').slice(-6).map((text, i) => ({
      id: `card-${i}`, content: text, flags: { [MODULE_ID]: { narratorCard: true, sessionId: 'sess-3', narrationText: text } },
    })) };
    const state = { currentSessionId: 'sess-3', sessionNumber: 3, currentSceneId: 'sc-3', sceneTruths: [],
      sceneFrame: { location: 'the Kobayashi IV\'s berth, Bleakhold Station', present: ['Mira Kestrel'], situation: 'a call', sceneId: 'sc-3' } };
    game.settings._store.set(`${MODULE_ID}.campaignState`, state);
    const extras = await buildNarratorExtras('paced_narrative', state, { playerNarration: 'I fly the skiff to her stall.' });
    expect(extras.wornDetails).toEqual(expect.arrayContaining(['data chit']));
    expect(extras.wornDetails).not.toContain('berth');
  });
});
