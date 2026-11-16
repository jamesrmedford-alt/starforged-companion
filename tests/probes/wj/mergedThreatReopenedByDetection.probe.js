/**
 * WJ-01 · THREAT-MERGED-PAGE-REOPENED
 *
 * Scenario: one threat is on two Threats pages ("The Red Fleet" and "Red
 * Fleet"; or the playtest's "<name>" and "<name>: attention on Savela"). The
 * GM presses Merge duplicates: the plain page keeps everything, the other is
 * closed — resolved, marked `mergedInto`. A later narration's capture names
 * the threat by the closed page's name (the detector drops the article, or
 * tacks the same words on again — it is how the duplicate was made).
 *
 * Correct: the name is the kept threat's — a variant of it, and the page it
 * was written on says "Merged into: <kept>". The kept page takes the update;
 * the closed page stays closed; the panel lists one threat.
 *
 * Today: `findThreatPageVariant` returns the page so named before it ranks
 * "a threat still in play before a resolved one", and nothing reads
 * `mergedInto`: the closed page is written and is active again, the kept page
 * is not updated, and the table has two Active Threats for one threat — the
 * state the merge was pressed to end.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { MODULE_ID, resetSkeletonTable, gmOf } from '../../helpers/skeletonTable.js';

const BASE = 'Unknown entity breaching blockade from far side';

let table;
let restore;
let wj;
let extractor;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  restore = await resetSkeletonTable(table, { narrativeSkeletons: false, threatSalienceThreshold: 'notable' }, {});
  wj        = await gmOf(table).import('../../src/world/worldJournal.js');
  extractor = await gmOf(table).import('../../src/entities/entityExtractor.js');
});
afterEach(() => restore?.());

const state   = () => gmOf(table).run(() => game.settings.get(MODULE_ID, 'campaignState'));
const pages   = () => gmOf(table).run(() => game.journal.find(j => j.flags?.[MODULE_ID]?.worldJournalCategory === 'threats'))?.pages?.contents ?? [];
const entries = () => pages().map(p => p.flags?.[MODULE_ID]?.threatEntry).filter(Boolean);
const entry   = (name) => entries().find(e => e.name === name);
const onGm    = async (work) => { const out = await gmOf(table).run(work); await table.drain(); return out; };
const active  = () => gmOf(table).run(() => wj.getActiveThreats(state())).map(t => t.name);
const capture = (worldJournal, narrationId = null) =>
  onGm(() => extractor.routeWorldJournalResults({ lore: [], factionUpdates: [], locationUpdates: [], threats: [], stateTransitions: [], ...worldJournal },
    state(), narrationId ? { narrationId } : {}));

/** Two pages for one threat, as a GM's `!journal` (or a world from before P2-15) leaves them — then merged. */
async function mergedPair(kept, other) {
  await onGm(() => wj.recordThreat(kept, { severity: 'looming', summary: 'Raiders are massing past the gate.' }, state()));
  await onGm(() => wj.recordThreat(other, { severity: 'active', summary: 'Three ships hold the gate.' }, state()));
  expect(gmOf(table).run(() => wj.findDuplicateThreats())).toEqual([{ keep: kept, merge: [other] }]);
  expect(await onGm(() => wj.mergeDuplicateThreats(state()))).toEqual({ kept: 1, merged: 1 });
  expect(entry(other)).toMatchObject({ severity: 'resolved', mergedInto: kept });
  expect(active()).toEqual([kept]);
}

describe('WJ-01 — a detection that names a merged-away page updates the threat it was merged into', () => {
  it('control: after the merge, a detection under the kept name updates the kept page; the closed page stays closed', async () => {
    await mergedPair('The Red Fleet', 'Red Fleet');
    await capture({ threats: [{ name: 'The Red Fleet', severity: 'immediate', summary: 'It has found the Savela.', salience: 'significant' }] }, 'nar-1');
    expect(entry('The Red Fleet')).toMatchObject({ severity: 'immediate', summary: 'It has found the Savela.' });
    expect(entry('Red Fleet').severity).toBe('resolved');
    expect(active()).toEqual(['The Red Fleet']);
  });

  it('the article dropped: "Red Fleet" after the merge is "The Red Fleet" — one active threat, the kept page updated', async () => {
    await mergedPair('The Red Fleet', 'Red Fleet');
    await capture({ threats: [{ name: 'Red Fleet', severity: 'immediate', summary: 'It has found the Savela.', salience: 'significant' }] }, 'nar-1');
    expect(active(), 'Active Threats after the capture').toEqual(['The Red Fleet']);
    expect(entry('Red Fleet').severity, 'the page the merge closed').toBe('resolved');
    expect(entry('The Red Fleet')).toMatchObject({ severity: 'immediate', summary: 'It has found the Savela.' });
  });

  it('the playtest\'s shape: the same words tacked on again land on the kept threat', async () => {
    await mergedPair(BASE, `${BASE}: attention on Savela`);
    await capture({ threats: [{ name: `${BASE}: attention on Savela`, severity: 'active', summary: 'It is reading the registry.', salience: 'significant' }] }, 'nar-2');
    expect(active(), 'Active Threats after the capture').toEqual([BASE]);
    expect(entry(BASE).summary).toBe('It is reading the registry.');
  });

  it('a transition that names the closed page escalates the kept threat', async () => {
    await mergedPair('The Red Fleet', 'Red Fleet');
    await capture({ stateTransitions: [{ entryType: 'threat', name: 'Red Fleet', change: 'escalated', newValue: 'immediate', summary: 'It is alongside.' }] }, 'nar-3');
    expect(active(), 'Active Threats after the transition').toEqual(['The Red Fleet']);
    expect(entry('The Red Fleet')).toMatchObject({ severity: 'immediate', summary: 'It is alongside.' });
  });
});
