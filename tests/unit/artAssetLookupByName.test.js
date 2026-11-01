/**
 * STARFORGED COMPANION
 * tests/unit/artAssetLookupByName.test.js
 *
 * Issue #322 V25 (the audit's artAssetLookupByName probe,
 * ART-ASSET-NAME-LOOKUP): campaignState.artAssetIds maps an asset id to the
 * JournalEntry NAME it was stored under ("Art: connection <entityId>
 * <assetId>"). loadArtAsset's fast path — the one the Entities panel uses —
 * looked the entry up by that name and returned null when it was not found,
 * with no fallback to the flag scan: a GM who renamed the opaque entry in the
 * Art Cache folder left the NPC with no portrait for good. The fast path's
 * entry must still hold the asset now, else the flags are scanned.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadArtAsset } from '../../src/art/storage.js';

const MODULE_ID = 'starforged-companion';
let savedJournal;

beforeEach(() => {
  savedJournal = game.journal;
  const asset = { _id: 'asset-1', entityId: 'conn-1', entityType: 'connection', b64: 'iVBORw0KGgo', locked: false };
  const entry = {
    id: 'je-1',
    name: 'Vance — portrait',                       // renamed by the GM
    flags: { [MODULE_ID]: { entityType: 'artAsset', assetId: 'asset-1' } },
    pages: { contents: [{ flags: { [MODULE_ID]: { artAsset: asset } } }] },
  };
  const entries = [entry];
  game.journal = {
    get: (id) => entries.find(e => e.id === id) ?? null,
    getName: (name) => entries.find(e => e.name === name) ?? undefined,
    contents: entries,
    [Symbol.iterator]: () => entries[Symbol.iterator](),
  };
});

afterEach(() => { game.journal = savedJournal; });

describe('a portrait after its journal entry is renamed (ART-ASSET-NAME-LOOKUP)', () => {
  it('control — the slow path (no campaignState) still finds it by its flags', async () => {
    expect((await loadArtAsset('asset-1'))?._id).toBe('asset-1');
  });

  it('the fast path the Entities panel uses still finds it', async () => {
    const campaignState = { artAssetIds: { 'asset-1': 'Art: connection conn-1 asset-1' } };
    // It was null — the name in artAssetIds no longer matches.
    expect((await loadArtAsset('asset-1', campaignState))?._id).toBe('asset-1');
  });

  it("an entry the index names that holds another asset is not this one's", async () => {
    // A GM's own entry took the old name: the fast path must not return its asset.
    const other = { _id: 'asset-9', entityId: 'conn-9', b64: 'x' };
    game.journal.contents.push({
      id: 'je-9', name: 'Art: connection conn-1 asset-1',
      flags: { [MODULE_ID]: { entityType: 'artAsset', assetId: 'asset-9' } },
      pages: { contents: [{ flags: { [MODULE_ID]: { artAsset: other } } }] },
    });
    const campaignState = { artAssetIds: { 'asset-1': 'Art: connection conn-1 asset-1' } };
    expect((await loadArtAsset('asset-1', campaignState))?._id).toBe('asset-1');
  });

  it('an asset with no entry left is null', async () => {
    expect(await loadArtAsset('asset-gone', { artAssetIds: { 'asset-gone': 'Art: gone' } })).toBeNull();
  });
});
