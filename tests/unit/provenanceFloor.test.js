/**
 * STARFORGED COMPANION
 * tests/unit/provenanceFloor.test.js
 *
 * Overhaul 2, slice 3 (§5.1–5.2, D5) — every fact carries its basis. A
 * narrator fact says where it comes from (`"from": "line"` — the player's
 * line says it; `"from": "result"` — the move's outcome or the oracle's answer
 * decides it), and code checks the claim against the beat's own words with
 * the floor a plan's reveal is read by: one of the fact's own telling words,
 * stemmed, in the ground — a name no evidence. Anything else is the
 * narrator's own colour.
 *
 * The long haul's fourth live run (its replay.json), read so: a6's "gave the
 * PC a written dock-fee slip" — the narration's invention, untagged — is
 * colour and never filed, so it never reaches session 2's opening (known-
 * issues OPENING-CONTRADICTS-WHERE-IT-STOPPED); a15's manifest, tagged
 * `line` under "I leave the cargo manifest with Tamsin for safekeeping.", is
 * the player's; a7's "agreed to open a ledger page … no fee", tagged `line`,
 * shares no telling word with its line and is refused; the line's own fact
 * ("Mira left the fee slip on Tamsin's counter") is the player's.
 */

import { describe, it, expect } from 'vitest';
import { factBasis, groundOf, decidedOfMove, entryBasis, binds, raisedBasis, saidBy } from '../../src/factContinuity/provenance.js';
import { normaliseSidecar, extractSidecar } from '../../src/factContinuity/sidecarParser.js';
import { applySidecar } from '../../src/factContinuity/ledgers.js';

const PCS = ['Mira Kestrel', 'Kobayashi IV'];
const about = (subject) => [subject, ...PCS];

/** Run 4's lines and fact blocks, as the run recorded them. */
const A6 = {
  line: "I set my hands flat on her counter. I'm not asking for a discount, Tamsin. I want you as my contact on Hollow Spire, someone I trust here and who can trust me back.",
  fact: "gave the PC a written dock-fee slip; will open a ledger page in the PC's name once it is paid",
};
const A7 = {
  line: "I leave the fee slip where it is and hold her gaze. I'm not buying anything, Tamsin. I'm asking you to be my friend on this dock, and I'll be yours. Will you be my connection here?",
  fact: "agreed to open a ledger page in the PC's name with no fee, ready tomorrow",
  own:  "Mira left the fee slip on Tamsin's counter",
};
const A15 = {
  line: 'I leave the cargo manifest with Tamsin for safekeeping.',
  fact: "holds Mira Kestrel's cargo manifest for safekeeping under her ledger",
};
const COMPEL = {
  resolution: { moveId: 'compel', outcome: 'strong_hit', stakes: { hit: 'Tamsin agrees to hold the manifest until the next cargo tide', miss: 'Tamsin turns her back' } },
  fact: 'agreed to hold the manifest until the next cargo tide',
};

describe('overhaul 2 §5.2 — the floor over the beat\'s own words', () => {
  it('a6\'s slip, untagged, is the narration\'s colour — even tagged, its words are not the line\'s', () => {
    expect(factBasis(null, A6.fact, groundOf({ line: A6.line }), { about: about('Tamsin Vey') })).toBe('narrator');
    expect(factBasis('line', A6.fact, groundOf({ line: A6.line }), { about: about('Tamsin Vey') })).toBe('narrator');
  });

  it('a15\'s manifest, tagged line, is the player\'s: "cargo", "manifest", "safekeeping"', () => {
    expect(factBasis('line', A15.fact, groundOf({ line: A15.line }), { about: about('Tamsin Vey') })).toBe('player');
  });

  it('a7\'s "ledger page … no fee", tagged line, is refused; the line\'s own fact is the player\'s', () => {
    expect(factBasis('line', A7.fact, groundOf({ line: A7.line }), { about: about('Tamsin Vey') })).toBe('narrator');
    expect(factBasis('line', A7.own, groundOf({ line: A7.line }), { about: about('Mira Kestrel') })).toBe('player');
  });

  it('a Compel hit\'s "agreed to hold the manifest", tagged result, is the dice\'s — against the stakes the hit delivered', () => {
    const ground = groundOf({ line: 'I ask Tamsin to keep the manifest safe.', decided: decidedOfMove(COMPEL.resolution) });
    expect(ground.decided).toBe(COMPEL.resolution.stakes.hit);
    expect(factBasis('result', COMPEL.fact, ground, { about: about('Tamsin Vey') })).toBe('dice');
    // On a miss the miss is what the dice decided, not the hit.
    expect(decidedOfMove({ ...COMPEL.resolution, outcome: 'miss' })).toEqual(['Tamsin turns her back']);
    // A result tag with no result to bear it out is colour.
    expect(factBasis('result', COMPEL.fact, groundOf({ line: 'I ask Tamsin to keep the manifest safe.' }), { about: about('Tamsin Vey') })).toBe('narrator');
  });

  it('a name is no evidence; a fact with no telling word of its own binds nothing', () => {
    expect(factBasis('line', 'is Tamsin Vey', groundOf({ line: 'I nod to Tamsin Vey.' }), { about: about('Tamsin Vey') })).toBe('narrator');
    expect(factBasis('line', 'is here', groundOf({ line: 'I am here.' }), { about: [] })).toBe('narrator');
  });

  it('bases: the table\'s bind, the narrator\'s does not; an old entry reads as its asserter', () => {
    for (const b of ['player', 'dice', 'gm', 'setup']) expect(binds({ basis: b }), b).toBe(true);
    expect(binds({ basis: 'narrator' })).toBe(false);
    expect(entryBasis({ asserter: 'gm' })).toBe('gm');
    expect(entryBasis({ asserter: 'player' })).toBe('player');
    expect(entryBasis({ asserter: 'narrator' })).toBe('narrator');
    expect(entryBasis({})).toBe('narrator');
    expect(entryBasis({ basis: 'bogus', asserter: 'gm' })).toBe('gm');
    expect(raisedBasis('narrator', 'player')).toBe('player');
    expect(raisedBasis('player', 'narrator')).toBe('player');
    expect(raisedBasis('gm', 'dice')).toBe('gm');
    expect(saidBy(['n1', 'n2', 'n3'], 'n4')).toEqual(['n4', 'n1', 'n2']);
    expect(saidBy(['n1'], 'n1')).toEqual(['n1']);
  });
});

