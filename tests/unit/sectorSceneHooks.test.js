/**
 * STARFORGED COMPANION
 * tests/unit/sectorSceneHooks.test.js
 *
 * Coverage for the click handler that opens settlement Actor sheets when
 * the user clicks a sector-scene Note pin (introduced as the Phase 3
 * follow-up fix for the v1.3.4 "Sector Creator failed to populate map"
 * bug — see CHANGELOG entry).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  registerSectorSceneHooks,
  handleSectorNoteClick,
  handleCommandVehicleTokenDrag,
  nearestSettlementNote,
  findSettlementNoteById,
  syncCommandVehicleTokenToPosition,
} from '../../src/sectors/sectorSceneHooks.js';

const MODULE_ID = 'starforged-companion';

function makeNote(flags) {
  return { document: { flags: { [MODULE_ID]: flags } } };
}

function makeActor(id) {
  const sheet = { render: vi.fn() };
  return { id, sheet };
}

beforeEach(() => {
  // Reset the actor stub used by global.game.actors.get(...)
  global.game.actors._set?.(undefined, undefined); // noop on undefined; clear via fresh map
  global.game.actors._reset?.();
  // Reset the install flag so each test can register cleanly
  registerSectorSceneHooks._installed = false;
  Hooks._handlers.clear();
});

describe('handleSectorNoteClick', () => {
  it('passes through (returns undefined) on a non-sector note — lets core handle', () => {
    const note = { document: { flags: {} } };
    expect(handleSectorNoteClick(note)).toBeUndefined();
  });

  it('opens the linked Actor sheet on a settlement pin', () => {
    const actor = makeActor('actor-set-1');
    global.game.actors._set('actor-set-1', actor);

    const note = makeNote({
      sectorNote:   true,
      settlementId: 'gen-1',
      actorId:      'actor-set-1',
    });

    const result = handleSectorNoteClick(note);
    expect(actor.sheet.render).toHaveBeenCalledWith(true);
    expect(result).toBe(false);   // prevent default
  });

  it('opens the parent settlement Actor on a planet pin (shared actorId)', () => {
    const actor = makeActor('actor-set-2');
    global.game.actors._set('actor-set-2', actor);

    const note = makeNote({
      sectorNote:   true,
      planetNote:   true,
      settlementId: 'gen-2',
      actorId:      'actor-set-2',
    });

    handleSectorNoteClick(note);
    expect(actor.sheet.render).toHaveBeenCalledTimes(1);
  });

  it('no-ops on a stellar pin (no actorId by design — decorative)', () => {
    const note = makeNote({
      sectorNote:   true,
      stellarNote:  true,
      settlementId: 'gen-3',
      // intentionally no actorId
    });
    const result = handleSectorNoteClick(note);
    expect(result).toBe(false);   // still suppresses default
  });

  it('warns and returns false when actorId is set but the Actor was deleted', () => {
    const note = makeNote({
      sectorNote: true,
      actorId:    'actor-missing',
    });
    global.ui.notifications.warn = vi.fn();
    const result = handleSectorNoteClick(note);

    expect(global.ui.notifications.warn).toHaveBeenCalledWith(
      expect.stringContaining('actor-missing'),
    );
    expect(result).toBe(false);
  });

  it('tolerates a malformed note object without throwing', () => {
    expect(() => handleSectorNoteClick(null)).not.toThrow();
    expect(() => handleSectorNoteClick({})).not.toThrow();
    expect(() => handleSectorNoteClick({ document: null })).not.toThrow();
  });
});

describe('registerSectorSceneHooks', () => {
  it('registers handlers for BOTH clickNote and activateNote (v12 + v13 hook names)', () => {
    registerSectorSceneHooks();
    expect(Hooks._handlers.get('clickNote')?.length).toBe(1);
    expect(Hooks._handlers.get('activateNote')?.length).toBe(1);
  });

  it('is idempotent — calling twice registers only one handler per event', () => {
    registerSectorSceneHooks();
    registerSectorSceneHooks();
    expect(Hooks._handlers.get('clickNote')?.length).toBe(1);
    expect(Hooks._handlers.get('activateNote')?.length).toBe(1);
  });

  it('patches Note.prototype._onClickLeft2 so sector pins bypass the JournalEntry path', () => {
    // The user's v1.3.4 follow-up bug ("no linkage from clicking on the note")
    // happened because Foundry v13 does not reliably fire clickNote. The
    // prototype patch is the cross-version-safe mechanism.
    const original = vi.fn();
    globalThis.foundry = globalThis.foundry ?? {};
    globalThis.foundry.canvas = { placeables: {
      Note: class { _onClickLeft2() { original(); } },
    }};

    registerSectorSceneHooks();
    const Note = globalThis.foundry.canvas.placeables.Note;
    expect(Note.prototype._sfSectorClickPatched).toBe(true);

    // Simulate a click on a sector pin — sheet should render, original
    // _onClickLeft2 should NOT be called.
    const actor = makeActor('actor-patched');
    global.game.actors._set('actor-patched', actor);
    const instance = Object.assign(new Note(), {
      document: { flags: { [MODULE_ID]: { sectorNote: true, actorId: 'actor-patched' } } },
    });
    instance._onClickLeft2({});
    expect(actor.sheet.render).toHaveBeenCalledWith(true);
    expect(original).not.toHaveBeenCalled();

    // Simulate a click on a non-sector pin — original should be called.
    const plain = Object.assign(new Note(), { document: { flags: {} } });
    plain._onClickLeft2({});
    expect(original).toHaveBeenCalledTimes(1);

    delete globalThis.foundry.canvas;
  });
});


// ────────────────────────────────────────────────────────────────────
// Token-drag set_a_course — fact-continuity §20.4b
// ────────────────────────────────────────────────────────────────────

function makeSettlementNote(id, x, y, name = id, extraFlags = {}) {
  return {
    id, x, y, text: name,
    flags: { [MODULE_ID]: { sectorNote: true, settlementId: id, ...extraFlags } },
  };
}

function makeSectorScene({ id = 'scene1', notes = [], gridSize = 100 } = {}) {
  return {
    id,
    grid: { size: gridSize },
    notes,
    flags: { [MODULE_ID]: { sectorScene: true } },
  };
}

describe('nearestSettlementNote', () => {
  it('returns the closest settlement Note within radius', () => {
    const scene = makeSectorScene({
      notes: [
        makeSettlementNote('near', 100, 100),
        makeSettlementNote('far',  500, 500),
      ],
    });
    const hit = nearestSettlementNote(scene, 110, 110, 200);
    expect(hit?.id).toBe('near');
  });

  it('returns null when no Note is within radius', () => {
    const scene = makeSectorScene({
      notes: [makeSettlementNote('s1', 500, 500)],
    });
    expect(nearestSettlementNote(scene, 0, 0, 100)).toBeNull();
  });

  it('ignores planet and stellar Notes (settlement Notes only)', () => {
    const scene = makeSectorScene({
      notes: [
        makeSettlementNote('p1', 100, 100, 'Planet', { planetNote: true }),
        makeSettlementNote('s1', 200, 100),
      ],
    });
    const hit = nearestSettlementNote(scene, 110, 110, 200);
    expect(hit?.id).toBe('s1');
  });

  it('ignores Notes without a settlementId flag', () => {
    const noFlag = { id: 'x', x: 100, y: 100, text: 'X', flags: { [MODULE_ID]: { sectorNote: true } } };
    const scene = makeSectorScene({ notes: [noFlag] });
    expect(nearestSettlementNote(scene, 100, 100, 200)).toBeNull();
  });

  it('returns null on empty / malformed scene', () => {
    expect(nearestSettlementNote(null, 0, 0, 100)).toBeNull();
    expect(nearestSettlementNote({}, 0, 0, 100)).toBeNull();
    expect(nearestSettlementNote({ notes: [] }, 0, 0, 100)).toBeNull();
  });
});

describe('handleCommandVehicleTokenDrag', () => {
  let originalChatMessageCreate;
  let createCalls;

  beforeEach(() => {
    createCalls = [];
    originalChatMessageCreate = globalThis.ChatMessage?.create;
    globalThis.ChatMessage = globalThis.ChatMessage ?? {};
    globalThis.ChatMessage.create = vi.fn(async (data) => {
      createCalls.push(data);
      return { id: 'msg1', ...data };
    });
    // Settings: shipTokenEnabled defaults to "enabled" when the read returns
    // undefined (the registration default), and shipTokenSnapRadius defaults
    // to 1 cell. Both fall through cleanly without setup.
  });

  function restore() {
    if (originalChatMessageCreate !== undefined) {
      globalThis.ChatMessage.create = originalChatMessageCreate;
    }
  }

  it('passes through when the Token is not flagged as the command vehicle', () => {
    const result = handleCommandVehicleTokenDrag(
      { flags: {}, x: 0, y: 0 },
      { x: 100, y: 100 },
    );
    expect(result).toBeUndefined();
    restore();
  });

  it('passes through when no position change is in the diff', () => {
    const result = handleCommandVehicleTokenDrag(
      { flags: { [MODULE_ID]: { commandVehicle: true } }, x: 100, y: 100 },
      { name: 'renamed' },
    );
    expect(result).toBeUndefined();
    restore();
  });

  it('passes through when the parent Scene is not a sector Scene', () => {
    const scene = { id: 's', flags: { [MODULE_ID]: {} }, notes: [] };
    const result = handleCommandVehicleTokenDrag(
      { flags: { [MODULE_ID]: { commandVehicle: true } }, x: 0, y: 0, parent: scene },
      { x: 100, y: 100 },
    );
    expect(result).toBeUndefined();
    restore();
  });

  it('passes through (free-text reposition) when no settlement Note is within radius', () => {
    const scene = makeSectorScene({
      notes: [makeSettlementNote('s1', 1000, 1000)],
    });
    const result = handleCommandVehicleTokenDrag(
      { flags: { [MODULE_ID]: { commandVehicle: true } }, x: 0, y: 0, parent: scene },
      { x: 50, y: 50 },
    );
    expect(result).toBeUndefined();
    restore();
  });

  it('returns false (cancels drag) and dispatches set_a_course when drop is near a settlement', async () => {
    const scene = makeSectorScene({
      notes: [makeSettlementNote('s1', 100, 100, 'Bleakhold')],
    });
    const result = handleCommandVehicleTokenDrag(
      { id: 'tok1', flags: { [MODULE_ID]: { commandVehicle: true } }, x: 0, y: 0, parent: scene },
      { x: 110, y: 110 },
    );
    expect(result).toBe(false);
    // Dispatch is via setTimeout(…, 0) — flush the microtask queue.
    await new Promise(r => setTimeout(r, 5));
    expect(createCalls).toHaveLength(1);
    const flag = createCalls[0].flags?.[MODULE_ID];
    expect(flag?.bypassPacing).toBe(true);
    expect(flag?.forcedMoveId).toBe('set_a_course');
    expect(flag?.forcedMoveTarget).toBe('Bleakhold');
    expect(flag?.tokenDragSetCourse?.destNoteId).toBe('s1');
    expect(flag?.tokenDragSetCourse?.destX).toBe(100);
    expect(flag?.tokenDragSetCourse?.destY).toBe(100);
    restore();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Position→token sync (Cluster C / F5 gap 1)
// ─────────────────────────────────────────────────────────────────────────────

describe('syncCommandVehicleTokenToPosition', () => {
  function makeSyncScene({ sectorId = 'sec-1', tokenAt = { x: 100, y: 100 } } = {}) {
    const token = {
      x: tokenAt.x, y: tokenAt.y,
      flags: { [MODULE_ID]: { commandVehicle: true } },
      update: vi.fn(async function (patch) { Object.assign(this, patch); }),
    };
    const notes = [
      { x: 700, y: 500, flags: { [MODULE_ID]: { settlementId: 'st-lyra' } } },
      { x: 200, y: 200, flags: { [MODULE_ID]: { settlementId: 'st-sep' } } },
      { x: 999, y: 999, flags: { [MODULE_ID]: { settlementId: 'st-lyra', planetNote: true } } },
    ];
    return {
      scene: {
        flags:  { [MODULE_ID]: { sectorScene: true, sectorId } },
        tokens: { contents: [token] },
        notes:  { contents: notes },
      },
      token,
    };
  }

  function withScenes(scenes, fn) {
    const prev = global.game.scenes;
    global.game.scenes = { contents: scenes };
    return Promise.resolve(fn()).finally(() => { global.game.scenes = prev; });
  }

  const position = (over = {}) => ({
    sectorId: 'sec-1', nearestSettlementId: 'st-lyra',
    nearestPlanetId: null, freeText: '', updatedAt: 1, updatedBy: 'set_a_course',
    ...over,
  });

  it('moves the command-vehicle token to the matching settlement pin', async () => {
    const { scene, token } = makeSyncScene();
    await withScenes([scene], async () => {
      const moved = await syncCommandVehicleTokenToPosition(position(), { activeSectorId: 'sec-1' });
      expect(moved).toBe(token);
      expect(token.update).toHaveBeenCalledWith({ x: 700, y: 500 });
    });
  });

  it('excludes planet-flagged pins that share the settlement id', async () => {
    const { scene, token } = makeSyncScene();
    // Remove the plain settlement pin so only the planetNote one matches the id.
    scene.notes.contents = scene.notes.contents.filter(n => !(
      n.flags[MODULE_ID].settlementId === 'st-lyra' && !n.flags[MODULE_ID].planetNote
    ));
    await withScenes([scene], async () => {
      const moved = await syncCommandVehicleTokenToPosition(position(), {});
      expect(moved).toBeNull();
      expect(token.update).not.toHaveBeenCalled();
    });
  });

  it('does not move the token for free-text positions (no settlement id)', async () => {
    const { scene, token } = makeSyncScene();
    await withScenes([scene], async () => {
      const moved = await syncCommandVehicleTokenToPosition(
        position({ nearestSettlementId: null, freeText: 'drifting in the graveyard' }), {},
      );
      expect(moved).toBeNull();
      expect(token.update).not.toHaveBeenCalled();
    });
  });

  it('resolves the scene by sectorId when several sector scenes exist', async () => {
    const a = makeSyncScene({ sectorId: 'sec-other' });
    const b = makeSyncScene({ sectorId: 'sec-1' });
    await withScenes([a.scene, b.scene], async () => {
      await syncCommandVehicleTokenToPosition(position(), {});
      expect(a.token.update).not.toHaveBeenCalled();
      expect(b.token.update).toHaveBeenCalledWith({ x: 700, y: 500 });
    });
  });

  it('skips the update when the token already sits on the pin', async () => {
    const { scene, token } = makeSyncScene({ tokenAt: { x: 700, y: 500 } });
    await withScenes([scene], async () => {
      const moved = await syncCommandVehicleTokenToPosition(position(), {});
      expect(moved).toBe(token);
      expect(token.update).not.toHaveBeenCalled();
    });
  });

  it('is GM-gated', async () => {
    const { scene, token } = makeSyncScene();
    const prevGM = global.game.user.isGM;
    global.game.user.isGM = false;
    try {
      await withScenes([scene], async () => {
        const moved = await syncCommandVehicleTokenToPosition(position(), {});
        expect(moved).toBeNull();
        expect(token.update).not.toHaveBeenCalled();
      });
    } finally {
      global.game.user.isGM = prevGM;
    }
  });

  it('respects the shipTokenEnabled gate', async () => {
    const { scene, token } = makeSyncScene();
    global.game.settings._store.set(`${MODULE_ID}.factContinuity.shipTokenEnabled`, false);
    try {
      await withScenes([scene], async () => {
        const moved = await syncCommandVehicleTokenToPosition(position(), {});
        expect(moved).toBeNull();
        expect(token.update).not.toHaveBeenCalled();
      });
    } finally {
      global.game.settings._store.delete(`${MODULE_ID}.factContinuity.shipTokenEnabled`);
    }
  });
});

describe('findSettlementNoteById', () => {
  it('returns null without a settlement id or scene', () => {
    expect(findSettlementNoteById(null, 'x')).toBeNull();
    expect(findSettlementNoteById({ notes: { contents: [] } }, null)).toBeNull();
  });
});
