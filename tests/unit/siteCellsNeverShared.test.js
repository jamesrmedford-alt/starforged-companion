// tests/unit/siteCellsNeverShared.test.js
//
// Each site of a sector has its own cell on the map (issue #362 AC51,
// SITE-SLOTS-WRAP-ONTO-EXISTING-PIN).
//
// A sector's sites are laid out in six fixed periphery cells
// (sectorGenerator.js SITE_SLOTS). Sector generation fills two to four of
// them; since issue #348 PT07 every Undertake an Expedition toward an unnamed
// destination records one more site in "the next periphery slot"
// (siteDiscovery.recordUnchartedDestination → layoutDiscovery(site,
// discoveries.length, …)), which was `SITE_SLOTS[index % 6]`. The seventh
// discovery of a sector wrapped to slot 0: its record carried the first
// site's gridX / gridY, and its Note pin and passage Drawing were created at
// exactly the first site's coordinates on the sector Scene — one pin hid the
// other, and a token parked there read as "near" the older site.
//
// Now a site recorded in play takes the first cell none of the sector's
// discoveries holds — the six slots, then their ring two columns in, then any
// free periphery cell. The generator's own layout is unchanged.
//
// Production path: the real recordUnchartedDestination, layoutDiscovery and
// addSiteToScene; only the location Actor's creation is stubbed (deps.createLoc).

import { describe, it, expect, beforeEach } from 'vitest';
import { recordUnchartedDestination } from '../../src/sectors/siteDiscovery.js';
import { layoutDiscovery } from '../../src/sectors/sectorGenerator.js';

const MODULE_ID = 'starforged-companion';

const SETTLEMENTS = [
  { id: 'gen-A', name: 'Bleakhold', gridX: 2, gridY: 3 },
  { id: 'gen-B', name: 'Lodestar',  gridX: 4, gridY: 6 },
];

/** An Expanse sector as the generator stores it: `count` generated sites in the first slots. */
function sectorWith(count) {
  const sites = Array.from({ length: count }, (_, i) => ({
    id: `gen-site-${i + 1}`, type: i % 2 ? 'vault' : 'derelict',
    name: i % 2 ? `Precursor Vault — Form ${i + 1}` : `Derelict Starship ${['I', 'II', 'III'][Math.floor(i / 2)]}`,
  }));
  return {
    id: 'sec-1', name: 'Vega Reach', region: 'expanse', regionLabel: 'Expanse', sceneId: 'scene-1',
    mapData: {
      settlements: SETTLEMENTS,
      // The generator's own layout (layoutSites → layoutDiscovery), with each site's Actor.
      discoveries: sites.map((s, i) => ({ ...layoutDiscovery(s, i, SETTLEMENTS), actorId: `actor-${s.id}` })),
    },
  };
}

function makeScene() {
  const scene = {
    id: 'scene-1',
    flags: { [MODULE_ID]: { sectorScene: true, sectorId: 'sec-1' } },
    dimensions: { sceneX: 200, sceneY: 200, sceneWidth: 1792, sceneHeight: 1024 },
    notes: { contents: [] }, drawings: { contents: [] },
    createEmbeddedDocuments: async (type, data) => {
      const docs = data.map((d, i) => ({ id: `${type}-${scene.notes.contents.length + scene.drawings.contents.length + i}`, ...d }));
      (type === 'Note' ? scene.notes.contents : scene.drawings.contents).push(...docs);
      return docs;
    },
  };
  return scene;
}

let state, scene, made;

async function setOutFor(label) {
  const before = state.sectors[0].mapData.discoveries.length;
  const result = await recordUnchartedDestination(label, state, {
    createLoc: async (_data, cs) => { made += 1; cs.locationIds.push(`actor-uncharted-${made}`); },
    getScene: () => scene,
  });
  expect(result?.site?.workingLabel).toBe(true);                       // the record was made
  expect(state.sectors[0].mapData.discoveries).toHaveLength(before + 1);
  return result.site;
}

