/**
 * STARFORGED COMPANION
 * tests/unit/liveDocuments.test.js
 *
 * Issue #302 slice C, step 1 — embedded Items, journals and actor deletion as
 * live documents on a simulated table (tests/helpers/liveDocuments.js).
 *
 * The harness modelled chat messages, settings and actor updates; a vow, a
 * bond or a Chronicle lives in a document it did not. On an unwrapped table
 * `Item.create` returns an object with no `update`, and no Item or journal
 * hook fires, so a vow the module creates can never be marked and the
 * shared-vow sync never runs. The first block checks the documents behave as
 * Foundry's do; the second that the module's own flows, unreachable on a
 * table before, now run end to end.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { withLiveDocuments, LiveCollection, diffUpdate } from '../helpers/liveDocuments.js';
import { failWrites, traceTable } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const { GM, P1, P2 } = USERS;
const VOW = { name: 'Find Kade', type: 'progress', system: { subtype: 'vow', rank: 'dangerous', current: 0 } };

let table, kira, ash;
const gm = () => table.client('gm-1');
const pat = () => table.client('pl-1');
const quinn = () => table.client('pl-2');

beforeAll(async () => {
  table = withLiveDocuments(await simulateTable({ users: [GM, P1, P2] }));
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1 },
  } } });
  kira = table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  ash  = table.addActor({ id: 'pc-ash',  name: 'Ash',  ownership: { 'pl-2': 3 } });
});

/** Every hook call of `name`, as { client, args }, in the order the clients saw it. */
function record(name) {
  const seen = [];
  table.listen(name, (client, ...args) => { seen.push({ client: client.id, args }); });
  return seen;
}

