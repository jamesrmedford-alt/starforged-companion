/**
 * PROBE — SESSION-04 CLOCK-FULL-CHECK-OUTSIDE-QUEUE (tenth audit, area session)
 *
 * What the user does: a tension clock stands at 3/4. The GM presses the
 * Clocks panel's + (or ↻) twice quickly — a double-click, or a second press
 * while the first write's round trip is still out — or types `!clock fill
 * Breach` twice in a row before the first card appears.
 *
 * What happens: each press reads the clock from the cached campaignState
 * (3/4, both — the cache changes only when the server answers), finds it not
 * full (advanceClock / fillClock → isFull, src/clocks/clocks.js:561, :597),
 * and queues its fill (fillOneSegment → mutateClock, :607-614, serialised by
 * serialiseClockWrite since issue #326 W53). The second task runs after the
 * first landed, reads 4/4, writes 4/4 again (:608 clamps), returns the clock
 * as 4/4 — and its caller, which decided before the queue, posts a second
 * "Clock filled 4/4 — TRIGGERED." card and fires a second trigger vignette
 * (:603 / :585): a second narrator call, a second TRIGGERED beat in the
 * recent-narration ring and the rolling summary. The already-full guard
 * (postAlreadyTriggered) only sees a clock that was full when the press was
 * read. The help's Clocks rows promise otherwise: "A clock that has already
 * triggered just posts a short notice."
 *
 * What should happen: the second press finds the clock full inside the
 * serialised write and posts the "already triggered" notice — one TRIGGERED
 * card, one vignette — as the sequential case does.
 *
 * Control: two sequential fills — the second posts "already triggered" and
 * no vignette.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/session/clockFullCheckStale.probe.js
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// fireClockVignette dynamically imports the narrator; stub the paid call.
vi.mock('../../../src/narration/narrator.js', () => ({
  narrateClockAdvancement: vi.fn(async () => 'The breach gives way.'),
}));

import { narrateClockAdvancement } from '../../../src/narration/narrator.js';
import { handleClockCommand } from '../../../src/clocks/clocks.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;

const cmd = (content) => ({ content, flags: {} });
const flush = () => new Promise(r => setTimeout(r, 0)).then(() => new Promise(r => setTimeout(r, 0)));
const stored = () => game.settings.get(MODULE_ID, 'campaignState')?.clocks ?? [];
const cards = () => ChatMessage._created.filter(m => !m.flags?.[MODULE_ID]?.clockVignetteCard);
const vignettes = () => ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.clockVignetteCard);
const triggeredCards = () => cards().filter(m => /<em>TRIGGERED\.<\/em>/.test(m.content));
const noticeCards = () => cards().filter(m => /already triggered/.test(m.content));

beforeEach(() => {
  game.settings._store.clear();
  ChatMessage._reset();
  narrateClockAdvancement.mockClear();
  game.settings._store.set(KEY, { clocks: [
    { _id: 't1', name: 'Breach', type: 'tension', segments: 4, filled: 3, active: true },
  ] });
});

describe('SESSION-04 two clock presses within one round trip on a clock one segment from full', () => {
  it('two `!clock fill Breach` together: one TRIGGERED card and one trigger vignette, then the notice', async () => {
    await Promise.all([
      handleClockCommand(cmd('!clock fill Breach')),
      handleClockCommand(cmd('!clock fill Breach')),
    ]);
    await flush();

    expect(stored()[0].filled).toBe(4);                    // the clock is full (correct, clamped)
    // Expected: the clock triggers once — one "TRIGGERED." card, one vignette, and the
    // second press's "already triggered" notice. Actual: two TRIGGERED cards, two
    // vignettes (two narrator calls), no notice.
    expect(triggeredCards()).toHaveLength(1);
    expect.soft(narrateClockAdvancement).toHaveBeenCalledTimes(1);
    expect.soft(vignettes()).toHaveLength(1);
    expect.soft(noticeCards()).toHaveLength(1);
  });

  it('two `!clock advance Breach` together (the panel\'s ↻ shares advanceClock): the same double trigger', async () => {
    await Promise.all([
      handleClockCommand(cmd('!clock advance Breach')),
      handleClockCommand(cmd('!clock advance Breach')),
    ]);
    await flush();

    expect(stored()[0].filled).toBe(4);
    expect(triggeredCards()).toHaveLength(1);
    expect.soft(narrateClockAdvancement).toHaveBeenCalledTimes(1);
    expect.soft(noticeCards()).toHaveLength(1);
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
});
