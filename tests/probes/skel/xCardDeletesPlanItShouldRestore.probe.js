/**
 * SKEL — PLAN-XCARD-HISTORY-CROWDED
 *
 * Scenario: one narration introduces an enemy ("the escort" — sidecar
 * `newThreats`), and its plan is filed undecided with its oracle rolls. The
 * NEXT narration decides it under DECIDE NOW (truth, escalation, clues), which
 * also gives it its escalation clock, and its beat shows the first clue
 * (`reveals`); the detection pass that follows that narration records the
 * escort as a significant threat and links the plan to its Threats page
 * (entityExtractor.js routeWorldJournalResults → secrets.planSignificantThreat,
 * stamped with the same narration). A player then plays the X-Card on that
 * second narration.
 *
 * Correct (decisions.md → "The narrative skeleton": "the X-Card takes a plan
 * back with the narration that made it, and restores the version before a
 * narration that changed it"): the plan goes back to what the first narration
 * filed — undecided, its rolls kept, still in play to be decided again.
 *
 * Today: every plan write pushes the stored version onto `previous`, capped at
 * three (worldJournal.js narrationStamp, NARRATION_HISTORY) — sized for
 * entries a narration writes once. One narration writes a plan up to four
 * times here (decide, clock id, reveal, link), so its own intermediate
 * versions push the first narration's out of the history. The X-Card then
 * finds no version from before the removed narration and takes the "it made
 * this entry" branch: the page is deleted. The enemy the first narration
 * introduced has no plan, and nothing files one again.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../../helpers/multiClient.js';
import {
  MODULE_ID, resetSkeletonTable, gmOf, plansOf, onGm, moveResolution, narrateMoveOn, playXCard, patSpeaks,
} from '../../helpers/skeletonTable.js';

let table;
let restore;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => { restore = await resetSkeletonTable(table); });
afterEach(() => restore?.());

const lastNarrationId = () => table.cards(f => f.narratorCard === true && f.narrationId).at(-1).flags[MODULE_ID].narrationId;

/** The first narration introduces the escort; its plan is filed undecided. */
async function escortIntroduced() {
  table.replies = () => ({ prose: 'An escort detaches from the dark.', sidecar: { newTruths: [], stateChanges: [],
    newThreats: [{ name: 'the escort' }] } });
  await narrateMoveOn(table, moveResolution());
  const [plan] = plansOf(table);
  expect(plan).toMatchObject({ kind: 'threat', truth: '', status: 'active', subject: { type: 'name', name: 'the escort' } });
  expect(plan.oracleSeeds.length).toBeGreaterThan(0);
  return plan;
}

/** The second narration decides it (and so gives it its clock) and its beat shows the first clue. */
async function escortDecidedAndClueShown(plan) {
  await patSpeaks(table);   // the X-Card's beat begins here
  table.replies = () => ({ prose: 'The escort pulses, counting.', sidecar: { newTruths: [], stateChanges: [],
    plans:   [{ id: plan.id, truth: 'A Keeper drone collecting names.', escalation: ['It asks again, closer'], clues: ['A pulse that counts down'] }],
    reveals: [{ id: plan.id, revealed: ['c1'] }] } });
  await narrateMoveOn(table, moveResolution({ outcome: 'weak_hit', outcomeLabel: 'Weak Hit' }));
  const decided = plansOf(table).find(p => p.id === plan.id);
  expect(decided).toMatchObject({ truth: 'A Keeper drone collecting names.' });
  expect(decided.clockId).toBeTruthy();
  expect(decided.clues[0].revealed).toBe(true);
  return lastNarrationId();
}

describe('SKEL PLAN-XCARD-HISTORY-CROWDED — the X-Card restores a plan an earlier narration made', () => {
  it('control: decided, clocked and a clue shown (three writes) — the X-Card puts the plan back undecided', async () => {
    const plan = await escortIntroduced();
    await escortDecidedAndClueShown(plan);
    await playXCard(table);
    const back = plansOf(table).find(p => p.id === plan.id);
    expect(back, 'the plan the first narration filed').toBeTruthy();
    expect(back).toMatchObject({ truth: '', status: 'active', clockId: null });
    expect(back.oracleSeeds).toEqual(plan.oracleSeeds);
  }, 60_000);

  it('…and when that narration\'s capture also linked it to its Threats page (a fourth write), it is still restored, not deleted', async () => {
    const plan = await escortIntroduced();
    const narrationId = await escortDecidedAndClueShown(plan);
    // The detection pass after the narration records the escort as a significant
    // threat: the plan filed under its name is linked to the page, stamped with
    // the narration (entityExtractor.js routeWorldJournalResults' own call).
    const secrets = await gmOf(table).import('../../src/world/secrets.js');
    const linked = await onGm(table, () => secrets.planSignificantThreat({ name: 'The Escort', pageId: 'pg-escort-0001' },
      { campaignState: game.settings.get(MODULE_ID, 'campaignState'), narrationId }));
    expect(linked?.subject).toMatchObject({ type: 'threat', id: 'pg-escort-0001' });

    await playXCard(table);
    const back = plansOf(table).find(p => p.id === plan.id);
    // Correct: back to what the first narration filed.
    expect(back, 'the plan the first narration filed survives the X-Card on the second').toBeTruthy();
    expect(back).toMatchObject({ truth: '', status: 'active', subject: { type: 'name', name: 'the escort' } });
  }, 60_000);
});
