/**
 * STARFORGED COMPANION
 * tests/unit/planPageDeleteRetiresClock.test.js
 *
 * Issue #364 PLAN-PAGE-DELETE-LEAVES-CLOCK (left open by issue #362 AC10): the
 * Secrets panel's Retire takes a plan's clock out of play with it, but a GM
 * who deletes the plan's page in the journal sidebar left the clock running
 * on the list — every Pay the Price turned it, and when it filled it fired a
 * trigger vignette with no plan behind it. The canonical GM's page hook
 * (secrets.js registerPlanSubjectHooks) now retires the clocks of a plan whose
 * page is gone, as Retire does.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import {
  MODULE_ID, makeJournal, resetSkeletonTable, gmOf, plansOf, onGm, moveResolution, narrateMoveOn,
} from '../helpers/skeletonTable.js';
import { withPayThePriceSeed } from '../../src/moves/resolver.js';

let table;
let restore;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.GM2, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => { restore = await resetSkeletonTable(table); });
afterEach(() => restore?.());

const stored = () => gmOf(table).run(() => game.settings.get(MODULE_ID, 'campaignState'));
const clockOf = (id) => (stored().clocks ?? []).find(c => c._id === id);
const secretsJournal = () => gmOf(table).run(() => game.journal.find(j => j.flags?.[MODULE_ID]?.worldJournalCategory === 'secrets'));
const pageOf = (planId) => secretsJournal().pages.contents.find(p => p.flags?.[MODULE_ID]?.secretEntry?.id === planId);
const vignettesOf = (clockId) => table.cards(f => f.clockVignetteCard === true && f.clockId === clockId);

/** A decided threat plan with its escalation clock, filed as a narration files one. */
async function decidedThreat(subject = 'the escort') {
  table.replies = (call) => {
    const ref = /- id (plan-[\w-]+-enemy):/.exec(call.system ?? '')?.[1];
    return { prose: `${subject} detaches from the dark.`, sidecar: { newTruths: [], stateChanges: [],
      ...(ref ? { plans: [{ id: ref, subject, truth: `What ${subject} really is.`,
        escalation: ['It asks again, closer', 'It seals the corridor'] }] } : {}) } };
  };
  const before = new Set(plansOf(table).map(p => p.id));
  await narrateMoveOn(table, moveResolution({ oracleSeeds: withPayThePriceSeed(null, 'face_danger', 'A new enemy is revealed') }));
  table.replies = () => ({ prose: 'It happens.', sidecar: { newTruths: [], stateChanges: [] } });
  return plansOf(table).find(p => p.kind === 'threat' && !before.has(p.id));
}

/** A GM deletes a page in the journal sidebar: the document goes, and every client's delete hook runs. */
async function deleteInSidebar(page, fromUserId = 'gm-1') {
  await page.delete();
  table.fireDocumentHook(fromUserId, 'deleteJournalEntryPage', page);
  await table.settle();
  await table.drain();
}

async function payThePrice() {
  const { advanceClocksOnPayThePrice } = await gmOf(table).import('../../src/clocks/payThePriceClocks.js');
  return onGm(table, () => advanceClocksOnPayThePrice());
}

describe('issue #364 PLAN-PAGE-DELETE-LEAVES-CLOCK — a plan page deleted in the journal takes its clock out of play', () => {
  it('the deleted plan\'s clock is retired: kept on the list, turned by no price, and it fires no vignette', async () => {
    const plan = await decidedThreat();
    expect(clockOf(plan.clockId)).toMatchObject({ active: true, planId: plan.id });

    await deleteInSidebar(pageOf(plan.id));
    expect(clockOf(plan.clockId), 'kept on the list for the record, as Retire keeps it').toMatchObject({ active: false, planId: plan.id });

    const advanced = await payThePrice();
    expect(advanced.map(c => c._id)).not.toContain(plan.clockId);
    expect(clockOf(plan.clockId).filled).toBe(0);
    expect(vignettesOf(plan.clockId)).toHaveLength(0);
  }, 60_000);

  it('the canonical GM retires it when another GM deletes the page', async () => {
    const plan = await decidedThreat();
    await deleteInSidebar(pageOf(plan.id), 'gm-2');
    expect(clockOf(plan.clockId)).toMatchObject({ active: false });
  }, 60_000);

  it('a plan the store still holds keeps its clock: a copy of its page deleted from another journal', async () => {
    const plan = await decidedThreat();
    const original = pageOf(plan.id);
    const elsewhere = makeJournal({ name: 'GM scratch' });
    const [copy] = await elsewhere.createEmbeddedDocuments('JournalEntryPage', [{ name: original.name, flags: original.flags }]);

    await deleteInSidebar(copy);
    expect(clockOf(plan.clockId), 'the plan stands: its clock runs on').toMatchObject({ active: true });
  }, 60_000);

  it('only the deleted plan\'s clock goes: another plan\'s clock runs on', async () => {
    const escort = await decidedThreat('the escort');
    const warden = await decidedThreat('the warden');
    await deleteInSidebar(pageOf(escort.id));
    expect(clockOf(escort.clockId).active).toBe(false);
    expect(clockOf(warden.clockId).active).toBe(true);
  }, 90_000);

  it('the Secrets journal deleted whole retires every plan\'s clock', async () => {
    const escort = await decidedThreat('the escort');
    const warden = await decidedThreat('the warden');
    const journal = secretsJournal();
    gmOf(table).run(() => game.journal.delete(journal.id));
    table.fireDocumentHook('gm-1', 'deleteJournalEntry', journal);
    await table.settle();
    await table.drain();
    expect(clockOf(escort.clockId).active).toBe(false);
    expect(clockOf(warden.clockId).active).toBe(false);
  }, 90_000);

  it('a page that is no plan\'s changes no clock', async () => {
    const plan = await decidedThreat();
    const [stray] = await secretsJournal().createEmbeddedDocuments('JournalEntryPage', [{ name: 'GM notes' }]);
    await deleteInSidebar(stray);
    expect(clockOf(plan.clockId).active).toBe(true);
  }, 60_000);
});
