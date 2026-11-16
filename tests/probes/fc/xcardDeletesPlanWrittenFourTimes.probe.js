/**
 * FC-02 · XCARD-DELETES-PLAN-WRITTEN-FOUR-TIMES  (LOST-UPDATE / WRONG-TARGET)
 *
 * Scenario: narration M introduces an enemy (its sidecar's `newThreats`), so
 * a `threat` plan is filed undecided, stamped with M. The table speaks. The
 * next narration N is the one DECIDE NOW asks: its sidecar decides the plan
 * (write 1), which gives the plan its escalation clock (write 2 — the plan's
 * `clockId`), and records the clue its beat showed (write 3); N's capture
 * then records the enemy as a significant threat, which links the plan to
 * its Threats page (write 4 — planSignificantThreat). All four writes are
 * N's own, by the real paths. The X-Card is played on N.
 *
 * Correct (decisions.md → "The narrative skeleton": "the X-Card takes a plan
 * back with the narration that made it, and restores the version before a
 * narration that changed it"; secrets.js header: "a plan it made is deleted,
 * one it changed restored"): M's plan is still there, undecided again, for
 * the next narration to decide.
 *
 * Today: a plan keeps at most NARRATION_HISTORY (3) earlier versions
 * (worldJournal.js narrationStamp). N's fourth write pushes M's version off
 * the end, so every version left is N's, and undoNarrationEntries takes
 * "no version a removed narration did not write" to mean "N made it":
 * `await page.delete()`. The enemy M introduced — M stands — has no plan at
 * all, and its rolls are gone. A Burn Momentum / Improve Result that
 * supersedes N takes the same path (resultUpgrade retractSupersededNarrations
 * → undoNarrationEntries(ids, { categories: ["secrets"] })).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../../helpers/multiClient.js';
import {
  MODULE_ID, resetSkeletonTable, gmOf, plansOf, onGm, narrateMoveOn, moveResolution, playXCard, patSpeaks,
} from '../../helpers/skeletonTable.js';

const TRUTH = 'The escort is a Keeper drone collecting names for the Pale Choir.';

let table;
let restore;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => { restore = await resetSkeletonTable(table); });
afterEach(() => restore?.());

const stored = () => gmOf(table).run(() => game.settings.get(MODULE_ID, 'campaignState'));
const lastNarrationId = () => table.cards(f => f.narratorCard === true && f.narrationId).at(-1).flags[MODULE_ID].narrationId;

/** Narration M: the prose brings in an enemy; its plan is filed undecided. */
async function enemyIntroduced() {
  table.replies = () => ({ prose: 'A second shape detaches from the dark: an escort, waiting.',
    sidecar: { newTruths: [], stateChanges: [], newThreats: [{ name: 'the escort' }] } });
  await narrateMoveOn(table, moveResolution());
  const [plan] = plansOf(table);
  return { plan, narrationId: lastNarrationId() };
}

/** Narration N: decides the plan (and so starts its clock) and shows its first clue. */
async function decidedAndClueShown(planId) {
  table.replies = () => ({ prose: 'The escort pulses, once, twice — counting.', sidecar: {
    newTruths: [], stateChanges: [],
    plans: [{ id: planId, truth: TRUTH, wants: 'A name the crew carries.',
      escalation: ['It asks again, closer', 'It seals the corridor'], clues: ['A pulse that counts down', 'A Choir sigil on its hull'] }],
    reveals: [{ id: planId, revealed: ['c1'] }],
  } });
  await narrateMoveOn(table, moveResolution({ outcome: 'weak_hit', outcomeLabel: 'Weak Hit' }));
  return lastNarrationId();
}

/** N's capture: the detection pass records the enemy as a significant threat (the real router). */
async function captureRecordsThreat(narrationId) {
  const { routeWorldJournalResults } = await gmOf(table).import('../../src/entities/entityExtractor.js');
  await onGm(table, () => routeWorldJournalResults({
    lore: [], factionUpdates: [], locationUpdates: [], stateTransitions: [],
    threats: [{ name: 'The Escort', severity: 'active', summary: 'It hunts names.', salience: 'significant' }],
  }, game.settings.get(MODULE_ID, 'campaignState'), { narrationId }));
}

describe('FC-02 — the X-Card restores a plan the removed narration changed, however many times it wrote it', () => {
  it('control: decided, clocked and a clue shown (three writes) — the X-Card puts the plan back undecided', async () => {
    const { plan, narrationId: m } = await enemyIntroduced();
    expect(plan).toMatchObject({ kind: 'threat', truth: '', narrationId: m });
    await patSpeaks(table);
    const n = await decidedAndClueShown(plan.id);
    expect(plansOf(table)[0]).toMatchObject({ truth: TRUTH, narrationId: n });
    expect(plansOf(table)[0].clockId).toBeTruthy();
    expect(plansOf(table)[0].clues[0].revealed).toBe(true);

    await playXCard(table);
    const after = plansOf(table);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ id: plan.id, truth: '', status: 'active', narrationId: m, clockId: null });
    expect((stored().clocks ?? []).some(c => c.planId === plan.id)).toBe(false);
  }, 60_000);

  it('…and its capture linked it to the Threats page (a fourth write): the plan narration M made is still there, undecided', async () => {
    const { plan, narrationId: m } = await enemyIntroduced();
    await patSpeaks(table);
    const n = await decidedAndClueShown(plan.id);
    await captureRecordsThreat(n);

    // Every write was N's, by the production paths.
    const written = plansOf(table)[0];
    expect(written).toMatchObject({ id: plan.id, truth: TRUTH, narrationId: n, subject: { type: 'threat', name: 'the escort' } });
    expect(written.clockId).toBeTruthy();
    expect(written.clues[0].revealed).toBe(true);

    await playXCard(table);

    const after = plansOf(table);
    expect(after.map(p => p.id), 'the plan M made outlives an X-Card on N').toEqual([plan.id]);
    expect(after[0]).toMatchObject({ truth: '', status: 'active', narrationId: m });
  }, 60_000);
});