describe('Items are documents', () => {
  it('a created Item can be updated, flagged and deleted — and createItem reaches every client once', async () => {
    const seen = record('createItem');
    const vow = await pat().run(() => Item.create(VOW, { parent: kira, suppressLog: true }));

    // On the creating client before its promise resolves; on the others later.
    expect(seen.map(s => s.client)).toEqual(['pl-1']);
    await table.settle();
    expect(seen.map(s => s.client).sort()).toEqual(['gm-1', 'pl-1', 'pl-2']);
    for (const s of seen) {
      expect(s.args[0]).toBe(vow);
      expect(s.args[1]).toMatchObject({ suppressLog: true });
      expect(s.args[2]).toBe('pl-1');
    }

    expect(vow.parent).toBe(kira);
    expect(kira.items.get(vow.id)).toBe(vow);
    expect(typeof vow.update).toBe('function');
    expect(typeof vow.setFlag).toBe('function');
    expect(typeof vow.delete).toBe('function');
  });

  it('an update with flat keys reaches updateItem expanded, with its options and the user, on every client', async () => {
    const vow = table.addItem(kira, VOW);
    const seen = record('updateItem');
    await pat().run(() => vow.update({ 'system.current': 8 }, { [MODULE_ID]: { marker: true } }));
    await table.settle();

    expect(vow.system.current).toBe(8);
    expect(seen.map(s => s.client).sort()).toEqual(['gm-1', 'pl-1', 'pl-2']);
    for (const s of seen) {
      expect(s.args[1]).toEqual({ system: { current: 8 } });
      expect(s.args[2]).toEqual({ [MODULE_ID]: { marker: true } });
      expect(s.args[3]).toBe('pl-1');
    }
  });

  it('an update that changes nothing is not sent — no write, no hook', async () => {
    const vow = table.addItem(kira, { ...VOW, system: { ...VOW.system, current: 8 } });
    const seen = record('updateItem');
    const trace = traceTable(table);
    await pat().run(() => vow.update({ 'system.current': 8, name: 'Find Kade' }));
    await table.settle();
    expect(seen).toEqual([]);
    expect(trace.entries.filter(e => /item update/.test(e))).toEqual([]);
  });

  it('only the changed part of an update is sent', async () => {
    const vow = table.addItem(kira, { ...VOW, system: { ...VOW.system, current: 8 } });
    const seen = record('updateItem');
    await pat().run(() => vow.update({ 'system.current': 8, 'system.completed': true }));
    await table.settle();
    expect(seen[0].args[1]).toEqual({ system: { completed: true } });
  });

  it('preUpdateItem runs on the requesting client only, and returning false cancels the update', async () => {
    const vow = table.addItem(kira, VOW);
    const pre = record('preUpdateItem');
    await pat().run(() => vow.update({ 'system.current': 4 }));
    await table.settle();
    expect(pre.map(s => s.client)).toEqual(['pl-1']);

    pat().listen('preUpdateItem', () => false);
    const post = record('updateItem');
    const out = await pat().run(() => vow.update({ 'system.current': 12 }));
    await table.settle();
    expect(out).toBeUndefined();
    expect(vow.system.current).toBe(4);
    expect(post).toEqual([]);
  });

  it('flags are written through update: setFlag, getFlag, unsetFlag', async () => {
    const vow = table.addItem(kira, VOW);
    const seen = record('updateItem');
    await pat().run(() => vow.setFlag(MODULE_ID, 'vowId', 'vid-1'));
    await pat().run(() => vow.setFlag(MODULE_ID, 'reward', { status: 'promised', form: 'supply' }));
    expect(vow.getFlag(MODULE_ID, 'vowId')).toBe('vid-1');
    expect(vow.getFlag(MODULE_ID, 'reward.status')).toBe('promised');
    expect(vow.flags[MODULE_ID]).toEqual({ vowId: 'vid-1', reward: { status: 'promised', form: 'supply' } });

    await pat().run(() => vow.unsetFlag(MODULE_ID, 'vowId'));
    await table.settle();
    expect(vow.getFlag(MODULE_ID, 'vowId')).toBeUndefined();
    expect('vowId' in vow.flags[MODULE_ID]).toBe(false);
    expect(seen.filter(s => s.client === 'gm-1')).toHaveLength(3);
  });

  it('a delete removes the Item and reaches every client; a second delete finds nothing', async () => {
    const vow = table.addItem(kira, VOW);
    const seen = record('deleteItem');
    await pat().run(() => vow.delete());
    await table.settle();
    expect(kira.items.get(vow.id)).toBeUndefined();
    expect(kira.items.size).toBe(0);
    expect(seen.map(s => s.client).sort()).toEqual(['gm-1', 'pl-1', 'pl-2']);
    expect(seen[0].args[2]).toBe('pl-1');

    await pat().run(() => vow.delete());
    await table.settle();
    expect(seen).toHaveLength(3);
  });

  it('needs OWNER on the actor: another player is refused, in Foundry\'s words; a GM is not', async () => {
    const vow = table.addItem(kira, VOW);
    await expect(quinn().run(() => vow.update({ 'system.current': 8 }))).rejects.toThrow(/User Quinn lacks permission to update Item/);
    await expect(quinn().run(() => vow.delete())).rejects.toThrow(/lacks permission to delete Item/);
    await expect(quinn().run(() => Item.create(VOW, { parent: kira }))).rejects.toThrow(/lacks permission to create Item/);
    expect(vow.system.current).toBe(0);
    expect(kira.items.size).toBe(1);

    await gm().run(() => vow.update({ 'system.current': 8 }));
    expect(vow.system.current).toBe(8);
  });

  it('actor.items is a collection: seeded Items are live, find gives undefined, contents is a copy', async () => {
    const quiet = record('createItem');
    const bex = table.addActor({ id: 'pc-bex', name: 'Bex', ownership: { 'pl-1': 3 }, items: [
      { id: 'v1', ...VOW }, { id: 'v2', ...VOW, name: 'Pay the debt' },
    ] });
    expect(quiet).toEqual([]);                                     // seeding is not play
    expect(bex.items).toBeInstanceOf(LiveCollection);
    expect(bex.items.size).toBe(2);
    expect(bex.items.getName('Pay the debt').id).toBe('v2');
    expect(bex.items.find(i => i.name === 'nobody')).toBeUndefined();
    expect(bex.items.filter(i => i.type === 'progress').map(i => i.id)).toEqual(['v1', 'v2']);
    expect([...bex.items].map(i => i.id)).toEqual(['v1', 'v2']);
    expect(bex.items.map(i => i.id)).toEqual(['v1', 'v2']);
    const contents = bex.items.contents;
    contents.push({ id: 'stray' });
    expect(bex.items.size).toBe(2);                                // a pushed stand-in is not a document

    await pat().run(() => bex.items.get('v1').update({ 'system.current': 8 }));
    expect(bex.items.get('v1').system.current).toBe(8);
  });

  it('the embedded-document calls on the actor go the same way', async () => {
    const created = record('createItem');
    const [vow] = await pat().run(() => kira.createEmbeddedDocuments('Item', [VOW]));
    await pat().run(() => kira.updateEmbeddedDocuments('Item', [{ _id: vow.id, 'system.current': 12 }]));
    expect(vow.system.current).toBe(12);
    await pat().run(() => kira.deleteEmbeddedDocuments('Item', [vow.id]));
    await table.settle();
    expect(kira.items.size).toBe(0);
    expect(created.filter(s => s.client === 'gm-1')).toHaveLength(1);
    await expect(pat().run(() => kira.createEmbeddedDocuments('ActiveEffect', [{}]))).rejects.toThrow(/not modelled/);
  });

  it('a refused write applies nothing and is reported; the next one lands', async () => {
    const vow = table.addItem(kira, VOW);
    const seen = record('updateItem');
    const trace = traceTable(table);
    failWrites(table, w => w.kind === 'item.update' && w.id === vow.id);
    await expect(pat().run(() => vow.update({ 'system.current': 8 }))).rejects.toThrow(/refused/i);
    await table.settle();
    expect(vow.system.current).toBe(0);
    expect(seen).toEqual([]);
    expect(trace.entries.some(e => /REFUSED item update "Find Kade"/.test(e))).toBe(true);

    await pat().run(() => vow.update({ 'system.current': 8 }));
    expect(vow.system.current).toBe(8);
    expect(trace.entries.some(e => /^item update "Find Kade" \{current\} by pl-1/.test(e))).toBe(true);
  });

  it('a page that was reloaded writes nothing more', async () => {
    const vow = table.addItem(kira, VOW);
    const oldPage = pat();
    await table.reload('pl-1');
    await expect(oldPage.run(() => vow.update({ 'system.current': 8 }))).rejects.toThrow(/unloaded page/);
    await table.client('pl-1').run(() => vow.update({ 'system.current': 8 }));
    expect(vow.system.current).toBe(8);
  }, 30_000);

  it('outside a live table\'s clients, Item.create is still the tests/setup.js stub', async () => {
    const stub = await Item.create(VOW, { parent: null });
    expect(stub.update).toBeUndefined();
  });
});

