/* global expectConsoleError -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/roundPlanRequestsPastTheCap.test.js
 *
 * Issue #364 ROUND-PLAN-REQUEST-CAP. A narration's plan requests were capped
 * at four (the plans one sidecar holds) where they were gathered
 * (buildNarratorExtras) and again where they are filed (applyPlanSideData), so
 * a Batch Mode round whose entries brought five or more — three prices that
 * each revealed a new enemy, two of them on expeditions just begun — dropped
 * the fifth onward: no plan, and their oracle rolls gone.
 *
 * Every request rides with the narration now. It is asked to decide the first
 * four (DECIDE NOW shows no more), and the rest are filed with their rolls
 * alone, for the next narration they are in play for (issue #362 AC07's
 * fallback) — on the round's card, and on its fallback when no narration is
 * written.
 *
 * narrateRound is driven on the simulated table with a round as the driver
 * hands one in: three acting entries, each a rolled miss whose price revealed
 * a new enemy; the first two also began an expedition.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { claudeFault } from '../helpers/faults.js';
import {
  MODULE_ID, NARRATION_MODEL, resetSkeletonTable, gmOf, plansOf, narrationCallsOf, onGm,
} from '../helpers/skeletonTable.js';
import { withPayThePriceSeed } from '../../src/moves/resolver.js';
import { normalisePlanRequests, PLANS_PER_SIDECAR, PLAN_REQUESTS_PER_NARRATION } from '../../src/world/skeletons.js';
import { buildNarratorSystemPrompt } from '../../src/narration/narratorPrompt.js';

let table;
let restore;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  restore = await resetSkeletonTable(table);
  table.addActor({ id: 'pc-ren', name: 'Ren', ownership: { 'pl-2': 3 } });
  table.addActor({ id: 'pc-vex', name: 'Vex', ownership: { 'gm-1': 3 } });
});
afterEach(() => restore?.());

const isNarration = (call) => call.model === NARRATION_MODEL;

const expeditionRequest = (n) => ({
  ref: `plan-res-${n}-expedition`, kind: 'expedition', trigger: 'undertake_an_expedition',
  label: `the expedition to Vault ${n}`, subject: { type: 'track', id: `track-${n}`, name: `Reach Vault ${n}` },
  oracleSeeds: [`What waits at the end — Action + Theme: Guard Relic ${n}`],
});

const entry = (userId, actorId, actorName, text, requests = []) => ({
  userId, actorId, actorName, userName: actorName, text,
  rolled: { narrationInput: {
    kind: 'move', resolutionId: `res-${userId}`, moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge',
    outcome: 'miss', outcomeLabel: 'Miss', isMatch: false, loremasterContext: '[MOVE: Face Danger +edge] [OUTCOME: Miss]',
    oracleSeeds: withPayThePriceSeed(null, 'face_danger', 'A new enemy is revealed'),
    skeletonRequests: requests, endingTrackIds: [],
    relevance: { resolvedClass: 'interaction', entityIds: [], entityTypes: [] },
  } },
});

/** A round of three misses that each revealed a new enemy; the first two began an expedition: five requests. */
const round = () => ({
  id: 'round-1', number: 1, phase: 'narrating', acting: ['pl-1', 'pl-2', 'gm-1'],
  entries: {
    'pl-1': entry('pl-1', 'pc-kira', 'Kira', 'I slip past the escort.', [expeditionRequest(1)]),
    'pl-2': entry('pl-2', 'pc-ren', 'Ren', 'I cut the tether.', [expeditionRequest(2)]),
    'gm-1': entry('gm-1', 'pc-vex', 'Vex', 'I hold the lock.'),
  },
});

async function narrateTheRound() {
  const { narrateRound } = await gmOf(table).import('../../src/narration/narrator.js');
  return onGm(table, () => narrateRound({
    round: round(), campaignState: foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')),
  }));
}

/** The requests DECIDE NOW lists in a prompt, by their ref. */
const askedRefs = (system) => [...String(system ?? '').matchAll(/^- id (plan-[\w-]+): /gm)].map(m => m[1]);

