/**
 * STARFORGED COMPANION
 * tests/unit/ledgerBlockShape.test.js
 *
 * Overhaul 2, slice 3 (§5.5, D8 — amends invariant 4) — the ACTIVE SCENE
 * block, in the order the narrator should weigh it: THE SCENE (why it began;
 * the place and the ship by the table's record; where in it, who is present
 * and what is happening as the narration has it; what it turns on, the
 * player's) → WHAT BINDS (the player's, the dice's, the GM's, the premise's,
 * each labelled) → CORRECTED → STANDING NOW → WHAT THE NARRATION HAS
 * DESCRIBED (colour: kept to while it stands, changed without argument, not
 * carried out of the scene) → PLAY LET THESE GO → the command vehicle.
 *
 * It used to open "BINDING TRUTHS AND CURRENT STATE … They are binding …
 * must not diverge from them" over every truth the narration wrote and the
 * frame's Where — so the narration argued its scenery against the player's
 * line (FRAME-REASONING-IN-PROSE, the fourth live run's a15: "You are no
 * longer at Tamsin's stall, so the manifest is not where you left it").
 *
 * Under the cap the described colour sheds first — state, then truths, the
 * oldest first — then standing state; THE SCENE, WHAT BINDS, CORRECTED,
 * PLAY LET THESE GO and the ship are never dropped.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildLedgerBlock } from '../../src/narration/narratorPrompt.js';

const MODULE = 'starforged-companion';
const truth = (id, fact, basis, over = {}) => ({ id, subject: { kind: 'text', text: 'Tamsin Vey' }, fact, retracted: false, basis,
  narrationId: `nar-${id}`, said: [`nar-${id}`], createdAt: Number(id.replace(/\D/g, '')) || 1, ...over });

function scene(over = {}) {
  return {
    currentSessionId: 's1', currentSceneId: 'sc-2', currentLocationId: 'set-bleak', currentLocationType: 'settlement',
    shipIds: ['ship-1'],
    sceneBegan: { sceneId: 'sc-2', at: 1, cause: 'place', what: 'the Kobayashi IV arrived at Bleakhold Station', place: null, ship: null,
      tracks: { combat: [], expedition: [], scene_challenge: [] } },
    sceneFrame: { sceneId: 'sc-2', location: "Tamsin's ledger stall on the market deck", present: ['Tamsin Vey'],
      situation: 'Tamsin weighs the offer', question: 'Will Tamsin hold the manifest?', narrationId: 'nar-t1',
      letGo: [{ text: 'Who is hailing the ship?', stems: ['hail', 'ship'] }] },
    sceneTruths: [
      truth('t1', 'agreed to hold the manifest until the next cargo tide', 'dice'),
      truth('t2', 'Mira left the manifest with her for safekeeping', 'player'),
      truth('t3', 'runs the ledger stall; she/her', 'narrator'),
      { id: 't4', subject: { kind: 'text', text: 'raider cutter' }, fact: 'is named the Cinder Wren', retracted: false, asserter: 'gm', createdAt: 4 },
    ],
    sceneState: { sceneId: 'sc-2', bySubject: {
      'tamsin vey': [
        { attribute: 'location', value: 'her ledger stall', basis: 'player', updatedAt: 1, narrationId: 'nar-t2', subjectText: 'Tamsin Vey' },
        { attribute: 'mood', value: 'wary', basis: 'narrator', updatedAt: 2, narrationId: 'nar-t3', subjectText: 'Tamsin Vey' },
      ],
    } },
    ...over,
  };
}

beforeEach(() => {
  game.actors?._set?.('ship-1', makeTestActor({ id: 'ship-1', name: 'Kobayashi IV', type: 'starship',
    flags: { [MODULE]: { ship: { isCommandVehicle: true, type: 'starship', position: { nearestSettlementId: 'set-bleak', freeText: 'Bleakhold Station', updatedBy: 'at_command' } } } } }));
  game.actors?._set?.('set-bleak', makeTestActor({ id: 'set-bleak', name: 'Bleakhold Station', type: 'location',
    flags: { [MODULE]: { settlement: { name: 'Bleakhold Station' } } } }));
});
afterEach(() => { game.actors?._delete?.('ship-1'); game.actors?._delete?.('set-bleak'); });

describe('overhaul 2 §5.5 — the block, in the order the narrator weighs it', () => {
  it('the sections, in order, under the new heading — and the old "They are binding" header is gone', () => {
    const { combined } = buildLedgerBlock(scene(), { sceneBeats: 4 });
    const at = (s) => combined.indexOf(s);
    expect(combined.startsWith('## ACTIVE SCENE — WHAT BINDS, AND WHAT THE NARRATION DESCRIBED')).toBe(true);
    const order = ['THE SCENE — began 4 beats ago, when the Kobayashi IV arrived at Bleakhold Station.', 'WHAT BINDS —', 'STANDING NOW:',
      'WHAT THE NARRATION HAS DESCRIBED —', 'PLAY LET THESE GO —', 'COMMAND VEHICLE: Kobayashi IV'];
    for (const s of order) expect(at(s), s).toBeGreaterThan(-1);
    expect(order.map(at)).toEqual([...order.map(at)].sort((a, b) => a - b));
    expect(combined).not.toContain('BINDING TRUTHS AND CURRENT STATE');
    expect(combined).not.toContain('They are');
    expect(combined).not.toContain('must not diverge');
  });

  it('THE SCENE: the place and the ship by the stores, the frame as the narration\'s, what it turns on as the player\'s', () => {
    const { scene: block, place } = buildLedgerBlock(scene(), { sceneBeats: 1 });
    expect(block).toContain('THE SCENE — began 1 beat ago, when the Kobayashi IV arrived at Bleakhold Station.');
    expect(place).toContain("  Place:    Bleakhold Station — where the characters are, by the table's record");
    expect(place).toMatch(/  Ship:     Kobayashi IV .*Bleakhold Station/);
    expect(block).toContain("  Where:    Tamsin's ledger stall on the market deck — as the narration has it");
    expect(block).toContain('  Present:  Tamsin Vey');
    expect(block).toContain('  Now:      Tamsin weighs the offer — as the narration has it');
    expect(block).toContain("  Turns on: Will Tamsin hold the manifest? — from the player's line");
    // The ship's position is THE SCENE's: no line of its own any more.
    expect(buildLedgerBlock(scene()).combined).not.toContain('SHIP POSITION:');
    // With no anchor (a scene open before this shipped) the head is plain; with no count, "began when".
    expect(buildLedgerBlock(scene({ sceneBegan: null })).scene.split('\n')[0]).toBe('THE SCENE');
    expect(buildLedgerBlock(scene()).scene.split('\n')[0]).toBe('THE SCENE — began when the Kobayashi IV arrived at Bleakhold Station.');
  });

  it('what binds, labelled; colour apart; an old GM truth binds as the GM\'s', () => {
    const { binds, described, standing } = buildLedgerBlock(scene());
    expect(binds).toContain('WHAT BINDS — what the player said, the dice decided or the GM set. Never contradict it:');
    expect(binds).toContain('  Tamsin Vey — agreed to hold the manifest until the next cargo tide (the dice)');
    expect(binds).toContain('  Tamsin Vey — Mira left the manifest with her for safekeeping (the player)');
    expect(binds).toContain('  raider cutter — is named the Cinder Wren (the GM)');
    expect(binds).not.toContain('runs the ledger stall');
    expect(described).toContain('  Tamsin Vey — runs the ledger stall; she/her');
    expect(described).toContain('  Tamsin Vey — mood: wary');
    expect(described).toContain('When the player\'s\nline, the dice or the GM change any of it, it changes, and the narration follows without a word of argument.');
    expect(standing).toBe('STANDING NOW:\n  Tamsin Vey — location: her ledger stall (the player)');
  });

  it('under a 120-token cap: described state, then described truths, then standing state shed — the rest never', () => {
    const many = scene({ sceneTruths: [...scene().sceneTruths,
      ...Array.from({ length: 6 }, (_, i) => truth(`t${10 + i}`, `describes the ${['lamp', 'crate', 'awning', 'bell', 'scale', 'ledger'][i]} at length, with a great deal of colour`, 'narrator'))] });
    const full = buildLedgerBlock(many);
    const capped = buildLedgerBlock(many, { maxTokens: 120 });
    expect(full.described.length).toBeGreaterThan(capped.described.length);
    // The fixed tiers stand whole.
    for (const k of ['scene', 'binds', 'letGo']) expect(capped[k], k).toBe(full[k]);
    expect(capped.combined).toContain('COMMAND VEHICLE: Kobayashi IV');
    // The described state went before any described truth: the mood line is the first to go.
    const half = buildLedgerBlock(many, { maxTokens: Math.ceil(full.combined.length / 4) - 5 });
    expect(half.described).not.toContain('mood: wary');
    expect(half.described).toContain('runs the ledger stall');
    // Standing state goes only once the colour is gone.
    const tight = buildLedgerBlock(many, { maxTokens: 1 });
    expect(tight.described).toBe('');
    expect(tight.standing).toBe('');
    expect(tight.binds).toBe(full.binds);
  });
});
