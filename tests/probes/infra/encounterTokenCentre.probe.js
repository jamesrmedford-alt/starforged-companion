// tests/probes/infra/encounterTokenCentre.probe.test.js
//
// PROBE (infra audit) — ENCOUNTER-TOKEN-OFF-CENTRE.
//
// spawnEncounter places the GM's foe token at (scene.width / 2,
// scene.height / 2). Token x/y are canvas coordinates, which include the
// scene padding: the scene rectangle starts at scene.dimensions.sceneX/Y.
// sceneBuilder.js already corrects exactly this for the command-vehicle token
// (sceneRectOffset — PLAYTEST-1712 A). On a module sector scene (1792×1024,
// padding 0.1 → sceneX = sceneY = 200) the foe lands two grid squares
// up-and-left of the centre it is documented to use.
//
// Asserts the token lands at the scene-rect centre. FAILS today.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnEncounter } from '../../../src/system/encounterSpawn.js';
import { _clearPackCache, IS_PACKS } from '../../../src/system/ironswornPacks.js';

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
    // Allow the token's top-left to sit up to one grid cell before the centre.
    // Actual today: x = 896, y = 512 (sceneX/sceneY ignored).
    expect(x).toBeGreaterThanOrEqual(centreX - 100);
    expect(x).toBeLessThanOrEqual(centreX);
    expect(y).toBeGreaterThanOrEqual(centreY - 100);
    expect(y).toBeLessThanOrEqual(centreY);
  });
});
