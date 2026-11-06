/**
 * STARFORGED COMPANION
 * tests/unit/campaignStateChain.test.js
 *
 * The per-client campaignState write chain (src/multiplayer/campaignStateChain.js,
 * issue #342 Z17) and the one write that does not wait its turn on it — the
 * X-Card's pause (runCampaignStateWriteNow, CAMPSTATE-CHAIN-PARTIAL): written
 * at once whatever is ahead of it, with every chained write that has not yet
 * read the store waiting for it to land. Each task here stands for a
 * read-modify-write: it "reads" when it is called and "lands" when the
 * promise it returns settles.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { serialiseCampaignStateWrite, runCampaignStateWriteNow } from '../../src/multiplayer/campaignStateChain.js';
import { deferred } from '../helpers/faults.js';

const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

afterEach(() => { vi.useRealTimers(); });

describe('campaignStateChain — the X-Card\'s pause jumps the chain', () => {
  it('the pause is written at once, though the chained write ahead has not landed', async () => {
    const reads = [];
    const ahead = deferred();
    const a = serialiseCampaignStateWrite(() => { reads.push('A'); return ahead.promise; }, 'A');
    const x = runCampaignStateWriteNow(() => { reads.push('X'); return Promise.resolve('paused'); }, 'X');
    expect(reads).toEqual(['A', 'X']);
    expect(await x).toBe('paused');
    ahead.resolve();
    await a;
  });

  it('a chained write queued before the pause but not yet started reads only once the pause has landed', async () => {
    const reads = [];
    const ahead = deferred();
    const pause = deferred();
    const a = serialiseCampaignStateWrite(() => { reads.push('A'); return ahead.promise; }, 'A');
    const b = serialiseCampaignStateWrite(() => { reads.push('B'); return Promise.resolve(); }, 'B');
    const x = runCampaignStateWriteNow(() => { reads.push('X'); return pause.promise; }, 'X');
    ahead.resolve();
    await a; await flush();
    expect(reads, 'B waits for the pause, not only for A').toEqual(['A', 'X']);
    pause.resolve();
    await x; await b;
    expect(reads).toEqual(['A', 'X', 'B']);
  });

  it('a chained write queued after the pause reads only once it has landed', async () => {
    const reads = [];
    const pause = deferred();
    const x = runCampaignStateWriteNow(() => { reads.push('X'); return pause.promise; }, 'X');
    const c = serialiseCampaignStateWrite(() => { reads.push('C'); return Promise.resolve(); }, 'C');
    await flush();
    expect(reads).toEqual(['X']);
    pause.resolve();
    await x; await c;
    expect(reads).toEqual(['X', 'C']);
  });

  it('a refused pause does not hold up the chain; the caller gets its rejection', async () => {
    const reads = [];
    const x = runCampaignStateWriteNow(() => { reads.push('X'); return Promise.reject(new Error('refused')); }, 'X');
    const c = serialiseCampaignStateWrite(() => { reads.push('C'); return Promise.resolve('ok'); }, 'C');
    await expect(x).rejects.toThrow('refused');
    expect(await c).toBe('ok');
    expect(reads).toEqual(['X', 'C']);
  });

  it('a pause that never lands is waited for at most 10 s from its start — then the write behind it goes, warned', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const reads = [];
      runCampaignStateWriteNow(() => { reads.push('X'); return new Promise(() => {}); }, 'X-Card pause');
      const c = serialiseCampaignStateWrite(() => { reads.push('C'); return Promise.resolve(); }, 'C');
      await vi.advanceTimersByTimeAsync(9_000);
      expect(reads).toEqual(['X']);
      await vi.advanceTimersByTimeAsync(1_100);
      await c;
      expect(reads).toEqual(['X', 'C']);
      const warned = () => warn.mock.calls.filter(args => /X-Card pause/.test(String(args[0]))).length;
      expect(warned()).toBe(1);
      // Waited for once: a later write does not wait for it, or warn, again.
      const d = serialiseCampaignStateWrite(() => { reads.push('D'); return Promise.resolve(); }, 'D');
      await vi.advanceTimersByTimeAsync(0);
      await d;
      expect(reads).toEqual(['X', 'C', 'D']);
      expect(warned()).toBe(1);
    } finally {
      warn.mockRestore();
    }
  });

  it('control: chained writes keep their order, each reading once the one ahead has landed', async () => {
    const reads = [];
    const first = deferred();
    const a = serialiseCampaignStateWrite(() => { reads.push('A'); return first.promise; }, 'A');
    const b = serialiseCampaignStateWrite(() => { reads.push('B'); return Promise.resolve(); }, 'B');
    await flush();
    expect(reads).toEqual(['A']);
    first.resolve();
    await a; await b;
    expect(reads).toEqual(['A', 'B']);
  });
});
