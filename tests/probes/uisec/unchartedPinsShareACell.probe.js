// tests/probes/uisec/unchartedPinsShareACell.probe.js
//
// UISEC-03 · SITE-SLOTS-WRAP-ONTO-EXISTING-PIN (WRONG-DETAIL)
//
// Scenario: a sector's sites are laid out in six fixed periphery cells
// (sectorGenerator.js SITE_SLOTS). Sector generation fills two to four of
// them; since issue #348 PT07 every Undertake an Expedition toward an unnamed
// destination records one more site in "the next periphery slot"
// (siteDiscovery.recordUnchartedDestination → layoutDiscovery(site,
// discoveries.length, …)), which is `SITE_SLOTS[index % 6]`. The seventh
// discovery of a sector — the third uncharted destination in an Expanse
// sector with a themed trouble (3 + 1 generated sites), the fifth in a
// Terminus one — wraps to slot 0: its record carries the first site's
// gridX / gridY, and its Note pin and passage Drawing are created at exactly
// the first site's coordinates on the sector Scene.
//
// Correct: every discovery of a sector has its own cell; no two site pins of
// one Scene share coordinates.
// Today: discovery #7 sits exactly on discovery #1 (and #8 on #2, …): one pin
// hides the other, and a token parked there reads as "near" the older site
// (sectorSceneHooks.computeTokenPositionRecord takes the first nearest pin).
//
// Production path: the real recordUnchartedDestination, layoutDiscovery and
// addSiteToScene; only the location Actor's creation is stubbed (deps.createLoc).

import { describe, it, expect, beforeEach } from 'vitest';
import { recordUnchartedDestination } from '../../../src/sectors/siteDiscovery.js';
import { layoutDiscovery } from '../../../src/sectors/sectorGenerator.js';

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

describe('UISEC-03: each site of a sector has its own cell on the map', () => {
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
    // Today: { gridX: 14, gridY: 1 } for both — the slot index wraps (index % 6).
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
