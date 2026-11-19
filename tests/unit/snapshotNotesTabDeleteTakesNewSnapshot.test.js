/**
 * STARFORGED COMPANION
 * tests/unit/snapshotNotesTabDeleteTakesNewSnapshot.test.js
 *
 * Issue #364 SNAPSHOT-NOTES-TAB-DELETE (SNAPSHOT-REWRITTEN-RECORD's rule, the
 * sheet's half of issue #362 AC65). An NPC card's and a ship's notes are
 * their sheet's Notes tab (issue #329 X12), and the narrator's world snapshot
 * (issue #357) states them on the entity's card. A GM who deleted a line on
 * the Notes tab took it off the sheet and out of nothing else: the record
 * still stands, so the manifest's `record_removed` never fired, no event was
 * reported, and the cached snapshot went on stating the deleted line while
 * the card rode under CHANGED SINCE THE SNAPSHOT only missing it.
 *
 * rules/narrator-memory.md 7c: a path that rewrites a record to take content
 * back reports an event of its own. Every client now compares the notes with
 * what an edit it makes writes (preUpdateActor) and stamps the update; the
 * canonical GM reports `entity_detail_removed` when the stamped update lands,
 * whoever made the edit, and the next narration takes a new snapshot.
 *
 * Composition: the real sheet edit (Actor#update on the editing client), the
 * hooks index.js registers at ready on every client, and the real narration
 * request on the canonical GM.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import {
  MODULE_ID, resetSkeletonTable, gmOf, narrationCallsOf, moveResolution, narrateMoveOn,
} from '../helpers/skeletonTable.js';
import { SNAPSHOT_BLOCK_HEADING, CONTEXT_BLOCK_HEADING } from '../../src/narration/narratorPrompt.js';
import { sheetNotesLoseText } from '../../src/entities/registry.js';

const LINE  = 'SENTINEL-NOTE: owes the Iron League a blood debt';
const OTHER = 'Keeps a berth at Bleakhold.';
const NOTES = `<p>${OTHER}</p><p>${LINE}</p>`;

let table;
let restore;

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.GM2, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
afterEach(() => restore?.());

beforeEach(async () => {
  restore = await resetSkeletonTable(table, {}, { sessionNumber: 3 });
  const store  = await gmOf(table).import('../../src/narration/worldSnapshotStore.js');
  const events = await gmOf(table).import('../../src/narration/snapshotEvents.js');
  gmOf(table).run(() => { store._resetWorldSnapshotStoreForTests(); events._resetSnapshotEventsForTests(); });
});

const gm = () => gmOf(table);
const lastCall = () => narrationCallsOf(table).at(-1);
const blockOf = (call, heading) => call.body.system.find(b => b.text.startsWith(heading)) ?? null;
const narrate = (line) => narrateMoveOn(table, moveResolution({ playerNarration: line }));
const snapshotLog = () => gm().run(() => {
  const journal = game.journal.find(j => j.flags?.[MODULE_ID]?.worldJournalCategory === 'secrets');
  const page = (journal?.pages?.contents ?? []).find(p => p.flags?.[MODULE_ID]?.worldSnapshot);
  return page?.flags?.[MODULE_ID]?.worldSnapshot?.log ?? [];
});

async function on(userId, work) {
  const result = await table.client(userId).run(work);
  await table.settle();
  await table.drain();
  return result;
}

/** A sheet's Notes tab edited on `userId`'s client, as the sheet saves it. */
const editNotes = (userId, actorId, html) => on(userId, () => game.actors.get(actorId).update({ 'system.notes': html }));

/** Vuldar Archer's NPC card, the GM's two paragraphs on its Notes tab. Returns the card's id. */
async function vuldarWithNotes() {
  const { createConnection } = await gm().import('../../src/entities/connection.js');
  const id = await on('gm-1', async () => {
    const cs = foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState'));
    await createConnection({ name: 'Vuldar Archer', role: 'Broker', pronouns: 'he/him' }, cs);
    return game.settings.get(MODULE_ID, 'campaignState').connectionIds.at(-1);
  });
  await editNotes('gm-1', id, NOTES);
  return id;
}

/** The Kestrel, a recorded ship, the GM's two paragraphs on its Notes tab. Returns its id. */
async function kestrelWithNotes() {
  const { createShip } = await gm().import('../../src/entities/ship.js');
  const id = await on('gm-1', async () => {
    const cs = foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState'));
    await createShip({ name: 'The Kestrel', type: 'Courier' }, cs);
    return game.settings.get(MODULE_ID, 'campaignState').shipIds.at(-1);
  });
  await editNotes('gm-1', id, NOTES);
  return id;
}

