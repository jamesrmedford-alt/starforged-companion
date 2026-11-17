/**
 * STARFORGED COMPANION
 * tests/unit/xcardLatePlanWrite.test.js
 *
 * Issue #362 AC35 (XCARD-LATE-PLAN-WRITE): the plan writes a narration makes
 * run after its card is on screen — several server round trips — and none of
 * the #353 writers asked whether the X-Card had removed that narration
 * meanwhile (rules/narrator-memory.md 6b, XCARD-LATE-CAPTURE: a writer
 * "checks the stored xCardedNarrationIds right before it writes … so a
 * capture still running when the card is played writes nothing more"). A plan
 * page created after the X-Card's undo had run was kept, with its escalation
 * clock, and a capture still running filed a plan for a threat the X-Card had
 * taken back. Each plan writer now checks before its write, and takes the
 * write back when the card landed while it was on its way.
 *
 * From the fourteenth audit's probes (nara/planWriteAfterXCard,
 * fc/xcardLateCaptureFilesPlan), on a simulated table.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import {
  MODULE_ID, resetSkeletonTable, gmOf, plansOf, narrateMoveOn, moveResolution, playXCard, patSpeaks,
} from '../helpers/skeletonTable.js';
import { withPayThePriceSeed } from '../../src/moves/resolver.js';
import { JOURNAL_NAMES } from '../../src/world/worldJournal.js';

const TRUTH = 'SENTINEL-TRUTH: the escort is a Keeper drone collecting names';

function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}

let table;
let restore;
/** While set, a Secrets page's creation, or the next flag write on one, waits on it — a slow server round trip. */
const gates = { create: null, flag: null };
/** While set, a Threats page's creation answers, then waits (the capture's write on its way). */
let threatHold = null;

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  gates.create = null;
  gates.flag = null;
  threatHold = null;
  restore = await resetSkeletonTable(table);
  const inner = globalThis.JournalEntry.create;
  globalThis.JournalEntry = {
    async create(data) {
      const journal = await inner(data);
      const create = journal.createEmbeddedDocuments.bind(journal);
      if (data?.flags?.[MODULE_ID]?.worldJournalCategory === 'secrets') {
        journal.createEmbeddedDocuments = async (...args) => {
          if (gates.create) await gates.create.promise;
          const pages = await create(...args);
          for (const page of pages) {
            const setFlag = page.setFlag.bind(page);
            page.setFlag = async (...a) => {
              const gate = gates.flag;
              if (gate) { gates.flag = null; gate.reached.resolve(); await gate.open.promise; }
              return setFlag(...a);
            };
          }
          return pages;
        };
      } else if (data?.name === JOURNAL_NAMES.threats) {
        journal.createEmbeddedDocuments = async (...args) => {
          const out = await create(...args);
          if (threatHold) { threatHold.reached.resolve(); await threatHold.open.promise; }
          return out;
        };
      }
      return journal;
    },
  };
});
afterEach(() => restore?.());

const stored = () => gmOf(table).run(() => game.settings.get(MODULE_ID, 'campaignState'));
const planClocks = () => (stored().clocks ?? []).filter(c => c.planId);
const lastNarrationId = () => table.cards(f => f.narratorCard === true && f.narrationId).at(-1)?.flags?.[MODULE_ID]?.narrationId;
const settleAll = async () => { for (let i = 0; i < 5; i += 1) { await table.settle(); await table.drain(); } };

/** A reply that decides the price's new enemy, by the ref DECIDE NOW gives. */
const decidesNewEnemy = (call) => {
  const ref = /- id (plan-[\w-]+-enemy):/.exec(call.system ?? '')?.[1];
  return { prose: 'A second shape detaches from the dark: an escort, waiting.', sidecar: { newTruths: [], stateChanges: [],
    ...(ref ? { plans: [{ id: ref, subject: 'the escort', truth: TRUTH, wants: 'A name.',
      escalation: ['It asks again, closer', 'It seals the corridor'], clues: ['A pulse that counts down'] }] } : {}) } };
};
const newEnemyMiss = () => moveResolution({ oracleSeeds: withPayThePriceSeed(null, 'face_danger', 'A new enemy is revealed') });

