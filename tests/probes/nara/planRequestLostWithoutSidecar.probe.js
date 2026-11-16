/**
 * NARA-01 · PLAN-REQUEST-LOST-WITHOUT-SIDECAR
 *
 * Scenario: a move's price reveals a new enemy. Its narration is asked to
 * decide what the enemy is (UNREVEALED → DECIDE NOW, by ref). The reply comes
 * back with its fact block missing — cut off by max_tokens inside the fence
 * (extractSidecar's parseError), or with no fence at all.
 *
 * Correct (decisions.md → the narrative skeleton: "If it decides none, the
 * plan is filed with its rolls alone and the next narration where it is in
 * play is asked"; secrets.js applyPlanSideData step 1): the request is filed
 * as an undecided `threat` plan carrying its Character Role / Goal /
 * Disposition rolls, and the next narration is shown it under DECIDE NOW.
 *
 * Today: applyNarratorSidecar calls applySidecarSideData — the only caller
 * of applyPlanSideData — only when a sidecar parsed
 * (`if (sidecar && campaignState && applySidecarHere)`), so with no parsed
 * sidecar the plan requests it was handed (`ctx.planRequests`) are dropped:
 * no plan is filed, the rolls are gone, and no later narration is asked.
 *
 * The same request is lost when the narration fails outright (Claude
 * overloaded → the "narration unavailable" card): narrateResolution's failure
 * paths file nothing, where a vow's swearing scene that fails files its
 * request with its roll alone (narrator.js narrateAndPostVowSwearing →
 * secrets.js fileRequestedPlan; decisions.md: "No scene (switched off, no key,
 * a failure): the request is filed with its roll alone").
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { withPayThePriceSeed } from '../../../src/moves/resolver.js';
import { claudeFault } from '../../helpers/faults.js';
import { skeletonTable, withSidecar, move } from './_skeletonTable.js';

let h;

beforeAll(async () => { h = await skeletonTable(); }, 30_000);
afterAll(() => h?.teardown());
beforeEach(async () => { await h.reset(); });
afterEach(() => h.restore());

const newEnemyMiss = () => move({ oracleSeeds: withPayThePriceSeed(null, 'face_danger', 'A new enemy is revealed') });

describe('NARA-01 — a plan a narration was asked to decide is kept when its reply has no usable fact block', () => {
  it('control: a reply whose fact block decides nothing files the plan with its rolls alone', async () => {
    h.reply = () => withSidecar('A second shape detaches from the dark.', { newTruths: [], stateChanges: [] });
    await h.narrateMove(newEnemyMiss());

    expect(h.narrationCalls()[0].system).toMatch(/- id plan-[\w-]+-enemy: Threat — the new enemy this price reveals/);
    const plans = h.plans();
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({ kind: 'threat', truth: '', status: 'active' });
    expect(plans[0].oracleSeeds.some(s => s.startsWith('Character Role: '))).toBe(true);
  }, 40_000);

  it('a reply cut off inside its fact block (max_tokens) still files the plan with its rolls alone', async () => {
    // What a truncated reply looks like: the fence opened, the object never closed.
    h.reply = () => 'A second shape detaches from the dark.\n```json\n{"newTruths":[{"subject":"the escort","fact":"It carries no mark';
    await h.narrateMove(newEnemyMiss());

    // The narration was asked, and its prose posted — only the fact block was lost.
    expect(h.narrationCalls()[0].system).toMatch(/- id plan-[\w-]+-enemy: Threat — the new enemy this price reveals/);
    const card = h.table.cards(f => f.narratorCard === true && f.narrationId).at(-1);
    expect(card?.flags?.['starforged-companion']?.narrationText).toBe('A second shape detaches from the dark.');

    const plans = h.plans();
    expect(plans, 'the new enemy this price revealed has a plan waiting to be decided').toHaveLength(1);
    expect(plans[0]).toMatchObject({ kind: 'threat', truth: '', status: 'active' });
    expect(plans[0].oracleSeeds.some(s => s.startsWith('Character Role: '))).toBe(true);
  }, 40_000);

  it('a reply with no fact block at all still files the plan, and the next narration is asked to decide it', async () => {
    h.reply = () => 'A second shape detaches from the dark.';
    await h.narrateMove(newEnemyMiss());

    const plans = h.plans();
    expect(plans, 'the new enemy this price revealed has a plan waiting to be decided').toHaveLength(1);

    h.reply = () => withSidecar('The shape waits.', { newTruths: [], stateChanges: [] });
    await h.narrateMove(move({ outcome: 'weak_hit', outcomeLabel: 'Weak Hit' }));
    expect(h.narrationCalls().at(-1).system).toContain(`- id ${plans[0].id}: Threat — the new enemy this price reveals.`);
  }, 40_000);

  it('a narration that fails outright (Claude overloaded) still files the plan with its rolls alone', async () => {
    expectConsoleError(/narrateResolution failed/);   // the failure is logged, as it should be
    h.reply = () => claudeFault.overloaded();
    await h.narrateMove(newEnemyMiss());

    // The price was paid and the table told the narration failed.
    const fallback = h.table.cards(f => f.narrationFallback === true).at(-1);
    expect(fallback, 'the "narration unavailable" card').toBeTruthy();

    const plans = h.plans();
    expect(plans, 'the new enemy this price revealed has a plan waiting to be decided').toHaveLength(1);
    expect(plans[0]).toMatchObject({ kind: 'threat', truth: '', status: 'active' });
  }, 40_000);
});