describe('issue #364 ROUND-PLAN-REQUEST-CAP — a round that brings five plan requests files all five', () => {
  it('the narration is asked to decide four, and the fifth is filed with its rolls alone', async () => {
    const res = await narrateTheRound();
    expect(res.posted).toBe('card');
    const system = narrationCallsOf(table).at(-1).system;
    expect(askedRefs(system), 'DECIDE NOW shows what one sidecar can answer').toHaveLength(PLANS_PER_SIDECAR);

    const plans = plansOf(table);
    expect(plans.filter(p => p.kind === 'threat'), 'each of the three prices\' new enemy has its plan').toHaveLength(3);
    expect(plans.filter(p => p.kind === 'expedition').map(p => p.subject.id).sort()).toEqual(['track-1', 'track-2']);
    for (const plan of plans) {
      expect(plan.oracleSeeds.length, `"${plan.subject.name}" keeps its rolls`).toBeGreaterThan(0);
      // Filed for the round's narration: the X-Card on its card takes all five back.
      expect(plan.narrationId).toBe(res.narrationId);
    }
  }, 60_000);

  it('the four it decides are decided, and the one it was not shown waits undecided', async () => {
    table.replies = (call) => ({ prose: 'Three shapes detach from the dark.', sidecar: { newTruths: [], stateChanges: [],
      plans: askedRefs(call.system).map((id, i) => ({ id, subject: `the hunter ${i + 1}`, truth: `DECIDED ${i + 1}: a Keeper drone.` })) } });
    await narrateTheRound();
    const plans = plansOf(table);
    expect(plans).toHaveLength(5);
    expect(plans.filter(p => p.truth).length).toBe(PLANS_PER_SIDECAR);
    const waiting = plans.filter(p => !p.truth);
    expect(waiting).toHaveLength(1);
    expect(waiting[0]).toMatchObject({ kind: 'threat', status: 'active' });
    expect(waiting[0].oracleSeeds.some(s => s.startsWith('Character Role: '))).toBe(true);
  }, 60_000);

  it('a round no narration is written for files all five, unstamped', async () => {
    expectConsoleError(/narrateRound failed/);
    table.script.when(isNarration, claudeFault.serverError());
    const res = await narrateTheRound();
    expect(res.posted).toBe('fallback');
    const plans = plansOf(table);
    expect(plans).toHaveLength(5);
    expect(plans.every(p => !p.truth && (p.narrationId ?? null) === null)).toBe(true);
  }, 60_000);
});

describe('issue #364 ROUND-PLAN-REQUEST-CAP — the bounds', () => {
  const requests = (n) => Array.from({ length: n }, (_, i) => ({ ref: `plan-r-${i}`, kind: 'threat', trigger: 'new_enemy', label: `enemy ${i}`, oracleSeeds: ['Character Role: Scout'] }));

  it('what crosses the relay is still bounded at the plans one sidecar holds', () => {
    expect(normalisePlanRequests(requests(9))).toHaveLength(PLANS_PER_SIDECAR);
  });

  it('a narration on this client carries up to PLAN_REQUESTS_PER_NARRATION', () => {
    expect(normalisePlanRequests(requests(9), { max: PLAN_REQUESTS_PER_NARRATION })).toHaveLength(9);
    expect(normalisePlanRequests(requests(40), { max: PLAN_REQUESTS_PER_NARRATION })).toHaveLength(PLAN_REQUESTS_PER_NARRATION);
    expect(normalisePlanRequests(requests(9), { max: 'many' }), 'a bound that is no number is the default').toHaveLength(PLANS_PER_SIDECAR);
  });

  it('the prompt lists under DECIDE NOW the requests the narration is asked to decide, not all it carries', () => {
    const carried = requests(6);
    const prompt = (extras) => buildNarratorSystemPrompt({}, {}, null, '', { mode: 'move_resolution', ...extras });
    expect(askedRefs(prompt({ planRequests: carried, decideNowRequests: carried.slice(0, PLANS_PER_SIDECAR) })))
      .toEqual(['plan-r-0', 'plan-r-1', 'plan-r-2', 'plan-r-3']);
    // Extras that name no asked list (a direct caller) ask every request they hold.
    expect(askedRefs(prompt({ planRequests: carried.slice(0, 2) }))).toEqual(['plan-r-0', 'plan-r-1']);
    expect(askedRefs(prompt({ planRequests: carried, decideNowRequests: [] }))).toEqual([]);
  });
});
