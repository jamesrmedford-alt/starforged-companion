/**
 * STARFORGED COMPANION
 * tests/unit/planRequestsFiledWhenXCardPausesNarration.test.js
 *
 * Issue #364 XCARD-PAUSED-NARRATION-PLAN-REQUESTS (left open by
 * PLAN-REQUESTS-FACT-CONTINUITY-OFF): a move's narration is asked to decide
 * the hidden plans the move owes — a price's new enemy, an expedition begun —
 * and each exit that writes no narration files them with their oracle rolls
 * alone, for the next narration to decide (issue #362 AC07). The X-Card's
 * exits did not: a narration paused because the card was active when the
 * move resolved, or discarded because the card was played while its reply was
 * on the way, posted its "narration paused" notice and filed nothing. The
 * move's result stands — the price was paid — so the enemy it revealed had no
 * plan, and the rolls behind it existed nowhere.
 *
 * A paused narration is final: its notice carries no retry, and lifting the
 * X-Card resumes play at the next move, not at the paused one. The only
 * later narration of the same move is a Burn Momentum / Improve Result
 * re-narration, which asks again for the plans about a known subject and
 * must not file a second one.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import {
  MODULE_ID, NARRATION_MODEL, resetSkeletonTable, gmOf, plansOf, narrationCallsOf, onGm, narrateMoveOn, moveResolution,
  playXCard,
} from '../helpers/skeletonTable.js';
import { withPayThePriceSeed } from '../../src/moves/resolver.js';

let table;
let restore;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  restore = await resetSkeletonTable(table);
  table.addActor({ id: 'pc-ren', name: 'Ren', ownership: { 'pl-2': 3 } });
});
afterEach(() => restore?.());

const isNarration = (call) => call.model === NARRATION_MODEL;
const stored = () => gmOf(table).run(() => game.settings.get(MODULE_ID, 'campaignState'));
const pausedCards = () => table.cards(f => f.narrationPaused === true);
const narrationCards = () => table.cards(f => f.narratorCard === true && f.narrationFallback !== true && typeof f.narrationText === 'string');
const newEnemyMiss = (over = {}) => moveResolution({ oracleSeeds: withPayThePriceSeed(null, 'face_danger', 'A new enemy is revealed'), ...over });

const expeditionRequest = (n = 1) => ({
  ref: `plan-res-${n}-expedition`, kind: 'expedition', trigger: 'undertake_an_expedition',
  label: `the expedition to Vault ${n}`, subject: { type: 'track', id: `track-${n}`, name: `Reach Vault ${n}` },
  oracleSeeds: [`What waits at the end — Action + Theme: Guard Relic ${n}`],
});

/** The plans filed undecided, with their rolls and no narration's stamp. */
function expectFiledWithRollsAlone(kinds) {
  const plans = plansOf(table);
  expect(plans.map(p => p.kind).sort()).toEqual([...kinds].sort());
  for (const plan of plans) {
    expect(plan, `"${plan.subject.name}" waits to be decided`).toMatchObject({ truth: '', status: 'active' });
    expect(plan.oracleSeeds.length, `"${plan.subject.name}" keeps its rolls`).toBeGreaterThan(0);
    expect(plan.narrationId ?? null, 'no card carries a paused narration\'s id').toBeNull();
  }
  return plans;
}

