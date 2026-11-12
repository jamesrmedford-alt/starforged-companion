/**
 * STARFORGED COMPANION
 * tests/unit/journalMergeDifferingEntry.test.js
 *
 * JOURNAL-MERGE-DIFFERING-ENTRY (TRACKS-JOURNAL-SPLIT-NOT-MERGED's residual).
 * The split-journal merge card (world/journalSplitMerge.js) had three gaps:
 *
 *   1. An entry both copies hold, changed in the other copy — a GM's edit
 *      made in the journal they took for the one in use — was left as the
 *      live journal has it and not listed on the card: a copy holding only
 *      such changes got no card at all, and the change was lost unseen.
 *   2. With no "keep separate", the card came back at every load until
 *      merged.
 *   3. A merged copy kept its category flag, so with the live journal deleted
 *      the lookups fell back to it — the old copy became the record again.
 *
 * Now the card lists the changed entries (Merge keeps the live text; the
 * other version stays in the renamed copy), a Keep separate button retires
 * the copies without touching them, and a retired copy is never the live
 * journal.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';

const LORE   = 'World Journal — Lore';
const TRACKS = 'Starforged Progress Tracks';
const MERGE  = '[data-action="sf-journal-merge"]';
const KEEP   = '[data-action="sf-journal-keep"]';

const clone = (v) => JSON.parse(JSON.stringify(v));
let seq = 0;

function deepMerge(target, src) {
  for (const [k, v] of Object.entries(src ?? {})) {
    if (v && typeof v === 'object' && !Array.isArray(v)) deepMerge(target[k] ??= {}, v);
    else target[k] = clone(v);
  }
  return target;
}
function makePage({ name, text = null, flags = {}, modifiedTime = 0 }) {
  return { id: `page-${++seq}`, name, type: 'text', text: text === null ? null : { content: text }, flags: clone(flags), _stats: { modifiedTime } };
}
function makeJournal({ id, name, flags = {}, pages = [] }) {
  const list = pages.map(makePage);
  const journal = {
    id, name, flags: clone(flags),
    pages: { get contents() { return list; } },
    getFlag: (mod, key) => journal.flags?.[mod]?.[key],
    setFlag: async (mod, key, val) => { (journal.flags[mod] ??= {})[key] = clone(val); return journal; },
    update: async (data) => {
      if (data.name !== undefined) journal.name = data.name;
      if (data.flags) deepMerge(journal.flags, data.flags);
      return journal;
    },
    createEmbeddedDocuments: async (_type, docs) => { const made = docs.map(makePage); list.push(...made); return made; },
  };
  return journal;
}
const loreFlag = { [MODULE_ID]: { worldJournalCategory: 'lore' } };
const lorePage = (title, text, { updatedAt = '2026-10-01T00:00:00.000Z', modifiedTime = 0 } = {}) => ({
  name: title, text: `<p>${text}</p>`, modifiedTime,
  flags: { [MODULE_ID]: { loreEntry: { title, text, confirmed: true, updatedAt } } },
});
const track = (id, label) => ({ id, label, type: 'expedition', rank: 'dangerous', ticks: 4, completed: false });

let table, journals;

/**
 * A Lore journal the GM renamed "My Lore" and kept editing by hand — the
 * Torch Room's page there was rewritten after the split — and the
 * default-named one every write since went to. Nothing is missing from it.
 */
function differingWorld() {
  journals = {
    oldLore: makeJournal({ id: 'j-old-lore', name: 'My Lore', flags: loreFlag, pages: [
      lorePage('The Torch Room', 'Vex burned the prisoner — and the GM added: the prisoner lived.', { modifiedTime: Date.parse('2026-11-05T00:00:00.000Z') }),
      lorePage('Old Beacon', 'It still pulses.'),
    ] }),
    lore: makeJournal({ id: 'j-lore', name: LORE, flags: loreFlag, pages: [
      lorePage('The Torch Room', 'Vex burned the prisoner.'),
      lorePage('Old Beacon', 'It still pulses.'),
    ] }),
  };
  return journals;
}

async function openWorld(world) {
  table = await simulateTable({ users: [USERS.GM, USERS.GM2, USERS.P1], boot: false,
    world: { settings: { chronicleAutoEntry: false, narratorSessionSummary: false } } });
  for (const j of Object.values(world)) table.journal._set(j);
  for (const id of ['gm-1', 'gm-2', 'pl-1']) await table.client(id).boot();
  await table.settle(); await table.drain();
}
afterEach(() => table?.teardown());

const mergeCards = (category) => table.cards(f => f.journalMergeCard === true && (!category || f.category === category));
const idOf       = (m) => m?._id ?? m?.id;
const recheck    = async () => {
  const mod = await table.client('gm-1').run(() => import('../../src/world/journalSplitMerge.js'));
  await table.client('gm-1').run(() => mod.checkJournalSplits());
  await table.settle(); await table.drain();
};

