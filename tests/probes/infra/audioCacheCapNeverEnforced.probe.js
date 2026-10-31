// tests/probes/infra/audioCacheCapNeverEnforced.probe.test.js
//
// PROBE (infra audit) — AUDIO-CACHE-CAP-DEAD.
//
// The help documents "Audio Cache Max — Maximum on-disk size of the audio
// cache. Default: 200 MB", and every clip the canonical GM caches fires
// evictIfOverflow(cap). The sweep browses every fan-out directory and issues a
// HEAD per cached file, then deletes through
// `FilePicker.implementation.delete` — which Foundry v13's client FilePicker
// does not have — so it `break`s on the first entry and evicts nothing, ever.
// (On The Forge the HEADs also go to `/https://assets.forge-vtt.com/…`, so
// every size reads 0.) The cap is never enforced; the cache only grows, and
// every 10 minutes of synthesis the GM's client pays for a full-tree scan.
//
// The tests/setup.js FilePicker stub has no delete either (as in v13).
// Asserts an over-cap cache is brought under the cap. FAILS today.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { evictIfOverflow, _resetAudioCacheStateForTests } from '../../../src/audio/cache.js';

let savedFetch;

beforeEach(() => {
  _resetAudioCacheStateForTests();
  savedFetch = globalThis.fetch;
  const fp = foundry.applications.apps.FilePicker.implementation;
  fp._reset();
  fp._dirs.add('worlds/test-world/audio');
  for (const sub of ['aa', 'bb']) {
    fp._dirs.add(`worlds/test-world/audio/${sub}`);
    for (let i = 0; i < 3; i++) fp._files.add(`worlds/test-world/audio/${sub}/${sub}${String(i).repeat(62)}.mp3`);
  }
  // 6 clips × 1 MB each, a day apart.
  let day = 0;
  globalThis.fetch = vi.fn(async () => {
    const lastModified = new Date(Date.UTC(2026, 0, 1 + day++)).toUTCString();
    return { headers: { get: (h) => (h === 'content-length' ? '1000000' : h === 'last-modified' ? lastModified : null) } };
  });
});

afterEach(() => {
  globalThis.fetch = savedFetch;
  foundry.applications.apps.FilePicker.implementation._reset();
});

describe('PROBE AUDIO-CACHE-CAP-DEAD — the documented cache cap', () => {
  it('a 6 MB cache with a 2 MB cap gets its oldest clips evicted', async () => {
    const evicted = await evictIfOverflow(2_000_000, { force: true });
    expect(globalThis.fetch).toHaveBeenCalledTimes(6);          // the full-tree HEAD scan ran
    // Actual today: 0 — no FilePicker.delete, so the sweep breaks before deleting anything.
    expect(evicted).toBeGreaterThanOrEqual(4);
    expect(foundry.applications.apps.FilePicker.implementation._files.size).toBeLessThanOrEqual(2);
  });
});