describe('diffUpdate', () => {
  it('keeps what differs, drops what does not, and keeps a deletion only of a key that is there', () => {
    const doc = { name: 'A', system: { current: 8, rank: 'dangerous' }, flags: { m: { vowId: 'v' } } };
    expect(diffUpdate(doc, { name: 'A', system: { current: 8 } })).toEqual({});
    expect(diffUpdate(doc, { name: 'B', system: { current: 8, rank: 'epic' } })).toEqual({ name: 'B', system: { rank: 'epic' } });
    expect(diffUpdate(doc, { flags: { m: { '-=vowId': null, '-=gone': null } } })).toEqual({ flags: { m: { '-=vowId': null } } });
    expect(diffUpdate(doc, { flags: { other: { a: 1 } } })).toEqual({ flags: { other: { a: 1 } } });
  });
});

describe('an actor can be deleted', () => {
  it('a GM\'s delete takes it out of game.actors and reaches every client; a stranger\'s is refused', async () => {
    const seen = record('deleteActor');
    await expect(quinn().run(() => kira.delete())).rejects.toThrow(/lacks permission to delete Actor/);
    expect(table.actors.get('pc-kira')).toBe(kira);

    await gm().run(() => kira.delete());
    await table.settle();
    expect(table.actors.get('pc-kira')).toBeNull();
    expect(seen.map(s => s.client).sort()).toEqual(['gm-1', 'pl-1', 'pl-2']);
    expect(seen[0].args[2]).toBe('gm-1');
  });
});

