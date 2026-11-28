/**
 * STARFORGED COMPANION
 * tests/unit/rolledMoveResultBinds.test.js
 *
 * What a rolled move decided binds — filed by the code (issue #402, D1).
 *
 * Issue #388 #5 (RESULT-FLOOR-BY-SHARED-WORD) had a narrator fact tagged
 * `"from": "result"` bind as the dice's on any rolled move. Issue #402's read
 * of every tag the kept long hauls of rounds 5 to 10 recorded (change 1c;
 * test/ci/playwright/judges/tags.json) found 44 right of the 155 a rolled
 * move's narration bound: the rest were the narrator's own names, objects,
 * words and new states, told to every later opening as the dice's ("gave the
 * PC a scrap of paper with a string of digits"). D1, decided from the counts:
 * a `result` tag binds nothing. What the dice decided the code files itself —
 * the stakes line the outcome delivered, in the words the player saw before
 * the roll (provenance.js decidedOfMove, narrator.js moveDiceFacts) — and an
 * oracle's answer (oracleAnswerFiledAsDice.test.js).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { factBasis, groundOf, normaliseGround, decidedOfMove, rolledMove } from '../../src/factContinuity/provenance.js';
import { normaliseSidecar } from '../../src/factContinuity/sidecarParser.js';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { resetSkeletonTable, gmOf, onGm, moveResolution, narrateMoveOn, MODULE_ID, NARRATION_MODEL } from '../helpers/skeletonTable.js';
import { claudeFault } from '../helpers/faults.js';

const PCS = ['Mira Kestrel', 'Kobayashi IV'];
const about = (subject) => [subject, ...PCS];

// Round 5's resolutions, as its cards had them — and the stakes line a Gather
// Information shows before its roll.
const FORGE_A_BOND = { moveId: 'forge_a_bond', outcome: 'strong_hit', moveTarget: 'Tamsin Okoro' };
const GATHER = { moveId: 'gather_information', outcome: 'strong_hit',
  stakes: { hit: 'You learn who saw the raiders last', miss: 'The crews clam up', priceStated: false } };
const DEVELOP = { moveId: 'develop_your_relationship', outcome: null, moveTarget: 'Tamsin Okoro',
  stakes: { hit: 'Tamsin trusts you a little more', miss: 'Tamsin pulls away' } };

describe('a `result` tag binds nothing (issue #402, D1)', () => {
  it('a71\'s bond, a37\'s decisive action, a11\'s report and a44\'s answer are the narrator\'s colour', () => {
    expect(factBasis('result', 'agreed to stand with Mira past the raids; the bond between them is formed',
      groundOf({ line: 'Tamsin, will you stand with me?' }), { about: about('Tamsin Okoro') })).toBe('narrator');
    expect(factBasis('result', 'her gun port is wrecked and a hatch on her ring is jammed half-open; her crew has not come out',
      groundOf({ line: 'I put a burst into her gun port.' }), { about: about('Ashen Wake') })).toBe('narrator');
    expect(factBasis('result', 'saw two dark-running hulls haul a tanker out of the lane at Lyra\'s debris field three shifts ago',
      groundOf({ line: 'I ask the dock crews who saw the raiders.' }), { about: about('dock hand') })).toBe('narrator');
    expect(factBasis('result', 'has at least one crew member alive aboard, trapped behind the jammed hatch',
      groundOf({ line: 'Is anyone left alive aboard the wreck?' }), { about: about('Cinder Wren') })).toBe('narrator');
  });

  it('the parser keeps no `result` tag: such a fact reads as untagged', () => {
    const { newTruths } = normaliseSidecar({ newTruths: [
      { subject: 'Tamsin Okoro', fact: 'agreed to stand with Mira', from: 'result' },
      { subject: 'Tamsin Okoro', fact: 'holds the manifest', from: ' Line ' },
    ] });
    expect(newTruths.map(t => t.from)).toEqual([undefined, 'line']);
  });

  it('a `line` tag still binds by the line\'s own words', () => {
    expect(factBasis('line', 'holds the cargo manifest the PC handed her', groundOf({ line: 'I hand Tamsin the cargo manifest.' }),
      { about: about('Tamsin Okoro') })).toBe('player');
  });
});

describe('what a rolled move decided: the stakes line its outcome delivered (decidedOfMove)', () => {
  it('a strong or a weak hit delivers the hit stated before the roll', () => {
    expect(decidedOfMove(GATHER)).toEqual(['You learn who saw the raiders last']);
    expect(decidedOfMove({ ...GATHER, outcome: 'weak_hit' })).toEqual(['You learn who saw the raiders last']);
  });

  it('a miss delivers the miss only where the stated miss is the price paid', () => {
    expect(decidedOfMove({ ...GATHER, outcome: 'miss', stakes: { ...GATHER.stakes, priceStated: true } })).toEqual(['The crews clam up']);
    expect(decidedOfMove({ ...GATHER, outcome: 'miss' })).toEqual([]);
  });

  it('a move with no roll, or no stakes line, decided nothing — a64\'s Develop, a71\'s progress roll', () => {
    expect(rolledMove(DEVELOP)).toBe(false);
    expect(decidedOfMove(DEVELOP)).toEqual([]);
    expect(decidedOfMove(FORGE_A_BOND)).toEqual([]);
    expect(decidedOfMove(null)).toEqual([]);
  });

  it('rolledMove: an action or progress roll\'s outcome — strong, weak or miss — and nothing else', () => {
    for (const outcome of ['strong_hit', 'weak_hit', 'miss']) expect(rolledMove({ outcome }), outcome).toBe(true);
    for (const outcome of [null, undefined, 'none', 'no_roll']) expect(rolledMove({ outcome }), String(outcome)).toBe(false);
    expect(rolledMove(null)).toBe(false);
  });

  it('a ground is the beat\'s player words alone — a relayed one keeps nothing else', () => {
    expect(normaliseGround({ line: 'x', decided: 'y', rolled: true })).toEqual({ line: 'x' });
    expect(normaliseGround(null)).toEqual({ line: '' });
  });
});

describe('on the table: a narration files what its dice decided (narrator.js moveDiceFacts)', () => {
  let table;
  let restore;
  beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
  afterAll(() => table?.teardown());
  beforeEach(async () => { restore = await resetSkeletonTable(table); });
  afterEach(() => restore?.());

  const truths = () => gmOf(table).run(() => game.settings.get(MODULE_ID, 'campaignState').sceneTruths ?? []);
  const diceFacts = () => truths().filter(t => t.basis === 'dice');
  const gather = (over = {}) => moveResolution({ moveId: 'gather_information', moveName: 'Gather Information',
    outcome: 'strong_hit', outcomeLabel: 'Strong Hit', playerNarration: 'I ask the dock crews who saw the raiders.',
    loremasterContext: '[MOVE: Gather Information +wits] [OUTCOME: Strong Hit]', stakes: GATHER.stakes, ...over });

  it('a11: the hit\'s stakes line is the dice\'s, stamped with the narration; its own `result` fact is colour', async () => {
    table.replies = () => ({ prose: 'The dock hand wipes her hands and talks.', sidecar: { stateChanges: [], newTruths: [
      { subject: 'dock hand', fact: 'saw two dark-running hulls haul a tanker out of the lane three shifts ago', from: 'result' }] } });
    await narrateMoveOn(table, gather());
    expect(diceFacts()).toEqual([expect.objectContaining({ subject: { kind: 'scene', sceneId: 'sc-1' },
      fact: 'You learn who saw the raiders last', source: 'move_result', moveId: 'gather_information', asserter: 'narrator',
      narrationId: expect.any(String) })]);
    const colour = truths().find(t => /dark-running hulls/.test(t.fact));
    expect(colour).toMatchObject({ basis: 'narrator' });
    expect(diceFacts()[0].narrationId).toBe(colour.narrationId);
  });

  it('about the move\'s target when it has one', async () => {
    await narrateMoveOn(table, moveResolution({ moveId: 'compel', moveName: 'Compel', outcome: 'weak_hit', outcomeLabel: 'Weak Hit',
      moveTarget: 'Tamsin Okoro', playerNarration: 'I ask Tamsin to hold the manifest for me.',
      stakes: { hit: 'Tamsin agrees to hold the manifest until you return', miss: 'Tamsin refuses', priceStated: false } }));
    expect(diceFacts()).toEqual([expect.objectContaining({ subject: { kind: 'text', text: 'Tamsin Okoro' },
      fact: 'Tamsin agrees to hold the manifest until you return', moveId: 'compel' })]);
  });

  it('a miss files its stated price only where the miss is the price paid', async () => {
    const stakes = { hit: 'You slip past unseen', miss: 'The escort sees you and raises the alarm' };
    await narrateMoveOn(table, moveResolution({ stakes: { ...stakes, priceStated: false } }));
    expect(diceFacts()).toEqual([]);
    await narrateMoveOn(table, moveResolution({ stakes: { ...stakes, priceStated: true } }));
    expect(diceFacts().map(t => t.fact)).toEqual(['The escort sees you and raises the alarm']);
  });

  it('a Repair hit decides nothing until its points are spent; a move with no roll decides nothing', async () => {
    await narrateMoveOn(table, moveResolution({ moveId: 'repair', moveName: 'Repair', outcome: 'strong_hit', outcomeLabel: 'Strong Hit',
      playerNarration: 'I get under the drive housing.', stakes: { hit: 'The drive is mended', miss: 'The fault spreads' } }));
    await narrateMoveOn(table, moveResolution({ moveId: 'develop_your_relationship', moveName: 'Develop Your Relationship',
      outcome: null, outcomeLabel: null, moveTarget: 'Tamsin Okoro', playerNarration: 'I sit with Tamsin a while.', stakes: DEVELOP.stakes }));
    expect(diceFacts()).toEqual([]);
  });

  it('a reply with no fact block still files it; told twice, it is filed once', async () => {
    table.replies = () => ({ prose: 'The dock hand talks.', sidecar: undefined });
    await narrateMoveOn(table, gather());
    expect(diceFacts().map(t => t.fact)).toEqual(['You learn who saw the raiders last']);
    table.replies = () => ({ prose: 'Another crew says the same.', sidecar: { newTruths: [], stateChanges: [] } });
    await narrateMoveOn(table, gather());
    expect(diceFacts()).toHaveLength(1);
  });

  it('a narration retried after a rate limit files it too', async () => {
    table.script.when(c => c.model === NARRATION_MODEL, claudeFault.rateLimited(), { times: 1 });
    await narrateMoveOn(table, gather());
    expect(diceFacts().map(t => [t.fact, t.moveId])).toEqual([['You learn who saw the raiders last', 'gather_information']]);
  });

  it('a Batch Mode round files each entry\'s, with the entry\'s move', async () => {
    const round = {
      id: 'round-1', number: 1, phase: 'narrating', acting: ['pl-1'],
      entries: { 'pl-1': { userId: 'pl-1', actorId: 'pc-kira', actorName: 'Kira', userName: 'Pat', text: 'I ask the dock crews who saw the raiders.',
        rolled: { narrationInput: { kind: 'move', resolutionId: 'res-1', moveId: 'gather_information', moveName: 'Gather Information',
          statUsed: 'wits', outcome: 'strong_hit', outcomeLabel: 'Strong Hit', isMatch: false, endingTrackIds: [], stakes: GATHER.stakes,
          relevance: { resolvedClass: 'interaction', entityIds: [], entityTypes: [] } } } } },
    };
    const { narrateRound } = await gmOf(table).import('../../src/narration/narrator.js');
    await onGm(table, () => narrateRound({ round, campaignState: foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')) }));
    expect(diceFacts()).toEqual([expect.objectContaining({ fact: 'You learn who saw the raiders last', moveId: 'gather_information' })]);
  });
});
