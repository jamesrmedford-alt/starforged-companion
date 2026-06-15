/**
 * STARFORGED COMPANION
 * tests/unit/sectorSceneBuilder.test.js
 *
 * Regression coverage for the v1.3.4 Forge bug:
 *   "Sector Creator failed to populate map with planets, settlements,
 *    and passages."
 *
 * Phase 3 (commit b65175a) migrated Settlement entities from JournalEntry
 * to a location-typed Actor. createSectorScene was unchanged and still
 * read `journal.id` (now an Actor.id) into NoteDocument#entryId. Foundry
 * v13 validates entryId against game.journal and rejects the whole
 * createEmbeddedDocuments("Note", …) batch when it cannot resolve.
 * That throw also blocked the createEmbeddedDocuments("Drawing", …) call
 * below — hence the map missing settlements, planets, AND passages.
 *
 * The fix in sceneBuilder.js drops `entryId` from every note and writes
 * `flags["starforged-companion"].actorId` instead. The click handler in
 * sectorSceneHooks.js opens the Actor sheet on click.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createSectorScene } from '../../src/sectors/sceneBuilder.js';

const MODULE_ID = 'starforged-companion';

function makeSector() {
  // Two settlements, one with a planet + stellar object, plus a passage
  // between them and an edge passage.
  return {
    id:   'sec-1',
    name: 'Test Sector',
    settlements: [
      { id: 'gen-A', name: 'Bleakhold', locationType: 'orbital',
        planet:  { type: 'Vital World', name: 'Verda' },
        stellar: 'Asteroid Belt' },
      { id: 'gen-B', name: 'Drift',     locationType: 'deep_space',
        planet: null, stellar: null },
    ],
    mapData: {
      settlements: [
        { id: 'gen-A', name: 'Bleakhold', locationType: 'orbital',   gridX: 3, gridY: 2 },
        { id: 'gen-B', name: 'Drift',     locationType: 'deep_space', gridX: 7, gridY: 5 },
      ],
      passages: [
        { fromId: 'gen-A', toId: 'gen-B', toEdge: false },
        { fromId: 'gen-B', toId: null,    toEdge: true  },
      ],
    },
  };
}

function makeEntityActors() {
  return {
    'gen-A': { id: 'actor-A' },
    'gen-B': { id: 'actor-B' },
  };
}

let createdNotes;
let createdDrawings;
let mockScene;

// Foundry insets the background ("scene rectangle") by (sceneX, sceneY) within
// the larger padded canvas. With sceneWidth 1792 / sceneHeight 1024, gridSize
// 100, padding 0.1 the inset is (200, 200) — the value real scene.dimensions
// returns. createSectorScene must offset every placeable by it (PLAYTEST-1712 A).
const SCENE_X = 200;
const SCENE_Y = 200;
const SCENE_W = 1792;
const SCENE_H = 1024;

beforeEach(() => {
  createdNotes    = null;
  createdDrawings = null;

  mockScene = {
    id: 'scene-1',
    // Authoritative scene-rect inset, as Foundry computes it post-create.
    dimensions: { sceneX: SCENE_X, sceneY: SCENE_Y, sceneWidth: SCENE_W, sceneHeight: SCENE_H },
    update: vi.fn(async () => mockScene),
    createEmbeddedDocuments: vi.fn(async (type, data) => {
      if (type === 'Note')    createdNotes    = data;
      if (type === 'Drawing') createdDrawings = data;
      return data;
    }),
  };

  global.Scene = {
    create: vi.fn(async () => mockScene),
  };
});

describe('createSectorScene — Phase 3 entryId regression', () => {
  it('never sets entryId on settlement notes (would fail v13 NoteDocument validation against game.journal)', async () => {
    await createSectorScene(makeSector(), null, makeEntityActors());

    expect(createdNotes).not.toBeNull();
    for (const note of createdNotes) {
      // The bug was passing actor.id as entryId. The fix drops it.
      // Either omitted or explicitly null is acceptable.
      const entryId = note.entryId;
      expect(entryId == null).toBe(true);
    }
  });

  it('writes flag.actorId on settlement and planet notes so the click handler can route', async () => {
    await createSectorScene(makeSector(), null, makeEntityActors());

    const settlementNote = createdNotes.find(
      n => n.flags[MODULE_ID]?.settlementId === 'gen-A' && !n.flags[MODULE_ID]?.planetNote && !n.flags[MODULE_ID]?.stellarNote,
    );
    expect(settlementNote.flags[MODULE_ID].actorId).toBe('actor-A');

    const planetNote = createdNotes.find(n => n.flags[MODULE_ID]?.planetNote);
    expect(planetNote.flags[MODULE_ID].actorId).toBe('actor-A');
  });

  it('omits actorId on stellar pins — they are decorative only, no Actor to open', async () => {
    await createSectorScene(makeSector(), null, makeEntityActors());

    const stellarNote = createdNotes.find(n => n.flags[MODULE_ID]?.stellarNote);
    expect(stellarNote.flags[MODULE_ID].actorId).toBeUndefined();
  });

  it('completes the Drawing batch — Notes throwing must not abort passage rendering', async () => {
    // The original symptom was: notes threw on the first entryId validation,
    // and because createEmbeddedDocuments("Drawing", …) is awaited AFTER
    // the Note call, the throw propagated up and drawings never ran. Even
    // though our mock doesn't actually throw, this test asserts the call
    // happens — the fix is "no invalid entryId → no throw → drawing call
    // proceeds".
    await createSectorScene(makeSector(), null, makeEntityActors());

    expect(createdDrawings).not.toBeNull();
    expect(createdDrawings.length).toBe(2);   // one normal passage + one edge passage
  });

  it('passage drawings carry every v13-mandatory field (text, fontFamily, fillColor, etc.)', async () => {
    // Even when fillType is 0 and the shape is a polyline, v13 BaseDrawing
    // validates the presence of every field the schema declares as
    // required. Setting them defensively rather than relying on Foundry's
    // own defaults — those have churned across v11 → v12 → v13.
    await createSectorScene(makeSector(), null, makeEntityActors());

    expect(createdDrawings.length).toBeGreaterThan(0);
    for (const d of createdDrawings) {
      expect(typeof d.text).toBe('string');
      expect(typeof d.fontFamily).toBe('string');
      expect(typeof d.fontSize).toBe('number');
      expect(typeof d.fillColor).toBe('string');
      expect(typeof d.strokeColor).toBe('string');
      expect(d.shape.width).toBeGreaterThan(0);
      expect(d.shape.height).toBeGreaterThan(0);
    }
  });

  it('still works when entityActors is empty (sector created with no actors)', async () => {
    await createSectorScene(makeSector(), null, {});

    expect(createdNotes).not.toBeNull();
    // Notes still placed, just with null actorId — pin renders but click no-ops.
    for (const note of createdNotes) {
      const f = note.flags[MODULE_ID];
      if (f.stellarNote) continue;            // stellar omits the field entirely
      expect(f.actorId).toBeNull();
    }
  });
});

describe('createSectorScene — camera (v1.7.11 finding D)', () => {
  it('sets non-zero padding so the camera can pan/zoom (no longer trapped at the image edge)', async () => {
    await createSectorScene(makeSector(), null, makeEntityActors());
    const payload = global.Scene.create.mock.calls[0][0];
    expect(payload.padding).toBeGreaterThan(0);
  });

  it('captures an initial view scale ≤ 1 at creation', async () => {
    await createSectorScene(makeSector(), null, makeEntityActors());
    const payload = global.Scene.create.mock.calls[0][0];
    expect(payload.initial).toBeTruthy();
    expect(payload.initial.scale).toBeGreaterThan(0);
    expect(payload.initial.scale).toBeLessThanOrEqual(1);
  });
});

describe('createSectorScene — scene-rect offset + centred camera (PLAYTEST-1712 A / v1.7.14)', () => {
  it('insets settlement, planet and stellar pins by (sceneX, sceneY) so they sit on the background, not the void', async () => {
    await createSectorScene(makeSector(), null, makeEntityActors());

    // gen-A is at gridX 3, gridY 2 → raw (300, 200); offset by (200, 200).
    const settlementNote = createdNotes.find(
      n => n.flags[MODULE_ID]?.settlementId === 'gen-A'
        && !n.flags[MODULE_ID]?.planetNote && !n.flags[MODULE_ID]?.stellarNote,
    );
    expect(settlementNote.x).toBe(SCENE_X + 300);
    expect(settlementNote.y).toBe(SCENE_Y + 200);

    // Planet pin keeps its (+70, +40) cluster offset relative to the settlement.
    const planetNote = createdNotes.find(n => n.flags[MODULE_ID]?.planetNote);
    expect(planetNote.x).toBe(SCENE_X + 300 + 70);
    expect(planetNote.y).toBe(SCENE_Y + 200 + 40);

    // Stellar pin keeps its (-60, +30) cluster offset.
    const stellarNote = createdNotes.find(n => n.flags[MODULE_ID]?.stellarNote);
    expect(stellarNote.x).toBe(SCENE_X + 300 - 60);
    expect(stellarNote.y).toBe(SCENE_Y + 200 + 30);
  });

  it('insets passage drawing origins by the same amount (relative deltas unchanged)', async () => {
    await createSectorScene(makeSector(), null, makeEntityActors());

    // The normal passage runs gen-A (3,2) → gen-B (7,5). Origin is gen-A's pin,
    // offset by the inset; the shape delta stays the raw grid delta (400, 300).
    const normalPassage = createdDrawings.find(d => !d.flags[MODULE_ID]?.toEdge);
    expect(normalPassage.x).toBe(SCENE_X + 300);
    expect(normalPassage.y).toBe(SCENE_Y + 200);
    expect(normalPassage.shape.points).toEqual([0, 0, 400, 300]);
  });

  it('points the initial view at the padding-aware scene-rect centre after placing content', async () => {
    await createSectorScene(makeSector(), null, makeEntityActors());

    const initialUpdate = mockScene.update.mock.calls
      .map(call => call[0])
      .find(arg => arg && arg.initial);
    expect(initialUpdate).toBeTruthy();
    expect(initialUpdate.initial.x).toBe(Math.round(SCENE_X + SCENE_W / 2)); // 1096
    expect(initialUpdate.initial.y).toBe(Math.round(SCENE_Y + SCENE_H / 2)); // 712
    expect(initialUpdate.initial.scale).toBeGreaterThan(0);
    expect(initialUpdate.initial.scale).toBeLessThanOrEqual(1);
  });

  it('falls back to the square-grid padding formula when the scene exposes no dimensions', async () => {
    // A stub scene without `dimensions` must still offset (real Foundry always
    // provides it; this guards the fallback path). padding 0.1, grid 100,
    // sceneWidth 1792 → ceil(179.2/100)*100 = 200.
    delete mockScene.dimensions;
    await createSectorScene(makeSector(), null, makeEntityActors());

    const settlementNote = createdNotes.find(
      n => n.flags[MODULE_ID]?.settlementId === 'gen-A'
        && !n.flags[MODULE_ID]?.planetNote && !n.flags[MODULE_ID]?.stellarNote,
    );
    expect(settlementNote.x).toBe(200 + 300);
    expect(settlementNote.y).toBe(200 + 200);
  });
});