describe('journals are documents', () => {
  it('a GM\'s entry lands in game.journal with its pages, and createJournalEntry reaches every client — the pages fire nothing', async () => {
    const entries = record('createJournalEntry');
    const pages = record('createJournalEntryPage');
    const journal = await gm().run(() => JournalEntry.create({
      name: 'Chronicle — Kira', flags: { [MODULE_ID]: { chronicleActorId: 'pc-kira' } },
      pages: [{ name: 'Entries', text: { content: '<p>Kade is gone.</p>' } }],
    }));
    await table.settle();
    expect(pat().run(() => game.journal.getName('Chronicle — Kira'))).toBe(journal);
    expect(journal.getFlag(MODULE_ID, 'chronicleActorId')).toBe('pc-kira');
    expect(journal.pages.contents.map(p => p.name)).toEqual(['Entries']);
    expect(journal.pages.contents[0].text.content).toBe('<p>Kade is gone.</p>');
    expect(entries.map(s => s.client).sort()).toEqual(['gm-1', 'pl-1', 'pl-2']);
    expect(pages).toEqual([]);
  });

  it('a player cannot create one', async () => {
    await expect(pat().run(() => JournalEntry.create({ name: 'Mine' }))).rejects.toThrow(/lacks permission to create JournalEntry/);
    expect(table.journal.size).toBe(0);
  });

  it('pages are created, edited and deleted as documents, each hook on every client', async () => {
    const journal = table.addJournal({ name: 'World Journal', ownership: { 'pl-1': 3 } });
    const created = record('createJournalEntryPage');
    const updated = record('updateJournalEntryPage');
    const deleted = record('deleteJournalEntryPage');

    const [page] = await pat().run(() => journal.createEmbeddedDocuments('JournalEntryPage', [{ name: 'Threats', text: { content: 'none' } }]));
    await pat().run(() => page.update({ 'text.content': 'the Reavers' }));
    await pat().run(() => page.setFlag(MODULE_ID, 'entryId', 'th-1'));
    await table.settle();
    expect(page.text.content).toBe('the Reavers');
    expect(page.getFlag(MODULE_ID, 'entryId')).toBe('th-1');
    expect(created.filter(s => s.client === 'pl-2')).toHaveLength(1);
    expect(updated.filter(s => s.client === 'gm-1').map(s => s.args[1])).toEqual([
      { text: { content: 'the Reavers' } }, { flags: { [MODULE_ID]: { entryId: 'th-1' } } },
    ]);

    await expect(quinn().run(() => page.update({ 'text.content': 'mine' }))).rejects.toThrow(/lacks permission to update JournalEntryPage/);
    await pat().run(() => page.delete());
    await table.settle();
    expect(journal.pages.size).toBe(0);
    expect(deleted.map(s => s.client).sort()).toEqual(['gm-1', 'pl-1', 'pl-2']);
  });

  it('an entry is renamed and deleted as a document', async () => {
    const journal = table.addJournal({ name: 'Session Log' });
    const updated = record('updateJournalEntry');
    const deleted = record('deleteJournalEntry');
    await gm().run(() => journal.update({ name: 'Session Log — I' }));
    await gm().run(() => journal.delete());
    await table.settle();
    expect(updated.filter(s => s.client === 'pl-1').map(s => s.args[1])).toEqual([{ name: 'Session Log — I' }]);
    expect(table.journal.get(journal.id)).toBeNull();
    expect(deleted).toHaveLength(3);
  });
});

