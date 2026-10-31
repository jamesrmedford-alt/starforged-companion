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
import { advanceCampaignClocksForBeginSession, applyClockAdvances } from '../../src/clocks/clocks.js';

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

// Issue #316 T04: a refused write lost the rolls — the advance was caught,
// logged and gone for the session, and Begin again said "already begun".
describe('a refused session-start write keeps the rolls (issue #316 T04)', () => {
  beforeEach(() => {
    game.settings._store.clear();
    vi.clearAllMocks();
  });

  it('every result names its clock and says it was saved', async () => {
    rollYesNo.mockReturnValue({ answer: 'yes', roll: 60 });
    setClocks([{ _id: 'c1', name: 'Hostile expansion', type: 'campaign', segments: 6, filled: 1, active: true, advanceOdds: 'likely' }]);
    const [r] = await advanceCampaignClocksForBeginSession();
    expect(r).toMatchObject({ _id: 'c1', advanced: true, filled: 2, saved: true });
    expect(r.error).toBeUndefined();
  });

  it('the write refused: the advanced entry carries saved:false and the error, the stored clock and the cache are unchanged', async () => {
    rollYesNo
      .mockReturnValueOnce({ answer: 'yes', roll: 30 })
      .mockReturnValueOnce({ answer: 'no', roll: 90 });
    setClocks([
      { _id: 'c1', name: 'Hostile expansion', type: 'campaign', segments: 6, filled: 1, active: true, advanceOdds: 'likely' },
      { _id: 'c2', name: 'Quiet decay',       type: 'campaign', segments: 8, filled: 3, active: true, advanceOdds: 'unlikely' },
    ]);
    vi.spyOn(game.settings, 'set').mockRejectedValueOnce(new Error('refused by the test'));

    const results = await advanceCampaignClocksForBeginSession();

    expect(results[0]).toMatchObject({ _id: 'c1', advanced: true, filled: 2, roll: 30, saved: false, error: 'refused by the test' });
    expect(results[1]).toMatchObject({ _id: 'c2', advanced: false, filled: 3, saved: true });
    expect(results[1].error).toBeUndefined();
    expect(storedClocks().map(c => c.filled)).toEqual([1, 3]);
  });

  it('applyClockAdvances saves the recorded fills, once: a second call changes nothing and writes nothing', async () => {
    setClocks([
      { _id: 'c1', name: 'Hostile expansion', type: 'campaign', segments: 6, filled: 1, active: true, advanceOdds: 'likely' },
      { _id: 'c2', name: 'Quiet decay',       type: 'campaign', segments: 8, filled: 3, active: true, advanceOdds: 'unlikely' },
    ]);
    expect(await applyClockAdvances([{ _id: 'c1', filled: 2 }])).toEqual({
      ok: true, applied: [{ _id: 'c1', name: 'Hostile expansion', filled: 2 }], missing: [],
    });
    expect(storedClocks().map(c => c.filled)).toEqual([2, 3]);

    const spy = vi.spyOn(game.settings, 'set');
    expect(await applyClockAdvances([{ _id: 'c1', filled: 2 }])).toEqual({ ok: true, applied: [], missing: [] });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('a clock a GM advanced past the recorded fill is left; the fill is clamped to the segments; a missing clock is named', async () => {
    setClocks([{ _id: 'c1', name: 'Hostile expansion', type: 'campaign', segments: 6, filled: 4, active: true, advanceOdds: 'likely' }]);
    expect(await applyClockAdvances([{ _id: 'c1', filled: 2 }, { _id: 'gone', filled: 3 }]))
      .toEqual({ ok: true, applied: [], missing: ['gone'] });
    expect(storedClocks()[0].filled).toBe(4);

    expect((await applyClockAdvances([{ _id: 'c1', filled: 9 }])).applied).toEqual([{ _id: 'c1', name: 'Hostile expansion', filled: 6 }]);
    expect(storedClocks()[0].filled).toBe(6);
  });

  it('a refused Retry write reports refused and leaves the cache as it was', async () => {
    setClocks([{ _id: 'c1', name: 'Hostile expansion', type: 'campaign', segments: 6, filled: 1, active: true, advanceOdds: 'likely' }]);
    vi.spyOn(game.settings, 'set').mockRejectedValueOnce(new Error('refused again'));
    expect(await applyClockAdvances([{ _id: 'c1', filled: 2 }])).toEqual({ ok: false, reason: 'refused', error: 'refused again' });
    expect(storedClocks()[0].filled).toBe(1);
  });
});