describe('JOURNAL-MERGE-DIFFERING-ENTRY — an entry changed in the other copy is shown, not lost unseen', () => {
  it('a copy holding only a changed entry gets a card naming it', async () => {
    await openWorld(differingWorld());
    const [card] = mergeCards('lore');
    expect(card, 'a card for the changed entry').toBeTruthy();
    expect(card.content).toContain('The Torch Room');
    expect(card.content, 'the same text in both is not listed').not.toContain('Old Beacon');
  }, 30_000);

  it('Merge keeps the live text and says the other version stays in the renamed copy', async () => {
    await openWorld(differingWorld());
    const [card] = mergeCards('lore');
    table.client('gm-1').click(idOf(card), MERGE);
    await table.settle(); await table.drain();

    const live = journals.lore.pages.contents.find(p => p.name === 'The Torch Room');
    expect(live.text.content).toBe('<p>Vex burned the prisoner.</p>');
    expect(journals.oldLore.name).toBe('My Lore (merged)');
    expect(journals.oldLore.pages.contents[0].text.content, 'the other version kept').toContain('the prisoner lived');
    const after = table.world.messages().find(m => idOf(m) === idOf(card));
    expect(after.content).toContain('The Torch Room');
    expect(after.content).toMatch(/stays in the renamed journal/);
  }, 30_000);

  it('control: a copy whose shared entry is only an older version of the live one gets no card', async () => {
    const world = differingWorld();
    world.oldLore.pages.contents[0]._stats.modifiedTime = Date.parse('2026-09-01T00:00:00.000Z');
    world.lore.pages.contents[0].flags[MODULE_ID].loreEntry.updatedAt = '2026-11-08T00:00:00.000Z';
    await openWorld(world);
    expect(mergeCards('lore')).toEqual([]);
  }, 30_000);
});

describe('JOURNAL-MERGE-DIFFERING-ENTRY — Keep separate', () => {
  it('Keep separate leaves the copy as it is and no later load asks again', async () => {
    await openWorld(differingWorld());
    const [card] = mergeCards('lore');
    table.client('gm-2').click(idOf(card), KEEP);
    await table.settle(); await table.drain();

    expect(journals.oldLore.name, 'not renamed').toBe('My Lore');
    expect(journals.oldLore.flags[MODULE_ID].journalMerged).toMatchObject({ keptSeparate: true, category: 'lore' });
    expect(journals.lore.pages.contents).toHaveLength(2);
    expect(table.world.messages().find(m => idOf(m) === idOf(card)).flags[MODULE_ID].journalMerge).toBe('kept');

    await recheck();
    expect(mergeCards('lore').filter(m => !m.flags[MODULE_ID].journalMerge), 'no fresh card').toEqual([]);
  }, 30_000);

  it('control: without Keep separate the card comes back at the next check', async () => {
    await openWorld(differingWorld());
    await recheck();
    expect(mergeCards('lore').filter(m => !m.flags[MODULE_ID].journalMerge)).toHaveLength(1);
  }, 30_000);
});

describe('JOURNAL-MERGE-DIFFERING-ENTRY — a retired copy is never the live journal', () => {
  it('with the live Lore journal deleted, the merged copy is not read as the lore', async () => {
    const world = differingWorld();
    world.oldLore.name = 'My Lore (merged)';
    world.oldLore.flags[MODULE_ID].journalMerged = { into: 'j-lore', category: 'lore', at: 1 };
    delete world.lore;   // the GM deleted the live journal
    await openWorld(world);

    const wj = await table.client('gm-1').run(() => import('../../src/world/worldJournal.js'));
    const lore = await table.client('gm-1').run(() => wj.getConfirmedLore(null));
    expect(lore.map(e => e.title)).toEqual([]);
  }, 30_000);

  it('with the live tracks journal deleted, the merged copy\'s tracks are not the open tracks', async () => {
    const world = {
      oldTracks: makeJournal({ id: 'j-old-tracks', name: 'Our Tracks (merged)', flags: { [MODULE_ID]: {
        tracks: [track('t1', 'Find the Beacon')], journalMerged: { into: 'j-tracks', category: 'tracks', at: 1 },
      } } }),
    };
    await openWorld(world);
    const pt = await table.client('gm-1').run(() => import('../../src/ui/progressTracks.js'));
    const tracks = await table.client('gm-1').run(() => pt.listProgressTracks());
    expect(tracks.map(t => t.label)).not.toContain('Find the Beacon');
    const { live } = await table.client('gm-1').run(() => pt.tracksJournalCopies());
    expect(live).toBeNull();
  }, 30_000);
});
