/**
 * STARFORGED COMPANION
 * tests/unit/loreRestore.test.js
 *
 * `!journal lore "<title>" confirmed` restores lore a strike took out of
 * canon (decisions.md "A strike reaches every copy of the fact"), keeping the
 * entry's text, category and provenance (issue #321 U40).
 *
 * The restore runs recordLoreDiscovery → upsertPage → page.setFlag. Foundry's
 * setFlag is a document update, which MERGES an object into the stored flag
 * key by key, so a key the write leaves out keeps its stored value. The page
 * double here merges flags the way Foundry does (tests/helpers/documentStubs.js
 * applyUpdate); worldJournal.test.js's page stub replaces the flag wholesale,
 * which hid that the restore never cleared `retracted`.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  recordLoreDiscovery,
  getConfirmedLore,
  getNarratorAssertedLore,
  parseJournalCommand,
  executeJournalCommand,
  JOURNAL_NAMES,
} from '../../src/world/worldJournal.js';
import { propagateRetraction } from '../../src/factContinuity/retractions.js';
import { applyUpdate } from '../helpers/documentStubs.js';

const MODULE_ID = 'starforged-companion';

let journals;
let saved;

function makeFoundryPage(doc) {
  const page = {
    id:    `page-${Math.random().toString(36).slice(2, 8)}`,
    name:  doc.name,
    type:  doc.type ?? 'text',
    text:  JSON.parse(JSON.stringify(doc.text ?? {})),
    flags: JSON.parse(JSON.stringify(doc.flags ?? {})),
  };
  page.update  = async (changes) => applyUpdate(page, changes);
  page.setFlag = async (scope, key, value) => applyUpdate(page, { [`flags.${scope}.${key}`]: value });
  page.getFlag = (scope, key) => page.flags?.[scope]?.[key];
  return page;
}

function makeFoundryJournal(name) {
  const pages = [];
  return {
    id: `journal-${name}`, name, flags: {},
    pages: { get contents() { return pages; }, find: (fn) => pages.find(fn) },
    createEmbeddedDocuments: async (_type, docs) => {
      const created = docs.map(makeFoundryPage);
      pages.push(...created);
      return created;
    },
  };
}

beforeEach(() => {
  journals = new Map();
  saved = { journal: global.game.journal, JE: global.JournalEntry };
  global.game.journal = {
    getName: (n) => journals.get(n) ?? null,
    find:    (fn) => [...journals.values()].find(fn) ?? null,
    get:     (id) => [...journals.values()].find(j => j.id === id) ?? null,
  };
  global.JournalEntry = {
    create: async (data) => { const j = makeFoundryJournal(data.name); journals.set(data.name, j); return j; },
  };
});
afterEach(() => {
  global.game.journal = saved.journal;
  global.JournalEntry = saved.JE;
});

const storedEntry = (title) =>
  journals.get(JOURNAL_NAMES.lore).pages.contents.find(p => p.name === title).flags[MODULE_ID].loreEntry;

/** Narrator lore from session 1, struck by the table in that session. */
async function struckLore(cs) {
  await recordLoreDiscovery("Kael's debt", {
    text: 'Kael owes the Khatri Syndicate 400 credits', category: 'debt', moveId: 'mv-17',
    confirmed: true, narratorAsserted: true, sessionId: 'sess-1', sessionNumber: 2,
  }, cs);
  await propagateRetraction({
    subject: { kind: 'text', text: 'Kael' },
    fact: 'owes the Khatri Syndicate 400 credits',
    sessionId: 'sess-1',
  }, cs);
  expect(getConfirmedLore(cs).map(e => e.title)).not.toContain("Kael's debt");
  expect(storedEntry("Kael's debt").retracted).toBe(true);
}

describe('restoring struck lore with `!journal lore "<title>" confirmed`', () => {
  it('puts the entry back in confirmed canon, with its text', async () => {
    const cs = { currentSessionId: 'sess-1', sessionNumber: 2 };
    await struckLore(cs);

    const result = await executeJournalCommand(parseJournalCommand(`!journal lore "Kael's debt" confirmed`), cs);
    expect(result?.confirmed).toBe(true);

    expect(getConfirmedLore(cs).map(e => e.title)).toContain("Kael's debt");
    const flag = storedEntry("Kael's debt");
    expect(flag.retracted).toBe(false);
    expect(flag.retractedAt).toBeNull();
    expect(flag.text).toBe('Kael owes the Khatri Syndicate 400 credits');
  });

  it('keeps the entry\'s category and provenance, even in a later session', async () => {
    const cs = { currentSessionId: 'sess-1', sessionNumber: 2 };
    await struckLore(cs);

    const later = { currentSessionId: 'sess-3', sessionNumber: 4 };
    await executeJournalCommand(parseJournalCommand(`!journal lore "Kael's debt" confirmed`), later);

    expect(storedEntry("Kael's debt")).toMatchObject({
      category: 'debt', sessionId: 'sess-1', sessionNumber: 2, moveId: 'mv-17',
      narratorAsserted: true, confirmed: true, retracted: false,
    });
  });

  it('takes the command\'s text when it gives one', async () => {
    const cs = { currentSessionId: 'sess-1', sessionNumber: 2 };
    await struckLore(cs);

    await executeJournalCommand(
      parseJournalCommand(`!journal lore "Kael's debt" confirmed — Kael owes the Syndicate 500 credits`), cs);

    expect(getConfirmedLore(cs).find(e => e.title === "Kael's debt")?.text).toBe('Kael owes the Syndicate 500 credits');
  });

  it('a rumour ruling clears the strike but keeps the entry out of canon and out of the review queue', async () => {
    const cs = { currentSessionId: 'sess-1', sessionNumber: 2 };
    await struckLore(cs);

    await executeJournalCommand(parseJournalCommand(`!journal lore "Kael's debt" rumour`), cs);

    expect(storedEntry("Kael's debt")).toMatchObject({
      confirmed: false, retracted: false, narratorAsserted: false,
      text: 'Kael owes the Khatri Syndicate 400 credits',
    });
    expect(getConfirmedLore(cs)).toEqual([]);
    expect(getNarratorAssertedLore(cs)).toEqual([]);
  });
});
