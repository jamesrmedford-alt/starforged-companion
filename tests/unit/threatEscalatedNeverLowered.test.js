/**
 * STARFORGED COMPANION
 * tests/unit/threatEscalatedNeverLowered.test.js
 *
 * Issue #362 AC42 THREAT-ESCALATED-WORD-LOWERS-SEVERITY. The detection pass
 * reports a threat transition `change: "escalated"` whose `newValue` repeats
 * the change — "escalated" / "escalating" — instead of one of the two
 * severities the prompt asks for. SEVERITY_WORDS files those words under
 * "active" (right for reading a stored value), so updateThreatSeverity took
 * "active" and never reached its `escalate` step: an immediate threat dropped
 * to active on a beat that pressed it, and an active one did not move.
 *
 * An "escalated" transition now never leaves a threat less urgent: the
 * severity it gives when that is at least as urgent as the threat was, else —
 * a word that only repeats the change, no severity, or a lower one — one step
 * more urgent.
 *
 * From the audit probe tests/probes/wj/escalatedTransitionLowersThreat.probe.js.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { MODULE_ID, resetSkeletonTable, gmOf } from '../helpers/skeletonTable.js';
import { normalizeThreatSeverity } from '../../src/world/worldJournal.js';

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
const transition = (change, newValue, summary = 'It is alongside, grapples out.') =>
  onGm(() => extractor.routeWorldJournalResults({ lore: [], factionUpdates: [], locationUpdates: [], threats: [],
    stateTransitions: [{ entryType: 'threat', name: NAME, change, newValue, summary }] }, state(), { narrationId: 'nar-1' }));
const escalate = (newValue, summary) => transition('escalated', newValue, summary);

describe('issue #362 AC42 — an "escalated" transition never makes a threat less urgent', () => {
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

  it('control: a looming threat escalated to "active" is active', async () => {
    await seed('looming');
    await escalate('active');
    expect(entry(NAME).severity).toBe('active');
  });

  it('control: a stored "escalating" still reads as active, and a "resolved" transition still closes the threat', async () => {
    expect(normalizeThreatSeverity('escalating')).toBe('active');
    expect(normalizeThreatSeverity('rising')).toBe('active');
    await seed('immediate');
    await transition('resolved', null, 'The fleet broke off.');
    expect(entry(NAME).severity).toBe('resolved');
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

  it('a looming threat that is "rising" becomes active; "escalated to immediate" is immediate', async () => {
    await seed('looming');
    await escalate('rising');
    expect(entry(NAME).severity).toBe('active');
    await escalate('escalated to immediate');
    expect(entry(NAME).severity).toBe('immediate');
  });

  it('a less urgent severity given for an escalation does not lower the threat', async () => {
    await seed('immediate');
    await escalate('active');
    expect(entry(NAME).severity, 'an immediate threat "escalated" to active').toBe('immediate');
    await escalate('resolved');
    expect(entry(NAME).severity, 'an "escalated" transition never resolves the threat').toBe('immediate');
  });
});
