/**
 * STARFORGED COMPANION
 * tests/unit/threatRedetectedEscalating.test.js
 *
 * Issue #364 THREAT-REDETECTED-ESCALATING (left open by issue #362 AC42). The
 * detection pass is told to report a recorded threat's change as a state
 * transition, but it also lists the threat again under "threats" — and gives
 * as its severity a word that only says it grew ("escalating", "rising").
 * SEVERITY_WORDS files those words under "active" (right for a stored value),
 * so recordThreat took "active": an immediate threat dropped to active on the
 * beat that pressed it. AC42 fixed the transition path only.
 *
 * A recorded threat listed again with such a severity is now read by the
 * transition's rule (escalationSeverity): never less urgent — the level the
 * words come with when it is at least as urgent as the threat was, else one
 * step more urgent. A level named plainly is still taken as given, and a GM's
 * `!journal threat` is unchanged.
 *
 * Driven through the capture's own route (routeWorldJournalResults →
 * recordThreat) on the simulated table's GM.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { MODULE_ID, resetSkeletonTable, gmOf } from '../helpers/skeletonTable.js';

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
const entries = () => pages().map(p => p.flags?.[MODULE_ID]?.threatEntry).filter(Boolean);
const entry   = (name) => entries().find(e => e.name === name);
const onGm    = async (work) => { const out = await gmOf(table).run(work); await table.drain(); return out; };
const seed    = (severity) => onGm(() => wj.recordThreat(NAME, { severity, summary: 'Three ships hold the gate.' }, state()));
/** The capture lists a threat under "threats" — not a state transition. */
const detect  = (threat) => onGm(() => extractor.routeWorldJournalResults({ lore: [], factionUpdates: [], locationUpdates: [], stateTransitions: [],
  threats: [{ name: NAME, summary: 'It is alongside, grapples out.', ...threat }] }, state(), { narrationId: 'nar-1' }));

describe('issue #364 THREAT-REDETECTED-ESCALATING — a recorded threat listed again as "escalating" is never made less urgent', () => {
  it('control: a level named plainly for a threat listed again is taken as given', async () => {
    await seed('looming');
    await detect({ severity: 'immediate' });
    expect(entry(NAME)).toMatchObject({ severity: 'immediate', summary: 'It is alongside, grapples out.' });
    await detect({ severity: 'active' });
    expect(entry(NAME).severity, 'the list path still takes a named level').toBe('active');
  });

  it('control: a threat first recorded as "escalating" is active, as a stored one reads', async () => {
    await detect({ severity: 'escalating' });
    expect(entry(NAME).severity).toBe('active');
  });

  it('a threat first recorded as "escalating to immediate" is immediate — the level the words come with', async () => {
    await detect({ severity: 'escalating to immediate' });
    expect(entry(NAME).severity).toBe('immediate');
  });

  it('an immediate threat listed again as "escalating" stays immediate', async () => {
    await seed('immediate');
    await detect({ severity: 'escalating' });
    expect(entry(NAME).severity, 'severity of an immediate threat the capture lists as "escalating"').toBe('immediate');
    expect(entries(), 'one page').toHaveLength(1);
  });

  it('an immediate threat listed again as "rising" stays immediate, and what it is doing is kept', async () => {
    await seed('immediate');
    await detect({ severity: 'rising' });
    expect(entry(NAME)).toMatchObject({ severity: 'immediate', summary: 'It is alongside, grapples out.' });
  });

  it('an active threat listed again as "escalating" becomes immediate; a looming one, active', async () => {
    await seed('active');
    await detect({ severity: 'escalating' });
    expect(entry(NAME).severity, 'an active threat that is "escalating"').toBe('immediate');

    await onGm(() => wj.recordThreat('The Iron Blockade', { severity: 'looming', summary: 'Pickets at the far gate.' }, state()));
    await detect({ name: 'The Iron Blockade', severity: 'growing' });
    expect(entry('The Iron Blockade').severity, 'a looming threat that is "growing"').toBe('active');
  });

  it('"escalating to active" does not lower an immediate threat; "rising to immediate" raises a looming one', async () => {
    await seed('immediate');
    await detect({ severity: 'escalating to active' });
    expect(entry(NAME).severity).toBe('immediate');

    await onGm(() => wj.recordThreat('The Iron Blockade', { severity: 'looming', summary: 'Pickets at the far gate.' }, state()));
    await detect({ name: 'The Iron Blockade', severity: 'rising to immediate' });
    expect(entry('The Iron Blockade').severity).toBe('immediate');
  });

  it('the word tacked onto the name ("<name>: escalating") is read the same way', async () => {
    await seed('immediate');
    await detect({ name: `${NAME}: escalating`, severity: undefined });
    expect(entry(NAME).severity, 'an immediate threat named "<name>: escalating"').toBe('immediate');
    expect(entries(), 'no second page').toHaveLength(1);
  });

  it('the history records the step, once', async () => {
    await seed('active');
    await detect({ severity: 'escalating' });
    expect(entry(NAME).history.map(h => h.severity)).toEqual(['active', 'immediate']);
  });
});
