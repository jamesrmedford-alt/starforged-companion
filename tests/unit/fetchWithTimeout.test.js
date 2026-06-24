/**
 * STARFORGED COMPANION
 * tests/unit/fetchWithTimeout.test.js
 *
 * Coverage for src/net/fetchWithTimeout.js — the bounded-fetch helper added in
 * response to the v1.7.23 sector-creator silent hang. An unbounded fetch that
 * stalls neither resolves nor rejects, so the pipeline awaiting it wedged with
 * nothing logged. These tests pin that a stalled request now rejects with a
 * clear, labelled timeout error (without waiting the real 120s — fake timers),
 * that the happy path forwards url/init and adds an abort signal, and that
 * non-timeout errors pass through unchanged.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchWithTimeout, DEFAULT_TIMEOUT_MS } from '../../src/net/fetchWithTimeout.js';

let realFetch;

beforeEach(() => {
  realFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('fetchWithTimeout — happy path', () => {
  it('returns the Response and forwards url, init, and an abort signal', async () => {
    const fakeResponse = { ok: true, status: 200 };
    globalThis.fetch = vi.fn(async () => fakeResponse);

    const res = await fetchWithTimeout(
      'https://api.example.com/x',
      { method: 'POST', headers: { 'x-test': '1' } },
      { timeoutMs: 1000 },
    );

    expect(res).toBe(fakeResponse);
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('https://api.example.com/x');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'x-test': '1' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('defaults to a 120s timeout', () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(120_000);
  });
});

describe('fetchWithTimeout — timeout', () => {
  it('rejects with a labelled timeout error when the request stalls past timeoutMs', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    // A fetch that never settles on its own — it only rejects if its signal
    // aborts, which is exactly the stall the helper must defend against.
    globalThis.fetch = vi.fn((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        reject(err);
      });
    }));

    const p = fetchWithTimeout('https://api.example.com/slow', {}, {
      timeoutMs: 5000,
      label: 'Slow op',
    });
    const expectation = expect(p).rejects.toThrow(/Slow op timed out after 5s/);

    await vi.advanceTimersByTimeAsync(5000);
    await expectation;
  });
});

describe('fetchWithTimeout — error passthrough', () => {
  it('passes a non-timeout network error through unchanged', async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error('ECONNREFUSED'); });

    await expect(
      fetchWithTimeout('https://api.example.com/x', {}, { timeoutMs: 1000 }),
    ).rejects.toThrow(/ECONNREFUSED/);
  });
});

describe('fetchWithTimeout — AbortController absent', () => {
  it('falls back to a plain fetch (no signal) when AbortController is unavailable', async () => {
    const savedAC = globalThis.AbortController;
    globalThis.AbortController = undefined;
    try {
      const fakeResponse = { ok: true };
      globalThis.fetch = vi.fn(async () => fakeResponse);

      const res = await fetchWithTimeout('https://api.example.com/x', { method: 'GET' });

      expect(res).toBe(fakeResponse);
      expect(globalThis.fetch.mock.calls[0][1].signal).toBeUndefined();
    } finally {
      globalThis.AbortController = savedAC;
    }
  });
});
