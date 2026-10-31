/**
 * PROBE — LEGACY-CLEARED-NEVER-SET
 *
 * addLegacyTicks (src/index.js ~3558) caps a legacy track at 40 ticks and
 * awards box XP with `legacyBoxXp` (~3576): 2 XP a box, "1 once the track
 * has been cleared". Nothing in src/ ever sets `cleared: true` (grep
 * `cleared` — the only reader is legacyBoxXp; the only test of the 1-XP rate,
 * flowDefectFixes.test.js, hand-sets `cleared: true` on its fixture). Earn
 * Experience: "+2 XP per legacy box filled (+1 once a track is cleared)" —
 * a filled legacy track is cleared and filled again (the vendor's own legacy
 * track has no maximum: ProgressTicksField({ max: undefined })). Here, once
 * a track reaches 40 ticks every later mark is dropped — "Marked 2 ticks on
 * your quests legacy track" is posted, nothing changes, no XP is ever earned
 * from it again.
 *
 * Correct behaviour (asserted): marks on a full legacy track continue on its
 * cleared second pass, and a box filled there earns 1 XP.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addLegacyTicks } from '../../../src/index.js';

beforeEach(() => {
  game.actors._reset();
  globalThis.ChatMessage = { create: vi.fn(async (d) => d) };
});

describe('PROBE LEGACY-CLEARED-NEVER-SET', () => {
  it('filling a legacy track clears it: the overflow carries on and the next box earns 1 XP', async () => {
    const pc = makeTestActor({ id: 'xp-full', type: 'character', system: { xp: 0 } });
    game.actors._setAll([pc]);

    // A full quests track (10 boxes), then an epic vow's worth of legacy reward lands on it.
    const cs = { legacyTracks: { quests: { ticks: 40, cleared: false } } };
    const boxes = addLegacyTicks(cs, 'quests', 4);

    // Expected: one box filled on the cleared track, worth 1 XP. Actual: 0 boxes,
    // ticks stuck at 40, cleared still false — the mark and its XP are lost.
    expect(boxes).toBe(1);
    expect(cs.legacyTracks.quests.cleared).toBe(true);
    await vi.waitFor(() => expect(pc.system.xp).toBe(1));
  });

  it('the box that fills the track is followed by the overflow, not dropped', () => {
    game.actors._setAll([makeTestActor({ id: 'xp-38', type: 'character', system: { xp: 0 } })]);
    const cs = { legacyTracks: { bonds: { ticks: 38, cleared: false } } };
    addLegacyTicks(cs, 'bonds', 8);   // 2 ticks complete box 10; 6 ticks remain
    // Expected: the remaining 6 ticks are kept on the cleared track (1 box + 2 ticks).
    // Actual: the track is capped at 40 and the 6 ticks vanish.
    expect(cs.legacyTracks.bonds.cleared).toBe(true);
    expect(cs.legacyTracks.bonds.ticks % 40).toBe(6);
  });
});
