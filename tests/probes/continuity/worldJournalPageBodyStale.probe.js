/**
 * PROBE — CONTINUITY-03 WJ-PAGE-BODY-STALE
 * (src/world/worldJournal.js updateThreatSeverity 383–413, promoteLoreToConfirmed
 *  420–448, retractSessionLore 461–480: `page.setFlag` only; the page body is
 *  rendered from the record only by upsertPage → renderPageBody, 1036–1097)
 *
 * What the user does: the GM resolves a threat from the World Journal panel's
 * severity dropdown (→ updateThreatSeverity), confirms a pending lore entry
 * there (→ promoteLoreToConfirmed), or strikes a truth with `!truth strike`
 * (→ propagateRetraction → retractSessionLore). A player then opens the
 * Threats or Lore journal in Foundry's journal viewer — "Players read full WJ
 * content via the native Foundry journal viewer" (worldJournalPanel.js header).
 *
 * What happens: each of those writers updates the page's FLAG and leaves the
 * page body as it was rendered at the last upsert. The journal the players
 * read says "Severity: active" for a threat the GM resolved, "Pending
 * confirmation." for lore the GM confirmed, and "Confirmed." for a fact the
 * table struck (the struck fact reads as canon to everyone who opens the
 * journal). The entry data lives in the flag (what the panel and the narrator
 * read), so the two views of one record disagree.
 *
 * What should happen: the page body is a rendered mirror of its record,
 * re-rendered on every record write — decisions.md → "Issue #322 audit" [V31]:
 * "A journal-hosted faction's or creature's page body is a rendered mirror of
 * its record, re-rendered on every record write, AS THE WORLD JOURNAL'S PAGES
 * ARE"; rules/reachability.md §5 (a mirror is written through on every change).
 * Three World Journal writers do not.
 *
 * Control: the record / upsert path (recordThreat on an existing name)
 * re-renders the body (the T3 test pins it).
 *
 * Asserts the CORRECT behaviour; fails today.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  recordThreat,
  recordLoreDiscovery,
  updateThreatSeverity,
  promoteLoreToConfirmed,
  retractSessionLore,
  JOURNAL_NAMES,
} from '../../../src/world/worldJournal.js';

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

describe('CONTINUITY-03 a World Journal page body follows its record on every write', () => {
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
    // Today: "Severity: active" — the body was rendered at the record's creation.
    expect(body).toContain('resolved');
    expect.soft(body).not.toContain('active');
  });

  it('lore the GM confirmed reads "Confirmed." in the journal, not "Pending confirmation."', async () => {
    await recordLoreDiscovery('The Covenant blockade', { text: 'The Covenant blockades Ironway.', narratorAsserted: true, sessionId: 'session-1' }, cs);
    expect(bodyOf(JOURNAL_NAMES.lore, 'The Covenant blockade')).toContain('Pending confirmation.');   // control: rendered at creation
    const promoted = await promoteLoreToConfirmed('The Covenant blockade', cs);
    expect(promoted.confirmed).toBe(true);
    const body = bodyOf(JOURNAL_NAMES.lore, 'The Covenant blockade');
    expect(body).toContain('Confirmed.');
    expect.soft(body).not.toContain('Pending confirmation.');
  });

  it('lore a strike retracted no longer reads "Confirmed." in the journal', async () => {
    await recordLoreDiscovery('Vance is dead', { text: 'Vance died at the docks.', narratorAsserted: true, confirmed: true, sessionId: 'session-1' }, cs);
    expect(bodyOf(JOURNAL_NAMES.lore, 'Vance is dead')).toContain('Confirmed.');   // control
    expect(await retractSessionLore('session-1', (e) => e.title === 'Vance is dead')).toBe(1);
    expect(pageOf(JOURNAL_NAMES.lore, 'Vance is dead').flags[MODULE_ID].loreEntry).toMatchObject({ retracted: true, confirmed: false });
    // Today: the struck fact still reads as confirmed canon to anyone who opens the Lore journal.
    expect(bodyOf(JOURNAL_NAMES.lore, 'Vance is dead')).not.toContain('Confirmed.');
  });
});