describe('issue #364 SNAPSHOT-NOTES-TAB-DELETE — a line deleted on a Notes tab is not left in the cached world snapshot', () => {
  it('control: the snapshot holds the Notes tab\'s lines', async () => {
    await vuldarWithNotes();
    await narrate('I ask Vuldar Archer what he knows.');
    const snapshot = blockOf(lastCall(), SNAPSHOT_BLOCK_HEADING).text;
    expect(snapshot).toContain(LINE);
    expect(snapshot).toContain(OTHER);
    expect(snapshotLog()).toHaveLength(1);
  }, 60_000);

  it('the GM deletes a line on the NPC\'s Notes tab: the next narration sends no cached block that still states it', async () => {
    const id = await vuldarWithNotes();
    await narrate('I ask Vuldar Archer what he knows.');
    await editNotes('gm-1', id, `<p>${OTHER}</p>`);
    await narrate('I ask Vuldar Archer again.');

    const stating = lastCall().body.system.filter(b => b.text.includes(LINE)).map(b => b.text.split('\n', 1)[0]);
    expect(stating, 'blocks of the request that still state the deleted line').toEqual([]);
    expect(snapshotLog()).toHaveLength(2);
    expect(blockOf(lastCall(), SNAPSHOT_BLOCK_HEADING).text).toContain(OTHER);
  }, 60_000);

  it('a co-GM makes the edit on their own client: the canonical GM still takes the new snapshot', async () => {
    const id = await vuldarWithNotes();
    await narrate('I ask Vuldar Archer what he knows.');
    await editNotes('gm-2', id, `<p>${OTHER}</p>`);
    await narrate('I ask Vuldar Archer again.');
    expect(lastCall().body.system.some(b => b.text.includes(LINE))).toBe(false);
    expect(snapshotLog()).toHaveLength(2);
  }, 60_000);

  it('a line reworded on the Notes tab takes a new snapshot too — the old wording is gone from the sheet', async () => {
    const id = await vuldarWithNotes();
    await narrate('I ask Vuldar Archer what he knows.');
    await editNotes('gm-1', id, `<p>${OTHER}</p><p>Owes the Iron League nothing any more.</p>`);
    await narrate('I ask Vuldar Archer again.');
    expect(lastCall().body.system.some(b => b.text.includes(LINE))).toBe(false);
    expect(snapshotLog()).toHaveLength(2);
  }, 60_000);

  it('a ship\'s Notes tab is the same', async () => {
    const id = await kestrelWithNotes();
    await narrate('I board the Kestrel.');
    expect(blockOf(lastCall(), SNAPSHOT_BLOCK_HEADING).text).toContain(LINE);
    await editNotes('gm-1', id, `<p>${OTHER}</p>`);
    await narrate('I walk her decks.');
    expect(lastCall().body.system.some(b => b.text.includes(LINE))).toBe(false);
    expect(snapshotLog()).toHaveLength(2);
  }, 60_000);

  it('control: a line added to the Notes tab takes no new snapshot — it rides as a change', async () => {
    const id = await vuldarWithNotes();
    await narrate('I ask Vuldar Archer what he knows.');
    await editNotes('gm-1', id, `${NOTES}<p>ADDED-NOTE: limps since the riots.</p>`);
    await narrate('I ask Vuldar Archer again.');
    expect(snapshotLog()).toHaveLength(1);
    expect(blockOf(lastCall(), CONTEXT_BLOCK_HEADING).text).toContain('ADDED-NOTE');
  }, 60_000);

  it('control: an edit to anything else on the sheet (its name) takes no new snapshot', async () => {
    const id = await vuldarWithNotes();
    await narrate('I ask Vuldar Archer what he knows.');
    await on('gm-1', () => game.actors.get(id).update({ img: 'icons/svg/mystery-man.svg' }));
    await narrate('I ask Vuldar Archer again.');
    expect(snapshotLog()).toHaveLength(1);
  }, 60_000);

  it('control: a player character\'s own notes are no entity card — an edit there reports nothing', async () => {
    await vuldarWithNotes();
    await on('pl-1', () => game.actors.get('pc-kira').update({ 'system.notes': '<p>My own notes.</p>' }));
    await narrate('I ask Vuldar Archer what he knows.');
    await on('pl-1', () => game.actors.get('pc-kira').update({ 'system.notes': '' }));
    await narrate('I ask Vuldar Archer again.');
    expect(snapshotLog()).toHaveLength(1);
  }, 60_000);
});

describe('sheetNotesLoseText — what counts as text taken off a Notes tab', () => {
  it('a deleted or reworded paragraph, list item or heading is text lost', () => {
    expect(sheetNotesLoseText('<p>One.</p><p>Two.</p>', '<p>One.</p>')).toBe(true);
    expect(sheetNotesLoseText('<p>One.</p><p>Two.</p>', '<p>One.</p><p>Too.</p>')).toBe(true);
    expect(sheetNotesLoseText('<ul><li>Alpha</li><li>Beta</li></ul>', '<ul><li>Alpha</li></ul>')).toBe(true);
    expect(sheetNotesLoseText('<h4>Seen at the docks</h4><p>One.</p>', '<p>One.</p>')).toBe(true);
    expect(sheetNotesLoseText('<p>One.</p>', '')).toBe(true);
  });

  it('text added, moved or reformatted, and markup alone, lose nothing', () => {
    expect(sheetNotesLoseText('<p>One.</p>', '<p>One.</p><p>Two.</p>')).toBe(false);
    expect(sheetNotesLoseText('<p>One.</p><p>Two.</p>', '<p>Two.</p><p>Zero.</p><p>One.</p>')).toBe(false);
    expect(sheetNotesLoseText('<p>One.</p>', '<p><strong>One.</strong></p>')).toBe(false);
    expect(sheetNotesLoseText('<p>One  two.</p>', '<p>One two.</p>')).toBe(false);
    expect(sheetNotesLoseText('<p><img src="a.png"></p><p>One.</p>', '<p>One.</p>')).toBe(false);
    expect(sheetNotesLoseText('', '<p>One.</p>')).toBe(false);
    expect(sheetNotesLoseText(undefined, undefined)).toBe(false);
  });
});
