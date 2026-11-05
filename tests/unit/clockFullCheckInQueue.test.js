/**
 * Issue #337 Y37 CLOCK-FULL-CHECK-OUTSIDE-QUEUE — a clock triggers once,
 * however many presses reach it within one round trip.
 *
 * A tension clock stands one segment from full. The GM presses the Clocks
 * panel's + (or ↻) twice quickly, or types `!clock fill X` twice in a row.
 * Each press read the clock from the cache (3/4 both times — the cache
 * changes only when the server answers), found it not full, and queued its
 * fill (issue #326 W53's serialised write). The second task read 4/4, wrote
 * 4/4 again and handed back a full clock — and its caller, which had decided
 * before the queue, posted a second "TRIGGERED." card and fired a second
 * trigger vignette (a second narrator call, a second TRIGGERED beat in the
 * ring and the summary). The already-full check now runs inside the queued
 * write: the second press posts the "already triggered" notice, as a second
 * press after the first landed always did (CLOCK-RETRIGGER).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// fireClockVignette dynamically imports the narrator; stub the paid call.
vi.mock('../../src/narration/narrator.js', () => ({
  narrateClockAdvancement: vi.fn(async () => 'The breach gives way.'),
}));

import { narrateClockAdvancement } from '../../src/narration/narrator.js';
import { handleClockCommand } from '../../src/clocks/clocks.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;

const cmd = (content) => ({ content, flags: {} });
const flush = () => new Promise(r => setTimeout(r, 0)).then(() => new Promise(r => setTimeout(r, 0)));
const stored = () => game.settings.get(MODULE_ID, 'campaignState')?.clocks ?? [];
const cards = () => ChatMessage._created.filter(m => !m.flags?.[MODULE_ID]?.clockVignetteCard);
const vignettes = () => ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.clockVignetteCard);
const triggeredCards = () => cards().filter(m => /<em>TRIGGERED\.<\/em>/.test(m.content));
const noticeCards = () => cards().filter(m => /already triggered/.test(m.content));

function setClock(clock) {
  game.settings._store.set(KEY, { clocks: [{ _id: 't1', name: 'Breach', active: true, ...clock }] });
}

beforeEach(() => {
  game.settings._store.clear();
  ChatMessage._reset();
  narrateClockAdvancement.mockClear();
  setClock({ type: 'tension', segments: 4, filled: 3 });
});

describe('two presses within one round trip on a clock one segment from full (issue #337 Y37)', () => {
  it('two `!clock fill Breach` together: one TRIGGERED card and one trigger vignette, then the notice', async () => {
    await Promise.all([
      handleClockCommand(cmd('!clock fill Breach')),
      handleClockCommand(cmd('!clock fill Breach')),
    ]);
    await flush();

    expect(stored()[0].filled).toBe(4);
    expect(triggeredCards()).toHaveLength(1);
    expect(narrateClockAdvancement).toHaveBeenCalledTimes(1);
    expect(vignettes()).toHaveLength(1);
    expect(noticeCards()).toHaveLength(1);
  });

  it('two `!clock advance Breach` together (the panel\'s ↻ shares advanceClock): the same', async () => {
    await Promise.all([
      handleClockCommand(cmd('!clock advance Breach')),
      handleClockCommand(cmd('!clock advance Breach')),
    ]);
    await flush();

    expect(stored()[0].filled).toBe(4);
    expect(triggeredCards()).toHaveLength(1);
    expect(narrateClockAdvancement).toHaveBeenCalledTimes(1);
    expect(noticeCards()).toHaveLength(1);
  });

  it('two advances of a campaign clock that both roll YES trigger it once', async () => {
    setClock({ type: 'campaign', segments: 6, filled: 5, advanceOdds: 'likely' });
    vi.spyOn(Math, 'random').mockReturnValue(0.1);   // d100 = 11 ≤ 75 → YES, both times
    await Promise.all([
      handleClockCommand(cmd('!clock advance Breach')),
      handleClockCommand(cmd('!clock advance Breach')),
    ]);
    await flush();

    expect(stored()[0].filled).toBe(6);
    expect(triggeredCards()).toHaveLength(1);
    expect(narrateClockAdvancement).toHaveBeenCalledTimes(1);
    expect(noticeCards()).toHaveLength(1);
  });

  it('the press that found the clock full writes nothing', async () => {
    const set = vi.spyOn(game.settings, 'set');
    await Promise.all([
      handleClockCommand(cmd('!clock fill Breach')),
      handleClockCommand(cmd('!clock fill Breach')),
    ]);
    await flush();
    expect(set.mock.calls.filter(([, key]) => key === 'campaignState')).toHaveLength(1);
  });

  it('control: two sequential fills — the second posts "already triggered" and fires no second vignette', async () => {
    await handleClockCommand(cmd('!clock fill Breach'));
    await flush();
    await handleClockCommand(cmd('!clock fill Breach'));
    await flush();

    expect(stored()[0].filled).toBe(4);
    expect(triggeredCards()).toHaveLength(1);
    expect(noticeCards()).toHaveLength(1);
    expect(narrateClockAdvancement).toHaveBeenCalledTimes(1);
    expect(vignettes()).toHaveLength(1);
  });

  it('two fills from 2/4 together: each card reports its own fill — 3/4, then 4/4 TRIGGERED once', async () => {
    // Each press reported the clock as re-read after the queue, so the first
    // could see the second's write and also announce 4/4 TRIGGERED.
    setClock({ type: 'tension', segments: 4, filled: 2 });
    await Promise.all([
      handleClockCommand(cmd('!clock fill Breach')),
      handleClockCommand(cmd('!clock fill Breach')),
    ]);
    await flush();

    expect(stored()[0].filled).toBe(4);
    expect(cards().map(m => m.content.match(/<strong>(\d)\/4<\/strong>/)?.[1])).toEqual(['3', '4']);
    expect(triggeredCards()).toHaveLength(1);
    expect(noticeCards()).toHaveLength(0);
    expect(narrateClockAdvancement).toHaveBeenCalledTimes(1);
  });
});
