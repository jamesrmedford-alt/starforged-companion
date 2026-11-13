/**
 * STARFORGED COMPANION
 * tests/unit/threatOnePageOneSeverity.test.js
 *
 * Issue #354 P2-15 — a threat has one page, and its severity is one of four
 * words.
 *
 * In the alpha 23 playtest the World Journal listed nine Active Threats for
 * two threats. The detector was shown each threat as "<name>: <severity>" and
 * told a transition's name must match the list exactly, so it returned that
 * whole string as the name — "Unknown entity breaching blockade from far
 * side: imminent detection: high" — and `recordThreat`, which matched a page
 * by its exact name, started a new page each time. A transition's `newValue`
 * was stored as the severity unchecked, so a page read "Severity: The second
 * presence has begun moving down the corridor…", and the panel's dropdown
 * showed its first option ("immediate") for every value it did not know.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { MODULE_ID, resetSkeletonTable, gmOf } from '../helpers/skeletonTable.js';
import { buildCombinedDetectionPrompt } from '../../src/entities/entityExtractor.js';
import { normalizeThreatSeverity, splitThreatName } from '../../src/world/worldJournal.js';

const BASE     = 'Unknown entity breaching blockade from far side';
const BLOCKADE = 'Blockade prevents trade with other sectors — Onyx Threshold';

let table;
let restore;
let wj;
let extractor;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  // The skeleton off: these are the Threats journal's own rules (its plans are P2-30's).
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
const capture = (worldJournal, narrationId = null) =>
  onGm(() => extractor.routeWorldJournalResults({ lore: [], factionUpdates: [], locationUpdates: [], threats: [], stateTransitions: [], ...worldJournal },
    state(), narrationId ? { narrationId } : {}));

describe('issue #354 P2-15 — a severity is one of four words (pure)', () => {
  it('the vocabulary, the words that mean it, and nothing else', () => {
    expect(normalizeThreatSeverity('immediate')).toBe('immediate');
    expect(normalizeThreatSeverity('High')).toBe('immediate');
    expect(normalizeThreatSeverity('very high')).toBe('immediate');
    expect(normalizeThreatSeverity('escalating')).toBe('active');
    expect(normalizeThreatSeverity('low')).toBe('looming');
    expect(normalizeThreatSeverity('resolved')).toBe('resolved');
    expect(normalizeThreatSeverity('The second presence has begun moving down the corridor')).toBeNull();
    expect(normalizeThreatSeverity('')).toBeNull();
    expect(normalizeThreatSeverity(undefined)).toBeNull();
  });

  it('a name with its severity tacked on is the name, with that severity', () => {
    expect(splitThreatName(`${BASE}: imminent detection: high`)).toEqual({ name: BASE, severity: 'immediate' });
    expect(splitThreatName('Raiders (immediate)')).toEqual({ name: 'Raiders', severity: 'immediate' });
    expect(splitThreatName('Raiders — active')).toEqual({ name: 'Raiders', severity: 'active' });
    // A name whose own words follow a dash is left whole.
    expect(splitThreatName(BLOCKADE)).toEqual({ name: BLOCKADE, severity: null });
  });
});

describe('issue #354 P2-15 — the detector is shown a threat\'s name and severity apart', () => {
  it('one threat a line, the name in quotes, the severity its own field', async () => {
    await onGm(() => wj.recordThreat(BASE, { severity: 'looming', summary: 'Something is on the far side.' }, state()));
    const prompt = gmOf(table).run(() => buildCombinedDetectionPrompt('The pulse comes again.', 'face_danger', 'miss', state()));
    expect(prompt).toContain(`  - "${BASE}" | severity: looming`);
    expect(prompt).not.toContain(`${BASE}: looming`);
    expect(prompt).toMatch(/"severity": "immediate"\|"active"\|"looming"/);
    expect(prompt).toMatch(/the name only, without its\s+severity/);
    expect(prompt).toMatch(/"newValue": string, "summary": string/);
  });

  it('no threats: the list says so', () => {
    const prompt = gmOf(table).run(() => buildCombinedDetectionPrompt('Quiet.', 'face_danger', 'miss', state()));
    expect(prompt).toMatch(/never part of the name\):\n {2}\(none\)/);
  });
});

describe('issue #354 P2-15 — the capture updates the threat it means; it starts no second page', () => {
  beforeEach(async () => {
    await onGm(() => wj.recordThreat(BASE, { severity: 'looming', summary: 'Something is on the far side.' }, state()));
  });

  it('the playtest\'s names: three detections with suffixes are one page, its severity a severity', async () => {
    await capture({ threats: [
      { name: `${BASE}: imminent detection: high`, severity: 'high', summary: 'It has noticed the Savela.', salience: 'significant' },
    ] }, 'nar-1');
    await capture({ threats: [
      { name: `${BASE}: attention on Savela`, severity: 'The second presence is reading the registry.', salience: 'significant' },
    ] }, 'nar-2');
    await capture({ threats: [
      { name: `the ${BASE.toLowerCase()}`, severity: 'active', summary: 'It holds position.', salience: 'significant' },
    ] }, 'nar-3');

    expect(pages()).toHaveLength(1);
    const threat = entry(BASE);
    expect(threat.severity).toBe('active');
    expect(threat.summary).toBe('It holds position.');
    // What it did before is kept, in order — never as the severity.
    expect(threat.history.map(h => h.summary)).toEqual([
      'Something is on the far side.', 'It has noticed the Savela.', 'The second presence is reading the registry.', 'It holds position.',
    ]);
    expect(threat.history.every(h => ['immediate', 'active', 'looming', 'resolved'].includes(h.severity))).toBe(true);
    // The page a player reads says the severity and what came before.
    expect(pages()[0].text.content).toContain('<strong>Severity:</strong> active');
    expect(pages()[0].text.content).toContain('The second presence is reading the registry.');
  });

  it('a name that runs two threats together is the first the journal holds', async () => {
    await onGm(() => wj.recordThreat(BLOCKADE, { severity: 'active' }, state()));
    await capture({ threats: [{ name: `${BASE}: looming; ${BLOCKADE}: active`, severity: 'immediate', summary: 'Both close in.', salience: 'significant' }] });
    expect(pages()).toHaveLength(2);
    expect(entry(BASE).severity).toBe('immediate');
  });

  it('an "escalated" transition whose new value is a sentence moves it one step, and keeps the sentence as what it is doing', async () => {
    await capture({ stateTransitions: [{ entryType: 'threat', name: `${BASE}: looming`, change: 'escalated',
      newValue: 'The second presence has begun moving down the corridor and is actively reading the Savela\'s registry' }] }, 'nar-4');
    expect(pages()).toHaveLength(1);
    const threat = entry(BASE);
    expect(threat.severity).toBe('active');
    expect(threat.summary).toMatch(/^The second presence has begun moving/);
    expect(threat.narrationId).toBe('nar-4');   // the X-Card's stamp is kept (XCARD-CAPTURE-TRANSITIONS)
  });

  it('an "escalated" transition with a severity and a summary uses both; "resolved" closes it', async () => {
    await capture({ stateTransitions: [{ entryType: 'threat', name: BASE, change: 'escalated', newValue: 'immediate', summary: 'It is alongside.' }] });
    expect(entry(BASE)).toMatchObject({ severity: 'immediate', summary: 'It is alongside.' });
    await capture({ stateTransitions: [{ entryType: 'threat', name: `${BASE}: immediate`, change: 'resolved', summary: 'It let the Savela pass.' }] });
    expect(entry(BASE)).toMatchObject({ severity: 'resolved', summary: 'It let the Savela pass.' });
    expect(gmOf(table).run(() => wj.getActiveThreats(state()))).toEqual([]);
  });

  it('control: a different threat is a new page, filed under its name without the severity', async () => {
    await capture({ threats: [{ name: 'Reactor leak: high', severity: 'high', summary: 'Coolant is venting.', salience: 'significant' }] });
    expect(entries().map(e => e.name).sort()).toEqual(['Reactor leak', BASE].sort());
    expect(entry('Reactor leak').severity).toBe('immediate');
  });

  it('control: a GM\'s `!journal threat` names its page exactly, as it always has', async () => {
    await onGm(() => wj.executeJournalCommand(wj.parseJournalCommand(`!journal threat "${BASE}: the far side" active — a second thing`), state()));
    expect(entries().map(e => e.name)).toContain(`${BASE}: the far side`);
    expect(pages()).toHaveLength(2);
  });

  it('the panel\'s severity change takes a severity only', async () => {
    expect(await onGm(() => wj.updateThreatSeverity(BASE, 'whatever this is', state()))).toBeNull();
    expect(entry(BASE).severity).toBe('looming');
    await onGm(() => wj.updateThreatSeverity(BASE, 'immediate', state()));
    expect(entry(BASE).severity).toBe('immediate');
  });
});

describe('issue #354 P2-15 — a world from before the check reads sanely, and a GM can fold its duplicates', () => {
  /** The playtest's journal: one threat on four pages, one of them holding a sentence as its severity. */
  async function seedDuplicates() {
    await onGm(() => wj.recordThreat(BASE, { severity: 'looming', summary: 'Something is on the far side.' }, state()));
    await onGm(() => wj.recordThreat(`${BASE}: imminent detection: high`, { severity: 'immediate', summary: 'It has noticed the Savela.' }, state()));
    await onGm(() => wj.recordThreat(`${BASE}: attention on Savela`, { severity: 'active', summary: 'It reads the registry.' }, state()));
    await onGm(() => wj.recordThreat(BLOCKADE, { severity: 'active', summary: 'No trade passes.' }, state()));
    // As the old transition wrote it: a sentence stored as the severity.
    const page = pages().find(p => p.flags[MODULE_ID].threatEntry.name === `${BASE}: attention on Savela`);
    await onGm(() => page.setFlag(MODULE_ID, 'threatEntry', { ...page.flags[MODULE_ID].threatEntry,
      severity: 'The second presence has begun moving down the corridor', updatedAt: '2099-01-01T00:00:00.000Z' }));
  }

  it('a stored sentence reads as "active" — never as the dropdown\'s first option', async () => {
    await seedDuplicates();
    const active = gmOf(table).run(() => wj.getActiveThreats(state()));
    expect(active.every(t => ['immediate', 'active', 'looming'].includes(t.severity))).toBe(true);
    expect(active.find(t => t.name === `${BASE}: attention on Savela`).severity).toBe('active');
  });

  it('the duplicates are found, and nothing is merged until a GM asks', async () => {
    await seedDuplicates();
    expect(gmOf(table).run(() => wj.findDuplicateThreats())).toEqual([
      { keep: BASE, merge: [`${BASE}: attention on Savela`, `${BASE}: imminent detection: high`] },
    ]);
    expect(pages()).toHaveLength(4);
  });

  it('merged: the plain name keeps every page\'s history and the latest state; the others are closed, not deleted', async () => {
    await seedDuplicates();
    expect(await onGm(() => wj.mergeDuplicateThreats(state()))).toEqual({ kept: 1, merged: 2 });
    expect(pages()).toHaveLength(4);
    const kept = entry(BASE);
    expect(kept.severity).toBe('active');
    expect(kept.summary).toBe('The second presence has begun moving down the corridor');
    expect(kept.history.map(h => h.summary)).toEqual(expect.arrayContaining([
      'Something is on the far side.', 'It has noticed the Savela.', 'It reads the registry.',
      'The second presence has begun moving down the corridor',
    ]));
    expect(entry(`${BASE}: imminent detection: high`)).toMatchObject({ severity: 'resolved', mergedInto: BASE });
    expect(gmOf(table).run(() => wj.getActiveThreats(state())).map(t => t.name).sort()).toEqual([BLOCKADE, BASE].sort());
    expect(gmOf(table).run(() => wj.findDuplicateThreats())).toEqual([]);
    // The other threat is untouched.
    expect(entry(BLOCKADE)).toMatchObject({ severity: 'active', summary: 'No trade passes.' });
  });

  it('a player cannot merge', async () => {
    await seedDuplicates();
    const fromPat = await table.client('pl-1').import('../../src/world/worldJournal.js');
    expect(await table.client('pl-1').run(() => fromPat.mergeDuplicateThreats({}))).toEqual({ kept: 0, merged: 0 });
    expect(entry(`${BASE}: imminent detection: high`).severity).toBe('immediate');
  });
});
