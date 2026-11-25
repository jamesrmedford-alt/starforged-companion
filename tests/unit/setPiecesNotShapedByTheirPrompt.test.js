/**
 * STARFORGED COMPANION
 * tests/unit/setPiecesNotShapedByTheirPrompt.test.js
 *
 * Known-issues SET-PIECES-SHAPED-BY-THEIR-PROMPT — the long haul's fourth
 * live run (issue #383, `explorations/long-haul-live-20261124-213912/`), the
 * first whose session set-pieces were built from rolled material (issue
 * #381). Shared words fell, and the shapes their prompts dictate stayed:
 *   - every closing ended on a thing put down ("put the flask back" a18,
 *     "left coin under the bowl" a52, "dropped it in the drum" a87) — told
 *     "It stops when the small thing is done, or put down.";
 *   - every opening handled a counted object and ended still ("a third time"
 *     a20, "fifth time" a54, "third confession" a89) — told "Its last
 *     sentence returns to what that leaves open … Nothing new happens", and
 *     given "for the third time this week" as the time not to let pass;
 *   - six rolled results were written as their own word (apparition a2,
 *     memory a18, makeshift lair a20, protection a52, surrendering and
 *     preserved a89) under "Never the words themselves";
 *   - the oath scene was one image in all four live long hauls ("press your
 *     palm flat against the … bulkhead … the words low"): its user message gave
 *     the vow's name, "vows are sworn upon iron" and "Pure sensory fiction; do
 *     not restate the vow's text" — no material.
 * The fixed shapes are dropped: a set-piece ends where its material takes it,
 * a result is never written as rolled, and the oath is built from the vow's
 * own words and the scene it is sworn in. Issue #381's "already used" lists
 * stay (its D4, not taken). To be measured by the next live run.
 */

import { describe, it, expect } from 'vitest';
import { buildEndSessionVignetteUserMessage } from '../../src/session/endSessionVignette.js';
import { buildGalleyVignetteUserMessage } from '../../src/session/galleyVignette.js';
import { formatMaterial } from '../../src/session/sceneSeeds.js';
import { buildVowSwearingUserMessage } from '../../src/narration/narrator.js';
import { buildNarratorSystemPrompt } from '../../src/narration/narratorPrompt.js';

const SECTOR = { sectors: [{ id: 'sx', name: 'Cinder Expanse' }], activeSectorId: 'sx' };
const seed = (slot, label, result) => ({ slot, label, from: 'oracle', tables: [{ id: 'action', name: 'Action', roll: 40, result }], result, used: null });

// The run's own material: a20's opening and a52's closing.
const OPENING_SEEDS = [
  seed('moment', 'What Mira Kestrel is doing in this lull', 'Investigate Dream'),
  seed('eye', 'What the scene\'s eye rests on', 'Makeshift Lair'),
];
const CLOSING_SEEDS = [
  { slot: 'subject', label: 'Who the closing shows', from: 'state', source: 'the campaign\'s people', tables: [], result: 'Tamsin Vey', used: null },
  seed('busy', 'What Tamsin Vey is busy with', 'Secure Protection'),
  seed('thing', 'The thing in hand, or close by', 'Shrouded Battleground'),
];
const LAST_SESSION = { text: 'Mira left her cargo manifest with Tamsin and promised to return before the next tide of cargo.', sessionNumber: 1,
  lastNarration: 'You walk the dock, and nobody follows.' };

const opening = (over = {}) => buildGalleyVignetteUserMessage({ active: [], absent: [] }, SECTOR,
  { earlier: [], seeds: OPENING_SEEDS, lastSession: LAST_SESSION, ...over });
const closing = () => buildEndSessionVignetteUserMessage({ kind: 'connection', name: 'Tamsin Vey' }, SECTOR,
  { earlier: [], seeds: CLOSING_SEEDS, charactersAt: 'Bleakhold Station docking ring' });