const cellOf = (d) => `${d.gridX},${d.gridY}`;
const pinAt  = (n) => `${n.x},${n.y}`;

beforeEach(() => {
  made = 0;
  scene = makeScene();
  state = { activeSectorId: 'sec-1', sectors: [sectorWith(4)], locationIds: [] };
});

describe('each site of a sector has its own cell on the map (issue #362 AC51)', () => {
  it('control: the generated sites and the first two uncharted destinations each take a free cell', async () => {
    await setOutFor('the amber shoal');
    await setOutFor('the cinder gate');
    const cells = state.sectors[0].mapData.discoveries.map(cellOf);
    expect(cells).toHaveLength(6);
    expect(new Set(cells).size).toBe(6);
    // …and the two new pins are on the Scene, apart.
    const pins = scene.notes.contents.map(pinAt);
    expect(pins).toHaveLength(2);
    expect(new Set(pins).size).toBe(2);
  });

  it('the seventh discovery — the third uncharted destination of a four-site sector — does not land on the first site', async () => {
    await setOutFor('the amber shoal');
    await setOutFor('the cinder gate');
    const seventh = await setOutFor('the hollow drift');

    const discoveries = state.sectors[0].mapData.discoveries;
    expect(discoveries).toHaveLength(7);
    const first = discoveries[0];
    // It was { gridX: 14, gridY: 1 } for both — the slot index wrapped (index % 6).
    expect(cellOf(seventh)).not.toBe(cellOf(first));
    expect(new Set(discoveries.map(cellOf)).size).toBe(7);
  });

  it('…nor do two uncharted destinations\' pins share coordinates on the Scene once the slots have run out', async () => {
    state = { activeSectorId: 'sec-1', sectors: [sectorWith(2)], locationIds: [] };   // a Terminus sector: 2 generated sites
    for (const label of ['the amber shoal', 'the cinder gate', 'the hollow drift', 'the pale orchard',
      'the quiet meridian', 'the salt lantern', 'the umber stair']) {
      await setOutFor(label);
    }
    // Seven uncharted pins placed in play; the seventh (the sector's ninth site) reuses the third slot,
    // the first uncharted destination's.
    const pins = scene.notes.contents.map(pinAt);
    expect(pins).toHaveLength(7);
    expect(new Set(pins).size).toBe(7);
  });
});

describe('layoutDiscovery — the cell a site takes (issue #362 AC51)', () => {
  it('control: the generator\'s layout (no discoveries passed) is the slot its index names, as before', () => {
    const cells = [0, 1, 2, 3, 4, 5, 6].map(i => cellOf(layoutDiscovery({ id: `s${i}`, type: 'derelict', name: `S${i}` }, i, SETTLEMENTS)));
    expect(cells).toEqual(['14,1', '15,4', '14,7', '16,2', '16,6', '13,8', '14,1']);
  });

  it('a site recorded in play takes the first cell no site holds — a freed slot first, then the ring two columns in', () => {
    const at = (gridX, gridY) => ({ gridX, gridY });
    // The second slot is free (its site was laid out elsewhere): it is taken before any later one.
    expect(cellOf(layoutDiscovery({ id: 'n', type: 'uncharted', name: 'N' }, 5,
      SETTLEMENTS, [at(14, 1), at(14, 7), at(16, 2), at(16, 6), at(13, 8)]))).toBe('15,4');
    // All six slots held: the ring's first cell, clear of the settlement cluster.
    const six = [at(14, 1), at(15, 4), at(14, 7), at(16, 2), at(16, 6), at(13, 8)];
    const next = layoutDiscovery({ id: 'n', type: 'uncharted', name: 'N' }, 6, SETTLEMENTS, six);
    expect(cellOf(next)).toBe('12,1');
    expect(next.gridX).toBeGreaterThan(Math.max(...SETTLEMENTS.map(s => s.gridX)));
    // The passage still leaves from the frontier settlement.
    expect(next.nearestSettlementId).toBe('gen-B');
  });
});
