/**
 * STARFORGED COMPANION
 * tests/unit/narratorUsageTelemetry.test.js
 *
 * Issue #286 F6 step 1 — measure before changing the narrator's prompt
 * layout. Every narrator call logs its token usage (uncached input, cache
 * reads, cache writes, output) and elapsed time to the "Narrator Usage" page
 * of the Pacing Telemetry journal, labelled with the narrator function that
 * made it. The page's summary line gives the cache-read share of prompt
 * tokens and the median time per call.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { logNarratorUsage } from '../../src/pacing/telemetry.js';
import { getRollingSessionSummary } from '../../src/narration/narrator.js';

const MODULE_ID = 'starforged-companion';

let journal;
let savedJournal;
let savedJournalEntry;

/** A Pacing Telemetry journal whose pages persist their flags and content. */
function makeJournal() {
  const j = {
    name:  'Pacing Telemetry',
    pages: { contents: [] },
    createEmbeddedDocuments: async (_type, docs) => {
      for (const doc of docs) {
        const flags = structuredClone(doc.flags ?? {});
        const page = {
          name:    doc.name,
          content: doc.text?.content ?? '',
          getFlag: (scope, key) => flags[scope]?.[key],
          setFlag: async (scope, key, value) => { (flags[scope] ??= {})[key] = value; },
          update:  async (changes) => { page.content = changes['text.content'] ?? page.content; },
        };
        j.pages.contents.push(page);
      }
    },
  };
  return j;
}

const usagePage = () => journal.pages.contents.find(p => p.name === 'Narrator Usage') ?? null;
const usageEntries = () => usagePage()?.getFlag(MODULE_ID, 'narratorUsageTelemetry')?.entries ?? [];

beforeEach(() => {
  journal = makeJournal();
  savedJournal = game.journal;
  savedJournalEntry = globalThis.JournalEntry;
  game.journal = { getName: (name) => (name === journal.name ? journal : null), find: () => null };
  globalThis.JournalEntry = { create: async () => journal };
});

afterEach(() => {
  game.journal = savedJournal;
  globalThis.JournalEntry = savedJournalEntry;
  vi.restoreAllMocks();
});

describe('logNarratorUsage', () => {
  it('appends each call\'s tokens and time, and summarises the cache-read share', async () => {
    await logNarratorUsage({
      label: 'narrateResolution', model: 'claude-sonnet-4-5-20250929', elapsedMs: 2400, sessionId: 's1',
      usage: { input_tokens: 6000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 300 },
    });
    await logNarratorUsage({
      label: 'narratePacedInput', model: 'claude-sonnet-4-5-20250929', elapsedMs: 1800, sessionId: 's1',
      usage: { input_tokens: 2000, cache_read_input_tokens: 6000, cache_creation_input_tokens: 0, output_tokens: 250 },
    });

    expect(usageEntries()).toMatchObject([
      { label: 'narrateResolution', inputTokens: 6000, cacheReadTokens: 0, outputTokens: 300, elapsedMs: 2400, sessionId: 's1' },
      { label: 'narratePacedInput', inputTokens: 2000, cacheReadTokens: 6000, outputTokens: 250, elapsedMs: 1800 },
    ]);
    // 6000 of 14000 prompt tokens came from the cache.
    expect(usagePage().content).toContain('2 calls: 43% of prompt tokens read from the cache; median 2400 ms per call.');
  });

  it('records a call whose response carried no usage, with blank counts', async () => {
    await logNarratorUsage({ label: 'interrogateScene', model: 'm', usage: null, elapsedMs: 900 });
    expect(usageEntries()).toMatchObject([{ label: 'interrogateScene', inputTokens: null, outputTokens: null, elapsedMs: 900 }]);
  });

  it('writes nothing off a GM client', async () => {
    const user = game.user;
    game.user = { ...user, isGM: false };
    try {
      await logNarratorUsage({ label: 'x', model: 'm', usage: {}, elapsedMs: 1 });
    } finally {
      game.user = user;
    }
    expect(usagePage()).toBeNull();
  });
});

describe('every narrator call logs its usage', () => {
  it('a rolling-summary regen is logged under its function, with the response\'s usage', async () => {
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-stub');
    game.messages = { contents: [1, 2, 3, 4, 5, 6].map(i => ({
      flags: { [MODULE_ID]: { narratorCard: true, sessionId: 'sess-1', narrationText: `Beat ${i}.` } },
    })) };
    const savedFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => ({
      ok: true, status: 200, text: async () => '',
      json: async () => ({
        content: [{ type: 'text', text: 'The crew chased the signal.' }],
        usage:   { input_tokens: 420, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 60 },
      }),
    }));
    try {
      await getRollingSessionSummary({ currentSessionId: 'sess-1' }, { forceRefresh: true });
      await vi.waitFor(() => expect(usageEntries()).toHaveLength(1));
      expect(usageEntries()[0]).toMatchObject({
        label: 'getRollingSessionSummary', model: 'claude-haiku-4-5-20251001', inputTokens: 420, outputTokens: 60,
      });
      expect(usageEntries()[0].elapsedMs).toBeGreaterThanOrEqual(0);
    } finally {
      globalThis.fetch = savedFetch;
      game.settings._store.delete(`${MODULE_ID}.claudeApiKey`);
      game.messages = { contents: [] };
    }
  });
});
