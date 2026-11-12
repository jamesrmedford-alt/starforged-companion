/**
 * STARFORGED COMPANION
 * tests/unit/journalSplitMerge.test.js
 *
 * Issue #347 residual TRACKS-JOURNAL-SPLIT-NOT-MERGED (the maintainer's
 * choice: a GM-confirmed merge at load). A world split before issue #345
 * AA62 / AA63 — a GM renamed a World Journal or Progress Tracks journal, and
 * the next write made a second one beside it — holds two journals carrying
 * the same flag. AB16 reads and writes the default-named one; what the other
 * copy held reached no reader, and nothing offered to bring it back.
 *
 * Now the canonical GM's world load whispers the GMs one card per split
 * journal, listing the entries the other copy holds that the live one lacks;
 * a GM's Merge — claimed once on the card — copies them (with their flags)
 * into the live journal and renames the other copy "<name> (merged)",
 * stamped so no later load offers it again. Nothing is deleted.
 */

/* global expectConsoleError */
import { describe, it, expect, afterEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';

const LORE     = 'World Journal — Lore';
const FACTIONS = 'World Journal — Factions';
const TRACKS   = 'Starforged Progress Tracks';
const MERGE    = '[data-action="sf-journal-merge"]';

const clone = (v) => JSON.parse(JSON.stringify(v));
let seq = 0;

function deepMerge(target, src) {
  for (const [k, v] of Object.entries(src ?? {})) {
    if (v && typeof v === 'object' && !Array.isArray(v)) deepMerge(target[k] ??= {}, v);
    else target[k] = clone(v);
  }
  return target;
}
function makePage({ name, type = 'text', text = null, flags = {} }) {
  return { id: `page-${++seq}`, name, type, text, flags: clone(flags) };
}
/** A JournalEntry as the harness needs one: flags, pages, update and page creation. */
function makeJournal({ id, name, flags = {}, pages = [] }) {
  const list = pages.map(makePage);
  const journal = {
    id, name, flags: clone(flags),
    pages: { get contents() { return list; } },
    getFlag: (mod, key) => journal.flags?.[mod]?.[key],
    setFlag: async (mod, key, val) => { (journal.flags[mod] ??= {})[key] = clone(val); return journal; },
    update: async (data) => {
      if (journal.failUpdate) throw new Error('the server refused the rename');
      if (data.name !== undefined) journal.name = data.name;
      if (data.flags) deepMerge(journal.flags, data.flags);
      return journal;
    },
    createEmbeddedDocuments: async (_type, docs) => { const made = docs.map(makePage); list.push(...made); return made; },
  };
  return journal;
}
const lorePage    = (title, text) => ({ name: title, flags: { [MODULE_ID]: { loreEntry: { title, text, confirmed: true } } } });
const factionPage = (name, entityId) => ({ name, flags: { [MODULE_ID]: { factionEntry: { factionName: name, entityId } } } });
const loreFlag    = { [MODULE_ID]: { worldJournalCategory: 'lore' } };
const track = (id, label) => ({ id, label, type: 'expedition', rank: 'dangerous', ticks: 4, completed: false });

let table, journals;

/** The split world: a renamed Lore journal and the default-named one made after it; the same for tracks; a Factions copy with nothing extra. */
function splitWorld() {
  journals = {
    oldLore:  makeJournal({ id: 'j-old-lore', name: 'My Lore', flags: loreFlag,
      pages: [lorePage('The Torch Room', 'Vex burned the prisoner.'), lorePage('Old Beacon', 'It still pulses.')] }),
    lore:     makeJournal({ id: 'j-lore', name: LORE, flags: loreFlag, pages: [lorePage('Old Beacon', 'It still pulses.')] }),
    oldFact:  makeJournal({ id: 'j-old-fact', name: 'Factions (Copy)', flags: { [MODULE_ID]: { worldJournalCategory: 'factions' } },
      pages: [factionPage('The Iron Accord', 'fac-1')] }),
    factions: makeJournal({ id: 'j-fact', name: FACTIONS, flags: { [MODULE_ID]: { worldJournalCategory: 'factions' } },
      pages: [factionPage('Iron Accord', 'fac-1')] }),
    oldTracks: makeJournal({ id: 'j-old-tracks', name: 'Our Tracks', flags: { [MODULE_ID]: { tracks: [track('t1', 'Find the Beacon'), track('t2', 'Cross the Rift')] } } }),
    tracks:    makeJournal({ id: 'j-tracks', name: TRACKS, flags: { [MODULE_ID]: { tracks: [track('t2', 'Cross the Rift')] } } }),
  };
  return journals;
}

async function openWorld(world = splitWorld()) {
  table = await simulateTable({ users: [USERS.GM, USERS.GM2, USERS.P1], boot: false,
    world: { settings: { chronicleAutoEntry: false, narratorSessionSummary: false } } });
  for (const j of Object.values(world)) table.journal._set(j);
  for (const id of ['gm-1', 'gm-2', 'pl-1']) await table.client(id).boot();
  await table.settle(); await table.drain();
}
afterEach(() => table?.teardown());

const mergeCards = (category) => table.cards(f => f.journalMergeCard === true && (!category || f.category === category));
const pageNames  = (j) => j.pages.contents.map(p => p.name);
const idOf       = (m) => m?._id ?? m?.id;

describe('a split journal at the canonical GM\'s load (issue #347 residual)', () => {
  it('one card per split journal, whispered to the GMs, naming only what the live journal lacks', async () => {
    await openWorld();
    expect(mergeCards().map(m => m.flags[MODULE_ID].category).sort()).toEqual(['lore', 'tracks']);

    const [lore] = mergeCards('lore');
    expect([...lore.whisper].sort()).toEqual(['gm-1', 'gm-2']);
    expect(lore.content).toContain('The Torch Room');
    expect(lore.content, 'the live journal holds it already').not.toContain('Old Beacon');
    const [tracks] = mergeCards('tracks');
    expect(tracks.content).toContain('Find the Beacon');
    expect(tracks.content).not.toContain('Cross the Rift');
    expect(mergeCards('factions'), 'a copy with nothing extra (the same faction, by its id) gets no card').toEqual([]);
  }, 30_000);

  it('a GM\'s Merge copies the entries with their flags, renames the other copy, and deletes nothing', async () => {
    await openWorld();
    const [card] = mergeCards('lore');
    table.client('gm-2').click(idOf(card), MERGE);
    await table.settle(); await table.drain();

    expect(pageNames(journals.lore).sort()).toEqual(['Old Beacon', 'The Torch Room']);
    const copied = journals.lore.pages.contents.find(p => p.name === 'The Torch Room');
    expect(copied.flags[MODULE_ID].loreEntry).toEqual({ title: 'The Torch Room', text: 'Vex burned the prisoner.', confirmed: true });
    expect(journals.oldLore.name).toBe('My Lore (merged)');
    expect(journals.oldLore.flags[MODULE_ID].journalMerged).toMatchObject({ into: 'j-lore', category: 'lore' });
    expect(pageNames(journals.oldLore), 'nothing deleted').toEqual(['The Torch Room', 'Old Beacon']);

    const after = table.world.messages().find(m => idOf(m) === idOf(card));
    expect(after.flags[MODULE_ID].journalMerge).toBe('merged');
    expect(table.client('gm-1').render(idOf(card)).querySelector(MERGE), 'no Merge button once merged').toBeFalsy();
  }, 30_000);

  it('two GMs pressing Merge at once merge once', async () => {
    await openWorld();
    const [card] = mergeCards('tracks');
    table.client('gm-1').click(idOf(card), MERGE);
    table.client('gm-2').click(idOf(card), MERGE);
    await table.settle(); await table.drain();

    expect(journals.tracks.flags[MODULE_ID].tracks.map(t => t.id)).toEqual(['t2', 't1']);
    expect(journals.oldTracks.name).toBe('Our Tracks (merged)');
    expect(journals.oldTracks.flags[MODULE_ID].tracks, 'the copy keeps its tracks').toHaveLength(2);
  }, 30_000);

  it('a player\'s relayed Merge is refused: nothing copied, the card still open', async () => {
    await openWorld();
    const [card] = mergeCards('lore');
    const relay = await table.client('pl-1').run(() => import('../../src/multiplayer/gmRelay.js'));
    await table.client('pl-1').run(() => relay.requestGmAction('journal.merge', { messageId: idOf(card) }));
    await table.settle(); await table.drain();

    expect(pageNames(journals.lore)).toEqual(['Old Beacon']);
    expect(journals.oldLore.name).toBe('My Lore');
    expect(table.world.messages().find(m => idOf(m) === idOf(card)).flags[MODULE_ID].journalMerge).toBeFalsy();
  }, 30_000);

  it('a merge that fails part-way frees the card, and a second press copies only what is missing', async () => {
    expectConsoleError(/merge did not finish/);
    await openWorld();
    journals.oldLore.failUpdate = true;   // the rename is refused, after the pages were copied
    const [card] = mergeCards('lore');
    table.client('gm-1').click(idOf(card), MERGE);
    await table.settle(); await table.drain();
    expect(table.world.messages().find(m => idOf(m) === idOf(card)).flags[MODULE_ID].journalMerge, 'claim released').toBeFalsy();
    expect(table.world.messages().some(m => /The merge did not finish/.test(m.content ?? ''))).toBe(true);

    journals.oldLore.failUpdate = false;
    table.client('gm-1').click(idOf(card), MERGE);
    await table.settle(); await table.drain();
    expect(pageNames(journals.lore).sort(), 'the entry copied once').toEqual(['Old Beacon', 'The Torch Room']);
    expect(journals.oldLore.name).toBe('My Lore (merged)');
  }, 30_000);

  it('a copy a merge stamped is not offered again', async () => {
    const world = splitWorld();
    world.oldLore.name = 'My Lore (merged)';
    world.oldLore.flags[MODULE_ID].journalMerged = { into: 'j-lore', category: 'lore', at: 1 };
    delete world.oldTracks; delete world.tracks;
    await openWorld(world);
    expect(mergeCards()).toEqual([]);
  }, 30_000);

  it('a later check retires the unpressed card and posts a fresh one while the split stands', async () => {
    await openWorld();
    const [first] = mergeCards('lore');
    const mod = await table.client('gm-1').run(() => import('../../src/world/journalSplitMerge.js'));
    await table.client('gm-1').run(() => mod.checkJournalSplits());
    await table.settle(); await table.drain();

    const lore = mergeCards('lore');
    expect(lore).toHaveLength(2);
    expect(lore.find(m => idOf(m) === idOf(first)).flags[MODULE_ID].journalMerge).toBe('superseded');
    expect(lore.filter(m => !m.flags[MODULE_ID].journalMerge)).toHaveLength(1);
  }, 30_000);
});
