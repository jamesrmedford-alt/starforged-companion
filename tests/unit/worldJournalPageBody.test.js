/**
 * STARFORGED COMPANION
 * tests/unit/worldJournalPageBody.test.js
 *
 * Issue #331 X30 (WJ-PAGE-BODY-STALE). A World Journal page's body — what
 * players read in Foundry's journal viewer — is a rendered mirror of its
 * record, re-rendered on every record write (decisions.md, issue #322 V31).
 * Three writers — a threat's severity from the panel, a lore confirm, a
 * strike's retraction — and the panel's Dismiss wrote the page flag only:
 * the journal said "Severity: active" for a resolved threat, "Pending
 * confirmation." for confirmed lore and "Confirmed." for a fact the table
 * struck. A struck entry the narrator re-recorded (`confirmed: true,
 * retracted: true`) read "Confirmed." even when re-rendered.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  recordThreat,
  recordLoreDiscovery,
  updateThreatSeverity,
  promoteLoreToConfirmed,
  retractSessionLore,
  writeEntryPage,
  JOURNAL_NAMES,
} from '../../src/world/worldJournal.js';

const MODULE_ID = 'starforged-companion';

// In-memory journal mock — the shape tests/unit/worldJournal.test.js installs.
function makeJournal(name) {
  const pages = [];
  const journal = {
    id: `journal-${name}`, name, flags: {},
    pages: { get contents() { return pages; }, find: (fn) => pages.find(fn) },
    createEmbeddedDocuments: async (_type, docs) => {
      const created = docs.map(d => makePage(d));
      pages.push(...created);
      return created;
    },
    setFlag: async (mod, key, val) => { (journal.flags[mod] ??= {})[key] = val; },
    getFlag: (mod, key) => journal.flags?.[mod]?.[key],
  };
  return journal;
}
function makePage(doc) {
  const page = {
    id: `page-${doc.name}-${Math.random().toString(36).slice(2, 8)}`,
    name: doc.name, type: doc.type ?? 'text', text: doc.text ?? null,
    flags: JSON.parse(JSON.stringify(doc.flags ?? {})),
    setFlag: async (mod, key, val) => { (page.flags[mod] ??= {})[key] = val; },
    getFlag: (mod, key) => page.flags?.[mod]?.[key],
    update: async (data) => Object.assign(page, data),
    delete: async () => {},
  };
  return page;
}

let journals, orig;
beforeEach(() => {
  journals = new Map();
  orig = { get: game.journal.get, getName: game.journal.getName, find: game.journal.find, create: global.JournalEntry?.create, user: global.game.user };
  game.journal.get     = (id) => [...journals.values()].find(j => j.id === id) ?? null;
  game.journal.getName = (n) => journals.get(n) ?? null;
  game.journal.find    = (fn) => [...journals.values()].find(fn) ?? null;
  global.JournalEntry  = { create: async (data) => { const j = makeJournal(data.name); journals.set(data.name, j); return j; } };
  global.game.user = { ...(global.game.user ?? {}), isGM: true, name: 'Test GM' };
});
afterEach(() => {
  game.journal.get = orig.get; game.journal.getName = orig.getName; game.journal.find = orig.find;
  global.JournalEntry = { create: orig.create };
  global.game.user = orig.user;
});

const cs = { currentSessionId: 'session-1', sessionNumber: 3 };
const pageOf = (journalName, pageName) => journals.get(journalName)?.pages.contents.find(p => p.name === pageName);
const bodyOf = (journalName, pageName) => pageOf(journalName, pageName)?.text?.content ?? '';

describe('X30 — a World Journal page body follows its record on every write', () => {
  it('control: an update through recordThreat re-renders the body', async () => {
    await recordThreat('Drift Raiders', { severity: 'looming', summary: 'massing at the gate' }, cs);
    await recordThreat('Drift Raiders', { severity: 'active',  summary: 'at the gate' }, cs);
    expect(bodyOf(JOURNAL_NAMES.threats, 'Drift Raiders')).toContain('active');
  });

  it('a threat resolved from the panel reads "resolved" in the journal, not its old severity', async () => {
    await recordThreat('Drift Raiders', { severity: 'active', summary: 'at the gate' }, cs);
    const updated = await updateThreatSeverity('Drift Raiders', 'resolved', cs);
    expect(updated.severity).toBe('resolved');                                   // the record (the panel's view)
    const body = bodyOf(JOURNAL_NAMES.threats, 'Drift Raiders');
    // It said "Severity: active" — the body was rendered at the record's creation.
    expect(body).toContain('resolved');
    expect(body).not.toContain('active');
  });

  it('lore the GM confirmed reads "Confirmed." in the journal, not "Pending confirmation."', async () => {
    await recordLoreDiscovery('The Covenant blockade', { text: 'The Covenant blockades Ironway.', narratorAsserted: true, sessionId: 'session-1' }, cs);
    expect(bodyOf(JOURNAL_NAMES.lore, 'The Covenant blockade')).toContain('Pending confirmation.');   // control: rendered at creation
    const promoted = await promoteLoreToConfirmed('The Covenant blockade', cs);
    expect(promoted.confirmed).toBe(true);
    const body = bodyOf(JOURNAL_NAMES.lore, 'The Covenant blockade');
    expect(body).toContain('Confirmed.');
    expect(body).not.toContain('Pending confirmation.');
  });

  it('lore a strike retracted no longer reads "Confirmed." in the journal', async () => {
    await recordLoreDiscovery('Vance is dead', { text: 'Vance died at the docks.', narratorAsserted: true, confirmed: true, sessionId: 'session-1' }, cs);
    expect(bodyOf(JOURNAL_NAMES.lore, 'Vance is dead')).toContain('Confirmed.');   // control
    expect(await retractSessionLore('session-1', (e) => e.title === 'Vance is dead')).toBe(1);
    expect(pageOf(JOURNAL_NAMES.lore, 'Vance is dead').flags[MODULE_ID].loreEntry).toMatchObject({ retracted: true, confirmed: false });
    // The struck fact read as confirmed canon to anyone who opened the Lore journal.
    expect(bodyOf(JOURNAL_NAMES.lore, 'Vance is dead')).not.toContain('Confirmed.');
    expect(bodyOf(JOURNAL_NAMES.lore, 'Vance is dead')).toContain('Retracted by the table.');
  });

  it('a struck entry the narrator re-records (confirmed and retracted) reads as retracted', async () => {
    await recordLoreDiscovery('Vance is dead', { text: 'Vance died at the docks.', narratorAsserted: true, confirmed: true, sessionId: 'session-1' }, cs);
    await retractSessionLore('session-1', (e) => e.title === 'Vance is dead');
    await recordLoreDiscovery('Vance is dead', { text: 'Vance died at the docks.', narratorAsserted: true, confirmed: true, sessionId: 'session-1' }, cs);
    const entry = pageOf(JOURNAL_NAMES.lore, 'Vance is dead').flags[MODULE_ID].loreEntry;
    expect(entry.retracted).toBe(true);
    const body = bodyOf(JOURNAL_NAMES.lore, 'Vance is dead');
    expect(body).toContain('Retracted by the table.');
    expect(body).not.toContain('Confirmed.');
  });

  it("the panel's Dismiss (writeEntryPage) drops 'Pending confirmation.' from the body", async () => {
    await recordLoreDiscovery('The Covenant blockade', { text: 'The Covenant blockades Ironway.', narratorAsserted: true, sessionId: 'session-1' }, cs);
    const page = pageOf(JOURNAL_NAMES.lore, 'The Covenant blockade');
    await writeEntryPage(page, 'loreEntry', { ...page.flags[MODULE_ID].loreEntry, narratorAsserted: false });
    expect(bodyOf(JOURNAL_NAMES.lore, 'The Covenant blockade')).not.toContain('Pending confirmation.');
    expect(bodyOf(JOURNAL_NAMES.lore, 'The Covenant blockade')).toContain('The Covenant blockades Ironway.');
  });

  it('a refused body write leaves the record written, warned not thrown', async () => {
    await recordThreat('Drift Raiders', { severity: 'active', summary: 'at the gate' }, cs);
    const page = pageOf(JOURNAL_NAMES.threats, 'Drift Raiders');
    page.update = async () => { throw new Error('refused (test fault)'); };
    await expect(updateThreatSeverity('Drift Raiders', 'resolved', cs)).resolves.toMatchObject({ severity: 'resolved' });
    expect(page.flags[MODULE_ID].threatEntry.severity).toBe('resolved');
  });
});