describe('issue #362 AC35 — a plan write for a narration the X-Card removed is not made', () => {
  it('control: the plan was written before the X-Card — the X-Card takes the plan and its clock back', async () => {
    table.replies = decidesNewEnemy;
    await narrateMoveOn(table, newEnemyMiss());
    expect(plansOf(table)).toHaveLength(1);
    expect(planClocks()).toHaveLength(1);

    await playXCard(table);
    expect(plansOf(table)).toEqual([]);
    expect(planClocks()).toEqual([]);
  }, 40_000);

  it('the plan\'s page write lands after the X-Card: no plan and no escalation clock of the removed narration is left', async () => {
    gates.create = deferred();
    table.replies = decidesNewEnemy;
    await narrateMoveOn(table, newEnemyMiss());
    const narrationId = lastNarrationId();
    expect(narrationId).toBeTruthy();
    expect(plansOf(table), 'the page is still on its way').toEqual([]);

    await playXCard(table);
    expect(stored().xCardedNarrationIds ?? []).toContain(narrationId);

    gates.create.resolve();     // the server answers the page write now
    gates.create = null;
    await settleAll();
    expect({
      plans:  plansOf(table).map(p => p.truth),
      clocks: (stored().clocks ?? []).filter(c => c.narrationId === narrationId).map(c => c.name),
    }, 'nothing of the narration the X-Card removed is left').toEqual({ plans: [], clocks: [] });
  }, 40_000);

  it('a decision of an earlier narration\'s plan that lands after the X-Card is taken back to that narration\'s version', async () => {
    table.replies = () => ({ prose: 'An escort detaches from the dark.', sidecar: { newTruths: [], stateChanges: [],
      newThreats: [{ name: 'the escort' }] } });
    await narrateMoveOn(table, moveResolution());
    const [filed] = plansOf(table);
    const m = lastNarrationId();
    expect(filed).toMatchObject({ truth: '', narrationId: m });

    await patSpeaks(table);
    const held = { reached: deferred(), open: deferred() };
    gates.flag = held;
    table.replies = () => ({ prose: 'The escort pulses, counting.', sidecar: { newTruths: [], stateChanges: [],
      plans: [{ id: filed.id, truth: TRUTH, escalation: ['It asks again, closer'], clues: ['A pulse that counts down'] }] } });
    await narrateMoveOn(table, moveResolution({ outcome: 'weak_hit', outcomeLabel: 'Weak Hit' }));
    await held.reached.promise;   // the decision's write is on its way
    await playXCard(table);
    held.open.resolve();
    await settleAll();

    const after = plansOf(table);
    expect(after.map(p => p.id)).toEqual([filed.id]);
    expect(after[0], 'back to the version narration M left').toMatchObject({ truth: '', narrationId: m, clockId: null });
    expect(planClocks(), 'no clock for a decision the table removed').toEqual([]);
  }, 40_000);
});

describe('issue #362 AC35 — a capture still running when the X-Card is played files no hidden plan', () => {
  const threatPages = () => (gmOf(table).run(() => game.journal.find(j => j.name === JOURNAL_NAMES.threats))?.pages?.contents ?? []).map(p => p.name);

  async function narrate() {
    await patSpeaks(table);
    table.replies = () => ({ prose: 'Something vast turns in the dark beyond the hull: the Pale Choir has found them.',
      sidecar: { newTruths: [], stateChanges: [] } });
    await narrateMoveOn(table, moveResolution());
    return lastNarrationId();
  }

  async function startCapture(narrationId) {
    const { routeWorldJournalResults } = await gmOf(table).import('../../src/entities/entityExtractor.js');
    return gmOf(table).run(() => routeWorldJournalResults({
      lore: [], factionUpdates: [], locationUpdates: [], stateTransitions: [],
      threats: [{ name: 'The Pale Choir', severity: 'active', summary: 'A cult that harvests names.', salience: 'significant' }],
    }, foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')), { narrationId }));
  }

  it('control: with no X-Card, the capture records the threat and files its plan, stamped with the narration', async () => {
    const n = await narrate();
    await startCapture(n);
    await table.settle();
    expect(threatPages()).toEqual(['The Pale Choir']);
    expect(plansOf(table)).toHaveLength(1);
    expect(plansOf(table)[0]).toMatchObject({ kind: 'threat', status: 'active', narrationId: n, subject: { type: 'threat', name: 'The Pale Choir' } });
  }, 40_000);

  it('the X-Card played while the capture writes its Threats page: no plan is filed for the removed narration', async () => {
    const n = await narrate();
    threatHold = { reached: deferred(), open: deferred() };
    const capture = startCapture(n);
    await threatHold.reached.promise;   // the Threats page has landed; the capture has not gone on

    await playXCard(table);
    expect(stored().xCardedNarrationIds).toEqual([n]);
    expect(threatPages(), 'the X-Card\'s undo took back the page that had landed').toEqual([]);

    threatHold.open.resolve();
    threatHold = null;
    await capture;
    await settleAll();
    expect(plansOf(table).filter(p => p.narrationId === n), 'no plan stamped with the removed narration').toEqual([]);
    expect(plansOf(table).filter(p => p.status === 'active')).toEqual([]);
  }, 40_000);
});
