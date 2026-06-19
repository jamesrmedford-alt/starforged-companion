/**
 * STARFORGED COMPANION
 * tests/unit/clocksSessionStart.test.js
 *
 * Unit coverage for advanceCampaignClocksForBeginSession — the session-start
 * oracle roll for campaign clocks (play kit: campaign clocks advance at Begin
 * a Session via Ask the Oracle on the clock's advanceOdds).
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../../src/oracles/roller.js', () => ({
  rollYesNo: vi.fn(),
}));

import { rollYesNo } from '../../src/oracles/roller.js';
import { advanceCampaignClocksForBeginSession } from '../../src/clocks/clocks.js';

const KEY = 'starforged-companion.campaignState';

function setClocks(clocks) {
  game.settings._store.set(KEY, { clocks });
}
function storedClocks() {
  return game.settings.get('starforged-companion', 'campaignState')?.clocks ?? [];
}

describe('advanceCampaignClocksForBeginSession', () => {
  beforeEach(() => {
    game.settings._store.clear();
    vi.clearAllMocks();
  });

  it('returns [] when there are no campaign clocks', async () => {
    setClocks([]);
    expect(await advanceCampaignClocksForBeginSession()).toEqual([]);
  });

  it('returns [] when all campaign clocks are already triggered', async () => {
    setClocks([{ _id: 'c1', name: 'Done', type: 'campaign', segments: 4, filled: 4, active: true, advanceOdds: 'likely' }]);
    expect(await advanceCampaignClocksForBeginSession()).toEqual([]);
  });

  it('ignores tension clocks entirely', async () => {
    rollYesNo.mockReturnValue({ answer: 'yes', roll: 50 });
    setClocks([{ _id: 't1', name: 'Reactor', type: 'tension', segments: 4, filled: 0, active: true, advanceOdds: 'likely' }]);
    const results = await advanceCampaignClocksForBeginSession();
    expect(results).toEqual([]);
    expect(rollYesNo).not.toHaveBeenCalled();
  });

  it('advances a campaign clock when the oracle rolls YES', async () => {
    rollYesNo.mockReturnValue({ answer: 'yes', roll: 60 });
    setClocks([{ _id: 'c1', name: 'Syndicate Plot', type: 'campaign', segments: 6, filled: 2, active: true, advanceOdds: 'likely' }]);

    const results = await advanceCampaignClocksForBeginSession();

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ name: 'Syndicate Plot', advanced: true, filled: 3, triggered: false, odds: 'likely', roll: 60 });
    expect(storedClocks()[0].filled).toBe(3);
    expect(rollYesNo).toHaveBeenCalledWith('likely');
  });

  it('does NOT advance a campaign clock when the oracle rolls NO', async () => {
    rollYesNo.mockReturnValue({ answer: 'no', roll: 85 });
    setClocks([{ _id: 'c1', name: 'Syndicate Plot', type: 'campaign', segments: 6, filled: 2, active: true, advanceOdds: 'likely' }]);

    const results = await advanceCampaignClocksForBeginSession();

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ advanced: false, filled: 2 });
    expect(storedClocks()[0].filled).toBe(2);
  });

  it('marks triggered when the final segment fills', async () => {
    rollYesNo.mockReturnValue({ answer: 'yes', roll: 40 });
    setClocks([{ _id: 'c1', name: 'Countdown', type: 'campaign', segments: 4, filled: 3, active: true, advanceOdds: 'almost_certain' }]);

    const results = await advanceCampaignClocksForBeginSession();
    expect(results[0]).toMatchObject({ triggered: true, filled: 4 });
  });

  it('returns results for all eligible clocks including non-advanced', async () => {
    rollYesNo
      .mockReturnValueOnce({ answer: 'yes', roll: 30 })
      .mockReturnValueOnce({ answer: 'no', roll: 90 });
    setClocks([
      { _id: 'c1', name: 'Clock A', type: 'campaign', segments: 6, filled: 1, active: true, advanceOdds: 'likely' },
      { _id: 'c2', name: 'Clock B', type: 'campaign', segments: 8, filled: 3, active: true, advanceOdds: 'unlikely' },
    ]);

    const results = await advanceCampaignClocksForBeginSession();
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ name: 'Clock A', advanced: true });
    expect(results[1]).toMatchObject({ name: 'Clock B', advanced: false });
  });

  it('skips inactive campaign clocks', async () => {
    rollYesNo.mockReturnValue({ answer: 'yes', roll: 50 });
    setClocks([{ _id: 'c1', name: 'Off Clock', type: 'campaign', segments: 6, filled: 1, active: false, advanceOdds: 'likely' }]);
    const results = await advanceCampaignClocksForBeginSession();
    expect(results).toEqual([]);
    expect(rollYesNo).not.toHaveBeenCalled();
  });

  it('does not write state when no clock advanced (no dirty)', async () => {
    rollYesNo.mockReturnValue({ answer: 'no', roll: 90 });
    setClocks([{ _id: 'c1', name: 'Static', type: 'campaign', segments: 4, filled: 1, active: true, advanceOdds: 'unlikely' }]);
    const spy = vi.spyOn(game.settings, 'set');
    await advanceCampaignClocksForBeginSession();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
