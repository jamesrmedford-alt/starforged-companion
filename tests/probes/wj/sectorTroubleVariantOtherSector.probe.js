/**
 * WJ-04 · THREAT-VARIANT-OTHER-SECTOR-TROUBLE
 *
 * Scenario: two sectors rolled the same Sector Trouble (the table has 20
 * rows). Since issue #342 Z65 each is its own threat, named "<trouble> —
 * <sector>": "Energy storms are rampant — Devil's Maw" (the first sector) and
 * "Energy storms are rampant — Onyx Threshold" (the active one, where the
 * crew is). A narration in Onyx Threshold has the storms close on the ship
 * and the detection pass reports the threat under its name alone — "Energy
 * storms are rampant" — as the prompt asks ("a short, stable label").
 *
 * Correct: the active sector's storms are the ones the narration is about;
 * the other sector's threat is a different threat and must not be touched
 * (Z65: "resolving it for one resolved both").
 *
 * Today: the name is a variant of both pages (nameMatch.js suffixedName), and
 * `findThreatPageVariant` takes "the shortest name" of several — whichever
 * sector has the shorter name. Devil's Maw's page takes the severity, the
 * summary and the history line; Onyx Threshold's, the threat in play, is left
 * as it was.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { MODULE_ID, resetSkeletonTable, gmOf } from '../../helpers/skeletonTable.js';

const TROUBLE = 'Energy storms are rampant';
const ELSEWHERE = `${TROUBLE} — Devil's Maw`;
const HERE      = `${TROUBLE} — Onyx Threshold`;

let table;
let restore;
let wj;
let extractor;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  restore = await resetSkeletonTable(table, { narrativeSkeletons: false, threatSalienceThreshold: 'notable' }, {
    activeSectorId: 'sec-2',
    sectors: [{ id: 'sec-1', name: 'Devil\'s Maw', trouble: TROUBLE }, { id: 'sec-2', name: 'Onyx Threshold', trouble: TROUBLE }],
  });
  wj        = await gmOf(table).import('../../src/world/worldJournal.js');
  extractor = await gmOf(table).import('../../src/entities/entityExtractor.js');
  // As sectorGenerator records each sector's trouble (issue #342 Z65).
  for (const [name, sector] of [[ELSEWHERE, 'Devil\'s Maw'], [HERE, 'Onyx Threshold']]) {
    await onGm(() => wj.recordThreat(name, { type: 'environmental', severity: 'looming', summary: `Trouble in ${sector}: ${TROUBLE}` }, state()));
  }
});
afterEach(() => restore?.());

const state   = () => gmOf(table).run(() => game.settings.get(MODULE_ID, 'campaignState'));
const pages   = () => gmOf(table).run(() => game.journal.find(j => j.flags?.[MODULE_ID]?.worldJournalCategory === 'threats'))?.pages?.contents ?? [];
const entry   = (name) => pages().map(p => p.flags?.[MODULE_ID]?.threatEntry).filter(Boolean).find(e => e.name === name);
const onGm    = async (work) => { const out = await gmOf(table).run(work); await table.drain(); return out; };
const capture = (worldJournal) =>
  onGm(() => extractor.routeWorldJournalResults({ lore: [], factionUpdates: [], locationUpdates: [], threats: [], stateTransitions: [], ...worldJournal },
    state(), { narrationId: 'nar-1' }));

describe('WJ-04 — a sector trouble named without its sector is not another sector\'s threat', () => {
  it('control: named in full, the active sector\'s trouble is the one updated', async () => {
    await capture({ threats: [{ name: HERE, severity: 'immediate', summary: 'A storm front closes on the Savela.', salience: 'significant' }] });
    expect(entry(HERE)).toMatchObject({ severity: 'immediate', summary: 'A storm front closes on the Savela.' });
    expect(entry(ELSEWHERE).severity).toBe('looming');
    expect(pages()).toHaveLength(2);
  });

  it('named by the trouble alone, in the active sector: the other sector\'s threat is untouched', async () => {
    await capture({ threats: [{ name: TROUBLE, severity: 'immediate', summary: 'A storm front closes on the Savela.', salience: 'significant' }] });
    expect(entry(ELSEWHERE), 'the threat page of the sector the crew is NOT in').toMatchObject({
      severity: 'looming', summary: `Trouble in Devil's Maw: ${TROUBLE}`,
    });
  });
});
