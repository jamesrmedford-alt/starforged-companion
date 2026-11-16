/**
 * WJ-03 · THREAT-ESCALATED-WORD-LOWERS-SEVERITY
 *
 * Scenario: a threat stands at "immediate". A narration presses it harder and
 * the detection pass reports a threat transition `change: "escalated"` whose
 * `newValue` repeats the change — "escalated" / "escalating" — instead of one
 * of the two severities the prompt asks for (the same slip P2-15 was written
 * for: the detector put what the threat was doing where a severity belongs).
 *
 * Correct: an "escalated" transition never leaves a threat less urgent than
 * it was. A `newValue` that says only that it escalated is no level: the
 * `escalate` rule applies (updateThreatSeverity: "the threat then moves one
 * step more urgent"), so an active threat becomes immediate and an immediate
 * one stays immediate.
 *
 * Today: SEVERITY_WORDS files "escalating" / "escalated" (and "rising",
 * "growing", "elevated") under "active" — right for reading a stored value,
 * wrong here: normalizeThreatSeverity("escalated") is "active", so the
 * `escalate` step is never reached. An immediate threat drops to active (its
 * page and the narrator's ACTIVE THREATS say so), and an active one does not
 * move.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { MODULE_ID, resetSkeletonTable, gmOf } from '../../helpers/skeletonTable.js';

const NAME = 'The Red Fleet';

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
const entry   = (name) => pages().map(p => p.flags?.[MODULE_ID]?.threatEntry).filter(Boolean).find(e => e.name === name);
const onGm    = async (work) => { const out = await gmOf(table).run(work); await table.drain(); return out; };
const seed    = (severity) => onGm(() => wj.recordThreat(NAME, { severity, summary: 'Three ships hold the gate.' }, state()));
const escalate = (newValue, summary = 'It is alongside, grapples out.') =>
  onGm(() => extractor.routeWorldJournalResults({ lore: [], factionUpdates: [], locationUpdates: [], threats: [],
    stateTransitions: [{ entryType: 'threat', name: NAME, change: 'escalated', newValue, summary }] }, state(), { narrationId: 'nar-1' }));

describe('WJ-03 — an "escalated" transition never makes a threat less urgent', () => {
  it('control: a severity for the new value is taken as given', async () => {
    await seed('active');
    await escalate('immediate');
    expect(entry(NAME)).toMatchObject({ severity: 'immediate', summary: 'It is alongside, grapples out.' });
  });

  it('control: a sentence for the new value moves it one step (the escalate rule)', async () => {
    await seed('active');
    await escalate('The fleet has closed to boarding range and is cutting through the hull', null);
    expect(entry(NAME).severity).toBe('immediate');
  });

  it('an immediate threat that "escalated" stays immediate', async () => {
    await seed('immediate');
    await escalate('escalated');
    expect(entry(NAME).severity, 'severity after an "escalated" transition on an immediate threat').toBe('immediate');
  });

  it('an active threat that is "escalating" becomes immediate', async () => {
    await seed('active');
    await escalate('escalating');
    expect(entry(NAME).severity, 'severity after an "escalated" transition on an active threat').toBe('immediate');
  });
});
