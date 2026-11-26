/**
 * STARFORGED COMPANION
 * tests/unit/restatedStateKeepsItsBasis.test.js
 *
 * The first-session playthrough's re-records (2026-11-26, PR #395): the
 * dockmaster's whereabouts — "at the berth console at Hollow Spire with the
 * PC" — came from the player's line, tagged "line", so they bound. The next
 * beat's fact block said the same words again with no tag, and the state
 * entry took the restatement's basis: the narrator's colour. The scene ended
 * on colour, and no LAST KNOWN location was kept on his card. Another run
 * said "in the dock office at Hollow Spire with the PC, going through the
 * berth logs" from the line, then "in the dock office at Hollow Spire with
 * the PC" tagged "line" with no word of that line's — colour again.
 *
 * A state value restated as it stands, or cut to its own first words, keeps
 * the basis it holds, or rises to the restatement's — the rule a truth's
 * restatement already follows (provenance.js raisedBasis, overhaul 2 §5.3).
 * A new value takes its own, and so does one that adds words.
 */

import { describe, it, expect } from 'vitest';
import { applySidecar } from '../../src/factContinuity/ledgers.js';
import { binds } from '../../src/factContinuity/provenance.js';

const AT_CONSOLE = 'at the berth console at Hollow Spire with the PC';
const freshState = () => ({ currentSceneId: 'sc-1', sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' } });
const tell = (cs, value, basis, narrationId) => applySidecar(
  { newTruths: [], stateChanges: [{ subject: 'Vance Oduya', attribute: 'location', value }] },
  { campaignState: cs, asserter: 'narrator', narrationId, basisOf: () => basis });
const locationOf = (cs) => Object.values(cs.sceneState.bySubject).flat().find(e => e.attribute === 'location');

describe('a state value restated as it stands keeps its basis', () => {
  it('the player\'s whereabouts, said again untagged, still bind', () => {
    const cs = freshState();
    tell(cs, AT_CONSOLE, 'player', 'nar-1');
    tell(cs, AT_CONSOLE, 'narrator', 'nar-2');
    expect(locationOf(cs)).toMatchObject({ value: AT_CONSOLE, basis: 'player' });
    expect(binds(locationOf(cs))).toBe(true);
    // Case and spacing aside, it is the same value.
    tell(cs, '  At the berth console at  Hollow Spire with the PC ', 'narrator', 'nar-3');
    expect(locationOf(cs).basis).toBe('player');
  });

  it('colour said again by the player\'s line rises to bind', () => {
    const cs = freshState();
    tell(cs, AT_CONSOLE, 'narrator', 'nar-1');
    tell(cs, AT_CONSOLE, 'player', 'nar-2');
    expect(locationOf(cs).basis).toBe('player');
  });

  it('the player\'s whereabouts, said again in their own first words, still bind', () => {
    const cs = freshState();
    const LONG = 'in the dock office at Hollow Spire with the PC, going through the berth logs';
    tell(cs, LONG, 'player', 'nar-1');
    tell(cs, 'in the dock office at Hollow Spire with the PC', 'narrator', 'nar-2');
    expect(locationOf(cs)).toMatchObject({ value: 'in the dock office at Hollow Spire with the PC', basis: 'player' });
    expect(binds(locationOf(cs))).toBe(true);
  });

  it('words added, or a cut inside a word, or the held value\'s tail, are a new value', () => {
    // What a longer value adds is the narration's.
    const longer = freshState();
    tell(longer, 'in the dock office at Hollow Spire', 'player', 'nar-1');
    tell(longer, 'in the dock office at Hollow Spire, going through the berth logs', 'narrator', 'nar-2');
    expect(locationOf(longer).basis).toBe('narrator');
    // "at the dock" is not the first words of "at the docking ring".
    const inWord = freshState();
    tell(inWord, 'at the docking ring of Hollow Spire', 'player', 'nar-1');
    tell(inWord, 'at the dock', 'narrator', 'nar-2');
    expect(locationOf(inWord).basis).toBe('narrator');
    // "aboard the Kobayashi IV" is the tail of "not aboard …", not its first words.
    const tail = freshState();
    tell(tail, 'not aboard the Kobayashi IV', 'player', 'nar-1');
    tell(tail, 'aboard the Kobayashi IV', 'narrator', 'nar-2');
    expect(locationOf(tail).basis).toBe('narrator');
    // One word is too little to say it again.
    const oneWord = freshState();
    tell(oneWord, 'aboard the Kobayashi IV', 'player', 'nar-1');
    tell(oneWord, 'aboard', 'narrator', 'nar-2');
    expect(locationOf(oneWord).basis).toBe('narrator');
  });

  it('a new value takes its own basis: the narration moving him is colour', () => {
    const cs = freshState();
    tell(cs, AT_CONSOLE, 'player', 'nar-1');
    tell(cs, 'at the foot of the Kobayashi IV\'s ramp', 'narrator', 'nar-2');
    expect(locationOf(cs)).toMatchObject({ value: 'at the foot of the Kobayashi IV\'s ramp', basis: 'narrator' });
    // The value it superseded rides on it, with its own basis, for an X-Card.
    expect(locationOf(cs).previous).toMatchObject({ value: AT_CONSOLE, basis: 'player' });
  });
});
