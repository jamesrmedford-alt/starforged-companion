/**
 * STARFORGED COMPANION
 * tests/unit/relayedSidecarPlanWrites.test.js
 *
 * Issue #362 D2 RELAYED-SIDECAR-APPLIES-PLANS (the maintainer's answer A). A
 * `narrator.sidecar` relayed from another client was applied with its `plans`
 * and `reveals` by id, and plan ids are public (a clock's `planId`, a rolls
 * card's `skeletonId`): a hand-made relay could make the GM reveal a hidden
 * truth into the scene ledger, Lore and a table card, or rewrite or end a
 * plan. The relay path now drops its `reveals` and the `plans` that are not
 * answers to its own plan requests (their `sameAs` taken off); its
 * `openQuestions`, `newThreats` and `countdown` stand. The step a clock
 * vignette or a chosen complication narrated off the canonical GM was made to
 * play rides apart (`forced`) and stands as the canonical GM would force it
 * for the same cause — dropped with the rest, a co-GM's vignette would leave
 * the plan's clock full (issue #362 AC08).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import {
  MODULE_ID, resetSkeletonTable, gmOf, plansOf, onGm, narrateMoveOn, moveResolution,
} from '../helpers/skeletonTable.js';
import { withPayThePriceSeed } from '../../src/moves/resolver.js';

const TRUTH = 'SENTINEL-TRUTH: a Keeper drone collecting names.';

let table;
let restore;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.GM2, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => { restore = await resetSkeletonTable(table); });
afterEach(() => restore?.());

const stored = () => gmOf(table).run(() => game.settings.get(MODULE_ID, 'campaignState'));
const clockOf = (id) => (stored().clocks ?? []).find(c => c._id === id);
const planOf = (id) => plansOf(table).find(p => p.id === id);
const liveTruths = () => (stored().sceneTruths ?? []).filter(t => !t.retracted).map(t => t.fact);

/** A decided threat with two steps and its tension clock, `filled` segments in. */
async function decidedThreat(filled = 0) {
  table.replies = (call) => {
    const ref = /- id (plan-[\w-]+-enemy):/.exec(call.system ?? '')?.[1];
    return { prose: 'An escort detaches from the dark.', sidecar: { newTruths: [], stateChanges: [],
      ...(ref ? { plans: [{ id: ref, subject: 'the escort', truth: TRUTH,
        escalation: ['It asks again, closer', 'It seals the corridor'], clues: ['A pulse that counts down'] }] } : {}) } };
  };
  await narrateMoveOn(table, moveResolution({ oracleSeeds: withPayThePriceSeed(null, 'face_danger', 'A new enemy is revealed') }));
  const plan = plansOf(table).find(p => p.kind === 'threat');
  if (filled) {
    const clocks = await gmOf(table).import('../../src/clocks/clocks.js');
    await onGm(table, () => clocks.adjustClockSegments(plan.clockId, filled));
  }
  table.replies = () => ({ prose: 'The escort drifts closer.', sidecar: { newTruths: [], stateChanges: [] } });
  return plan;
}

/** A `narrator.sidecar` relay `userId`'s client sends, as a hand-made one would. */
async function relayFrom(userId, payload) {
  const { requestGmAction } = await table.client(userId).import('../../src/multiplayer/gmRelay.js');
  await table.client(userId).run(() => requestGmAction('narrator.sidecar', { sceneId: 'sc-1', narrationId: `n-${userId}-relay`, ...payload }));
  await table.settle();
  await table.drain();
}

const sidecar = (over = {}) => ({ newTruths: [], stateChanges: [], ...over });

