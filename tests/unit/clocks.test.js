/**
 * STARFORGED COMPANION
 * tests/unit/clocks.test.js
 *
 * Unit coverage for the programmatic clock-advance hook used by the move
 * pipeline on a Pay the Price (playtest finding #10). The chat-command surface
 * (!clock new/advance/…) is exercised via the integration suite; this file
 * pins the pure-ish campaignState mutation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { advanceTensionClocksForPayThePrice } from '../../src/clocks/clocks.js';

const KEY = 'starforged-companion.campaignState';

function setClocks(clocks) {
  game.settings._store.set(KEY, { clocks });
}
function storedClocks() {
  return game.settings.get('starforged-companion', 'campaignState')?.clocks ?? [];
}

describe('advanceTensionClocksForPayThePrice', () => {
  beforeEach(() => {
    game.settings._store.clear();
  });

  it('advances each active tension clock by one segment and persists it', async () => {
    setClocks([
      { _id: 't1', name: "Dani's captivity", type: 'tension', segments: 6, filled: 2, active: true },
      { _id: 't2', name: 'Reactor breach',   type: 'tension', segments: 4, filled: 0, active: true },
    ]);

    const advanced = await advanceTensionClocksForPayThePrice();

    expect(advanced).toHaveLength(2);
    expect(advanced[0]).toMatchObject({ name: "Dani's captivity", filled: 3, segments: 6, triggered: false });
    expect(storedClocks().find(c => c._id === 't1').filled).toBe(3);
    expect(storedClocks().find(c => c._id === 't2').filled).toBe(1);
  });

  it('marks a clock triggered when it reaches its final segment', async () => {
    setClocks([{ _id: 't1', name: 'Doom', type: 'tension', segments: 4, filled: 3, active: true }]);
    const advanced = await advanceTensionClocksForPayThePrice();
    expect(advanced[0]).toMatchObject({ filled: 4, triggered: true });
  });

  it('leaves campaign clocks untouched (they advance at Begin a Session)', async () => {
    setClocks([{ _id: 'c1', name: 'Faction plot', type: 'campaign', segments: 8, filled: 1, active: true }]);
    const advanced = await advanceTensionClocksForPayThePrice();
    expect(advanced).toEqual([]);
    expect(storedClocks()[0].filled).toBe(1);
  });

  it('skips full and inactive tension clocks', async () => {
    setClocks([
      { _id: 'full', name: 'Full', type: 'tension', segments: 4, filled: 4, active: true },
      { _id: 'off',  name: 'Off',  type: 'tension', segments: 4, filled: 1, active: false },
    ]);
    const advanced = await advanceTensionClocksForPayThePrice();
    expect(advanced).toEqual([]);
    expect(storedClocks().find(c => c._id === 'off').filled).toBe(1);
  });

  it('returns an empty array when there are no clocks at all', async () => {
    setClocks([]);
    expect(await advanceTensionClocksForPayThePrice()).toEqual([]);
  });
});
