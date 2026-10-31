// tests/probes/infra/artAssetLookupByName.probe.test.js
//
// PROBE (infra audit) — ART-ASSET-NAME-LOOKUP.
//
// campaignState.artAssetIds maps assetId → the JournalEntry NAME the asset was
// stored under ("Art: connection <entityId> <assetId>"). loadArtAsset's fast
// path — the one the Entities panel uses (it passes campaignState) — looks the
// entry up by that name and returns null when it is not found, without falling
// back to the flag scan the slow path does. Rename the entry in the "Art Cache"
// folder (the auto names are opaque ids, so a GM tidying up will) and the
// panel shows the NPC with no portrait and a "Generate portrait" button that
// "succeeds" without ever displaying it; Regenerate disappears. The entry still
// carries flags.assetId and the asset flag — a stable id the lookup ignores.
//
// Asserts the asset is still found after a rename. FAILS today.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadArtAsset } from '../../../src/art/storage.js';

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

describe('PROBE ART-ASSET-NAME-LOOKUP — portrait after its journal entry is renamed', () => {
  it('control — the slow path (no campaignState) still finds it by its flags', async () => {
    expect((await loadArtAsset('asset-1'))?._id).toBe('asset-1');
  });

  it('the fast path the Entities panel uses still finds it', async () => {
    const campaignState = { artAssetIds: { 'asset-1': 'Art: connection conn-1 asset-1' } };
    // Actual today: null — the name in artAssetIds no longer matches.
    expect((await loadArtAsset('asset-1', campaignState))?._id).toBe('asset-1');
  });
});
