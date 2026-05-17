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
  it('registers a clickNote hook handler', () => {
    registerSectorSceneHooks();
    const handlers = Hooks._handlers.get('clickNote') ?? [];
    expect(handlers.length).toBe(1);
  });

  it('is idempotent — calling twice registers only one handler', () => {
    registerSectorSceneHooks();
    registerSectorSceneHooks();
    const handlers = Hooks._handlers.get('clickNote') ?? [];
    expect(handlers.length).toBe(1);
  });
});