describe('issue #362 D2 — a relayed fact block writes no plan by id', () => {
  it('a hand-made relay revealing a plan\'s truth reveals nothing: no ledger truth, no Lore, no rolls card', async () => {
    const plan = await decidedThreat();
    await relayFrom('pl-1', { sidecar: sidecar({ reveals: [{ id: plan.id, revealed: ['truth', 'c1'], resolved: true }] }) });
    expect(planOf(plan.id)).toMatchObject({ truthRevealed: false, status: 'active' });
    expect(planOf(plan.id).clues[0].revealed).toBe(false);
    expect(liveTruths()).not.toContain(TRUTH);
    const { getConfirmedLore } = await gmOf(table).import('../../src/world/worldJournal.js');
    expect(gmOf(table).run(() => getConfirmedLore(null)).map(e => e.text)).not.toContain(TRUTH);
    expect(table.cards(f => f.secretRollsCard === true)).toEqual([]);
  }, 40_000);

  it('a relay rewriting a plan by its id changes nothing; its sameAs on a request\'s answer is taken off', async () => {
    const plan = await decidedThreat();
    await relayFrom('pl-1', {
      sidecar: sidecar({ plans: [
        { id: plan.id, truth: 'FORGED truth', wants: 'FORGED wants' },
        { id: 'plan-n-forged-enemy', sameAs: plan.id, subject: 'the raider', truth: 'A raider of the Iron Choir.' },
      ] }),
      planRequests: [{ ref: 'plan-n-forged-enemy', kind: 'threat', trigger: 'new_enemy', label: 'the new enemy this price reveals',
        oracleSeeds: ['Character Role: Scout'] }],
    });
    expect(planOf(plan.id)).toMatchObject({ truth: TRUTH, aliases: [] });
    // The answer to its own request is filed — as a plan of its own, not joined to the escort by id.
    expect(plansOf(table).filter(p => p.kind === 'threat' && p.status === 'active').map(p => p.subject.name).sort())
      .toEqual(['the escort', 'the raider']);
  }, 40_000);

  it('control: what a relay may still bring stands — its plan requests\' answers, a posed question, a new enemy, a countdown', async () => {
    await decidedThreat();
    await relayFrom('pl-1', {
      sidecar: sidecar({
        plans: [{ id: 'plan-n-own-enemy', subject: 'the raider', truth: 'A raider of the Iron Choir.' }],
        openQuestions: [{ question: 'Who opened the outer lock?' }],
        newThreats: ['the second presence'],
        countdown: { label: 'The reactor cools', segments: 4 },
      }),
      planRequests: [{ ref: 'plan-n-own-enemy', kind: 'threat', trigger: 'new_enemy', label: 'the new enemy this price reveals',
        oracleSeeds: ['Character Role: Scout'] }],
    });
    const names = plansOf(table).map(p => p.kind === 'mystery' ? p.question : p.subject.name);
    expect(names).toEqual(expect.arrayContaining(['the raider', 'Who opened the outer lock?', 'the second presence', 'What happens when The reactor cools runs out?']));
    expect((stored().clocks ?? []).map(c => c.name)).toContain('The reactor cools');
  }, 40_000);
});

describe('issue #362 D2 — the step a vignette was made to play still stands off the canonical GM', () => {
  it('a co-GM\'s trigger vignette plays its plan\'s step — and the clock runs again — while its own reveals are dropped', async () => {
    const plan = await decidedThreat(4);
    expect(clockOf(plan.clockId)).toMatchObject({ filled: 4 });
    await table.setClaudeKey('gm-2', 'sk-ant-cogm');
    table.replies = () => ({ prose: 'The escort drifts closer and asks again.', sidecar: { newTruths: [], stateChanges: [],
      reveals: [{ id: plan.id, revealed: ['c1'] }] } });
    const { narrateClockAdvancement } = await table.client('gm-2').import('../../src/narration/narrator.js');
    await onGm(table, () => table.client('gm-2').run(() => narrateClockAdvancement({
      clock: { _id: plan.clockId, name: 'the escort', type: 'tension', filled: 4, segments: 4, triggered: true },
      campaignState: foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')),
    })));
    await table.settle();
    await table.drain();
    expect(table.claude.calls.filter(c => /has TRIGGERED/.test(c.userText ?? '')).map(c => c.client), 'narrated off the canonical GM').toEqual(['gm-2']);
    expect(planOf(plan.id).escalation.map(e => e.done), 'the step the vignette played').toEqual([true, false]);
    expect(clockOf(plan.clockId), 'paced: it runs again from empty').toMatchObject({ active: true, filled: 0 });
    expect(planOf(plan.id).clues[0].revealed, 'the model\'s own reveal is dropped').toBe(false);
  }, 60_000);

  it('a co-GM\'s chosen complication plays the in-scene plan\'s step', async () => {
    const plan = await decidedThreat();
    await table.setClaudeKey('gm-2', 'sk-ant-cogm');
    const { narrateOracleFollowup } = await table.client('gm-2').import('../../src/narration/narrator.js');
    await onGm(table, () => table.client('gm-2').run(() => narrateOracleFollowup({
      kind: 'complication', oracleName: 'A complication', question: '', rolledLine: 'The player chose a complication',
      campaignState: foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')),
    })));
    await table.settle();
    await table.drain();
    expect(table.claude.calls.filter(c => /chose a complication/.test(c.userText ?? '')).map(c => c.client)).toEqual(['gm-2']);
    expect(planOf(plan.id).escalation.map(e => e.done)).toEqual([true, false]);
  }, 60_000);

  it('a forced step a relay claims but the GM would not force is dropped — a clock not full, a step not next', async () => {
    const plan = await decidedThreat(2);
    await relayFrom('pl-1', { sidecar: sidecar(), forced: { reveals: [{ id: plan.id, advanced: 'e1' }], clockId: plan.clockId } });
    expect(planOf(plan.id).escalation[0].done, 'the clock is not full').toBe(false);

    const clocks = await gmOf(table).import('../../src/clocks/clocks.js');
    await onGm(table, () => clocks.adjustClockSegments(plan.clockId, 2));
    await relayFrom('pl-1', { sidecar: sidecar(), forced: { reveals: [{ id: plan.id, advanced: 'e2' }], clockId: plan.clockId } });
    expect(planOf(plan.id).escalation.map(e => e.done), 'not its next step').toEqual([false, false]);
    await relayFrom('pl-1', { sidecar: sidecar(), forced: { reveals: [{ id: plan.id, revealed: ['truth'] }], clockId: plan.clockId } });
    expect(planOf(plan.id).truthRevealed).toBe(false);
  }, 60_000);
});