describe('the closing ends where its material takes it — not on a thing put down', () => {
  it('no fixed way to stop; the ending is the material\'s', () => {
    const msg = closing();
    expect(msg).not.toMatch(/put down/);
    expect(msg).not.toMatch(/It stops when the small thing is done/);
    expect(msg).toMatch(/How it ends is the material's: its last sentence stays with whichever result the scene reaches last, as it stands then\. No closing gesture, and nothing finished or set aside to end it\./);
  });

  it('control: whom it shows, where the characters are and the earlier closings as already used, as before', () => {
    const msg = closing();
    expect(msg).toMatch(/^Subject \(connection\): Tamsin Vey\.$/m);
    expect(msg).toContain('Where the characters are as the session ends: Bleakhold Station docking ring.');
    const withEarlier = buildEndSessionVignetteUserMessage({ kind: 'connection', name: 'Tamsin Vey' }, SECTOR,
      { earlier: [{ text: 'Tamsin shutters the stall slat by slat.', npc: 'Tamsin Vey' }], seeds: CLOSING_SEEDS });
    expect(withEarlier).toMatch(/EARLIER CLOSINGS/);
  });
});

describe('the opening ends where its material takes it — no return, no stillness, no count', () => {
  it('with the last session behind it: no "returns to what that leaves open", no "Nothing new happens", no "third time"', () => {
    const msg = opening();
    expect(msg).not.toMatch(/returns to what that leaves open/);
    expect(msg).not.toMatch(/Nothing new happens/);
    expect(msg).not.toMatch(/third time/);
    expect(msg).toMatch(/How it ends is the material's: its last sentence stays with whichever result the scene reaches last\. No turn of the plot happens in it: the first move is the players'\./);
    // The rule the count came out of stays, without its example.
    expect(msg).toMatch(/do not\s+let more time pass than it allows\./);
  });

  it('with nothing behind it and no material: no fixed ending either', () => {
    const msg = buildGalleyVignetteUserMessage({ active: [], absent: [] }, SECTOR, { earlier: [], seeds: [] });
    expect(msg).not.toMatch(/left unfinished|Nothing new happens/);
    expect(msg).toMatch(/How it ends comes from the scene itself\. No turn of the plot happens in it: the first move is the players'\./);
  });

  it('the set-piece role says the same: no stillness rule for the opening', () => {
    const role = buildNarratorSystemPrompt({ currentSessionId: 's-2' }, {}, null, '', { mode: 'session_vignette' });
    expect(role).toMatch(/OPENING — the player characters whose players are at the table, in a quiet moment inside the situation the last session left\. No turn of the plot happens in it\./);
    expect(role).not.toMatch(/Nothing new happens in it/);
  });
});

describe('a rolled result is never written as its own word', () => {
  it('the MATERIAL says so for every set-piece — the spotlight\'s too', () => {
    for (const block of [formatMaterial(OPENING_SEEDS), formatMaterial(OPENING_SEEDS, { spotlight: true })]) {
      expect(block).toMatch(/A result's words are the oracle's, never the prose's: no word of a result is\s+written as it was rolled/);
      expect(block).not.toMatch(/Never the words themselves/);
    }
  });

  it('control: each result is still in the scene, recognisably, and the account names the prose\'s own words for it', () => {
    const block = formatMaterial(OPENING_SEEDS);
    expect(block).toMatch(/Each numbered result is in the scene, recognisably/);
    expect(block).toMatch(/"builtFrom": one entry for each number, with the\s+three to eight words of your prose that are it/);
  });
});

describe('a quiet scene leaves the characters\' things as the records have them (issue #388 #12)', () => {
  // a19's lull read "Deliver" as Mira setting her own brass star-compass on
  // Tamsin's counter; a20 told the compass as left there.
  it('an opening\'s and a closing\'s MATERIAL say nothing of theirs changes hands — the spotlight, a turn of the plot, does not', () => {
    const rule = /What the characters hold, owe and have said stays as the records have it:\s+nothing of theirs changes hands, and nothing is given, promised, spent or\s+broken in this scene\. The table decides those\./;
    expect(formatMaterial(OPENING_SEEDS)).toMatch(rule);
    expect(formatMaterial(OPENING_SEEDS, { spotlight: true })).not.toMatch(rule);
  });
});

describe('the oath is built from the vow\'s own words and the scene it is sworn in', () => {
  const VOW = { name: 'Find who is raiding the Cinder Expanse lanes', rank: 'dangerous' };

  it('a3\'s oath: the vow\'s own words, the Iron truth and the scene as its material — no stock gesture, no "pure sensory fiction"', () => {
    const msg = buildVowSwearingUserMessage(VOW, null);
    expect(msg).not.toMatch(/Pure sensory fiction/);
    expect(msg).not.toMatch(/do not restate the vow's text/);
    expect(msg).toMatch(/THE OATH'S MATERIAL/);
    expect(msg).toContain('A character is swearing "Find who is raiding the Cinder Expanse lanes" (dangerous).');
    expect(msg).toContain('- The vow\'s own words: "Find who is raiding the Cinder Expanse lanes".');
    expect(msg).toContain('- How oaths are bound: In this world, vows are sworn upon iron.');
    expect(msg).toContain('- The scene: where the character is now, who is there and what has just happened — the active scene in this prompt.');
    expect(msg).toMatch(/What is sworn upon is iron at hand there/);
    expect(msg).toMatch(/no stock gesture/);
  });

  it('the Iron truth the table chose is the binding, as before (IRON-TRUTH-COLON)', () => {
    const msg = buildVowSwearingUserMessage(VOW, {
      title: 'Iron vows are sworn upon the remnants of ships that carried our people to the Forge.',
      description: 'Many of our outposts were built from the iron bones of the Exodus ships.',
    });
    expect(msg).toContain('- How oaths are bound: In this world, the Ironsworn bind their oaths thus — Iron vows are sworn upon the remnants of ships that carried our people to the Forge. Many of our outposts were built from the iron bones of the Exodus ships.');
  });

  it('a vow with no name is sworn from the scene alone', () => {
    const msg = buildVowSwearingUserMessage({ name: null }, null);
    expect(msg).toMatch(/The vow's own words: none on record/);
  });

  it('the scene it is sworn in is given: the recent narration, word for word', () => {
    const recentScene = 'PLAYER — Mira Kestrel wrote: "I walk the dock."\nThe hauler crew leader steps aside, slowly.';
    const msg = buildVowSwearingUserMessage(VOW, null, { recentScene });
    expect(msg).toContain('— the active scene in this prompt, and the recent narration below.');
    expect(msg).toContain(`RECENT NARRATION (most recent last):\n${recentScene}`);
  });
});
