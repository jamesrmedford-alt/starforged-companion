/**
 * STARFORGED COMPANION
 * tests/unit/clocks.test.js
 *
 * Unit coverage for the programmatic clock-advance hook used by the move
 * pipeline on a Pay the Price (playtest finding #10), plus the `!clock advance`
 * / `!clock fill` verbs' trigger handling (no re-trigger or second paid
 * vignette on an already-full clock). The rest of the chat-command surface
 * (!clock new/list/…) is exercised via the integration suite.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// fireClockVignette dynamically imports the narrator; stub the paid call.
vi.mock('../../src/narration/narrator.js', () => ({
  narrateClockAdvancement: vi.fn(async () => 'The net tightens.'),
}));

import { narrateClockAdvancement } from '../../src/narration/narrator.js';
import {
  advanceTensionClocksForPayThePrice, revertTensionClocksForBurn, handleClockCommand,
  retireClock, removeClock,
} from '../../src/clocks/clocks.js';

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
    expect(advanced[0]).toMatchObject({ _id: 't1', name: "Dani's captivity", filled: 3, segments: 6, triggered: false });
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

// ── revertTensionClocksForBurn ────────────────────────────────────────────────

describe('revertTensionClocksForBurn', () => {
  beforeEach(() => {
    game.settings._store.clear();
  });

  it('decrements the specified tension clocks by one segment', async () => {
    setClocks([
      { _id: 't1', name: 'Dani', type: 'tension', segments: 6, filled: 3, active: true },
      { _id: 't2', name: 'Doom', type: 'tension', segments: 4, filled: 2, active: true },
    ]);

    await revertTensionClocksForBurn(['t1']);

    expect(storedClocks().find(c => c._id === 't1').filled).toBe(2);
    expect(storedClocks().find(c => c._id === 't2').filled).toBe(2); // untouched
  });

  it('does not go below zero', async () => {
    setClocks([{ _id: 't1', name: 'X', type: 'tension', segments: 4, filled: 0, active: true }]);
    await revertTensionClocksForBurn(['t1']);
    expect(storedClocks()[0].filled).toBe(0);
  });

  it('silently skips unknown ids', async () => {
    setClocks([{ _id: 't1', name: 'X', type: 'tension', segments: 4, filled: 2, active: true }]);
    await revertTensionClocksForBurn(['unknown']);
    expect(storedClocks()[0].filled).toBe(2); // unchanged
  });

  it('is a no-op for empty input', async () => {
    setClocks([{ _id: 't1', name: 'X', type: 'tension', segments: 4, filled: 3, active: true }]);
    await revertTensionClocksForBurn([]);
    expect(storedClocks()[0].filled).toBe(3); // unchanged
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// !clock advance / fill — no re-trigger on a full clock (D2)
// ─────────────────────────────────────────────────────────────────────────────

describe('!clock advance / fill', () => {
  const cmd = (content) => ({ content, flags: {} });
  const flush = () => new Promise(r => setTimeout(r, 0)).then(() => new Promise(r => setTimeout(r, 0)));
  const cards = () => ChatMessage._created.filter(m => !m.flags?.['starforged-companion']?.clockVignetteCard);
  const vignettes = () => ChatMessage._created.filter(m => m.flags?.['starforged-companion']?.clockVignetteCard);

  beforeEach(() => {
    game.settings._store.clear();
    ChatMessage._reset();
    narrateClockAdvancement.mockClear();
  });

  it('advance on a tension clock fills a segment and fires one vignette', async () => {
    setClocks([{ _id: 't1', name: 'Breach', type: 'tension', segments: 4, filled: 1, active: true }]);
    await handleClockCommand(cmd('!clock advance Breach'));
    await flush();
    expect(storedClocks()[0].filled).toBe(2);
    expect(cards()[0].content).toContain('Clock advanced');
    expect(narrateClockAdvancement).toHaveBeenCalledTimes(1);
    expect(narrateClockAdvancement.mock.calls[0][0].clock).toMatchObject({ filled: 2, triggered: false });
    expect(vignettes()).toHaveLength(1);
  });

  it('advance onto the last segment announces TRIGGERED once with a trigger vignette', async () => {
    setClocks([{ _id: 't1', name: 'Breach', type: 'tension', segments: 4, filled: 3, active: true }]);
    await handleClockCommand(cmd('!clock advance Breach'));
    await flush();
    expect(cards()[0].content).toContain('TRIGGERED');
    expect(narrateClockAdvancement.mock.calls[0][0].clock.triggered).toBe(true);
  });

  it('advance on an already-full clock posts a notice and no vignette', async () => {
    setClocks([{ _id: 't1', name: 'Reactor breach', type: 'tension', segments: 4, filled: 4, active: true }]);
    await handleClockCommand(cmd('!clock advance Reactor'));
    await flush();
    expect(cards()).toHaveLength(1);
    expect(cards()[0].content).toContain('already triggered');
    expect(cards()[0].content).not.toContain('<em>TRIGGERED.</em>');
    expect(cards()[0].content).toContain('!clock reset &quot;Reactor breach&quot;');
    expect(narrateClockAdvancement).not.toHaveBeenCalled();
    expect(storedClocks()[0].filled).toBe(4);
  });

  it('advance on a full campaign clock does not roll or narrate', async () => {
    setClocks([{ _id: 'c1', name: 'Plot', type: 'campaign', segments: 6, filled: 6, active: true, advanceOdds: 'likely' }]);
    const rnd = vi.spyOn(Math, 'random');
    await handleClockCommand(cmd('!clock advance Plot'));
    await flush();
    expect(rnd).not.toHaveBeenCalled();
    expect(cards()[0].content).toContain('already triggered');
    expect(narrateClockAdvancement).not.toHaveBeenCalled();
  });

  it('advance on a campaign clock rolling YES fills and narrates; NO does neither', async () => {
    setClocks([{ _id: 'c1', name: 'Plot', type: 'campaign', segments: 6, filled: 2, active: true, advanceOdds: 'likely' }]);
    vi.spyOn(Math, 'random').mockReturnValue(0.1);   // d100 = 11 ≤ 75 → YES
    await handleClockCommand(cmd('!clock advance Plot'));
    await flush();
    expect(storedClocks()[0].filled).toBe(3);
    expect(narrateClockAdvancement).toHaveBeenCalledTimes(1);

    ChatMessage._reset();
    narrateClockAdvancement.mockClear();
    vi.spyOn(Math, 'random').mockReturnValue(0.95);  // d100 = 96 > 75 → NO
    await handleClockCommand(cmd('!clock advance Plot'));
    await flush();
    expect(storedClocks()[0].filled).toBe(3);
    expect(cards()[0].content).toContain('did not advance');
    expect(narrateClockAdvancement).not.toHaveBeenCalled();
  });

  it('fill below full posts the card without a vignette', async () => {
    setClocks([{ _id: 't1', name: 'Breach', type: 'tension', segments: 4, filled: 1, active: true }]);
    await handleClockCommand(cmd('!clock fill Breach'));
    await flush();
    expect(storedClocks()[0].filled).toBe(2);
    expect(cards()[0].content).toContain('Clock filled');
    expect(narrateClockAdvancement).not.toHaveBeenCalled();
  });

  it('fill onto the last segment fires the trigger vignette (transition only)', async () => {
    setClocks([{ _id: 't1', name: 'Breach', type: 'tension', segments: 4, filled: 3, active: true }]);
    await handleClockCommand(cmd('!clock fill Breach'));
    await flush();
    expect(cards()[0].content).toContain('TRIGGERED');
    expect(narrateClockAdvancement).toHaveBeenCalledTimes(1);
    expect(narrateClockAdvancement.mock.calls[0][0].clock.triggered).toBe(true);
  });

  it('fill on an already-full clock posts a notice and no vignette', async () => {
    setClocks([{ _id: 't1', name: 'Breach', type: 'tension', segments: 4, filled: 4, active: true }]);
    await handleClockCommand(cmd('!clock fill Breach'));
    await flush();
    expect(cards()).toHaveLength(1);
    expect(cards()[0].content).toContain('already triggered');
    expect(narrateClockAdvancement).not.toHaveBeenCalled();
  });

  it('players cannot advance clocks', async () => {
    const restore = globalThis.asPlayer();
    try {
      setClocks([{ _id: 't1', name: 'Breach', type: 'tension', segments: 4, filled: 1, active: true }]);
      await handleClockCommand(cmd('!clock advance Breach'));
      expect(storedClocks()[0].filled).toBe(1);
      expect(cards()).toHaveLength(0);
    } finally {
      restore();
    }
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// retireClock / removeClock — a scene challenge's paired clock (issue #316 T03)
// ─────────────────────────────────────────────────────────────────────────────

describe('retireClock / removeClock', () => {
  beforeEach(() => {
    game.settings._store.clear();
    ChatMessage._reset();
  });

  it('retireClock marks the clock inactive and keeps it; automatic advances then skip it', async () => {
    setClocks([
      { _id: 't1', name: 'Flooding chamber', type: 'tension', segments: 4, filled: 1, active: true },
      { _id: 't2', name: 'Reactor breach',   type: 'tension', segments: 4, filled: 0, active: true },
    ]);
    const retired = await retireClock('t1');
    expect(retired).toMatchObject({ _id: 't1', active: false, filled: 1 });
    expect(storedClocks().map(c => [c._id, c.active])).toEqual([['t1', false], ['t2', true]]);

    const advanced = await advanceTensionClocksForPayThePrice();
    expect(advanced.map(c => c._id)).toEqual(['t2']);
    expect(storedClocks().find(c => c._id === 't1').filled).toBe(1);
  });

  it('retireClock is idempotent — a clock already retired is left as it is, with no write', async () => {
    setClocks([{ _id: 't1', name: 'Done', type: 'tension', segments: 4, filled: 2, active: false, updatedAt: 'then' }]);
    const spy = vi.spyOn(game.settings, 'set');
    expect(await retireClock('t1')).toMatchObject({ _id: 't1', active: false, updatedAt: 'then' });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('retireClock writes on a copy: a refused write leaves the cached state as it was', async () => {
    setClocks([{ _id: 't1', name: 'Flooding chamber', type: 'tension', segments: 4, filled: 1, active: true }]);
    vi.spyOn(game.settings, 'set').mockRejectedValueOnce(new Error('refused by the test'));
    await expect(retireClock('t1')).rejects.toThrow('refused by the test');
    expect(storedClocks()[0].active).toBe(true);
  });

  it('removeClock takes the clock off the list and returns it; an unknown id is null', async () => {
    setClocks([
      { _id: 't1', name: 'Flooding chamber', type: 'tension', segments: 4, filled: 1, active: true },
      { _id: 't2', name: 'Reactor breach',   type: 'tension', segments: 4, filled: 0, active: true },
    ]);
    expect(await removeClock('t1')).toMatchObject({ _id: 't1', name: 'Flooding chamber' });
    expect(storedClocks().map(c => c._id)).toEqual(['t2']);
    expect(await removeClock('nope')).toBeNull();
    expect(await retireClock('nope')).toBeNull();
  });

  it('`!clock remove` and `!clock list` go through the same list: a retired clock is listed as retired', async () => {
    setClocks([
      { _id: 't1', name: 'Flooding chamber', type: 'tension', segments: 4, filled: 1, active: false },
      { _id: 't2', name: 'Reactor breach',   type: 'tension', segments: 4, filled: 0, active: true },
    ]);
    await handleClockCommand({ content: '!clock list', flags: {} });
    expect(ChatMessage._created.at(-1).content).toMatch(/Flooding chamber — tension 1\/4 <em>\(retired\)<\/em>/);
    expect(ChatMessage._created.at(-1).content).not.toMatch(/Reactor breach — tension 0\/4 <em>\(retired\)/);

    await handleClockCommand({ content: '!clock remove "Reactor breach"', flags: {} });
    expect(storedClocks().map(c => c._id)).toEqual(['t1']);
    expect(ChatMessage._created.at(-1).content).toMatch(/Clock removed/);
  });
});
