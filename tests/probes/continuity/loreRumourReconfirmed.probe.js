/**
 * PROBE — CONTINUITY-04 LORE-RUMOUR-RECONFIRMED (Needs a decision)
 * (src/entities/entityExtractor.js routeWorldJournalResults 1074–1081 →
 *  src/world/worldJournal.js recordLoreDiscovery 116–155: `confirmed:
 *  entry?.confirmed === true`, and only `retracted` is carried over from the
 *  stored entry — line 128)
 *
 * What the user does: the narrator's detection pass auto-confirms a lore entry
 * ("The Covenant blockade"). The GM rules it a rumour — `!journal lore "The
 * Covenant blockade" rumour — …` — which takes it out of canon and out of the
 * review queue (issue #321 U40, docs: "the GM's ruling on an entry: confirmed
 * or rumour"). A later narration mentions it again and the detection pass
 * emits the same title.
 *
 * What happens: routeWorldJournalResults records the title again with
 * `confirmed: true, narratorAsserted: true`; recordLoreDiscovery keeps only a
 * stored `retracted` mark, so the rumour ruling (`confirmed: false,
 * narratorAsserted: false`) is overwritten and the entry is canon again —
 * back in ESTABLISHED LORE on the next narration. A STRUCK entry is protected
 * from exactly this ("keeps a struck entry struck when the detection pass
 * records it again"; decisions.md "A strike reaches every copy": the
 * detection pass's 'lore confirmed' transition cannot re-confirm it); a
 * rumour ruling is not. The panel's Dismiss (clearNarratorAssertion) is
 * overridden the same way.
 *
 * What should happen — two readings, so this is filed for a decision:
 *   A. A GM's ruling stands until a GM changes it: an entry the GM demoted to
 *      a rumour (narratorAsserted false, confirmed false, not retracted) is
 *      re-recorded without re-confirming it, as a struck entry is — the
 *      narrator re-asserting it is the same event a strike guards against,
 *      and "nothing auto-corrects — GM authority" (decisions.md, consistency
 *      check).
 *   B. The narrator's re-assertion re-confirms it (today): "World lore
 *      auto-confirms" (decisions.md 2026-06-22) applies to every detection.
 * The probe asserts A.
 *
 * Controls: a brand-new narrator lore title auto-confirms; a STRUCK entry
 * stays struck when re-recorded.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  parseJournalCommand,
  executeJournalCommand,
  getConfirmedLore,
  retractSessionLore,
  JOURNAL_NAMES,
} from '../../../src/world/worldJournal.js';
import { routeWorldJournalResults } from '../../../src/entities/entityExtractor.js';

const MODULE_ID = 'starforged-companion';

function makeJournal(name) {
  const pages = [];
  const journal = {
    id: `journal-${name}`, name, flags: {},
    pages: { get contents() { return pages; }, find: (fn) => pages.find(fn) },
    createEmbeddedDocuments: async (_type, docs) => { const created = docs.map(makePage); pages.push(...created); return created; },
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

const cs = { currentSessionId: 'session-1', sessionNumber: 3, connectionIds: [], factionIds: [], settlementIds: [], locationIds: [], planetIds: [], shipIds: [], creatureIds: [] };
const TITLE = 'The Covenant blockade';
const entry = () => journals.get(JOURNAL_NAMES.lore)?.pages.contents.find(p => p.name === TITLE)?.flags[MODULE_ID]?.loreEntry;
const detected = () => routeWorldJournalResults({
  lore: [{ title: TITLE, text: 'The Covenant has blockaded Ironway.', category: 'factions', salience: 'defining' }],
}, cs);

describe('CONTINUITY-04 a lore entry the GM ruled a rumour', () => {
  it('control: a new narrator-detected lore entry auto-confirms', async () => {
    await detected();
    expect(entry()).toMatchObject({ confirmed: true, narratorAsserted: true });
    expect(getConfirmedLore(cs).map(e => e.title)).toContain(TITLE);
  });

  it('control: a STRUCK entry stays struck when the detection pass records it again', async () => {
    await detected();
    expect(await retractSessionLore('session-1', (e) => e.title === TITLE)).toBe(1);
    await detected();
    // (recordLoreDiscovery re-records it `confirmed: true` beside `retracted:
    // true`; every reader keys on `retracted`, so it stays out of canon.)
    expect(entry()).toMatchObject({ retracted: true });
    expect(getConfirmedLore(cs).map(e => e.title)).not.toContain(TITLE);
  });

  it('stays a rumour (out of canon) when the detection pass records the same title again — option A', async () => {
    await detected();
    const ruling = parseJournalCommand(`!journal lore "${TITLE}" rumour — Dock gossip, nothing more.`);
    expect(ruling).toMatchObject({ type: 'lore', qualifier: 'rumour' });
    await executeJournalCommand(ruling, cs);
    expect(entry()).toMatchObject({ confirmed: false, narratorAsserted: false, retracted: false });   // control: the ruling landed
    expect(getConfirmedLore(cs).map(e => e.title)).not.toContain(TITLE);

    await detected();
    // Today: confirmed: true, narratorAsserted: true — the GM's ruling is gone and the entry is canon again.
    expect(entry().confirmed).toBe(false);
    expect.soft(getConfirmedLore(cs).map(e => e.title)).not.toContain(TITLE);
  });
});