/** Narrate a move on the GM and play the X-Card while its reply is on the way. */
async function narrateWithXCardMidReply(resolution) {
  const held = table.script.hold(isNarration);
  const { narrateResolution } = await gmOf(table).import('../../src/narration/narrator.js');
  const pending = gmOf(table).run(() => narrateResolution(resolution,
    foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')), { speakerActorId: 'pc-kira' }));
  await held.arrived;
  await table.settle();
  await playXCard(table);
  held.release();
  const result = await pending;
  for (let i = 0; i < 3; i += 1) { await table.settle(); await table.drain(); }
  return result;
}

const roundEntry = (userId, actorId, actorName, text, requests = []) => ({
  userId, actorId, actorName, userName: actorName, text,
  rolled: { narrationInput: {
    kind: 'move', resolutionId: `res-${userId}`, moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge',
    outcome: 'miss', outcomeLabel: 'Miss', isMatch: false, loremasterContext: '[MOVE: Face Danger +edge] [OUTCOME: Miss]',
    oracleSeeds: withPayThePriceSeed(null, 'face_danger', 'A new enemy is revealed'),
    skeletonRequests: requests, endingTrackIds: [],
    relevance: { resolvedClass: 'interaction', entityIds: [], entityTypes: [] },
  } },
});

/** A round of two misses that each revealed a new enemy; the first began an expedition: three requests. */
const round = () => ({
  id: 'round-1', number: 1, phase: 'narrating', acting: ['pl-1', 'pl-2'],
  entries: {
    'pl-1': roundEntry('pl-1', 'pc-kira', 'Kira', 'I slip past the escort.', [expeditionRequest(1)]),
    'pl-2': roundEntry('pl-2', 'pc-ren', 'Ren', 'I cut the tether.'),
  },
});

describe('issue #364 XCARD-PAUSED-NARRATION-PLAN-REQUESTS — a move narration the X-Card paused files its plan requests', () => {
  it('the X-Card is active when the move resolves: no narration is asked for, and the price\'s new enemy is filed with its rolls', async () => {
    await playXCard(table);
    expect(stored().xCardActive).toBe(true);

    expect(await narrateMoveOn(table, newEnemyMiss())).toBeNull();
    expect(narrationCallsOf(table), 'the narrator stays silent').toHaveLength(0);
    expect(pausedCards()).toHaveLength(1);
    const [plan] = expectFiledWithRollsAlone(['threat']);
    expect(plan.oracleSeeds.some(s => s.startsWith('Character Role: ')), 'the hidden rolls, made on the GM').toBe(true);
  }, 60_000);

  it('an expedition the paused move began is filed about its track', async () => {
    await playXCard(table);
    await narrateMoveOn(table, moveResolution({ moveId: 'undertake_an_expedition', moveName: 'Undertake an Expedition',
      outcome: 'weak_hit', outcomeLabel: 'Weak Hit', skeletonRequests: [expeditionRequest(1)] }));
    const [plan] = expectFiledWithRollsAlone(['expedition']);
    expect(plan.subject).toMatchObject({ type: 'track', id: 'track-1' });
  }, 60_000);

  it('the X-Card is played while the reply is on its way: the reply is discarded, and the request it carried is filed', async () => {
    expect(await narrateWithXCardMidReply(newEnemyMiss())).toBeNull();
    expect(narrationCallsOf(table)).toHaveLength(1);
    expect(narrationCards(), 'the interrupted reply is not posted').toHaveLength(0);
    expect(pausedCards()).toHaveLength(1);
    expectFiledWithRollsAlone(['threat']);
  }, 60_000);

  it('a move that owes no plan files none', async () => {
    await playXCard(table);
    await narrateMoveOn(table, moveResolution());
    expect(pausedCards()).toHaveLength(1);
    expect(plansOf(table)).toEqual([]);
  }, 60_000);

  it('the X-Card lifted: the next narration is shown the waiting plan and decides it — it is not asked for again', async () => {
    await playXCard(table);
    await narrateMoveOn(table, newEnemyMiss());
    const [waiting] = expectFiledWithRollsAlone(['threat']);

    const { clearXCard } = await gmOf(table).import('../../src/context/safety.js');
    await onGm(table, () => clearXCard());
    table.replies = () => ({ prose: 'The second shape is a Keeper drone.', sidecar: { newTruths: [], stateChanges: [],
      plans: [{ id: waiting.id, subject: 'the escort', truth: 'A Keeper drone collecting names.' }] } });
    await narrateMoveOn(table, moveResolution({ outcome: 'weak_hit', outcomeLabel: 'Weak Hit', playerNarration: 'I face the new enemy.' }));
    expect(narrationCallsOf(table).at(-1).system, 'the waiting plan is put to the next narration').toContain(waiting.id);
    const plans = plansOf(table);
    expect(plans, 'one plan for the one enemy').toHaveLength(1);
    expect(plans[0]).toMatchObject({ id: waiting.id, truth: 'A Keeper drone collecting names.' });
  }, 60_000);

  it('a later re-narration of the paused move (Burn Momentum, Improve Result) files no second plan for its expedition', async () => {
    await playXCard(table);
    const resolution = moveResolution({ moveId: 'undertake_an_expedition', moveName: 'Undertake an Expedition',
      skeletonRequests: [expeditionRequest(1)] });
    await narrateMoveOn(table, resolution);
    expectFiledWithRollsAlone(['expedition']);

    const { clearXCard } = await gmOf(table).import('../../src/context/safety.js');
    await onGm(table, () => clearXCard());
    // The upgrade's re-narration is asked for the plans the roll's narration was (issue #362 AC04).
    await narrateMoveOn(table, { ...resolution, outcome: 'strong_hit', outcomeLabel: 'Strong Hit', inputMethod: 'burn',
      upgradeOf: resolution._id, playerNarration: '[Player burned momentum to upgrade the outcome]' });
    expect(narrationCards()).toHaveLength(1);
    expect(narrationCallsOf(table).at(-1).system, 'the subject is planned: nothing to decide anew').not.toContain('plan-res-1-expedition');
    expect(plansOf(table).filter(p => p.kind === 'expedition'), 'one plan for the one expedition').toHaveLength(1);
  }, 60_000);
});

describe('issue #364 XCARD-PAUSED-NARRATION-PLAN-REQUESTS — a round the X-Card paused files its entries\' plan requests', () => {
  async function narrateTheRound() {
    const { narrateRound } = await gmOf(table).import('../../src/narration/narrator.js');
    return onGm(table, () => narrateRound({
      round: round(), campaignState: foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')),
    }));
  }

  it('the X-Card is active when the round is narrated: the paused notice posts, and all three requests are filed', async () => {
    await playXCard(table);
    const res = await narrateTheRound();
    expect(res.posted).toBe('paused');
    expect(narrationCallsOf(table)).toHaveLength(0);
    const plans = expectFiledWithRollsAlone(['expedition', 'threat', 'threat']);
    expect(plans.find(p => p.kind === 'expedition').subject).toMatchObject({ type: 'track', id: 'track-1' });
  }, 60_000);

  it('the X-Card is played while the round\'s reply is on its way: the same', async () => {
    const held = table.script.hold(isNarration);
    const { narrateRound } = await gmOf(table).import('../../src/narration/narrator.js');
    const pending = gmOf(table).run(() => narrateRound({
      round: round(), campaignState: foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')),
    }));
    await held.arrived;
    await table.settle();
    await playXCard(table);
    held.release();
    const res = await pending;
    for (let i = 0; i < 3; i += 1) { await table.settle(); await table.drain(); }
    expect(res.posted).toBe('paused');
    expect(narrationCards()).toHaveLength(0);
    expectFiledWithRollsAlone(['expedition', 'threat', 'threat']);
  }, 60_000);

  it('the paused notice closes the round: it carries what the driver reads as "narrated", so no second narration files again', async () => {
    await playXCard(table);
    const res = await narrateTheRound();
    // batch/driver.js roundNarrationPosted: a card of the round flagged narratorCard or narrationPaused.
    expect(res.card.flags[MODULE_ID]).toMatchObject({ narrationPaused: true, roundId: 'round-1' });
    expect(pausedCards().filter(c => c.flags[MODULE_ID].roundId === 'round-1')).toHaveLength(1);
    expect(plansOf(table)).toHaveLength(3);
  }, 60_000);
});
