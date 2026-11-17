/**
 * STARFORGED COMPANION
 * tests/unit/planHistoryKeepsEarlierNarration.test.js
 *
 * Issue #362 AC34 (PLAN-HISTORY-OVERFLOW-DELETES-PLAN): narration M files an
 * enemy's plan undecided; the next narration N decides it, and in doing so
 * writes the plan several times — the decision, its escalation clock's link,
 * one write per `reveals` entry, its capture's link to the Threats page. Each
 * write pushed N's own last version onto the page's `previous`, which keeps
 * three (worldJournal.js NARRATION_HISTORY): a fourth pushed M's version off,
 * and the X-Card on N then found no version from before it and deleted the
 * plan M made — decisions.md says the X-Card "restores the version before a
 * narration that changed it". A narration now keeps one version of a plan.
 *
 * From the fourteenth audit's probes (nara/planHistoryOverflowDeletesPlan,
 * fc/xcardDeletesPlanWrittenFourTimes, skel/xCardDeletesPlanItShouldRestore).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import {
  MODULE_ID, resetSkeletonTable, gmOf, plansOf, onGm, moveResolution, narrateMoveOn, playXCard, patSpeaks,
} from '../helpers/skeletonTable.js';

const TRUTH = 'The escort is a Keeper drone collecting names.';

let table;
let restore;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => { restore = await resetSkeletonTable(table); });
afterEach(() => restore?.());

const stored = () => gmOf(table).run(() => game.settings.get(MODULE_ID, 'campaignState'));
const lastNarrationId = () => table.cards(f => f.narratorCard === true && f.narrationId).at(-1).flags[MODULE_ID].narrationId;

/** Narration M: the prose brings in an enemy; its plan is filed undecided, stamped with M. */
async function enemyIntroduced() {
  table.replies = () => ({ prose: 'A second shape detaches from the dark: an escort, waiting.',
    sidecar: { newTruths: [], stateChanges: [], newThreats: [{ name: 'the escort' }] } });
  await narrateMoveOn(table, moveResolution());
  const [plan] = plansOf(table);
  expect(plan).toMatchObject({ kind: 'threat', truth: '', status: 'active', subject: { type: 'name', name: 'the escort' } });
  expect(plan.oracleSeeds.length).toBeGreaterThan(0);
  return { plan, m: lastNarrationId() };
}

/** Narration N decides it (so its clock starts) and records what the beat showed as `reveals`. */
async function decided(planId, reveals) {
  await patSpeaks(table);   // the X-Card's beat begins here
  table.replies = () => ({ prose: 'The escort pulses, once, twice — counting.', sidecar: {
    newTruths: [], stateChanges: [],
    plans: [{ id: planId, truth: TRUTH, wants: 'A name the crew carries.',
      escalation: ['It asks again, closer', 'It seals the corridor'], clues: ['A pulse that counts down', 'A Keeper sigil'] }],
    reveals,
  } });
  await narrateMoveOn(table, moveResolution({ outcome: 'weak_hit', outcomeLabel: 'Weak Hit' }));
  return lastNarrationId();
}

describe('issue #362 AC34 — the X-Card restores a plan however many times the removed narration wrote it', () => {
  it('control: decided, clocked and one reveals entry (three writes) — the X-Card puts it back undecided', async () => {
    const { plan, m } = await enemyIntroduced();
    const n = await decided(plan.id, [{ id: plan.id, revealed: ['c1'], advanced: 'e1' }]);
    expect(plansOf(table)[0]).toMatchObject({ truth: TRUTH, narrationId: n });

    await playXCard(table);
    const after = plansOf(table);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ id: plan.id, truth: '', status: 'active', narrationId: m, clockId: null });
    expect(after[0].oracleSeeds).toEqual(plan.oracleSeeds);
    expect((stored().clocks ?? []).some(c => c.planId === plan.id)).toBe(false);
  }, 60_000);

  it('the same beat recorded as TWO reveals entries of the one plan (four writes) — still restored, not deleted', async () => {
    const { plan, m } = await enemyIntroduced();
    await decided(plan.id, [{ id: plan.id, revealed: ['c1'] }, { id: plan.id, advanced: 'e1' }]);
    const written = plansOf(table)[0];
    expect(written.clues[0].revealed).toBe(true);
    expect(written.escalation[0].done).toBe(true);

    await playXCard(table);
    const after = plansOf(table);
    expect(after.map(p => p.id), 'the plan narration M made is still there').toEqual([plan.id]);
    expect(after[0]).toMatchObject({ truth: '', status: 'active', narrationId: m });
    expect(after[0].oracleSeeds).toEqual(plan.oracleSeeds);
  }, 60_000);

  it('…and when N\'s capture also linked it to its Threats page (the real router) — restored to M\'s, link and all', async () => {
    const { plan, m } = await enemyIntroduced();
    const n = await decided(plan.id, [{ id: plan.id, revealed: ['c1'] }]);
    const { routeWorldJournalResults } = await gmOf(table).import('../../src/entities/entityExtractor.js');
    await onGm(table, () => routeWorldJournalResults({
      lore: [], factionUpdates: [], locationUpdates: [], stateTransitions: [],
      threats: [{ name: 'The Escort', severity: 'active', summary: 'It hunts names.', salience: 'significant' }],
    }, game.settings.get(MODULE_ID, 'campaignState'), { narrationId: n }));
    const written = plansOf(table)[0];
    expect(written).toMatchObject({ id: plan.id, truth: TRUTH, narrationId: n, subject: { type: 'threat', name: 'the escort' } });
    expect(written.clockId).toBeTruthy();

    await playXCard(table);
    const after = plansOf(table);
    expect(after.map(p => p.id), 'the plan M made outlives an X-Card on N').toEqual([plan.id]);
    expect(after[0]).toMatchObject({ truth: '', status: 'active', narrationId: m, subject: { type: 'name', name: 'the escort' } });
  }, 60_000);

  it('a plan the removed narration made itself is still taken out of play, however often it wrote it', async () => {
    table.replies = (call) => {
      const ref = /- id (plan-[\w-]+-enemy):/.exec(call.system ?? '')?.[1];
      return { prose: 'An escort detaches from the dark.', sidecar: { newTruths: [], stateChanges: [],
        ...(ref ? { plans: [{ id: ref, subject: 'the escort', truth: TRUTH, escalation: ['It asks again'], clues: ['A pulse'] }] } : {}) } };
    };
    await patSpeaks(table);
    const { withPayThePriceSeed } = await import('../../src/moves/resolver.js');
    await narrateMoveOn(table, moveResolution({ oracleSeeds: withPayThePriceSeed(null, 'face_danger', 'A new enemy is revealed') }));
    expect(plansOf(table)).toHaveLength(1);
    expect(plansOf(table)[0].clockId, 'filed, then linked to its clock: two writes').toBeTruthy();
    await playXCard(table);
    expect(plansOf(table)).toEqual([]);
  }, 60_000);
});
