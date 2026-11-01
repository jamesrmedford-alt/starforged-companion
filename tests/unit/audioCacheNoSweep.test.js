/**
 * STARFORGED COMPANION
 * tests/unit/audioCacheNoSweep.test.js
 *
 * Issue #322 V16 (the audit's audioCacheCapNeverEnforced probe,
 * AUDIO-CACHE-CAP-DEAD): the help documented "Audio Cache Max — Maximum
 * on-disk size of the audio cache. Default: 200 MB", and every clip the
 * canonical GM cached fired evictIfOverflow(cap). The sweep browsed every
 * fan-out directory and sent a HEAD per cached file, then deleted through
 * `FilePicker.implementation.delete` — which Foundry v13's client FilePicker
 * does not have — so it evicted nothing, ever (on The Forge every size also
 * read 0), while the GM's client paid for a full-tree scan every 10 minutes of
 * synthesis. A module cannot delete files on v13, so the sweep, its setting
 * and its help row are gone; the help says the cache is trimmed by hand.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as cache from "../../src/audio/cache.js";
import { PAGES } from "../../src/help/helpJournal.js";
import { productionSources } from "../helpers/sourceScan.js";

const MODULE_ID = "starforged-companion";
const page = (name) => PAGES.find(p => p.name === name)?.text?.content ?? "";

describe("the audio cache has no size-cap sweep", () => {
  let savedFetch;
  beforeEach(() => {
    cache._resetAudioCacheStateForTests();
    foundry.applications.apps.FilePicker.implementation._reset();
    savedFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => ({ ok: true, headers: { get: () => null } }));
  });
  afterEach(() => {
    globalThis.fetch = savedFetch;
    vi.restoreAllMocks();
  });

  it("the module exports no eviction sweep (Foundry v13's client cannot delete a file)", () => {
    expect(cache.evictIfOverflow).toBeUndefined();
    expect(foundry.applications.apps.FilePicker.implementation.delete).toBeUndefined();   // as in v13
  });

  it("caching a clip scans nothing: no browse of the cache tree, no HEAD per file", async () => {
    const fp = foundry.applications.apps.FilePicker.implementation;
    for (const sub of ["aa", "bb"]) fp._files.add(`worlds/test-world/audio/${sub}/${sub.repeat(32)}.mp3`);
    const browse = vi.spyOn(fp, "browse");
    await cache.write("c".repeat(64), new Uint8Array([1, 2, 3]));
    expect(browse.mock.calls.filter(([, dir]) => dir === "worlds/test-world/audio")).toHaveLength(0);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("no production code registers or reads the cap's setting, and the help no longer documents it", () => {
    const users = productionSources().filter(({ code }) => /audio\.cacheMaxBytes|evictIfOverflow/.test(code)).map(({ file }) => file);
    expect(users).toEqual([]);
    expect(page("Settings Reference")).not.toContain("Audio Cache Max");
    expect(page("Audio Narration")).toMatch(/never trimmed automatically/);
  });
});
