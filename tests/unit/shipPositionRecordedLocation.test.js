// tests/unit/shipPositionRecordedLocation.test.js
// SHIP POSITION for a recorded location says where the ship is (issue #326
// W65). A derelict, vault or station was stored as the record's bare
// `freeText`, and formatShipPositionLine prints free text verbatim after the
// ship's name: "SHIP POSITION: Wayfinder Derelict Kovash (Outlands)". The
// record now carries the location's id (nearestLocationId), rendered by its
// current name with the settlement treatment — "docked at" for the
// stationary sources, "near" otherwise.

import { describe, it, expect } from 'vitest';
import { inferShipPosition, formatShipPositionLine } from '../../src/factContinuity/shipPosition.js';

const state = {
  locations:  [{ _id: 'loc-kov', journalId: 'loc-kov', name: 'Derelict Kovash', sectorId: 'sec-1' }],
  settlements: [{ _id: 'set-bleak', journalId: 'set-bleak', name: 'Bleakhold' }],
  sectors:    [{ id: 'sec-1', name: 'Outlands' }],
  activeSectorId: 'sec-1',
};

describe('SHIP POSITION for a recorded location says where the ship is (issue #326 W65)', () => {
  it('control: a settlement arrival reads "docked at"', () => {
    const p = inferShipPosition('Bleakhold', state, { source: 'at_command' });
    expect(formatShipPositionLine(p, state, 'Wayfinder')).toMatch(/Wayfinder docked at Bleakhold/);
  });

  it('`!at Derelict Kovash` reads "docked at Derelict Kovash", not "Wayfinder Derelict Kovash"', () => {
    const p = inferShipPosition('Derelict Kovash', state, { source: 'at_command' });
    const line = formatShipPositionLine(p, state, 'Wayfinder');
    // It read "SHIP POSITION: Wayfinder Derelict Kovash (Outlands)".
    expect(line).toBe('SHIP POSITION: Wayfinder docked at Derelict Kovash (Outlands)');
    expect(p.nearestLocationId).toBe('loc-kov');
  });

  it('a narrated approach to the location reads "near Derelict Kovash"', () => {
    const p = inferShipPosition('alongside the Derelict Kovash', state, { source: 'narrator_sidecar' });
    const line = formatShipPositionLine(p, state, 'Wayfinder');
    // It read "SHIP POSITION: Wayfinder Derelict Kovash (Outlands)".
    expect(line).toBe('SHIP POSITION: Wayfinder near Derelict Kovash (Outlands)');
  });
  it('the location is named as it is now — a renamed location reads its new name', () => {
    const p = inferShipPosition('Derelict Kovash', state, { source: 'at_command' });
    const renamed = { ...state, locations: [{ ...state.locations[0], name: 'The Kovash Wreck' }] };
    expect(formatShipPositionLine(p, renamed, 'Wayfinder')).toBe('SHIP POSITION: Wayfinder docked at The Kovash Wreck (Outlands)');
  });

  it('control: an unrecorded place stays free text, as narrated', () => {
    const p = inferShipPosition('adrift in the Veil Nebula', state, { source: 'narrator_sidecar' });
    expect(p.nearestLocationId ?? null).toBeNull();
    expect(formatShipPositionLine(p, state, 'Wayfinder')).toMatch(/Wayfinder adrift in the Veil Nebula/);
  });
});
