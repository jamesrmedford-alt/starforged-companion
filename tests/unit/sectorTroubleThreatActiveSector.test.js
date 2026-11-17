/**
 * STARFORGED COMPANION
 * tests/unit/sectorTroubleThreatActiveSector.test.js
 *
 * Issue #362 AC43 THREAT-VARIANT-OTHER-SECTOR-TROUBLE. Two sectors rolled the
 * same Sector Trouble (the table has 20 rows). Since issue #342 Z65 each is
 * its own threat, named "<trouble> — <sector>". A narration in the active
 * sector reports the threat under the trouble alone — "Energy storms are
 * rampant" — and findThreatPageVariant took "the shortest name" of the two
 * variants: whichever sector had the shorter name took the severity, the
 * summary and the history line, and the active sector's threat was left as
 * it was. The active sector's page is chosen now; with neither the active
 * sector's, the name is no recorded threat's (a new page, or a transition
 * skipped) — never another sector's threat.
 *
 * From the audit probe tests/probes/wj/sectorTroubleVariantOtherSector.probe.js.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { MODULE_ID, resetSkeletonTable, gmOf } from '../helpers/skeletonTable.js';

const TROUBLE = 'Energy storms are rampant';
const ELSEWHERE = `${TROUBLE} — Devil's Maw`;
const HERE      = `${TROUBLE} — Onyx Threshold`;
const SECTORS = [
  { id: 'sec-1', name: 'Devil\'s Maw', trouble: TROUBLE },
  { id: 'sec-2', name: 'Onyx Threshold', trouble: TROUBLE },
  { id: 'sec-3', name: 'Ashen Reach', trouble: 'Supply chains are disrupted' },
];

let table;
let restore;
let wj;
let extractor;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

const state   = () => gmOf(table).run(() => game.settings.get(MODULE_ID, 'campaignState'));
const pages   = () => gmOf(table).run(() => game.journal.find(j => j.flags?.[MODULE_ID]?.worldJournalCategory === 'threats'))?.pages?.contents ?? [];
const entry   = (name) => pages().map(p => p.flags?.[MODULE_ID]?.threatEntry).filter(Boolean).find(e => e.name === name);
const onGm    = async (work) => { const out = await gmOf(table).run(work); await table.drain(); return out; };
const capture = (worldJournal) =>
  onGm(() => extractor.routeWorldJournalResults({ lore: [], factionUpdates: [], locationUpdates: [], threats: [], stateTransitions: [], ...worldJournal },
    state(), { narrationId: 'nar-1' }));
const untouched = (sector) => ({ severity: 'looming', summary: `Trouble in ${sector}: ${TROUBLE}` });

/** The table with the two sectors' troubles recorded, as sectorGenerator records them (issue #342 Z65). */
async function setUp(activeSectorId) {
  restore = await resetSkeletonTable(table, { narrativeSkeletons: false, threatSalienceThreshold: 'notable' }, {
    activeSectorId, sectors: SECTORS,
  });
  wj        = await gmOf(table).import('../../src/world/worldJournal.js');
  extractor = await gmOf(table).import('../../src/entities/entityExtractor.js');
  for (const [name, sector] of [[ELSEWHERE, 'Devil\'s Maw'], [HERE, 'Onyx Threshold']]) {
    await onGm(() => wj.recordThreat(name, { type: 'environmental', severity: 'looming', summary: `Trouble in ${sector}: ${TROUBLE}` }, state()));
  }
}
afterEach(() => restore?.());