describe('overhaul 2 §5.2 — the tag, through the parser and the ledger', () => {
  it('"from" is "line" or "result", case and spaces aside; anything else is colour', () => {
    const { newTruths, stateChanges } = normaliseSidecar({
      newTruths: [
        { subject: 'Tamsin Vey', fact: 'a', from: 'line' },
        { subject: 'Tamsin Vey', fact: 'b', from: ' Result ' },
        { subject: 'Tamsin Vey', fact: 'c', from: 'lines' },
        { subject: 'Tamsin Vey', fact: 'd', from: 42 },
        { subject: 'Tamsin Vey', fact: 'e', from: ['line'] },
        { subject: 'Tamsin Vey', fact: 'f' },
        'not an entry',
        null,
      ],
      stateChanges: [{ subject: 'Tamsin Vey', attribute: 'location', value: 'her stall', from: 'LINE' }, { subject: 'x', attribute: 'y', value: 'z', from: {} }],
    });
    // An untagged, misspelled or garbage tag is left off: the fact is colour.
    expect(newTruths.slice(0, 6).map(t => t.from)).toEqual(['line', 'result', undefined, undefined, undefined, undefined]);
    expect(newTruths.slice(2, 6).every(t => !('from' in t))).toBe(true);
    expect(newTruths.slice(6)).toEqual(['not an entry', null]);
    expect(stateChanges.map(c => c.from)).toEqual(['line', undefined]);
  });

  it('a fenced block keeps the tag through extraction', () => {
    const { sidecar } = extractSidecar('Tamsin takes the manifest.\n```json\n{"newTruths":[{"subject":"Tamsin Vey","fact":"holds the manifest","from":"line"}],"stateChanges":[]}\n```');
    expect(sidecar.newTruths[0].from).toBe('line');
  });

  it('applySidecar writes each truth and state value with the basis its floor gives, and colour with who said it', () => {
    const cs = { currentSessionId: 's1', currentSceneId: 'sc-1', sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' } };
    const ground = groundOf({ line: A15.line });
    const basisOf = ({ from, text, subject }) => factBasis(from, text, ground, { about: about(subject) });
    applySidecar({
      newTruths: [{ subject: 'Tamsin Vey', fact: A15.fact, from: 'line' }, { subject: 'scene', fact: 'the dock lamps burn amber' }],
      stateChanges: [{ subject: 'Tamsin Vey', attribute: 'location', value: 'her ledger stall', from: 'line' }],
    }, { campaignState: cs, asserter: 'narrator', narrationId: 'nar-15', basisOf });
    expect(cs.sceneTruths.map(t => [t.fact, t.basis, t.said])).toEqual([
      [A15.fact, 'player', ['nar-15']],
      ['the dock lamps burn amber', 'narrator', ['nar-15']],
    ]);
    // "her ledger stall" shares no word with the line: the narration placed her.
    expect(Object.values(cs.sceneState.bySubject)[0][0]).toMatchObject({ attribute: 'location', basis: 'narrator' });
  });

  it('without a floor every fact is its asserter\'s — a narrator\'s colour', () => {
    const cs = { currentSessionId: 's1', currentSceneId: 'sc-1', sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' } };
    applySidecar({ newTruths: [{ subject: 'Tamsin Vey', fact: A15.fact, from: 'line' }], stateChanges: [] }, { campaignState: cs, asserter: 'narrator' });
    expect(cs.sceneTruths[0].basis).toBe('narrator');
  });
});
