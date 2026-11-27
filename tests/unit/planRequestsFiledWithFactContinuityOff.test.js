/* global expectConsoleError -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/planRequestsFiledWithFactContinuityOff.test.js
 *
 * Issue #364 PLAN-REQUESTS-FACT-CONTINUITY-OFF. With fact continuity switched
 * off, `applyNarratorSidecar` returned before anything was applied — and with
 * the fact block went two things that are the code's, not the block's:
 *
 *   - the plans the narration was asked to decide (a price's new enemy, a
 *     vow's swearing scene): the narrator is shown no DECIDE NOW without the
 *     sidecar, and the request was dropped — no plan, its rolls gone (issue
 *     #362 AC07's defect, on the one exit AC07 left);
 *   - the step a plan clock's trigger vignette was made to play: unmarked,
 *     the clock stayed full for good with its vignette written (issue #362
 *     AC08's shape).
 *
 * Both are recorded now, on the canonical GM or relayed to it, and nothing of
 * the scene's ledgers is written while the switch is off.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { claudeFault } from '../helpers/faults.js';
import {
  MODULE_ID, NARRATION_MODEL, resetSkeletonTable, gmOf, plansOf, narrationCallsOf, onGm, narrateMoveOn, moveResolution,
} from '../helpers/skeletonTable.js';
import { withPayThePriceSeed } from '../../src/moves/resolver.js';

const FC_OFF = { 'factContinuity.enabled': false };

let table;
let restore;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
afterEach(() => restore?.());

const isNarration = (call) => call.model === NARRATION_MODEL;
const isFollowup  = (call) => isNarration(call) && /The player invoked the oracle/.test(call.userText ?? '');
const newEnemyMiss = () => moveResolution({ oracleSeeds: withPayThePriceSeed(null, 'face_danger', 'A new enemy is revealed') });
const narrationCards = () => table.cards(f => f.narratorCard === true && f.narrationFallback !== true && typeof f.narrationText === 'string');
const stored = () => gmOf(table).run(() => game.settings.get(MODULE_ID, 'campaignState'));
const clockOf = (id) => (stored().clocks ?? []).find(c => c._id === id);
const planOf = (id) => plansOf(table).find(p => p.id === id);

/** The one plan filed, undecided, with its Character Role / Goal / Disposition rolls. */
function expectEnemyFiledWithRolls(message = 'the new enemy this price revealed has a plan waiting to be decided') {
  const plans = plansOf(table);
  expect(plans, message).toHaveLength(1);
  expect(plans[0]).toMatchObject({ kind: 'threat', truth: '', status: 'active' });
  expect(plans[0].oracleSeeds.some(s => s.startsWith('Character Role: '))).toBe(true);
  return plans[0];
}

