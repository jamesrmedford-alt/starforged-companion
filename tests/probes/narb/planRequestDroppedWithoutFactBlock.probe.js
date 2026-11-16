/**
 * NARB-02 · PLAN-REQUEST-DROPPED-WITHOUT-FACT-BLOCK
 *
 * Scenario: a narration is asked to decide a hidden plan (UNREVEALED → DECIDE
 * NOW) — here `!pay-the-price` rolls "A new enemy is revealed" and its oracle
 * follow-up carries the enemy's Character Role / Goal / Disposition rolls; a
 * vow's swearing scene and an expedition's first narration are asked the same
 * way. The narrator's reply comes back with prose but no fact block (no
 * ```json fence — the case applyNarratorSidecar itself warns of,
 * NARR-SIDECAR-SILENT), or with one cut off by max_tokens.
 *
 * Correct (decisions.md → "The narrative skeleton": "If it decides none, the
 * plan is filed with its rolls alone and the next narration where it is in play
 * is asked — keep the raw rolls as the skeleton"): the enemy is filed as an
 * undecided `threat` plan with its three rolls.
 *
 * Today: applyNarratorSidecar only reaches applySidecarSideData — the one
 * place `ctx.planRequests` are filed — `if (sidecar && …)`. With no parsed
 * fact block the request is dropped: no plan, no rolls kept, and nothing asks
 * again (the rolls were made for this narration only). The narration posts as
 * normal, so the table never learns the enemy has no plan.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../../helpers/multiClient.js';
import {
  MODULE_ID, NARRATION_MODEL, resetSkeletonTable, gmOf, plansOf, narrationCallsOf, onGm,
} from '../../helpers/skeletonTable.js';

let table;
let restore;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => { restore = await resetSkeletonTable(table); });
afterEach(() => restore?.());

const isFollowup = (call) => call.model === NARRATION_MODEL && /The player invoked the oracle/.test(call.userText ?? '');

async function narrateNewEnemyPrice() {
  const { narrateOracleFollowup } = await gmOf(table).import('../../src/narration/narrator.js');
  return onGm(table, () => narrateOracleFollowup({
    kind: 'pay_the_price', oracleName: 'Pay the Price', question: '',
    rolledLine: 'd100 = 3 → A new enemy is revealed',
    speakerActorId: 'pc-kira',
    campaignState: foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')),
  }));
}

const followupCards = () => table.cards(f => f.oracleNarrationCard === true);

describe('NARB-02 — a plan a narration was asked to decide is kept with its rolls when the reply decides none', () => {
  it('control: an empty fact block files the new enemy with its rolls alone', async () => {
    table.script.when(isFollowup, 'A second engine signature slides out of the debris.\n```json\n{"newTruths":[],"stateChanges":[]}\n```');
    const text = await narrateNewEnemyPrice();
    expect(text).toContain('second engine signature');
    // The narration was asked to decide it.
    expect(narrationCallsOf(table).at(-1).system).toMatch(/### DECIDE NOW[\s\S]*- id plan-nar-[\w]+-enemy: Threat — the new enemy this price reveals/);
    const plans = plansOf(table);
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({ kind: 'threat', truth: '', status: 'active' });
    expect(plans[0].oracleSeeds.some(s => /^Character Role: /.test(s))).toBe(true);
  }, 40_000);

  it('a reply with prose and no fact block still files the new enemy with its rolls', async () => {
    table.script.when(isFollowup, 'A second engine signature slides out of the debris.');
    const text = await narrateNewEnemyPrice();
    // The narration itself stands and is posted.
    expect(text).toContain('second engine signature');
    expect(followupCards()).toHaveLength(1);
    expect(narrationCallsOf(table).at(-1).system).toMatch(/### DECIDE NOW[\s\S]*- id plan-nar-[\w]+-enemy:/);
    // The enemy it introduced keeps its rolls as an undecided plan.
    const plans = plansOf(table);
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({ kind: 'threat', truth: '', status: 'active' });
    expect(plans[0].oracleSeeds.some(s => /^Character Role: /.test(s))).toBe(true);
  }, 40_000);

  it('a vow\'s swearing scene with no fact block still files what is behind the vow, with its roll', async () => {
    const isVowScene = (call) => call.model === NARRATION_MODEL && /A character is swearing/.test(call.userText ?? '');
    table.script.when(isVowScene, 'Kira lays her palm on the cold iron and says the words.');
    const { narrateAndPostVowSwearing } = await gmOf(table).import('../../src/narration/narrator.js');
    const text = await onGm(table, () => narrateAndPostVowSwearing({
      vow: { name: 'Find the lost ark', rank: 'dangerous', vowId: 'vow-ark-1' },
      campaignState: foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')), speakerActorId: 'pc-kira',
    }));
    expect(text).toContain('cold iron');
    expect(table.cards(f => f.vowSceneCard === true)).toHaveLength(1);
    // The scene was asked to decide it …
    expect(narrationCallsOf(table).at(-1).system).toMatch(/### DECIDE NOW[\s\S]*- id plan-nar-[\w]+-vow: Vow — what is really behind the vow "Find the lost ark"/);
    // … and decided nothing: the vow's plan is kept with its roll (as when there is no scene at all — fileRequestedPlan).
    const plans = plansOf(table);
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({ kind: 'vow', truth: '', subject: { type: 'vow', id: 'vow-ark-1' } });
  }, 40_000);

  it('a reply whose fact block was cut off still files the new enemy with its rolls', async () => {
    table.script.when(isFollowup, 'A second engine signature slides out of the debris.\n```json\n{"newTruths":[{"subject":"the signature","fact":"it is');
    const text = await narrateNewEnemyPrice();
    expect(text).toContain('second engine signature');
    const plans = plansOf(table);
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({ kind: 'threat', truth: '', status: 'active' });
  }, 40_000);
});
