/**
 * STARFORGED COMPANION
 * tests/unit/sceneTurns.test.js
 *
 * Overhaul 2, slice 2 (§4.2) — when a scene turns, pure. A session was one
 * scene unless someone typed `!scene` (the long haul's third and fourth live
 * runs: one scene a session, besides the cutaways). A scene turns now when
 * the stores say its place or its situation changed: the characters' place,
 * the ship's place, a fight / an expedition / a scene challenge begun or
 * ended, time the player's words skip or a Sojourn. Begins before, ends
 * after: a track the beat's own resolution ended turns the scene at the next
 * beat. Several causes in one beat are one turn, the first in order.
 *
 * The time-skip phrases are run over every typed line of the four kept long
 * hauls (test/ci/playwright/explorations/long-haul-live-*), and the lines
 * they fire on are listed here — none, as these runs were played.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  sceneTurnDue, sceneAnchorOf, sceneStores, anchorFilled, shipPlaceKey, skippedTime, causeText,
  sceneObligations, sceneOpeningOf,
} from '../../src/factContinuity/sceneTurns.js';
import { formatObligationsBlock } from '../../src/moves/contracts/obligations.js';

const BLEAKHOLD = { id: 'set-bleak', type: 'settlement', name: 'Bleakhold Station' };
const HOLLOW = { id: 'set-hollow', type: 'settlement', name: 'Hollow Spire' };
const DOCKED = { key: 'id:set-bleak', line: 'SHIP POSITION: Kobayashi IV docked at Bleakhold Station (Cinder Expanse)', name: 'Kobayashi IV' };
const AWAY = { key: 'text:off the ring', line: 'SHIP POSITION: Kobayashi IV off the ring', name: 'Kobayashi IV' };
const WREN = { id: 'trk-wren', type: 'combat', label: 'The Cinder Wren' };
const DERELICT = { id: 'trk-derelict', type: 'expedition', label: 'the derelict hauler' };
const HEIST = { id: 'trk-heist', type: 'scene_challenge', label: 'Slip the blockade' };

const stores = (over = {}) => sceneStores({ place: BLEAKHOLD, ship: DOCKED, openTracks: [], ...over });
const anchor = (over = {}) => sceneAnchorOf(stores(over), { sceneId: 'sc-1', cause: 'place', what: 'the characters have reached Bleakhold Station' });

describe('overhaul 2 §4.1 — a scene\'s anchor', () => {
  it('is what the scene began with, and why, in words', () => {
    const a = sceneAnchorOf(stores({ openTracks: [WREN, DERELICT] }), { sceneId: 'sc-1', at: 5, cause: 'fight', what: 'a fight has begun: The Cinder Wren' });
    expect(a).toEqual({
      sceneId: 'sc-1', at: 5, cause: 'fight', what: 'a fight has begun: The Cinder Wren',
      place: BLEAKHOLD, ship: { key: DOCKED.key, line: DOCKED.line },
      tracks: { combat: [{ id: WREN.id, label: WREN.label }], expedition: [{ id: DERELICT.id, label: DERELICT.label }], scene_challenge: [] },
    });
  });

  it('a slot the scene began without is filled from the first store that records it, with no turn — and a scene with no anchor takes one', () => {
    const a = sceneAnchorOf(sceneStores({ place: null, ship: null }), { sceneId: 'sc-1', cause: 'campaign' });
    const filled = anchorFilled(a, stores(), { sceneId: 'sc-1' });
    expect(filled).toMatchObject({ cause: 'campaign', place: BLEAKHOLD, ship: { key: DOCKED.key } });
    expect(sceneTurnDue(filled, stores())).toBeNull();
    expect(anchorFilled(filled, stores(), { sceneId: 'sc-1' })).toBeNull();          // nothing more to fill
    expect(anchorFilled(null, stores(), { sceneId: 'sc-1' })).toMatchObject({ sceneId: 'sc-1', cause: 'first', place: BLEAKHOLD });
    expect(anchorFilled(a, stores(), { sceneId: 'sc-2' })).toMatchObject({ sceneId: 'sc-2' });   // another scene's
  });

  it('the ship\'s place key: its recorded place, else its words — undocking at the same place keeps it', () => {
    expect(shipPlaceKey({ nearestSettlementId: 'set-bleak', freeText: '' })).toBe('id:set-bleak');
    expect(shipPlaceKey({ nearestLocationId: 'loc-1', nearestSettlementId: 'set-bleak' })).toBe('id:loc-1');
    expect(shipPlaceKey({ nearestPlanetId: 'pl-1' })).toBe('id:pl-1');
    expect(shipPlaceKey({ freeText: '  Off the  Ring ' })).toBe('text:off the ring');
    expect(shipPlaceKey({})).toBeNull();
    expect(shipPlaceKey(null)).toBeNull();
  });
});

describe('overhaul 2 §4.2 — what turns a scene', () => {
  it('nothing changed: no turn', () => {
    expect(sceneTurnDue(anchor(), stores(), { line: 'I look around the market.' })).toBeNull();
  });

  it('the characters\' place: an arrival "reached", a GM\'s word "at"', () => {
    expect(sceneTurnDue(anchor(), stores({ place: HOLLOW }), { moveId: 'set_a_course' }))
      .toEqual({ cause: 'place', what: 'the characters have reached Hollow Spire' });
    expect(sceneTurnDue(anchor(), stores({ place: HOLLOW }), { moveId: null }))
      .toEqual({ cause: 'place', what: 'the characters are at Hollow Spire' });
    // A place cleared is no new place.
    expect(sceneTurnDue(anchor(), stores({ place: null }))).toBeNull();
  });

  it('the ship\'s place', () => {
    expect(sceneTurnDue(anchor(), stores({ ship: AWAY }))).toEqual({ cause: 'ship', what: 'Kobayashi IV is now off the ring' });
    // The same place, read "near" now: the same key.
    expect(sceneTurnDue(anchor(), stores({ ship: { ...DOCKED, line: 'SHIP POSITION: Kobayashi IV near Bleakhold Station' } }))).toBeNull();
  });

  it('a fight begun turns before; one ended turns after the beat that ended it', () => {
    expect(sceneTurnDue(anchor(), stores({ openTracks: [WREN] }))).toEqual({ cause: 'fight', what: 'a fight has begun: The Cinder Wren' });
    const inFight = anchor({ openTracks: [WREN] });
    // The finishing blow's own beat is the fight's last…
    expect(sceneTurnDue(inFight, stores({ openTracks: [] }), { endingIds: [WREN.id] })).toBeNull();
    // …and the next beat finds it gone.
    expect(sceneTurnDue(inFight, stores({ openTracks: [] }))).toEqual({ cause: 'fight', what: 'the fight with The Cinder Wren is over' });
  });

  it('an expedition and a scene challenge, the same way', () => {
    expect(sceneTurnDue(anchor(), stores({ openTracks: [DERELICT] }))).toEqual({ cause: 'expedition', what: 'the expedition the derelict hauler has begun' });
    expect(sceneTurnDue(anchor({ openTracks: [DERELICT] }), stores())).toEqual({ cause: 'expedition', what: 'the expedition the derelict hauler is over' });
    expect(sceneTurnDue(anchor(), stores({ openTracks: [HEIST] }))).toEqual({ cause: 'challenge', what: 'Slip the blockade has begun' });
    expect(sceneTurnDue(anchor({ openTracks: [HEIST] }), stores())).toEqual({ cause: 'challenge', what: 'Slip the blockade is settled' });
  });

  it('time the player\'s words skip, or a Sojourn', () => {
    expect(sceneTurnDue(anchor(), stores(), { line: 'I rest aboard until the next morning.' }))
      .toEqual({ cause: 'time', what: 'time has passed: "I rest aboard until the next morning."' });
    expect(sceneTurnDue(anchor(), stores(), { moveId: 'sojourn' })).toMatchObject({ cause: 'time' });
    expect(sceneTurnDue(anchor(), stores(), { moveIds: ['face_danger', 'sojourn'] })).toMatchObject({ cause: 'time' });
  });

  it('two causes in one beat are one turn, the first in order: an arrival is the place, not the ship', () => {
    expect(sceneTurnDue(anchor(), stores({ place: HOLLOW, ship: AWAY, openTracks: [WREN] }), { moveId: 'set_a_course', line: 'Hours later we dock.' }))
      .toMatchObject({ cause: 'place' });
    expect(sceneTurnDue(anchor(), stores({ ship: AWAY, openTracks: [WREN] }))).toMatchObject({ cause: 'ship' });
  });

  it('the words of the causes no beat finds', () => {
    expect(causeText('session')).toBe('the session begins');
    expect(causeText('gm')).toBe('the GM began a new scene');
    expect(causeText('first')).toBe('');
  });
});

describe('overhaul 2 §4.2 — TIME_SKIP: phrases, never a bare word', () => {
  it('fires on a skip of time', () => {
    for (const line of [
      'Later that night I slip out to the dock.', 'Three days later we reach the beacon.', 'A few hours later, she calls.',
      'An hour later the patrol is gone.', 'The next morning I head for the market.', 'Next morning, I check the hold.',
      'The following day I sell the salvage.', 'I leave the beacon running overnight.', 'I sleep until the shift bell.',
      'I wait for morning in the cockpit.', 'We wait until dawn.', 'I rest for a few hours.', 'We rest until nightfall.',
      'Skip ahead to the landing.', 'Time passes while the repairs finish.', 'I rest aboard until the next morning.',
    ]) expect(skippedTime(line), line).not.toBe('');
  });

  it('not on "later" alone, a farewell, a plan for tomorrow or a moment\'s rest', () => {
    for (const line of [
      "I'll talk to you later.", 'Later, maybe.', "Tomorrow I'll find the broker.", 'I rest for a moment against the hull.',
      'I wait.', 'I skip the small talk.', 'The next thing I do is check the lock.', 'I rest my hand on the console.',
    ]) expect(skippedTime(line), line).toBe('');
  });

  // Beat 22 asks for the night to pass in those words since the fifth live
  // run: the one line of each kept run it is for (issue #388; it turned the
  // fifth run's scene at a56). The sixth round's two runs each reached it, and the seventh, eighth and ninth rounds' runs.
  it('over every typed line of the kept long hauls it fires only on beat 22\'s night-pass line', () => {
    const dir = join(process.cwd(), 'test/ci/playwright/explorations');
    const fired = [];
    let lines = 0;
    for (const run of readdirSync(dir).filter(d => d.startsWith('long-haul-live'))) {
      const replay = JSON.parse(readFileSync(join(dir, run, 'replay.json'), 'utf8'));
      for (const a of replay.actions ?? []) {
        if (a.action !== 'say' || typeof a.text !== 'string' || a.text.startsWith('!')) continue;
        lines += 1;
        if (skippedTime(a.text)) fired.push(`${run}: ${a.text}`);
      }
    }
    expect(lines).toBeGreaterThan(150);
    expect(fired).toEqual([
      'long-haul-live-20261125-164201: I rest aboard until the next morning.',
      'long-haul-live-20261125-225635: I rest aboard until the next morning.',
      'long-haul-live-20261125-232143: I rest aboard until the next morning.',
      'long-haul-live-20261126-030646: I rest aboard until the next morning.',
      'long-haul-live-20261126-184225: I rest aboard until the next morning.',
      'long-haul-live-20261127-041734: I rest aboard until the next morning.',
    ]);
  });
});

describe('overhaul 2 §4.5, §10.3 — what the scene obliges the narration to tell, in overhaul 4\'s block', () => {
  const began = (over = {}) => ({ sceneId: 'sc-2', at: 1, cause: 'place', what: 'the characters are at Hollow Spire',
    place: null, ship: null, tracks: { combat: [], expedition: [], scene_challenge: [] }, ...over });
  const state = (over = {}) => ({ currentSceneId: 'sc-2', sceneBegan: began(), sceneFrame: null, sceneTruths: [], ...over });

  it('TELL [scene] on the beat that opens a scene — while no narration has written in it', () => {
    expect(sceneOpeningOf(state())).toBe('the characters are at Hollow Spire');
    const [scene] = sceneObligations(state());
    expect(scene).toMatchObject({ kind: 'scene', list: 'TELL' });
    expect(scene.text).toBe('This beat opens a new scene: the characters are at Hollow Spire. Open it there — where the characters '
      + "are now, who is here. What still binds is under ACTIVE SCENE; the last scene's description is not carried: describe this place fresh.");
    // The cast a turn carried in is no narration's frame.
    expect(sceneOpeningOf(state({ sceneFrame: { location: '', present: ['Tamsin Vey'], situation: '', sceneId: 'sc-2' } }))).not.toBe('');
    // Once a narration has written in it — its frame, or a truth — the scene is open.
    expect(sceneOpeningOf(state({ sceneFrame: { location: 'the docks', sceneId: 'sc-2', narrationId: 'n1' } }))).toBe('');
    expect(sceneOpeningOf(state({ sceneTruths: [{ id: 't', narrationId: 'n1' }] }))).toBe('');
    // A scene a first narration opened says nothing of why; another scene's anchor is not this one's.
    expect(sceneOpeningOf(state({ sceneBegan: began({ what: '' }) }))).toBe('');
    expect(sceneOpeningOf(state({ sceneBegan: began({ sceneId: 'sc-1' }) }))).toBe('');
  });

  it('NOT SO [letgo] for each question play let go in this scene', () => {
    const lines = sceneObligations(state({ sceneFrame: { location: 'the docks', sceneId: 'sc-2', narrationId: 'n1',
      letGo: [{ text: 'Who is hailing the ship?', stems: ['hail', 'ship'] }] } }));
    expect(lines).toEqual([{ kind: 'letgo', list: 'NOT SO',
      text: 'Play let this go: "Who is hailing the ship?". Do not end on it or bring it back unless the player\'s line takes it up.',
      // The entry itself, for checks.js's [letgo] floor (its stems).
      letGo: { text: 'Who is hailing the ship?', stems: ['hail', 'ship'] } }]);
    // Another scene's frame lets nothing go here.
    expect(sceneObligations(state({ sceneFrame: { sceneId: 'sc-1', narrationId: 'n1', letGo: [{ text: 'x', stems: [] }] } }))).toEqual([]);
  });

  it('they render in the one block, under its lists', () => {
    const block = formatObligationsBlock(sceneObligations(state({ sceneFrame: { location: '', present: [], situation: '', sceneId: 'sc-2',
      letGo: [{ text: 'Who is hailing the ship?', stems: ['hail', 'ship'] }] } })));
    expect(block).toContain('## WHAT THIS NARRATION MUST TELL, AND MUST NOT');
    expect(block).toContain('TELL — this has happened:\n- [scene] This beat opens a new scene: the characters are at Hollow Spire.');
    expect(block).toContain('NOT SO — never tell it as true:\n- [letgo] Play let this go: "Who is hailing the ship?".');
  });
});
