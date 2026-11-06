/**
 * STARFORGED COMPANION
 * tests/unit/artIndexWritesOnChain.test.js
 *
 * ART-INDEX-WRITE-OFF-CHAIN (CAMPSTATE-CHAIN-PARTIAL's art-store writers,
 * found while fixing issue #342).
 *
 * The art index (`campaignState.artAssetIds`) is written by storeArtAsset
 * (registerArtAssetInStore) and deleteEntityArtAssets as a copy of the cached
 * campaignState with the index changed — off the client's campaignState write
 * chain (src/multiplayer/campaignStateChain.js, issue #342 Z17). Sent while a
 * chained write was on its way to the server (a clock advance, an oracle
 * capture), each was built from a cache without that write and, applied
 * after it, put the old value back. Both now run on the chain; and a store
 * of an asset the index already names — a portrait's lock or regeneration
 * state changing — writes no campaignState at all.
 *
 * A world write lands one round trip later here: the cache holds the old
 * value until then (the clockWritesSerialised.test.js model).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { storeArtAsset, deleteEntityArtAssets } from '../../src/art/storage.js';
import { advanceTensionClocksForPayThePrice } from '../../src/clocks/clocks.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const stored = () => game.settings._store.get(KEY);

const TENSION = { _id: 'clk-raid', name: 'The raiders close in', type: 'tension', segments: 6, filled: 2, active: true };
const ASSET = { _id: 'art-vex', entityType: 'connection', entityId: 'conn-vex', b64: 'AAAA' };
const ENTRY = 'Art: connection conn-vex art-vex';

/** World journal entries, with the flags and pages the art store writes. */
let journals;
function makeJournal(data) {
  const pages = [];
  const entry = {
    id: `je-${Math.random().toString(36).slice(2, 10)}`, name: data.name, folder: data.folder ?? null,
    flags: JSON.parse(JSON.stringify(data.flags ?? {})),
    pages: { get contents() { return pages; } },
    createEmbeddedDocuments: async (_type, docs) => {
      const created = docs.map(d => ({
        name: d.name, type: d.type, text: d.text, flags: JSON.parse(JSON.stringify(d.flags ?? {})),
        setFlag: async function (mod, key, val) { (this.flags[mod] ??= {})[key] = val; },
        update: async function (u) { Object.assign(this, u); },
      }));
      pages.push(...created);
      return created;
    },
    delete: async () => { const i = journals.indexOf(entry); if (i >= 0) journals.splice(i, 1); },
  };
  return entry;
}

let orig, setSpy, writes;
beforeEach(() => {
  game.settings._store.clear();
  game.settings._store.set(KEY, { currentSessionId: 's1', clocks: [{ ...TENSION }], artAssetIds: { 'art-other': 'Art: ship ship-1 art-other' } });
  journals = [];
  orig = { journal: global.game.journal, create: global.JournalEntry.create };
  global.game.journal = {
    get contents() { return journals; },
    get: (id) => journals.find(j => j.id === id) ?? null,
    getName: (n) => journals.find(j => j.name === n) ?? null,
    find: (fn) => journals.find(fn) ?? null,
    [Symbol.iterator]: () => journals[Symbol.iterator](),
  };
  global.JournalEntry.create = async (data) => { const j = makeJournal(data); journals.push(j); return j; };
  // A world write lands one round trip later; the cache holds the old value until then.
  writes = [];
  setSpy = vi.spyOn(game.settings, 'set').mockImplementation(async (mod, key, val) => {
    if (`${mod}.${key}` === KEY) writes.push(val);
    await new Promise(r => setTimeout(r, 15));
    game.settings._store.set(`${mod}.${key}`, val);
    return val;
  });
});
afterEach(() => {
  setSpy.mockRestore();
  global.game.journal = orig.journal;
  global.JournalEntry.create = orig.create;
});

describe('ART-INDEX-WRITE-OFF-CHAIN — the art index writes join the campaignState write chain', () => {
  it('a portrait stored while a clock advance is on its way: the index entry and the advance both stand', async () => {
    const copy = { artAssetIds: {} };
    await Promise.all([advanceTensionClocksForPayThePrice(), storeArtAsset({ ...ASSET }, copy)]);
    expect(stored().artAssetIds).toEqual({ 'art-other': 'Art: ship ship-1 art-other', 'art-vex': ENTRY });
    expect(stored().clocks[0].filled).toBe(3);
    expect(copy.artAssetIds['art-vex']).toBe(ENTRY);
  });

  it('a portrait deleted with its entity while a clock advance is on its way: the index drop and the advance both stand', async () => {
    game.settings._store.set(KEY, { ...stored(), artAssetIds: { 'art-other': 'Art: ship ship-1 art-other', 'art-vex': ENTRY } });
    journals.push(makeJournal({ name: ENTRY, flags: { [MODULE_ID]: { entityType: 'artAsset', assetId: 'art-vex' } } }));
    await journals[0].createEmbeddedDocuments('JournalEntryPage', [{ name: 'Asset Data', type: 'text', flags: { [MODULE_ID]: { artAsset: { ...ASSET } } } }]);

    const [, deleted] = await Promise.all([advanceTensionClocksForPayThePrice(), deleteEntityArtAssets('connection', 'conn-vex', { portraitId: 'art-vex' })]);
    expect(deleted).toBe(1);
    expect(stored().artAssetIds).toEqual({ 'art-other': 'Art: ship ship-1 art-other' });
    expect(stored().clocks[0].filled).toBe(3);
  });

  it('a portrait the index already names (its lock or regeneration state changing) writes no campaignState', async () => {
    const copy = { artAssetIds: {} };
    await storeArtAsset({ ...ASSET }, copy);
    expect(writes).toHaveLength(1);
    await storeArtAsset({ ...ASSET, regenerationUsed: true }, copy);
    expect(writes).toHaveLength(1);
    expect(stored().artAssetIds['art-vex']).toBe(ENTRY);
    expect(copy.artAssetIds['art-vex']).toBe(ENTRY);
  });

  it('control: one after the other, both stand', async () => {
    const copy = { artAssetIds: {} };
    await advanceTensionClocksForPayThePrice();
    await storeArtAsset({ ...ASSET }, copy);
    expect(stored().artAssetIds['art-vex']).toBe(ENTRY);
    expect(stored().clocks[0].filled).toBe(3);
  });
});
