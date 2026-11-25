/**
 * STARFORGED COMPANION
 * tests/unit/revealedTruthLoreOnce.test.js
 *
 * Issue #362 AC37 REVEALED-TRUTH-ARCHIVED-TWICE. A hidden plan's truth a
 * narration reveals becomes a stated fact (decisions.md "The narrative
 * skeleton, Phase 2"): confirmed Lore ("Threat: the escort") and a truth of
 * the narration's own in the scene ledger. When the scene ended, the scene
 * lifecycle archived every text-subject ledger truth to Lore
 * (sceneLifecycle.migrateSceneTruth → worldJournal.archiveSceneTruth, titled
 * "<subject>: <fact>"), and nothing tied the ledger truth to the entry the
 * reveal had filed: the same sentence was confirmed Lore twice, under two
 * titles — two of ESTABLISHED LORE's capped slots, and a GM's correction of
 * one left the other. The revealed truth now carries its plan's id
 * (`revealOf`), and the scene's end leaves its Lore to the reveal.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import {
  MODULE_ID, resetSkeletonTable, gmOf, plansOf, onGm, narrateMoveOn, moveResolution,
} from '../helpers/skeletonTable.js';

const TRUTH = 'The escort is a Keeper drone collecting names for the Pale Choir.';
const OTHER = 'The corridor lights flicker in the drone\'s count.';

let table;
let restore;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => { restore = await resetSkeletonTable(table); });
afterEach(() => restore?.());

const stored = () => gmOf(table).run(() => game.settings.get(MODULE_ID, 'campaignState'));

async function seedPlan() {
  const secrets = await gmOf(table).import('../../src/world/secrets.js');
  return onGm(table, () => secrets.createSkeleton({
    kind: 'threat', subject: { type: 'name', name: 'the escort' }, truth: TRUTH, wants: 'A name the crew carries.',
    escalation: ['It asks again, closer'], clues: ['A pulse that counts down'],
    oracleSeeds: ['Character Role: Scout'], sceneId: 'sc-1', sessionId: 's-1',
  }));
}

async function loreStating(text) {
  const { getConfirmedLore } = await gmOf(table).import('../../src/world/worldJournal.js');
  return gmOf(table).run(() => getConfirmedLore(null)).filter(e => e.text === text || e.fact === text);
}

async function endTheScene() {
  const { endScene } = await gmOf(table).import('../../src/factContinuity/sceneLifecycle.js');
  return onGm(table, () => endScene(foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')), { reason: 'scene_command' }));
}

const revealing = (planId, newTruths = []) => () => ({ prose: 'The drone speaks in the Choir\'s voice.',
  sidecar: { newTruths, stateChanges: [], reveals: [{ id: planId, revealed: ['truth'] }] } });

describe('issue #362 AC37 — a revealed truth is confirmed lore once', () => {
  it('the reveal files it as lore and as a ledger truth of the narration, marked with its plan', async () => {
    const plan = await seedPlan();
    table.replies = revealing(plan.id);
    await narrateMoveOn(table, moveResolution({ outcome: 'strong_hit', outcomeLabel: 'Strong Hit' }));

    expect(plansOf(table)[0].truthRevealed).toBe(true);
    const truths = (stored().sceneTruths ?? []).filter(t => t.fact === TRUTH && !t.retracted);
    expect(truths).toHaveLength(1);
    expect(truths[0].revealOf).toBe(plan.id);
    expect(await loreStating(TRUTH)).toHaveLength(1);
  }, 40_000);

  it('after the scene ends, the lore still states it once', async () => {
    const plan = await seedPlan();
    table.replies = revealing(plan.id);
    await narrateMoveOn(table, moveResolution({ outcome: 'strong_hit', outcomeLabel: 'Strong Hit' }));

    await endTheScene();
    expect(stored().currentSceneId ?? null, 'the scene closed').toBe(null);
    const lore = await loreStating(TRUTH);
    expect(lore.map(e => e.title), 'one lore entry states the revealed truth').toHaveLength(1);
    expect(lore[0].title).toBe('Threat: the escort');
  }, 40_000);

  it('once too when the narration also states the revealed truth as a truth of its own', async () => {
    const plan = await seedPlan();
    table.replies = revealing(plan.id, [{ subject: 'the escort', fact: TRUTH }]);
    await narrateMoveOn(table, moveResolution({ outcome: 'strong_hit', outcomeLabel: 'Strong Hit' }));
    await endTheScene();
    expect(await loreStating(TRUTH)).toHaveLength(1);
  }, 40_000);

  it('control: the beat\'s other truths are archived at the scene\'s end as before — a marker the model writes is ignored', async () => {
    const plan = await seedPlan();
    // The player's line bears it out (overhaul 2 §5.2): it binds, and the scene's end archives it.
    table.replies = revealing(plan.id, [{ subject: 'the corridor', fact: OTHER, revealOf: plan.id, from: 'line' }]);
    await narrateMoveOn(table, moveResolution({ outcome: 'strong_hit', outcomeLabel: 'Strong Hit',
      playerNarration: 'I watch the corridor lights flicker in the drone\'s count.' }));
    expect((stored().sceneTruths ?? []).find(t => t.fact === OTHER)?.revealOf).toBeUndefined();
    await endTheScene();
    expect(await loreStating(OTHER)).toHaveLength(1);
  }, 40_000);
});
