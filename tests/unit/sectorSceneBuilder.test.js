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

beforeEach(() => {
  createdNotes    = null;
  createdDrawings = null;

  mockScene = {
    id: 'scene-1',
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

  it('captures an initial view centred on the map at a fit scale ≤ 1', async () => {
    await createSectorScene(makeSector(), null, makeEntityActors());
    const payload = global.Scene.create.mock.calls[0][0];
    expect(payload.initial).toBeTruthy();
    expect(payload.initial.x).toBe(Math.round(payload.width  / 2));
    expect(payload.initial.y).toBe(Math.round(payload.height / 2));
    expect(payload.initial.scale).toBeGreaterThan(0);
    expect(payload.initial.scale).toBeLessThanOrEqual(1);
  });
});
