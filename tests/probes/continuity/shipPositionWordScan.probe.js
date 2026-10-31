/**
 * PROBE — SHIP-POS-WORD-SCAN (src/factContinuity/shipPosition.js)
 *
 * inferShipPosition resolves the narrator's `{subject:"ship", attribute:
 * "position", value}` sidecar entry (and `!at` / `!ship` seeds) through
 * matchSeedAgainstIndex. After the full-name tries it scans the seed's words
 * LOWERCASED against buildNameIndex, whose keys include the first/last word of
 * every multi-word name ("station" from "Bleakhold Station", "covenant" from
 * "The Covenant"). So:
 *   1. a common noun in an unrecorded destination ("a derelict station above
 *      Kaan") matches a recorded settlement's name part — the ship is recorded
 *      at Bleakhold Station (and the token is synced there); the bounded
 *      resolveEntityName ladder refuses exactly this ("a lowercase word never
 *      matches a name part");
 *   2. a non-spatial hit (faction / connection / ship) replaces the whole seed
 *      with the hit's bare name: "alongside the Covenant flagship Iron Resolve"
 *      is stored as freeText "The Covenant" → "SHIP POSITION: <ship> The
 *      Covenant".
 *
 * Asserts the CORRECT behaviour; fails today.
 */

import { describe, it, expect } from 'vitest';
import { inferShipPosition, formatShipPositionLine } from '../../../src/factContinuity/shipPosition.js';

const state = () => ({
  settlements: [{ _id: 's-bleak', journalId: 's-bleak', name: 'Bleakhold Station', sectorId: 'sec-1' }],
  planets:     [{ _id: 'p-kaan',  journalId: 'p-kaan',  name: 'Kaan', settlementIds: [], sectorId: 'sec-1' }],
  factions:    [{ _id: 'f-cov',   journalId: 'f-cov',   name: 'The Covenant' }],
  sectors:     [{ id: 'sec-1', name: 'Igneous Spine' }],
  activeSectorId: 'sec-1',
});

describe('ship position from a narrated destination', () => {
  it('does not dock the ship at a recorded settlement because the phrase says "station"', () => {
    const pos = inferShipPosition('a derelict station above Kaan', state(), { source: 'narrator_sidecar' });
    expect(pos.nearestSettlementId).not.toBe('s-bleak');
  });

  it('keeps the narrated phrase when the only match is a faction', () => {
    const cs  = state();
    const pos = inferShipPosition('alongside the Covenant flagship Iron Resolve', cs, { source: 'narrator_sidecar' });
    const line = formatShipPositionLine(pos, cs, "Pioneer's Pride");
    expect(line).toContain('flagship');
  });
});
