/**
 * STARFORGED COMPANION
 * tests/unit/notesPromotedBefore.test.js
 *
 * Known-issues NOTES-PROMOTED-BEFORE — a detail promoted to an NPC card's or
 * ship's record notes before issue #329 X12 is shown again.
 *
 * X12 made the sheet's Notes tab an NPC card's and a ship's notes (decisions.md
 * → "An NPC card's or ship's notes are its sheet's Notes tab"): the getters,
 * the narrator's ENTITIES IN SCENE Notes row and the Entities panel read the
 * tab, never the record's `notes`. But the Entities panel's ⤴ Promote had
 * appended details to the record's `notes` until then, so in a world played
 * before X12 those details were in a store nothing reads any more — gone from
 * the narrator and the panel. And `updateShip({ notes })` (an `!ship envision`
 * / `!ship history` append) still wrote the record's copy beside the tab.
 *
 * Now the canonical GM's world load moves them (migrator.js
 * moveRecordNotesToSheets): each promoted paragraph the tab does not already
 * hold is appended to it, and the record's copy is cleared; `updateShip`
 * writes the tab alone.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { moveRecordNotesToSheets } from '../../src/entities/migrator.js';
import { getShip, updateShip, ShipSchema } from '../../src/entities/ship.js';
import { getConnection } from '../../src/entities/connection.js';
import { formatEntityCard } from '../../src/narration/narratorPrompt.js';
import { ConnectionSchema } from '../../src/schemas.js';

const MODULE_ID = 'starforged-companion';
const notesRow = (card) => (card.split('\n').find(l => /^\s*Notes:/.test(l)) ?? '').trim();

const ENVISIONED = '<hr><h4>✦ Envisioned details — 2026-10-30</h4><p>The cargo bay smells of ozone.</p>';

function makeNpc(recordNotes, sheetNotes) {
  const actor = global.makeTestActor({
    id: 'npc-vex', type: 'character', name: 'Vex',
    system: { notes: sheetNotes },
    flags: { [MODULE_ID]: { entityType: 'connection', entityId: 'conn-vex',
      connection: { ...ConnectionSchema, _id: 'conn-vex', name: 'Vex', notes: recordNotes } } },
  });
  global.game.actors._set(actor.id, actor);
  return actor;
}
function makeShip(recordNotes, sheetNotes) {
  const actor = global.makeTestActor({
    id: 'ship-kestrel', type: 'starship', name: 'Kestrel',
    system: { notes: sheetNotes },
    flags: { [MODULE_ID]: { entityType: 'ship', entityId: 'rec-kestrel',
      ship: { ...ShipSchema, _id: 'rec-kestrel', name: 'Kestrel', notes: recordNotes } } },
  });
  global.game.actors._set(actor.id, actor);
  return actor;
}

beforeEach(() => {
  global.game.actors._reset();
  global.game.settings._store.clear();
  global.game.settings._store.set(`${MODULE_ID}.campaignState`, { shipIds: ['ship-kestrel'], connectionIds: ['npc-vex'] });
  global.game.user = { id: 'gm-1', isGM: true, active: true };
});

describe('NOTES-PROMOTED-BEFORE — details promoted to the record before X12 reach the Notes tab', () => {
  it("an NPC card's promoted details join its Notes tab — the narrator's Notes row shows them again", async () => {
    const npc = makeNpc('Owes the Syndicate a favour.\n\nFlew with the Ninth Fleet.', '<p>Keeps her own counsel.</p>');
    expect(notesRow(formatEntityCard(getConnection(npc.id), 'connection'))).not.toMatch(/Syndicate/);   // control: lost since X12

    expect(await moveRecordNotesToSheets()).toEqual({ moved: 1, cleared: 0 });
    expect(npc.system.notes).toBe('<p>Keeps her own counsel.</p><p>Owes the Syndicate a favour.</p><p>Flew with the Ninth Fleet.</p>');
    expect(npc.getFlag(MODULE_ID, 'connection').notes).toBe('');
    expect(notesRow(formatEntityCard(getConnection(npc.id), 'connection')))
      .toBe('Notes: Keeps her own counsel. Owes the Syndicate a favour. Flew with the Ninth Fleet.');
  });

  it('a detail the tab already holds is not added twice — the copy is only cleared', async () => {
    const npc = makeNpc('Owes the Syndicate a favour.', '<p>Keeps her own counsel.</p><p>Owes the Syndicate a favour.</p>');
    expect(await moveRecordNotesToSheets()).toEqual({ moved: 0, cleared: 1 });
    expect(npc.system.notes).toBe('<p>Keeps her own counsel.</p><p>Owes the Syndicate a favour.</p>');
    expect(npc.getFlag(MODULE_ID, 'connection').notes).toBe('');
  });

  it("a ship: its envision section (already in the tab) stays once; the promoted detail joins it", async () => {
    const ship = makeShip(`${ENVISIONED}\n\nA stowaway hides in the vents.`, `<p>A battered hauler.</p>${ENVISIONED}`);
    expect(await moveRecordNotesToSheets()).toEqual({ moved: 1, cleared: 0 });
    expect(ship.system.notes).toBe(`<p>A battered hauler.</p>${ENVISIONED}<p>A stowaway hides in the vents.</p>`);
    expect(getShip(ship.id).notes).toBe(ship.system.notes);
  });

  it("a GM's trim of the envision section in the tab stands — the record's whole-notes copy is not put back", async () => {
    const ship = makeShip(`${ENVISIONED}\n\nA stowaway hides in the vents.`, '<p>A battered hauler.</p>');
    expect(await moveRecordNotesToSheets()).toEqual({ moved: 1, cleared: 0 });
    expect(ship.system.notes).toBe('<p>A battered hauler.</p><p>A stowaway hides in the vents.</p>');
  });

  it('a second world load moves nothing', async () => {
    const npc = makeNpc('Owes the Syndicate a favour.', '');
    await moveRecordNotesToSheets();
    const after = npc.system.notes;
    expect(await moveRecordNotesToSheets()).toEqual({ moved: 0, cleared: 0 });
    expect(npc.system.notes).toBe(after);
  });

  it('control: a player\'s client moves nothing — not even on a card the player owns', async () => {
    const npc = makeNpc('Owes the Syndicate a favour.', '');
    npc.ownership = { 'pl-1': 3 };   // the write would land: the GM gate is what stops it
    global.game.user = { id: 'pl-1', isGM: false, active: true };
    expect(await moveRecordNotesToSheets()).toEqual({ moved: 0, cleared: 0 });
    expect(npc.getFlag(MODULE_ID, 'connection').notes).toBe('Owes the Syndicate a favour.');
  });
});

describe("NOTES-PROMOTED-BEFORE — updateShip writes a ship's notes to its Notes tab alone", () => {
  it('the tab takes the notes; the record keeps no copy', async () => {
    const ship = makeShip('', '<p>A battered hauler.</p>');
    await updateShip(ship.id, { notes: `<p>A battered hauler.</p>${ENVISIONED}` });
    expect(ship.system.notes).toBe(`<p>A battered hauler.</p>${ENVISIONED}`);
    expect(ship.getFlag(MODULE_ID, 'ship').notes).toBe('');                       // was the same HTML — a copy nothing read
    expect(getShip(ship.id).notes).toBe(`<p>A battered hauler.</p>${ENVISIONED}`); // control: the getter reads the tab
  });

  it('control: an update that leaves the notes alone leaves the record as it was', async () => {
    const ship = makeShip('', '<p>A battered hauler.</p>');
    await updateShip(ship.id, { battered: true });
    expect(ship.system.notes).toBe('<p>A battered hauler.</p>');
    expect(ship.getFlag(MODULE_ID, 'ship').battered).toBe(true);
  });
});
