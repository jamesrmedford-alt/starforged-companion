/**
 * STARFORGED COMPANION
 * tests/unit/revealedTruthLoreOnce.test.js
 *
 * Issue #362 AC37 REVEALED-TRUTH-ARCHIVED-TWICE, under issue #402's change
 * 1b. A hidden plan's truth a narration revealed was confirmed Lore ("Threat:
 * the escort") and a truth of the narration's own in the scene ledger, and the
 * scene's end archived the ledger truth again under "<subject>: <fact>": the
 * same sentence was confirmed Lore twice. Since change 1b a reveal files what
 * the narration told — its own fact block — and the plan's truth as Lore
 * pending the GM's confirmation: no ledger truth of its own, so the scene's
 * end has nothing of it to archive, and the entry is canon when a GM confirms
 * it. Round 10's a75 told a name and "one hand behind all of it", and the
 * plan's whole text was filed as established and told by the recap.
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

/** Every Lore entry stating it — confirmed or pending the GM. */
async function anyLoreStating(text) {
  const { getConfirmedLore, getNarratorAssertedLore } = await gmOf(table).import('../../src/world/worldJournal.js');
  return gmOf(table).run(() => [...getConfirmedLore(null), ...getNarratorAssertedLore(null)])
    .filter(e => e.text === text || e.fact === text);
}

async function endTheScene() {
  const { endScene } = await gmOf(table).import('../../src/factContinuity/sceneLifecycle.js');
  return onGm(table, () => endScene(foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')), { reason: 'scene_command' }));
}

const revealing = (planId, newTruths = []) => () => ({ prose: 'The drone speaks in the Choir\'s voice.',
  sidecar: { newTruths, stateChanges: [], reveals: [{ id: planId, revealed: ['truth'] }] } });

describe('issue #362 AC37 / #402 1b — a revealed truth is filed once, pending the GM', () => {
  it('the reveal files it as Lore pending the GM, marked with its plan — and as no ledger truth', async () => {
    const plan = await seedPlan();
    table.replies = revealing(plan.id);
    await narrateMoveOn(table, moveResolution({ outcome: 'strong_hit', outcomeLabel: 'Strong Hit' }));

    expect(plansOf(table)[0].truthRevealed).toBe(true);
    expect((stored().sceneTruths ?? []).filter(t => t.fact === TRUTH), 'no scene fact the prose did not give').toHaveLength(0);
    expect(await loreStating(TRUTH), 'not canon').toHaveLength(0);
    const lore = await anyLoreStating(TRUTH);
    expect(lore).toHaveLength(1);
    expect(lore[0]).toMatchObject({ title: 'Threat: the escort', confirmed: false, narratorAsserted: true, revealOf: plan.id });
  }, 40_000);

  it('after the scene ends, the lore still states it once — and still pending', async () => {
    const plan = await seedPlan();
    table.replies = revealing(plan.id);
    await narrateMoveOn(table, moveResolution({ outcome: 'strong_hit', outcomeLabel: 'Strong Hit' }));

    await endTheScene();
    expect(stored().currentSceneId ?? null, 'the scene closed').toBe(null);
    const lore = await anyLoreStating(TRUTH);
    expect(lore.map(e => e.title), 'one lore entry states the revealed truth').toEqual(['Threat: the escort']);
    expect(lore[0].confirmed).toBe(false);
  }, 40_000);

  it('once too when the narration also states the revealed truth as a truth of its own', async () => {
    const plan = await seedPlan();
    table.replies = revealing(plan.id, [{ subject: 'the escort', fact: TRUTH }]);
    await narrateMoveOn(table, moveResolution({ outcome: 'strong_hit', outcomeLabel: 'Strong Hit' }));
    await endTheScene();
    expect(await anyLoreStating(TRUTH)).toHaveLength(1);
  }, 40_000);

  it('a GM\'s confirm from the review queue makes it canon', async () => {
    const plan = await seedPlan();
    table.replies = revealing(plan.id);
    await narrateMoveOn(table, moveResolution({ outcome: 'strong_hit', outcomeLabel: 'Strong Hit' }));
    const { promoteLoreToConfirmed } = await gmOf(table).import('../../src/world/worldJournal.js');
    await onGm(table, () => promoteLoreToConfirmed('Threat: the escort', null));
    const lore = await loreStating(TRUTH);
    expect(lore).toHaveLength(1);
    expect(lore[0]).toMatchObject({ title: 'Threat: the escort', confirmed: true, revealOf: plan.id });
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