describe('the module\'s own document flows run on a table', () => {
  it('a vow the module creates can be marked — it could not, with no update on the stub', async () => {
    const bridge = await gm().import('../../src/character/actorBridge.js');
    const vow = await gm().run(() => bridge.createCharacterVowItem(kira, { name: 'Find Kade', rank: 'dangerous' }));
    await table.settle();
    expect(kira.items.get(vow.id)).toBe(vow);
    await gm().run(() => bridge.markVowProgress(kira, vow.id, 8));
    await table.settle();
    expect(vow.system.current).toBe(8);
    expect(bridge.readVows(kira).map(v => ({ name: v.name, ticks: v.ticks }))).toEqual([{ name: 'Find Kade', ticks: 8 }]);
  });

  it('a vow made on the sheet is given its vowId and announced once, by the canonical GM', async () => {
    const vow = await pat().run(() => Item.create(VOW, { parent: kira }));
    await table.settle(); await table.drain();
    expect(vow.getFlag(MODULE_ID, 'vowId')).toBe(vow.id);
    expect(table.cards(f => f.playerVowCard)).toHaveLength(1);
    expect(table.cards(f => f.playerVowCard)[0].flags[MODULE_ID]).toMatchObject({ vowId: vow.id, actorId: 'pc-kira' });
  });

  it('the shared vow\'s copies stay in step: a mark on one sheet reaches the other, and stops there', async () => {
    const shared = { ...VOW, flags: { [MODULE_ID]: { sharedVow: true, vowId: 'inciting-1' } } };
    const kiras = table.addItem(kira, shared);
    const ashs  = table.addItem(ash, shared);
    const seen = record('updateItem');
    await pat().run(() => kiras.update({ 'system.current': 8 }));
    await table.settle(); await table.drain();
    expect(ashs.system.current).toBe(8);
    // Two writes in all — Kira's, and the canonical GM's mirror to Ash's copy.
    expect(seen.filter(s => s.client === 'gm-1').map(s => [s.args[0].parent.id, s.args[3]])).toEqual([
      ['pc-kira', 'pl-1'], ['pc-ash', 'gm-1'],
    ]);
  });

  it('a connection\'s bond Item follows its record: progress, then the bond', async () => {
    const bridge = await gm().import('../../src/character/actorBridge.js');
    const conn   = await gm().import('../../src/entities/connection.js');
    table.world.setSetting('campaignState', { ...table.world.campaignState(), connectionIds: ['conn-sable'] });
    table.addActor({ id: 'conn-sable', name: 'Sable', type: 'character', flags: { [MODULE_ID]: { entityType: 'connection', connection: {
      _id: 'rec-sable', name: 'Sable', rank: 'dangerous', role: 'Pilot', relationshipTicks: 0, bonded: false, active: true, history: [],
    } } } });
    const bond = await gm().run(() => bridge.createCharacterBondItem(kira, { name: 'Sable', rank: 'dangerous', connectionId: 'rec-sable' }));
    await table.settle();

    await gm().run(() => conn.markRelationshipProgress('conn-sable', 1));
    await table.settle();
    expect(bond.system.current).toBe(8);

    await gm().run(() => conn.forgeBond('conn-sable'));
    await table.settle();
    expect(bond.system.completed).toBe(true);
  });

  it('deleting an NPC card tears its connection down', async () => {
    table.world.setSetting('campaignState', { ...table.world.campaignState(), connectionIds: ['conn-sable'] });
    const sable = table.addActor({ id: 'conn-sable', name: 'Sable', type: 'character', flags: { [MODULE_ID]: { entityType: 'connection', connection: {
      _id: 'rec-sable', name: 'Sable', rank: 'dangerous', role: 'Pilot', relationshipTicks: 8, bonded: false, active: true, history: [],
    } } } });
    const bond = table.addItem(kira, { name: 'Sable', type: 'progress', system: { subtype: 'bond', rank: 'dangerous', current: 8 },
      flags: { [MODULE_ID]: { connectionId: 'rec-sable' } } });
    await gm().run(() => sable.delete());
    await table.settle(); await table.drain();
    expect(table.world.campaignState().connectionIds).toEqual([]);
    // A marked bond is kept on the sheet, flagged lost — nothing a player earned is deleted.
    expect(kira.items.get(bond.id)?.getFlag(MODULE_ID, 'lost')).toBe(true);
  });
});