describe('issue #364 PLAN-REQUESTS-FACT-CONTINUITY-OFF — a plan request is filed with fact continuity off', () => {
  beforeEach(async () => { restore = await resetSkeletonTable(table, FC_OFF); });

  it('a price\'s new enemy: the narrator is shown no DECIDE NOW, the prose posts, and the plan is filed with its rolls', async () => {
    table.script.when(isNarration, 'A second shape detaches from the dark.');
    await narrateMoveOn(table, newEnemyMiss());
    expect(narrationCallsOf(table)[0].system, 'no sidecar, so nothing asks the narrator to decide it').not.toContain('DECIDE NOW');
    expect(narrationCards()).toHaveLength(1);
    const plan = expectEnemyFiledWithRolls();
    // Filed for the narration that posted: stamped with its card's id, so an X-Card on it takes the plan back.
    expect(plan.narrationId).toBe(narrationCards()[0].flags[MODULE_ID].narrationId);
  }, 40_000);

  it('a fact block the narrator wrote anyway is not read: no scene truth, no plan decided from it', async () => {
    table.replies = () => ({ prose: 'A second shape detaches from the dark.', sidecar: {
      newTruths: [{ subject: 'the escort', fact: 'LEDGER-OFF: it carries no mark' }], stateChanges: [],
      newThreats: ['the second presence'] } });
    await narrateMoveOn(table, newEnemyMiss());
    expect((stored().sceneTruths ?? []).map(t => t.fact)).not.toContain('LEDGER-OFF: it carries no mark');
    expectEnemyFiledWithRolls('only the plan the move asked for — nothing from the unread fact block');
  }, 40_000);

  it('a narration that fails outright files the plan once, unstamped', async () => {
    expectConsoleError(/narrateResolution failed/);
    table.script.when(isNarration, claudeFault.overloaded());
    await narrateMoveOn(table, newEnemyMiss());
    expect(table.cards(f => f.narrationFallback === true)).toHaveLength(1);
    expect(expectEnemyFiledWithRolls().narrationId ?? null).toBeNull();
  }, 40_000);

  it('an empty reply files the plan once', async () => {
    table.script.when(isNarration, '   ');
    await narrateMoveOn(table, newEnemyMiss());
    expect(table.cards(f => f.narrationFallback === true)).toHaveLength(1);
    expectEnemyFiledWithRolls();
  }, 40_000);

  it('a vow\'s swearing scene files what is behind the vow, with its roll', async () => {
    const isVowScene = (call) => isNarration(call) && /A character is swearing/.test(call.userText ?? '');
    // In the second person, as the oath scene is held to (issue #399's audit N29).
    table.script.when(isVowScene, 'You lay your palm on the cold iron and say the words.');
    const { narrateAndPostVowSwearing } = await gmOf(table).import('../../src/narration/narrator.js');
    const text = await onGm(table, () => narrateAndPostVowSwearing({
      vow: { name: 'Find the lost ark', rank: 'dangerous', vowId: 'vow-ark-1' },
      campaignState: foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')), speakerActorId: 'pc-kira',
    }));
    expect(text).toContain('cold iron');
    const plans = plansOf(table);
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({ kind: 'vow', truth: '', subject: { type: 'vow', id: 'vow-ark-1' } });
    expect(plans[0].oracleSeeds.length).toBeGreaterThan(0);
  }, 40_000);

  it('a follow-up narrated on a player\'s own key: the canonical GM files the new enemy, by relay, and writes no ledger', async () => {
    await table.setClaudeKey('gm-1', '');
    await table.setClaudeKey('pl-1', 'sk-ant-pat');
    table.script.when(isFollowup, 'A second engine signature slides out of the debris.');
    const client = table.client('pl-1');
    const { narrateOracleFollowup } = await client.import('../../src/narration/narrator.js');
    const text = await client.run(() => narrateOracleFollowup({
      kind: 'pay_the_price', oracleName: 'Pay the Price', question: '',
      rolledLine: 'd100 = 3 → A new enemy is revealed', speakerActorId: 'pc-kira',
      campaignState: foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')),
    }));
    for (let i = 0; i < 3; i += 1) { await table.settle(); await table.drain(); }
    expect(text).toContain('second engine signature');
    expect(table.claude.calls.filter(isFollowup).map(c => c.client)).toEqual(['pl-1']);
    expectEnemyFiledWithRolls('the player\'s narration\'s request reached the GM\'s plan store');
    expect(stored().sceneTruths ?? []).toEqual([]);
  }, 40_000);
});

describe('issue #364 PLAN-REQUESTS-FACT-CONTINUITY-OFF — the step a trigger vignette plays is marked with fact continuity off', () => {
  beforeEach(async () => { restore = await resetSkeletonTable(table); });

  it('a plan clock\'s trigger vignette plays its step, and the clock runs again', async () => {
    // Decided while fact continuity is on: a threat with two steps and its clock, full.
    table.replies = (call) => {
      const ref = /- id (plan-[\w-]+-enemy):/.exec(call.system ?? '')?.[1];
      return { prose: 'An escort detaches from the dark.', sidecar: { newTruths: [], stateChanges: [],
        ...(ref ? { plans: [{ id: ref, subject: 'the escort', truth: 'A Keeper drone collecting names.',
          escalation: ['It asks again, closer', 'It seals the corridor'], clues: ['A pulse that counts down'] }] } : {}) } };
    };
    await narrateMoveOn(table, newEnemyMiss());
    const plan = plansOf(table).find(p => p.kind === 'threat');
    const clocks = await gmOf(table).import('../../src/clocks/clocks.js');
    await onGm(table, () => clocks.adjustClockSegments(plan.clockId, 4));
    expect(clockOf(plan.clockId)).toMatchObject({ filled: 4 });

    await onGm(table, () => game.settings.set(MODULE_ID, 'factContinuity.enabled', false));
    table.script.when(isNarration, 'The escort drifts closer and asks again.');
    const { narrateClockAdvancement } = await gmOf(table).import('../../src/narration/narrator.js');
    const text = await onGm(table, () => narrateClockAdvancement({
      clock: { _id: plan.clockId, name: 'the escort', type: 'tension', filled: 4, segments: 4, triggered: true },
      campaignState: foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')),
    }));
    expect(text).toContain('asks again');
    expect(planOf(plan.id).escalation.map(e => e.done), 'the step the vignette played').toEqual([true, false]);
    expect(clockOf(plan.clockId), 'paced: it runs again from empty').toMatchObject({ active: true, filled: 0 });
  }, 60_000);
});
