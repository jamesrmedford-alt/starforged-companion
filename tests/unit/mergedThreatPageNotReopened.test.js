/**
 * STARFORGED COMPANION
 * tests/unit/mergedThreatPageNotReopened.test.js
 *
 * Issue #362 AC21 THREAT-MERGED-PAGE-REOPENED. One threat is on two Threats
 * pages ("The Red Fleet" and "Red Fleet"; or the playtest's "<name>" and
 * "<name>: attention on Savela"). A GM presses Merge duplicates: the plain
 * page keeps everything, the other is closed — resolved, marked
 * `mergedInto`. A later capture names the threat by the closed page's name
 * (the detector drops the article, or tacks the same words on again — how the
 * duplicate was made). findThreatPageVariant returned the page so named before
 * it ranked anything, and nothing read `mergedInto`: the closed page was
 * written and active again, the kept page missed the update, and the table
 * had two Active Threats for one threat.
 *
 * A closed page is now the threat it was merged into (followed to the end of
 * a chain of merges); and a GM's `!journal threat` that deliberately names a
 * closed page re-opens it with the mark cleared — written as null, because
 * Foundry merges a flag key by key (this harness's setFlag replaces it).
 *
 * From the audit probe tests/probes/wj/mergedThreatReopenedByDetection.probe.js.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { MODULE_ID, resetSkeletonTable, gmOf } from '../helpers/skeletonTable.js';

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
const journal = () => gmOf(table).run(() => game.journal.find(j => j.flags?.[MODULE_ID]?.worldJournalCategory === 'threats'));
const pages   = () => journal()?.pages?.contents ?? [];
const entries = () => pages().map(p => p.flags?.[MODULE_ID]?.threatEntry).filter(Boolean);
const entry   = (name) => entries().find(e => e.name === name);
const onGm    = async (work) => { const out = await gmOf(table).run(work); await table.drain(); return out; };
const active  = () => gmOf(table).run(() => wj.getActiveThreats(state())).map(t => t.name).sort();
const capture = (worldJournal, narrationId = null) =>
  onGm(() => extractor.routeWorldJournalResults({ lore: [], factionUpdates: [], locationUpdates: [], threats: [], stateTransitions: [], ...worldJournal },
    state(), narrationId ? { narrationId } : {}));
const gmRecords = (name, severity, summary) => onGm(() => wj.recordThreat(name, { severity, summary }, state()));

/** Two pages for one threat, as a GM's `!journal` (or a world from before P2-15) leaves them — then merged. */
async function mergedPair(kept, other) {
  await gmRecords(kept, 'looming', 'Raiders are massing past the gate.');
  await gmRecords(other, 'active', 'Three ships hold the gate.');
  expect(gmOf(table).run(() => wj.findDuplicateThreats())).toEqual([{ keep: kept, merge: [other] }]);
  expect(await onGm(() => wj.mergeDuplicateThreats(state()))).toEqual({ kept: 1, merged: 1 });
  expect(entry(other)).toMatchObject({ severity: 'resolved', mergedInto: kept });
  expect(active()).toEqual([kept]);
}

describe('issue #362 AC21 — a detection that names a merged-away page updates the threat it was merged into', () => {
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
    expect(entry('Red Fleet'), 'the page the merge closed').toMatchObject({ severity: 'resolved', mergedInto: 'The Red Fleet', summary: 'Three ships hold the gate.' });
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

  it('a chain of merges is followed to the page that holds the threat now', async () => {
    // "… (closing)" merged into "Red Fleet: two ships", which a later merge closed into "Red Fleet".
    await gmRecords('Red Fleet: two ships', 'looming', 'Two ships hold the gate.');
    await gmRecords('Red Fleet: two ships (closing)', 'active', 'They are closing.');
    await onGm(() => wj.mergeDuplicateThreats(state()));
    await gmRecords('Red Fleet', 'active', 'The fleet is named at last.');
    expect(gmOf(table).run(() => wj.findDuplicateThreats())).toEqual([{ keep: 'Red Fleet', merge: ['Red Fleet: two ships'] }]);
    await onGm(() => wj.mergeDuplicateThreats(state()));
    expect(active()).toEqual(['Red Fleet']);

    await capture({ threats: [{ name: 'Red Fleet: two ships (closing)', severity: 'immediate', summary: 'Boarding tubes extend.', salience: 'significant' }] }, 'nar-4');
    expect(active()).toEqual(['Red Fleet']);
    expect(entry('Red Fleet')).toMatchObject({ severity: 'immediate', summary: 'Boarding tubes extend.' });
  });

  it('a GM\'s `!journal threat` naming the closed page re-opens it, and it is no longer marked merged', async () => {
    await mergedPair('The Red Fleet', 'Red Fleet');
    await gmRecords('Red Fleet', 'active', 'A second fleet after all — the GM says so.');
    expect(active()).toEqual(['Red Fleet', 'The Red Fleet']);
    // Written as null, not left out — Foundry merges a flag key by key, so a
    // left-out mark would survive the write and hide the page from the merge.
    expect(entry('Red Fleet')).toHaveProperty('mergedInto', null);
    expect(gmOf(table).run(() => wj.findDuplicateThreats())).toEqual([{ keep: 'The Red Fleet', merge: ['Red Fleet'] }]);
  });

  it('control (the follow\'s guard): a mark that loops stops where it is — the capture still lands on one page', async () => {
    await gmRecords('Red Fleet', 'active', 'One.');
    await gmRecords('The Red Fleet', 'active', 'Two.');
    await onGm(async () => {
      const j = game.journal.find(x => x.flags?.[MODULE_ID]?.worldJournalCategory === 'threats');
      for (const [from, into] of [['Red Fleet', 'The Red Fleet'], ['The Red Fleet', 'Red Fleet']]) {
        const page = j.pages.contents.find(p => p.flags[MODULE_ID].threatEntry.name === from);
        await wj.writeEntryPage(page, 'threatEntry', { ...page.flags[MODULE_ID].threatEntry, mergedInto: into });
      }
    });
    await capture({ threats: [{ name: 'Red Fleet', severity: 'immediate', summary: 'Alongside.', salience: 'significant' }] }, 'nar-5');
    expect(pages()).toHaveLength(2);
    expect(entries().filter(e => e.summary === 'Alongside.')).toHaveLength(1);
  });
});
