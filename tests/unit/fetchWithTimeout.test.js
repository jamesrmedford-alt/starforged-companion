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

// Issue #300 F06: fetch() resolves at the response headers, and the helper
// cleared its timer there — a body that stalled after the headers left the
// caller's res.json() waiting forever. The deadline now covers the body.
describe('fetchWithTimeout — the deadline covers the body', () => {
  it('rejects a body read that stalls past timeoutMs', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: () => new Promise(() => {}) }));

    const res = await fetchWithTimeout('https://api.example.com/x', {}, { timeoutMs: 5000, label: 'Slow body' });
    const read = expect(res.json()).rejects.toThrow(/Slow body timed out after 5s/);
    await vi.advanceTimersByTimeAsync(5000);
    await read;
  });

  it('stops a real Response whose stream never ends', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const stalled = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('{"partial":')); } });
    globalThis.fetch = vi.fn(async () => new Response(stalled, { status: 200 }));

    const res = await fetchWithTimeout('https://api.example.com/x', {}, { timeoutMs: 1000, label: 'Stream' });
    const read = expect(res.text()).rejects.toThrow(/Stream timed out after 1s/);
    await vi.advanceTimersByTimeAsync(1000);
    await read;
  });

  it('a body read in time is returned, and the deadline is cleared', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    globalThis.fetch = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));

    const res = await fetchWithTimeout('https://api.example.com/x', {}, { timeoutMs: 5000 });
    expect(await res.json()).toEqual({ ok: true });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(warn).not.toHaveBeenCalled();
  });

  it('a caller of the Anthropic proxy gets the timeout, not a hang', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: () => new Promise(() => {}) }));
    const { apiPost } = await import('../../src/api-proxy.js');

    const call = expect(apiPost('https://api.anthropic.com/v1/messages', { 'x-api-key': 'sk-ant-x' }, {}))
      .rejects.toThrow(/Anthropic request timed out after 120s/);
    await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS);
    await call;
  });
});

// Issue #399's audit N7: the narration's judge gives up at 4 s, and its
// request ran on to this deadline, billed and in the API Log. A caller's own
// signal cancels the request, and the cancel is never reported as a timeout.
describe('fetchWithTimeout — the caller cancels', () => {
  const stalled = () => vi.fn((_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      reject(err);
    });
  }));

  it('the caller\'s signal aborts the request: an AbortError saying it was cancelled, not a timeout', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    globalThis.fetch = stalled();
    const cancel = new AbortController();
    const pending = fetchWithTimeout('https://api.example.com/x', { method: 'POST', signal: cancel.signal }, { timeoutMs: 60_000, label: 'Judge' });
    cancel.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError', message: 'Judge cancelled by its caller' });
    const [, init] = globalThis.fetch.mock.calls[0];
    expect(init.signal.aborted).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it('a signal already aborted cancels before any wait', async () => {
    globalThis.fetch = stalled();
    const cancel = new AbortController();
    cancel.abort();
    await expect(fetchWithTimeout('https://api.example.com/x', { signal: cancel.signal }, { timeoutMs: 60_000, label: 'Judge' }))
      .rejects.toMatchObject({ name: 'AbortError' });
  });

  it('a request that completes leaves the caller\'s signal alone', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: 1 }) }));
    const cancel = new AbortController();
    const res = await fetchWithTimeout('https://api.example.com/x', { signal: cancel.signal }, { timeoutMs: 60_000 });
    expect(await res.json()).toEqual({ ok: 1 });
    cancel.abort();   // after the fact: nothing left to cancel, nothing thrown
  });
});
