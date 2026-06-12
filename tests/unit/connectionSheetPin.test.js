/**
 * STARFORGED COMPANION
 * tests/unit/connectionSheetPin.test.js
 *
 * v1.7.10 playtest findings #1/#4 — NPC cards must pin the Starforged
 * character sheet at creation. foundry-ironsworn registers the classic
 * Ironsworn sheet as the `character`-type default, and the classic sheet's
 * Notes tab binds system.biography — so an unpinned card opens with
 * Bonds/Banes/Burdens and never renders the seeded portrait + narrator
 * intro that live on system.notes.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createConnection,
  STARFORGED_CHARACTER_SHEET,
} from '../../src/entities/connection.js';
import { _resetFolderCache } from '../../src/entities/folder.js';

const MODULE = 'starforged-companion';

beforeEach(() => {
  global.game.actors._reset();
  global.game.folders._reset?.();
  _resetFolderCache();
});

describe('createConnection — Starforged sheet pin', () => {
  it('creates the NPC card with core.sheetClass pinned to the Starforged sheet', async () => {
    const state = { connectionIds: [] };
    const record = await createConnection({ name: 'Patch Hawking', role: 'Crew' }, state, { persist: false });

    expect(record?._id).toBeTruthy();
    expect(state.connectionIds).toHaveLength(1);

    const actor = global.game.actors.get(state.connectionIds[0]);
    expect(actor?.type).toBe('character');
    expect(actor?.flags?.[MODULE]?.entityType).toBe('connection');
    expect(actor?.flags?.core?.sheetClass).toBe(STARFORGED_CHARACTER_SHEET);
    expect(STARFORGED_CHARACTER_SHEET).toBe('ironsworn.StarforgedCharacterSheet');
  });
});
