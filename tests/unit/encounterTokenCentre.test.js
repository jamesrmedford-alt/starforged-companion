/**
 * STARFORGED COMPANION
 * tests/unit/encounterTokenCentre.test.js
 *
 * Issue #322 V24 (the audit's encounterTokenCentre probe,
 * ENCOUNTER-TOKEN-OFF-CENTRE): `!sfc encounter` placed the foe's token at half
 * the scene's width and height. Foundry pads a scene (a module sector scene:
 * 10% each side, so the scene rectangle starts at sceneX / sceneY), and a
 * token's x / y is its top-left — the foe landed up and to the left of
 * centre, (896, 512) on a padded 1792×1024 sector scene. It is centred on
 * the scene's own rectangle now (scene.dimensions), its middle on the middle.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnEncounter } from '../../src/system/encounterSpawn.js';
import { _clearPackCache, IS_PACKS } from '../../src/system/ironswornPacks.js';

describe('PROBE ENCOUNTER-TOKEN-OFF-CENTRE — foe token at the scene centre', () => {
  const UUID = `Compendium.${IS_PACKS.FOE_ACTORS_SF}.Actor.compendium-foe`;
  let saved, placed;

  beforeEach(() => {
    _clearPackCache();
    game.actors._reset();
    saved = { packs: game.packs, canvas: globalThis.canvas, user: game.user };
    game.user = { id: 'gm-1', isGM: true };
    const canonical = { id: 'compendium-foe', uuid: UUID, name: 'Chiton', pack: IS_PACKS.FOE_ACTORS_SF, system: { dfid: '' } };
    game.packs = new Map([[IS_PACKS.FOE_ACTORS_SF, {
      index: [{ _id: canonical.id, name: canonical.name }],
      getDocument: async () => canonical,
    }]]);
    // Already imported once, so no import stub is needed.
    game.actors._set('world-foe', {
      id: 'world-foe', name: 'Chiton', type: 'foe', _stats: { compendiumSource: UUID },
      getTokenDocument: async (data) => ({ toObject: () => ({ ...data, actorId: 'world-foe', width: 1, height: 1 }) }),
    });
    placed = [];
    globalThis.canvas = {
      scene: {
        width: 1792, height: 1024,
        // What Foundry derives for a module sector scene (padding 0.1, grid 100).
        dimensions: { sceneX: 200, sceneY: 200, sceneWidth: 1792, sceneHeight: 1024, size: 100 },
        createEmbeddedDocuments: async (_type, docs) => { placed.push(...docs); return docs; },
      },
    };
  });

  afterEach(() => {
    game.packs = saved.packs;
    globalThis.canvas = saved.canvas;
    game.user = saved.user;
    game.actors._reset();
  });

  it('places the token inside the centre grid cell of the scene rectangle', async () => {
    const result = await spawnEncounter('Chiton');
    expect(result.placed).toBe(true);
    const { x, y } = placed[0];
    const centreX = 200 + 1792 / 2;   // 1096
    const centreY = 200 + 1024 / 2;   // 712
    // The token's top-left sits half a token before the centre — it was
    // (896, 512): sceneX / sceneY ignored.
    expect(x).toBeGreaterThanOrEqual(centreX - 100);
    expect(x).toBeLessThanOrEqual(centreX);
    expect(y).toBeGreaterThanOrEqual(centreY - 100);
    expect(y).toBeLessThanOrEqual(centreY);
    expect({ x, y }).toEqual({ x: centreX - 50, y: centreY - 50 });   // a 1×1 token's middle on the middle
  });

  it('a 2×2 foe is centred by its own size', async () => {
    game.actors.get('world-foe').getTokenDocument = async (data) => ({ toObject: () => ({ ...data, actorId: 'world-foe', width: 2, height: 2 }) });
    await spawnEncounter('Chiton');
    expect(placed[0]).toMatchObject({ x: 200 + 896 - 100, y: 200 + 512 - 100 });
  });
});
