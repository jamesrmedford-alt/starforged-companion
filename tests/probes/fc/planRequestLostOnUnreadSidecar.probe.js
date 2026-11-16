/**
 * FC-01 · PLAN-REQUEST-LOST-ON-UNREAD-SIDECAR  (LLM-OUTPUT / SILENT)
 *
 * Scenario: a move's price reveals a new enemy (the real withPayThePriceSeed),
 * so its narration is asked to decide a `threat` plan (UNREVEALED → DECIDE
 * NOW, by ref) from Character Role / Goal / Disposition rolls that are shown
 * to that one narration only. The narrator's reply is posted as usual, but
 * its fact block cannot be read — one unescaped quote inside a string (the
 * plan-deciding block is the largest JSON the narrator writes), or no block
 * at all (NARR-SIDECAR-SILENT's case).
 *
 * Correct (decisions.md → "The narrative skeleton": "If it decides none, the
 * plan is filed with its rolls alone and the next narration where it is in
 * play is asked"; secrets.js applyPlanSideData step 1: "or — its sidecar gave
 * none — with its oracle rolls alone"): the requested plan is filed with its
 * rolls, undecided.
 *
 * Today: narrator.js applyNarratorSidecar calls applySidecarSideData — the
 * only caller of applyPlanSideData — only when a sidecar was parsed
 * (`if (sidecar && campaignState && applySidecarHere)`), so the plan request
 * and its rolls are dropped: no plan exists for the enemy the prose just
 * introduced, and nothing ever asks for one again. The same gate drops an
 * expedition's, a discovery's and a vow scene's request.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../../helpers/multiClient.js';
import {
  NARRATION_MODEL, resetSkeletonTable, plansOf, narrationCallsOf, narrateMoveOn, moveResolution,
} from '../../helpers/skeletonTable.js';
import { withPayThePriceSeed } from '../../../src/moves/resolver.js';

let table;
let restore;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => { restore = await resetSkeletonTable(table); });
afterEach(() => restore?.());

const newEnemyMove = () => moveResolution({ oracleSeeds: withPayThePriceSeed(null, 'face_danger', 'A new enemy is revealed') });
const narrationCards = () => table.cards(f => f.narratorCard === true && f.narrationFallback !== true && typeof f.narrationText === 'string');
const isNarration = (call) => call.model === NARRATION_MODEL;

describe('FC-01 — a plan a narration was asked to decide is filed even when its fact block cannot be read', () => {
  it('control: a readable fact block that decides nothing files the plan with its rolls', async () => {
    await narrateMoveOn(table, newEnemyMove());
    expect(narrationCallsOf(table)[0].system).toMatch(/- id plan-[\w-]+-enemy: Threat — the new enemy this price reveals\. Oracle: Character Role: /);
    expect(narrationCards()).toHaveLength(1);
    const plans = plansOf(table);
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({ kind: 'threat', truth: '', status: 'active' });
    expect(plans[0].oracleSeeds.some(s => s.startsWith('Character Role: '))).toBe(true);
  }, 40_000);

  it('a fact block with one unescaped quote: the narration posts, and the plan is still filed with its rolls', async () => {
    table.script.when(isNarration,
      'A second shape detaches from the dark: an escort, waiting.\n' +
      '```json\n{"newTruths":[{"subject":"the escort","fact":"answers to "Warden" on the comm"}],"stateChanges":[]}\n```');
    await narrateMoveOn(table, newEnemyMove());

    // The request was made, and the prose reached the table clean.
    expect(narrationCallsOf(table)[0].system).toMatch(/- id plan-[\w-]+-enemy: Threat — the new enemy this price reveals\. Oracle: Character Role: /);
    expect(narrationCards()).toHaveLength(1);
    expect(narrationCards()[0].content).not.toContain('newTruths');

    const plans = plansOf(table);
    expect(plans, 'the enemy the price revealed has a plan, filed with its rolls').toHaveLength(1);
    expect(plans[0]).toMatchObject({ kind: 'threat', truth: '', status: 'active' });
    expect(plans[0].oracleSeeds.some(s => s.startsWith('Character Role: '))).toBe(true);
  }, 40_000);

  it('no fact block at all: the narration posts, and the plan is still filed with its rolls', async () => {
    table.script.when(isNarration, 'A second shape detaches from the dark: an escort, waiting.');
    await narrateMoveOn(table, newEnemyMove());

    expect(narrationCards()).toHaveLength(1);
    const plans = plansOf(table);
    expect(plans, 'the enemy the price revealed has a plan, filed with its rolls').toHaveLength(1);
    expect(plans[0].oracleSeeds.some(s => s.startsWith('Character Role: '))).toBe(true);
  }, 40_000);
});
