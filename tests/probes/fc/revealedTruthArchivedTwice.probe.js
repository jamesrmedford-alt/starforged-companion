/**
 * FC-04 · REVEALED-TRUTH-ARCHIVED-TWICE  (MIRROR-DRIFT / duplicate record)
 *
 * Scenario: a hidden plan's truth is revealed by a narration (its sidecar's
 * `reveals: [{ id, revealed: ["truth"] }]`). By decision (decisions.md →
 * "The narrative skeleton, Phase 2": "A revealed truth becomes a stated fact:
 * a truth of the narration's own in the scene ledger … and confirmed lore")
 * the reveal files the truth as confirmed lore ("Threat: the escort") and
 * adds it to the scene ledger. The scene then ends (`!scene end`, End a
 * Session, the next scene's start).
 *
 * Correct: the World Journal's lore states the revealed truth once.
 *
 * Today: scene end archives every text-subject ledger truth to lore
 * (sceneLifecycle.migrateSceneTruth → worldJournal.archiveSceneTruth, titled
 * "<subject>: <fact>"), and nothing ties the ledger truth to the lore entry
 * the reveal already filed — so the same sentence is confirmed lore twice,
 * under two titles. Both are offered to ESTABLISHED LORE / the world
 * snapshot, and a later correction of one (a GM's `!journal`) leaves the
 * other standing.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../../helpers/multiClient.js';
import {
  MODULE_ID, resetSkeletonTable, gmOf, plansOf, onGm, narrateMoveOn, moveResolution,
} from '../../helpers/skeletonTable.js';

const TRUTH = 'The escort is a Keeper drone collecting names for the Pale Choir.';

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

describe('FC-04 — a revealed truth is confirmed lore once', () => {
  it('control: the reveal files it as lore and as a ledger truth of the narration', async () => {
    const plan = await seedPlan();
    table.replies = () => ({ prose: 'The drone speaks in the Choir\'s voice.',
      sidecar: { newTruths: [], stateChanges: [], reveals: [{ id: plan.id, revealed: ['truth'] }] } });
    await narrateMoveOn(table, moveResolution({ outcome: 'strong_hit', outcomeLabel: 'Strong Hit' }));

    expect(plansOf(table)[0].truthRevealed).toBe(true);
    expect((stored().sceneTruths ?? []).filter(t => t.fact === TRUTH && !t.retracted)).toHaveLength(1);
    expect(await loreStating(TRUTH)).toHaveLength(1);
  }, 40_000);

  it('after the scene ends, the lore still states it once', async () => {
    const plan = await seedPlan();
    table.replies = () => ({ prose: 'The drone speaks in the Choir\'s voice.',
      sidecar: { newTruths: [], stateChanges: [], reveals: [{ id: plan.id, revealed: ['truth'] }] } });
    await narrateMoveOn(table, moveResolution({ outcome: 'strong_hit', outcomeLabel: 'Strong Hit' }));

    await endTheScene();
    expect(stored().currentSceneId ?? null, 'the scene closed').toBe(null);

    const lore = await loreStating(TRUTH);
    expect(lore.map(e => e.title), 'one lore entry states the revealed truth').toHaveLength(1);
  }, 40_000);
});
