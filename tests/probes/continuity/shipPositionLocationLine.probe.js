/**
 * PROBE — FC-06 SHIP-POSITION-LOCATION-LINE
 * (src/factContinuity/shipPosition.js inferShipPosition "location" case,
 *  inferShipPositionFromEntityId, formatShipPositionLine free-text branch)
 *
 * What the user does: `!at Derelict Kovash` (or the Entities panel's "Set as
 * current location", a Set a Course / Finish an Expedition arrival, a token
 * dropped on the place's pin) with a recorded LOCATION — a derelict, vault or
 * station, not a settlement or planet.
 *
 * What happens: a location hit is stored as `freeText: <the place's bare
 * name>` (no settlement / planet id), and formatShipPositionLine prints free
 * text verbatim after the ship's name: the never-dropped ledger line reads
 *   "SHIP POSITION: Wayfinder Derelict Kovash (Outlands)"
 * — no "docked at" / "near" / "at", so the ship's name runs into the place's
 * and the line no longer says where the ship is relative to it. The relation
 * word is applied to settlements ("docked at" / "near") and planets ("in
 * orbit of") only; free text was meant to be the narrator's own phrase
 * ("drifting in the dark"), which carries its own preposition. (The token's
 * own "deep space" record, sectorSceneHooks.computeTokenPositionRecord, is a
 * second bare producer: "Wayfinder deep space".)
 *
 * What should happen: a recorded location reads like a settlement does —
 * "docked at Derelict Kovash" for the stationary sources (at_command,
 * set_a_course, expedition, scene_token), "near Derelict Kovash" otherwise.
 *
 * Asserts the CORRECT behaviour; fails today.
 */

import { describe, it, expect } from 'vitest';
import { inferShipPosition, formatShipPositionLine } from '../../../src/factContinuity/shipPosition.js';

const state = {
  locations:  [{ _id: 'loc-kov', journalId: 'loc-kov', name: 'Derelict Kovash', sectorId: 'sec-1' }],
  settlements: [{ _id: 'set-bleak', journalId: 'set-bleak', name: 'Bleakhold' }],
  sectors:    [{ id: 'sec-1', name: 'Outlands' }],
  activeSectorId: 'sec-1',
};

describe('SHIP POSITION for a recorded location says where the ship is', () => {
  it('control: a settlement arrival reads "docked at"', () => {
    const p = inferShipPosition('Bleakhold', state, { source: 'at_command' });
    expect(formatShipPositionLine(p, state, 'Wayfinder')).toMatch(/Wayfinder docked at Bleakhold/);
  });

  it('`!at Derelict Kovash` reads "docked at Derelict Kovash", not "Wayfinder Derelict Kovash"', () => {
    const p = inferShipPosition('Derelict Kovash', state, { source: 'at_command' });
    const line = formatShipPositionLine(p, state, 'Wayfinder');
    // Today: "SHIP POSITION: Wayfinder Derelict Kovash (Outlands)".
    expect(line).toMatch(/Wayfinder (docked at|at|near) Derelict Kovash/);
  });

  it('a narrated approach to the location reads "near Derelict Kovash"', () => {
    const p = inferShipPosition('alongside the Derelict Kovash', state, { source: 'narrator_sidecar' });
    const line = formatShipPositionLine(p, state, 'Wayfinder');
    // Today: the narrated phrase is replaced by the bare name — "SHIP POSITION: Wayfinder Derelict Kovash (Outlands)".
    expect(line).toMatch(/Wayfinder (near|alongside( the)?) Derelict Kovash/);
  });
});
