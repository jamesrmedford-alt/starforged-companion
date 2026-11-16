/**
 * FC-05 · XCARD-LATE-CAPTURE-PLAN-WRITES  (INCOMPLETE-FIX of XCARD-LATE-CAPTURE — SAFETY)
 *
 * Scenario: a narration N introduces a menace. About 2 s later its capture
 * (the detection pass) records it as a significant threat — a Threats page,
 * then a hidden `threat` plan for it in the Secrets journal
 * (entityExtractor.routeWorldJournalResults → secrets.planSignificantThreat).
 * The table plays the X-Card on N while the capture is writing: the pause
 * lands after the capture's check at the top of its threat loop, during the
 * Threats page's write.
 *
 * Correct (rules/narrator-memory.md 6b: "a new capture writer takes the id
 * from its caller, and checks the stored `xCardedNarrationIds` right before
 * it writes — `isNarrationXCarded`, after any Claude call — so a capture
 * still running when the card is played writes nothing more:
 * XCARD-LATE-CAPTURE"): nothing more is written for N — no plan.
 *
 * Today: routeWorldJournalResults checks `removed()` once before
 * `recordThreat`, and neither it nor secrets.js (createSkeleton /
 * updateSkeleton / planSignificantThreat / planNpcAgenda / applyPlanSideData)
 * checks again before a plan write. The X-Card's undo deletes the Threats
 * page (it had landed), and the capture then files a plan stamped with the
 * removed narration — after the undo, so nothing takes it back. The plan is
 * active: every later narration it is in play for is handed it under
 * UNREVEALED / DECIDE NOW, i.e. the content the table removed.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../../helpers/multiClient.js';
import {
  MODULE_ID, resetSkeletonTable, gmOf, plansOf, narrateMoveOn, moveResolution, playXCard, patSpeaks,
} from '../../helpers/skeletonTable.js';
import { JOURNAL_NAMES } from '../../../src/world/worldJournal.js';

let table;
let restore;
let hold = null;   // { arrived: Promise, release: () => void } while a Threats page write is held

function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  hold = null;
  restore = await resetSkeletonTable(table);
  // The Threats journal's page writes can be held open after the page has
  // landed — the moment the X-Card arrives in (the shape of
  // tests/unit/xcardLateCapture.test.js's `afterPageCreate`).
  const inner = globalThis.JournalEntry.create;
  globalThis.JournalEntry = {
    async create(data) {
      const journal = await inner(data);
      if (data?.name === JOURNAL_NAMES.threats) {
        const create = journal.createEmbeddedDocuments.bind(journal);
        journal.createEmbeddedDocuments = async (...args) => {
          const out = await create(...args);
          if (hold) { hold.reached.resolve(); await hold.gate.promise; }
          return out;
        };
      }
      return journal;
    },
  };
});
afterEach(() => restore?.());

const stored = () => gmOf(table).run(() => game.settings.get(MODULE_ID, 'campaignState'));
const threatPages = () => (gmOf(table).run(() => game.journal.find(j => j.name === JOURNAL_NAMES.threats))?.pages?.contents ?? []).map(p => p.name);

/** A narration posts; returns its id. */
async function narrate() {
  await patSpeaks(table);
  table.replies = () => ({ prose: 'Something vast turns in the dark beyond the hull: the Pale Choir has found them.',
    sidecar: { newTruths: [], stateChanges: [] } });
  await narrateMoveOn(table, moveResolution());
  return table.cards(f => f.narratorCard === true && f.narrationId).at(-1).flags[MODULE_ID].narrationId;
}

/** The narration's capture: the detection pass's results, routed by the real router. */
async function startCapture(narrationId) {
  const { routeWorldJournalResults } = await gmOf(table).import('../../src/entities/entityExtractor.js');
  return gmOf(table).run(() => routeWorldJournalResults({
    lore: [], factionUpdates: [], locationUpdates: [], stateTransitions: [],
    threats: [{ name: 'The Pale Choir', severity: 'active', summary: 'A cult that harvests names.', salience: 'significant' }],
  }, foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')), { narrationId }));
}

describe('FC-05 — a capture still running when the X-Card is played files no hidden plan', () => {
  it('control: with no X-Card, the capture records the threat and files its plan, stamped with the narration', async () => {
    const n = await narrate();
    await startCapture(n);
    await table.settle();
    expect(threatPages()).toEqual(['The Pale Choir']);
    expect(plansOf(table)).toHaveLength(1);
    expect(plansOf(table)[0]).toMatchObject({ kind: 'threat', status: 'active', narrationId: n, subject: { type: 'threat', name: 'The Pale Choir' } });
  }, 40_000);

  it('control: the X-Card played before the capture writes — nothing is recorded', async () => {
    const n = await narrate();
    await playXCard(table);
    expect(stored().xCardedNarrationIds).toEqual([n]);
    await startCapture(n);
    await table.settle();
    expect(threatPages()).toEqual([]);
    expect(plansOf(table)).toEqual([]);
  }, 40_000);

  it('the X-Card played while the capture writes its Threats page: no plan is filed for the removed narration', async () => {
    const n = await narrate();
    hold = { reached: deferred(), gate: deferred() };
    const capture = startCapture(n);
    await hold.reached.promise;              // the Threats page has landed; the capture has not gone on

    await playXCard(table);                  // …and the table removes the narration
    expect(stored().xCardedNarrationIds).toEqual([n]);
    expect(threatPages(), 'the X-Card\'s undo took back the page that had landed').toEqual([]);

    hold.gate.resolve();                     // the capture goes on
    hold = null;
    await capture;
    await table.settle();
    await table.drain();

    expect(plansOf(table).filter(p => p.narrationId === n), 'no plan stamped with the removed narration').toEqual([]);
    expect(plansOf(table).filter(p => p.status === 'active')).toEqual([]);
  }, 40_000);
});
