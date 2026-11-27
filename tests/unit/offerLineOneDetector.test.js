/**
 * STARFORGED COMPANION
 * tests/unit/offerLineOneDetector.test.js
 *
 * Issue #399's bug audit, N32 (the maintainer's call: "address all bugs from
 * audit with recommended choice"): the closing offer line — the one sentence
 * a narration offered a move may close on to invite it — had three detectors
 * that disagreed. The checks and both judges stripped a final italic span in
 * every mode, so a move narration's closing italic comm line was hidden from
 * them, and a bold offer line was read as narration; the Roll button read the
 * last italic span anywhere in the prose; the worn details dropped every
 * italic span, a ship's name among them. Now one detector
 * (narration/closingOfferLine.js), read only where an offer may be given: a
 * narration offered a move — its lines hold [offer], its card a move.
 *
 * The kept runs bear it out: every one of the 186 recorded narrations offered
 * a move closed on its line, as a sentence in italics, and none of the rest
 * closed on emphasis — so the kept measure's requests are unchanged
 * (judgeMeasure.test.js).
 */

/* global makeTestActor */
import { describe, it, expect } from 'vitest';
import { splitOfferLine } from '../../src/narration/closingOfferLine.js';
import { judgedView, offerMayBeGiven } from '../../src/moves/contracts/checks.js';
import { obligationsFor } from '../../src/moves/contracts/obligations.js';
import { extractMoveFromNarrationHint } from '../../src/narration/narrator.js';
import { buildNarratorExtras } from '../../src/narration/narrator.js';
import { wornDetails } from '../../src/narration/proseVariety.js';

const MODULE_ID = 'starforged-companion';

describe('the closing offer line: one detector', () => {
  it('a closing sentence in emphasis — italic or bold, Markdown or HTML, on its own line or after the last sentence', () => {
    const body = 'He shifts, eyes on the airlock.';
    for (const [told, offer] of [
      [`${body}\n\n*Pressing further here would be a Compel.*`, 'Pressing further here would be a Compel.'],
      [`${body} *Pressing further here would be a Compel.*`, 'Pressing further here would be a Compel.'],
      [`${body}\n\n**Pressing further here would be a Compel.**`, 'Pressing further here would be a Compel.'],
      [`${body}\n\n***Pressing further here would be a Compel.***`, 'Pressing further here would be a Compel.'],
      [`${body}\n\n_Pressing further here would be a Compel._`, 'Pressing further here would be a Compel.'],
      [`${body} <em>You could Secure an Advantage before they regroup.</em>`, 'You could Secure an Advantage before they regroup.'],
      [`${body} <strong>This might be the moment to Face Danger.</strong>`, 'This might be the moment to Face Danger.'],
      ['*If you want answers, this could be a Gather Information.*', 'If you want answers, this could be a Gather Information.'],
    ]) {
      const split = splitOfferLine(told);
      expect(split.offer, told).toBe(offer);
      expect(split.body, told).toBe(told.startsWith('*If') ? '' : body);
    }
  });

  it('none: an emphasised name or word that ends the prose, emphasis mid-prose, and plain prose', () => {
    for (const told of ['The berth beside you holds the *Kobayashi IV*', 'She says it was *nothing*.', 'The *Kestrel* drifts past the viewport. She waits.',
      'Just plain prose with no hint.', '', null]) {
      expect(splitOfferLine(told), String(told)).toEqual({ body: String(told ?? '').trim(), offer: null });
    }
  });
});

describe('read only where an offer may be given', () => {
  const COMM = 'The lock gives, and the cutter falls away.\n\n*"Kestrel, you are clear," the dockmaster says over the comm.*';

  it('a narration\'s lines say whether it was offered a move: [offer], a paced beat\'s SUGGESTED MOVE', () => {
    expect(offerMayBeGiven(obligationsFor({ mode: 'paced', line: 'I wait', offer: 'gather_information' }))).toBe(true);
    expect(offerMayBeGiven(obligationsFor({ mode: 'paced', line: 'I wait' }))).toBe(false);
    expect(offerMayBeGiven(obligationsFor({ mode: 'move', resolution: { moveId: 'face_danger', outcome: 'strong_hit' } }))).toBe(false);
    expect(offerMayBeGiven(null)).toBe(false);
  });

  it('the judged view: a move narration\'s closing italic comm line is the story\'s, and is read; an offer line is not', () => {
    expect(judgedView(COMM).text).toBe(COMM);
    expect(judgedView('She waits.\n\n*Pressing her would be a Compel.*', { offer: true }).text).toBe('She waits.');
    expect(judgedView('She waits.\n\n**Pressing her would be a Compel.**', { offer: true }).text).toBe('She waits.');
  });

  it('the Roll button reads the closing line alone: a move named in emphasis mid-prose is no hint', () => {
    expect(extractMoveFromNarrationHint('You remember the *Strike* that broke their line. She waits.')).toBeNull();
    expect(extractMoveFromNarrationHint('The *Kestrel* drifts. *If you press him now, this could be a Compel.*')).toBe('compel');
    expect(extractMoveFromNarrationHint('She waits.\n\n**Reading her for tells would be a Gather Information.**')).toBe('gather_information');
  });
});

describe('the worn details: italic words are words, and an offer line is left out where it was given', () => {
  it('a detail in italics, said again and again, is worn; a ship\'s name in italics is a name', () => {
    const told = (i) => `The *brass compass* turns in your palm ${i}. The *Kestrel* hums.`;
    const worn = wornDetails([told(1), told(2), told(3)]);
    expect(worn).toContain('brass compass');
    expect(worn.some(w => /kestrel/.test(w))).toBe(false);
  });

  it('a beat is handed the details of its session\'s cards — a card that offered a move without its closing line', async () => {
    game.actors._reset();
    game.actors._set('pc-mira', makeTestActor({ id: 'pc-mira', name: 'Mira Kestrel' }));
    const state = { currentSessionId: 'sess-5', sessionNumber: 5, currentSceneId: 'sc-5', sceneTruths: [],
      sceneFrame: { location: 'the cargo deck', present: ['Mira Kestrel'], situation: 'a wait', sceneId: 'sc-5' } };
    game.settings._store.set(`${MODULE_ID}.campaignState`, state);
    const BODIES = ['The lift groans down a deck.', 'Rain needles the viewport.', 'A crate shifts in its straps.'];
    const LINE = '*Asking the dockhand about the cargo manifest would be a Gather Information.*';
    const cards = (offered) => BODIES.map((body, i) => ({ id: `card-${i}`, content: body, flags: { [MODULE_ID]: {
      narratorCard: true, sessionId: 'sess-5', narrationText: `${body}\n\n${LINE}`, ...(offered ? { pacedNarrative: true, suggestedMove: 'gather_information' } : {}),
    } } }));

    global.game.messages = { contents: cards(true) };
    const offered = await buildNarratorExtras('paced_narrative', state, { playerNarration: 'I wait by the lift.' });
    expect(offered.wornDetails.some(w => /dockhand|manifest|gather/.test(w)), offered.wornDetails.join(', ')).toBe(false);

    // The same closing line on cards that offered nothing is their narration, and counted.
    global.game.messages = { contents: cards(false) };
    const told = await buildNarratorExtras('paced_narrative', state, { playerNarration: 'I wait by the lift.' });
    expect(told.wornDetails.some(w => /dockhand|manifest/.test(w)), told.wornDetails.join(', ')).toBe(true);
  });
});
