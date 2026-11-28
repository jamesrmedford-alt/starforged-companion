/**
 * STARFORGED COMPANION
 * tests/unit/provenanceFloor.test.js
 *
 * Overhaul 2, slice 3 (§5.1–5.2, D5) — every fact carries its basis. A
 * narrator fact says where it comes from (`"from": "line"` — the player's
 * line says it), and code checks the claim against the beat's own words with
 * the floor a plan's reveal is read by: one of the fact's own telling words,
 * stemmed, in the ground — a name no evidence. Anything else is the
 * narrator's own colour. (Its `"from": "result"` — the move's outcome or the
 * oracle's answer decides it — is retired by issue #402's D1: what the dice
 * decided the code files itself; rolledMoveResultBinds.test.js.)
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
import { appendSidecarInstruction } from '../../src/narration/narratorPrompt.js';

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

  it('a Compel hit\'s "agreed to hold the manifest", tagged result, is colour — the code files the stakes the hit delivered (issue #402, D1)', () => {
    expect(factBasis('result', COMPEL.fact, groundOf({ line: 'I ask Tamsin to keep the manifest safe.' }), { about: about('Tamsin Vey') })).toBe('narrator');
    expect(decidedOfMove(COMPEL.resolution)).toEqual([COMPEL.resolution.stakes.hit]);
    // On a miss the miss is what the dice decided where it is the price paid — not the hit.
    expect(decidedOfMove({ ...COMPEL.resolution, outcome: 'miss', stakes: { ...COMPEL.resolution.stakes, priceStated: true } }))
      .toEqual(['Tamsin turns her back']);
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
  it('"from" is "line", case and spaces aside; anything else — "result" too (issue #402, D1) — is colour', () => {
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
    expect(newTruths.slice(0, 6).map(t => t.from)).toEqual(['line', undefined, undefined, undefined, undefined, undefined]);
    expect(newTruths.slice(1, 6).every(t => !('from' in t))).toBe(true);
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

  it('a reveal adds no fact of its own: a truth marked with a plan rests on its words, like any other (issue #402, change 1b)', () => {
    // The fifth live long haul's a81 had the plan's truth filed as the GM's
    // (issue #388 #6); round 10's a75 then had a plan's whole text — the
    // culprit, why, what he holds, a second name — filed as established beside
    // a narration that told a name and "one hand behind all of it". A reveal
    // now files what the narration told: a `revealOf` mark, the model's or
    // anyone's, gives a truth no basis and is not kept.
    const cs = { currentSessionId: 's1', currentSceneId: 'sc-1', sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' } };
    const truth = "The raiders are not strangers: they hold access to the Kobayashi IV's own systems, and have been listening through the galley's unexplained installation since before Mira swore her vow.";
    applySidecar({
      newTruths: [{ subject: 'the raiders of the Cinder Expanse lanes', fact: truth, revealOf: 'sk-F64M6OWBHfW7CGwa' },
        { subject: 'Tamsin Okoro', fact: 'rubs the pen between her fingers' }],
      stateChanges: [],
    }, { campaignState: cs, asserter: 'narrator', narrationId: 'nar-81', basisOf: () => 'narrator' });
    expect(cs.sceneTruths.map(t => [t.fact, t.basis, t.revealOf ?? null])).toEqual([
      [truth, 'narrator', null],
      ['rubs the pen between her fingers', 'narrator', null],
    ]);
  });

  it('without a floor every fact is its asserter\'s — a narrator\'s colour', () => {
    const cs = { currentSessionId: 's1', currentSceneId: 'sc-1', sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' } };
    applySidecar({ newTruths: [{ subject: 'Tamsin Vey', fact: A15.fact, from: 'line' }], stateChanges: [] }, { campaignState: cs, asserter: 'narrator' });
    expect(cs.sceneTruths[0].basis).toBe('narrator');
  });
});

describe('overhaul 2 §5.2 — the rule asks for the tag on what the player\'s own line states', () => {
  // The tag is the only way a narrator fact binds (D5): untagged, the gather
  // line's dockmaster placed "with him" at the Hollow Spire is colour, and
  // his place never becomes LAST KNOWN (first-session's end step).
  const flat = (text) => text.replace(/\s+/g, ' ');

  it('says it plainly, frame or no frame, with a worked example from a line', () => {
    for (const options of [{}, { sceneFrameEnabled: false }, { skeletonsEnabled: true }]) {
      const rule = flat(appendSidecarInstruction(options));
      expect(rule).toContain('A fact the player\'s own line states is always tagged "from": "line"');
      expect(rule).toContain('where they and whoever is with them are');
      expect(rule).toContain('E.g. the line "I hand Kael the datapad and wait with him in the cargo bay" states');
      expect(rule).toContain('"attribute": "location", "value": "in the cargo bay with the PC", "from": "line" }');
    }
  });

  it('the example\'s facts are the player\'s by the floor — the thing given, and where he is', () => {
    const ground = groundOf({ line: 'I hand Kael the datapad and wait with him in the cargo bay' });
    expect(factBasis('line', 'holds the datapad the PC handed him', ground, { about: about('Kael Dros') })).toBe('player');
    expect(factBasis('line', 'in the cargo bay with the PC', ground, { about: about('Kael Dros') })).toBe('player');
    // Untagged, the same facts are the narration's colour.
    expect(factBasis(null, 'in the cargo bay with the PC', ground, { about: about('Kael Dros') })).toBe('narrator');
  });
});
