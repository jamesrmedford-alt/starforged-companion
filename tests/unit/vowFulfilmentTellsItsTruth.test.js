/**
 * STARFORGED COMPANION
 * tests/unit/vowFulfilmentTellsItsTruth.test.js
 *
 * known-issues VOW-FULFILLED-WITH-NOBODY-NAMED — the long haul's third live
 * run (explorations/long-haul-live-20261124-0321, a64).
 *
 * "Find who is raiding the Cinder Expanse lanes" was fulfilled on a strong
 * hit, and the narration said: "The thing you swore to find has a hand and a
 * seal, and both are named now." No name is anywhere in the story. The recap
 * repeated it ("have a name"), and four steps on an NPC asked "Whose name did
 * you decide on?". The narration's fact block read
 *   "reveals": [{ "id": "sk-JXaR4dHYkGuq4PkU", "revealed": ["truth"], "resolved": true }]
 * and the mark was taken at its word: the vow's hidden truth became a binding
 * scene fact and confirmed lore, and its oracle rolls were shown to the table
 * — with none of it told.
 *
 * Why: the fulfilment's prompt held the plan under UNREVEALED's standing rule,
 * "Never state one outright", beside "record … "truth" as revealed if it
 * comes out"; nothing lifted the rule for the beat that ends the vow, nothing
 * said a fulfilment may not claim an answer it does not state, and nothing
 * checked the mark against the prose.
 *
 * Now: (1) the beat that fulfils a vow is told its plan's truth is told
 * there, in the prose, and that it claims nothing the truth does not hold;
 * (2) every fulfilment is told never to say an answer is known without
 * stating it, and to say what is still not known; (3) "truth" comes off a
 * reveal whose prose told none of it.
 *
 * The plan, the prose and the fact block below are the run's own.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import {
  MODULE_ID, resetSkeletonTable, gmOf, plansOf, narrationCallsOf, onGm, moveResolution, narrateMoveOn,
} from '../helpers/skeletonTable.js';
import { proseTellsTruth } from '../../src/world/skeletons.js';
import { formatUnrevealedBlock, buildNarratorUserMessage, buildRoundUserMessage } from '../../src/narration/narratorPrompt.js';

const VOW   = 'Find who is raiding the Cinder Expanse lanes';
const TRUTH = "The raiders are a coordinated crew working the lanes from inside Hollow Spire's shadow, preying on supply haulers "
  + 'and sparing no one who might carry word of them. Their leader threatens the one thing the settlements still protect: '
  + 'a vulnerable enclave kept hidden from the lanes.';
// a64, as narrated.
const A64_PROSE = '"I\'d still like that slip back," the dry voice says. You don\'t answer it. You set the stamp square on the galley table, '
  + 'and the weight of the vow lifts off you. The thing you swore to find has a hand and a seal, and both are named now. '
  + 'The drawer by your hip slides open its inch, and the compass needle swings north and stops.';
const A64_OUTCOME = '[MOVE: Fulfill Your Vow] [ROLL: Progress score: 4 vs Challenge: 1, 2] [OUTCOME: Strong Hit] '
  + '[CONSEQUENCE: Vow fulfilled. Legacy reward marked on quests track per vow rank.]';
// A fulfilment that tells it.
const TELLING = 'The stamp, the registry and the slip agree. It is one crew, working the lanes out of Hollow Spire\'s shadow, '
  + 'and their leader is hunting an enclave the settlements have kept hidden. You still have no name for him.';

const vowPlan = (over = {}) => ({
  id: 'sk-JXaR4dHYkGuq4PkU', kind: 'vow', status: 'active', subject: { type: 'vow', id: 'vow-lanes-1', name: VOW },
  truth: TRUTH, wants: 'To keep the lanes frightened and unwatched.', knows: '', escalation: [], clues: [], resolutions: [], ...over,
});

describe('a narration tells a truth, or it does not (proseTellsTruth)', () => {
  it('a64: the fulfilment\'s prose told none of the vow\'s truth', () => {
    expect(proseTellsTruth(A64_PROSE, TRUTH, { about: [VOW] })).toBe(false);
  });

  it('a fulfilment that says who the raiders are tells it', () => {
    expect(proseTellsTruth(TELLING, TRUTH, { about: [VOW] })).toBe(true);
  });

  it('the vow\'s own words tell nothing: "found who is raiding the lanes" is the claim, not the answer', () => {
    expect(proseTellsTruth('You have found who is raiding the Cinder Expanse lanes. It is done.', TRUTH, { about: [VOW] })).toBe(false);
  });

  it('a telling in other forms of the truth\'s words counts (hidden, hauler, protects)', () => {
    expect(proseTellsTruth('Someone is protecting a place nobody was meant to find.', TRUTH, { about: [VOW] })).toBe(true);
  });

  it('a truth with no telling words of its own is not checked', () => {
    expect(proseTellsTruth('Anything at all.', 'It is them.', { about: [] })).toBe(true);
  });
});

describe('the beat that fulfils a vow is told its truth is told there (UNREVEALED)', () => {
  it('the rule against stating a truth is lifted for the vow the beat ends, and it claims nothing the truth lacks', () => {
    const block = formatUnrevealedBlock([vowPlan()], { endingSubjectIds: ['vow-lanes-1'] });
    expect(block).toMatch(/Never state one outright/);                                    // the standing rule it lifts
    expect(block).toContain('### THIS BEAT ENDS A VOW');
    expect(block).toContain(`The move this beat narrates fulfils Vow — ${VOW} (id sk-JXaR4dHYkGuq4PkU).`);
    expect(block).toMatch(/For this plan the rule against stating a truth outright is lifted/);
    expect(block).toMatch(/state that truth in the narration itself, in plain words a player could repeat/);
    expect(block).toMatch(/A truth\s+recorded as revealed that the prose did not tell is not revealed/);
    expect(block).toMatch(/Where it gives no name, there is no name: say what was found,\s+and say plainly that the rest — who, by name — is still not known/);
    expect(block).toMatch(/Never write that an answer is "known", "named", "found" or "proved" without saying what it is/);
  });

  it('the vow\'s line no longer says its end reveals its truth', () => {
    const block = formatUnrevealedBlock([vowPlan()]);
    expect(block).not.toMatch(/"truth" as revealed if it comes out/);
    expect(block).toMatch(/Its truth comes out only by being told: record "truth" as revealed when your prose states it, never because the vow ended/);
  });

  it('every reveal: "truth" only when the prose states it', () => {
    expect(formatUnrevealedBlock([vowPlan()])).toMatch(/"truth" only when the prose of this narration states the truth itself, naming what it names/);
  });

  it('control: a beat that ends no vow is told nothing of the kind; nor is a truth the X-Card withheld', () => {
    expect(formatUnrevealedBlock([vowPlan()])).not.toContain('THIS BEAT ENDS A VOW');
    expect(formatUnrevealedBlock([vowPlan()], { endingSubjectIds: ['another-vow'] })).not.toContain('THIS BEAT ENDS A VOW');
    expect(formatUnrevealedBlock([vowPlan({ truthWithheldBy: 'nar-x' })], { endingSubjectIds: ['vow-lanes-1'] })).not.toContain('THIS BEAT ENDS A VOW');
    // An expedition a move finishes has its own line; this block is the vow's.
    const expedition = vowPlan({ kind: 'expedition', subject: { type: 'track', id: 'trk-1', name: 'Bleakhold Reach' } });
    expect(formatUnrevealedBlock([expedition], { endingSubjectIds: ['trk-1'] })).not.toContain('THIS BEAT ENDS A VOW');
  });
});

describe('every fulfilment is told never to claim an answer it does not state (the move\'s user message)', () => {
  const fulfil = (over = {}) => ({ moveId: 'fulfill_your_vow', moveName: 'Fulfill Your Vow', outcome: 'strong_hit',
    outcomeLabel: 'Strong Hit', loremasterContext: A64_OUTCOME, ...over });

  it('a64\'s Fulfill Your Vow, a strong hit', () => {
    const user = buildNarratorUserMessage(fulfil(), 'Attempt to fulfill your vow.', 3, 'Mira Kestrel');
    expect(user).toContain(A64_OUTCOME);
    expect(user).toContain('## THE VOW IS FULFILLED');
    expect(user).toMatch(/Say what the vow set out to find, do or learn, and only as far as the story holds it/);
    expect(user).toMatch(/Never write that an answer is known, named, found or proved without stating it in this narration/);
    expect(user).toMatch(/Where the story holds no answer — no name, no face, no place — the vow ends on what was done, and the narration says plainly what is still not known/);
    expect(user.indexOf('## THE VOW IS FULFILLED')).toBeLessThan(user.indexOf('## PLAYER NARRATION'));
  });

  it('a weak hit fulfils it too; a miss does not, and no other move is told this', () => {
    expect(buildNarratorUserMessage(fulfil({ outcome: 'weak_hit' }), 'Attempt to fulfill your vow.', 3, 'Mira Kestrel')).toContain('## THE VOW IS FULFILLED');
    expect(buildNarratorUserMessage(fulfil({ outcome: 'miss' }), 'Attempt to fulfill your vow.', 3, 'Mira Kestrel')).not.toContain('THE VOW IS FULFILLED');
    expect(buildNarratorUserMessage(fulfil({ moveId: 'reach_a_milestone' }), 'Mark progress on your vow.', 3, 'Mira Kestrel')).not.toContain('THE VOW IS FULFILLED');
  });

  it('a Batch Mode round\'s fulfilment is told under its own entry', () => {
    const user = buildRoundUserMessage({ entries: [{ actorName: 'Mira Kestrel', text: 'Attempt to fulfill your vow.',
      input: { kind: 'move', moveId: 'fulfill_your_vow', moveName: 'Fulfill Your Vow', outcome: 'strong_hit', outcomeLabel: 'Strong Hit', loremasterContext: A64_OUTCOME } }], sentenceTarget: 3 });
    expect(user).toContain('#### THE VOW IS FULFILLED');
  });
});

describe('VOW-FULFILLED-WITH-NOBODY-NAMED — a plan is not marked revealed by a narration that did not tell it (simulated table)', () => {
  let table;
  let restore;
  beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
  afterAll(() => table?.teardown());
  beforeEach(async () => { restore = await resetSkeletonTable(table); });
  afterEach(() => restore?.());

  const stored = () => gmOf(table).run(() => game.settings.get(MODULE_ID, 'campaignState'));
  const planOf = (id) => plansOf(table).find(p => p.id === id);
  const lastCall = () => narrationCallsOf(table).at(-1);
  const lore = async () => {
    const { getConfirmedLore } = await gmOf(table).import('../../src/world/worldJournal.js');
    return gmOf(table).run(() => getConfirmedLore(null));
  };
  const reply = (prose, sidecar) => () => ({ prose, sidecar: { newTruths: [], stateChanges: [], ...sidecar } });

  /** The vow's hidden plan, as the swearing scene filed it. */
  async function seedVowPlan() {
    const { createSkeleton } = await gmOf(table).import('../../src/world/secrets.js');
    return onGm(table, () => createSkeleton({
      kind: 'vow', subject: { type: 'vow', id: 'vow-lanes-1', name: VOW }, truth: TRUTH,
      wants: 'To keep the lanes frightened and unwatched, and to find the enclave that no one is supposed to know exists.',
      oracleSeeds: ['Action + Theme: Fortify / Solution'], sceneId: 'sc-earlier', sessionId: 's-1',
    }));
  }
  const fulfilment = () => moveResolution({ moveId: 'fulfill_your_vow', moveName: 'Fulfill Your Vow', outcome: 'strong_hit',
    outcomeLabel: 'Strong Hit', loremasterContext: A64_OUTCOME, playerNarration: 'Attempt to fulfill your vow.', endingTrackIds: ['vow-lanes-1'] });

  it('a64 replayed: the prose tells none of the truth, so the mark is not taken — no scene fact, no lore, no rolls shown', async () => {
    const plan = await seedVowPlan();
    table.replies = reply(A64_PROSE, { reveals: [{ id: plan.id, revealed: ['truth'], resolved: true }] });
    await narrateMoveOn(table, fulfilment());

    // What the narration was told.
    expect(lastCall().system).toContain('### THIS BEAT ENDS A VOW');
    expect(lastCall().system).toContain(`(id ${plan.id})`);
    expect(lastCall().userText).toContain('## THE VOW IS FULFILLED');
    // What its fact block was allowed to record.
    expect(planOf(plan.id).truthRevealed, 'the truth is not revealed by a narration that did not tell it').toBe(false);
    expect(planOf(plan.id).rollsShown, 'the oracle rolls behind it stay hidden').not.toBe(true);
    expect(planOf(plan.id).status, 'the vow\'s story still ends').toBe('resolved');
    expect((stored().sceneTruths ?? []).map(t => t.fact), 'the truth is no scene fact').not.toContain(TRUTH);
    expect((await lore()).map(e => e.text), 'and no lore').not.toContain(TRUTH);
    expect(table.cards(f => f.narratorCard === true && f.narrationText === A64_PROSE), 'the narration itself posts').toHaveLength(1);
  }, 60_000);

  it('a fulfilment that tells the truth reveals it: the plan, the scene fact, the lore', async () => {
    const plan = await seedVowPlan();
    table.replies = reply(TELLING, { reveals: [{ id: plan.id, revealed: ['truth'], resolved: true }] });
    await narrateMoveOn(table, fulfilment());

    expect(planOf(plan.id)).toMatchObject({ truthRevealed: true, status: 'resolved' });
    expect((stored().sceneTruths ?? []).map(t => t.fact)).toContain(TRUTH);
    expect((await lore()).map(e => e.text)).toContain(TRUTH);
  }, 60_000);

  it('the rest of an untold reveal stands: a clue shown with it is still marked', async () => {
    const { createSkeleton } = await gmOf(table).import('../../src/world/secrets.js');
    const plan = await onGm(table, () => createSkeleton({
      kind: 'threat', subject: { type: 'name', name: 'the escort' }, truth: 'The escort is a Keeper drone collecting names for the Pale Choir.',
      clues: ['A pulse that counts down'], sceneId: 'sc-1', sessionId: 's-1',
    }));
    table.replies = reply('The escort turns, and something under its hull begins to count.', { reveals: [{ id: plan.id, revealed: ['truth', 'c1'] }] });
    await narrateMoveOn(table, moveResolution({ outcome: 'strong_hit', outcomeLabel: 'Strong Hit' }));

    expect(planOf(plan.id).clues[0].revealed).toBe(true);
    expect(planOf(plan.id).truthRevealed).toBe(false);
  }, 60_000);
});