describe('issue #362 AC43 — a sector trouble named without its sector is the active sector\'s, never another sector\'s', () => {
  beforeEach(() => setUp('sec-2'));

  it('control: named in full, the active sector\'s trouble is the one updated', async () => {
    await capture({ threats: [{ name: HERE, severity: 'immediate', summary: 'A storm front closes on the Savela.', salience: 'significant' }] });
    expect(entry(HERE)).toMatchObject({ severity: 'immediate', summary: 'A storm front closes on the Savela.' });
    expect(entry(ELSEWHERE).severity).toBe('looming');
    expect(pages()).toHaveLength(2);
  });

  it('named by the trouble alone, in the active sector: the other sector\'s threat is untouched', async () => {
    await capture({ threats: [{ name: TROUBLE, severity: 'immediate', summary: 'A storm front closes on the Savela.', salience: 'significant' }] });
    expect(entry(ELSEWHERE), 'the threat page of the sector the crew is NOT in').toMatchObject(untouched('Devil\'s Maw'));
  });

  it('named by the trouble alone, in the active sector: the active sector\'s threat takes it, and no page is added', async () => {
    await capture({ threats: [{ name: TROUBLE, severity: 'immediate', summary: 'A storm front closes on the Savela.', salience: 'significant' }] });
    expect(entry(HERE)).toMatchObject({ severity: 'immediate', summary: 'A storm front closes on the Savela.' });
    expect(pages()).toHaveLength(2);
  });

  it('an "escalated" transition named by the trouble alone escalates the active sector\'s threat only', async () => {
    await capture({ stateTransitions: [{ entryType: 'threat', name: TROUBLE, change: 'escalated', newValue: 'active', summary: 'The storms close the lanes.' }] });
    expect(entry(HERE)).toMatchObject({ severity: 'active', summary: 'The storms close the lanes.' });
    expect(entry(ELSEWHERE)).toMatchObject(untouched('Devil\'s Maw'));
  });
});

describe('issue #362 AC43 — neither sector of the trouble is the active one', () => {
  beforeEach(() => setUp('sec-3'));

  it('a threat named by the trouble alone is a threat of its own: neither sector\'s page is written', async () => {
    await capture({ threats: [{ name: TROUBLE, severity: 'active', summary: 'Storms here too.', salience: 'significant' }] });
    expect({ elsewhere: entry(ELSEWHERE), here: entry(HERE) }).toMatchObject({
      elsewhere: untouched('Devil\'s Maw'), here: untouched('Onyx Threshold'),
    });
    expect(entry(TROUBLE)).toMatchObject({ severity: 'active', summary: 'Storms here too.' });
  });

  it('a transition named by the trouble alone is skipped: no recorded threat is that one', async () => {
    await capture({ stateTransitions: [{ entryType: 'threat', name: TROUBLE, change: 'resolved', summary: 'The storms passed.' }] });
    expect(entry(ELSEWHERE).severity).toBe('looming');
    expect(entry(HERE).severity).toBe('looming');
    expect(pages()).toHaveLength(2);
  });
});

describe('issue #362 AC43 — controls: what is not two sectors\' one trouble keeps its old reading', () => {
  beforeEach(() => setUp('sec-3'));

  it('a trouble only one sector rolled, named alone, is still that sector\'s threat', async () => {
    await onGm(() => wj.recordThreat(`Supply chains are disrupted — Ashen Reach`, { severity: 'looming', summary: 'Trouble in Ashen Reach.' }, state()));
    await capture({ threats: [{ name: 'Supply chains are disrupted', severity: 'active', summary: 'The depot is empty.', salience: 'significant' }] });
    expect(entry('Supply chains are disrupted — Ashen Reach')).toMatchObject({ severity: 'active', summary: 'The depot is empty.' });
    expect(entry('Supply chains are disrupted')).toBeUndefined();
  });

  it('two variants that are no sector\'s keep "the shortest name" — no new page', async () => {
    await onGm(() => wj.recordThreat('Raiders: two ships', { severity: 'looming', summary: 'Two ships.' }, state()));
    await onGm(() => wj.recordThreat('Raiders: the Red Fleet', { severity: 'looming', summary: 'The fleet.' }, state()));
    await capture({ threats: [{ name: 'Raiders', severity: 'immediate', summary: 'They attack.', salience: 'significant' }] });
    expect(entry('Raiders: two ships')).toMatchObject({ severity: 'immediate', summary: 'They attack.' });
    expect(entry('Raiders')).toBeUndefined();
  });
});
