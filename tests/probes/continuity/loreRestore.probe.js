/**
 * PROBE — LORE-RESTORE-STAYS-RETRACTED (src/world/worldJournal.js)
 *
 * decisions.md → "A strike reaches every copy of the fact": a strike takes the
 * session's matching World Journal lore out of canon (`retracted: true`,
 * unconfirmed), and `!journal lore "<title>" confirmed` RESTORES it.
 *
 * The restore runs recordLoreDiscovery → upsertPage → page.setFlag(MODULE,
 * "loreEntry", data). Foundry's setFlag is a document update, which MERGES an
 * object value into the stored flag key by key — `data` carries no `retracted`
 * key, so `retracted: true` survives. getConfirmedLore filters it out, the
 * narrator's ESTABLISHED LORE never sees the restored entry, while the page body
 * and the chat card both say "Confirmed". The same write also replaces the
 * entry's text with the command's (empty) text.
 *
 * The page double merges flags the way Foundry does (tests/helpers/
 * documentStubs.js applyUpdate — the repo's own Foundry-update model; the
 * unit-test page stubs replace the flag wholesale, which hides this).
 *
 * Asserts the CORRECT behaviour; fails today.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  recordLoreDiscovery,
  getConfirmedLore,
  parseJournalCommand,
  executeJournalCommand,
} from '../../../src/world/worldJournal.js';
import { propagateRetraction } from '../../../src/factContinuity/retractions.js';
import { applyUpdate } from '../../helpers/documentStubs.js';

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

describe('restoring struck lore with `!journal lore "<title>" confirmed`', () => {
  it('puts the entry back in confirmed canon, with its text', async () => {
    const cs = { currentSessionId: 'sess-1', sessionNumber: 2 };
    await recordLoreDiscovery("Kael's debt", {
      text: 'Kael owes the Khatri Syndicate 400 credits',
      confirmed: true, narratorAsserted: true, sessionId: 'sess-1',
    }, cs);

    // The table strikes the matching truth — the lore goes retracted.
    await propagateRetraction({
      subject: { kind: 'text', text: 'Kael' },
      fact: 'owes the Khatri Syndicate 400 credits',
      sessionId: 'sess-1',
    }, cs);
    expect(getConfirmedLore(cs).map(e => e.title)).not.toContain("Kael's debt");

    // The GM changes their mind and restores it, as decisions.md documents.
    const result = await executeJournalCommand(parseJournalCommand(`!journal lore "Kael's debt" confirmed`), cs);
    expect(result?.confirmed).toBe(true);   // the command reports success…

    const restored = getConfirmedLore(cs).find(e => e.title === "Kael's debt");
    expect.soft(restored, 'restored entry is back in ESTABLISHED LORE').toBeTruthy();
    const flag = journals.get('World Journal — Lore').pages.contents[0].flags['starforged-companion'].loreEntry;
    expect.soft(flag.retracted, 'stored retracted flag').not.toBe(true);
    expect.soft(flag.text, 'entry text kept').toBe('Kael owes the Khatri Syndicate 400 credits');
  });
});
