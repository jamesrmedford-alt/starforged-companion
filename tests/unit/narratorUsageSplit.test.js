/**
 * STARFORGED COMPANION
 * tests/unit/narratorUsageSplit.test.js
 *
 * Issue #354 P2-24 — gaps in the usage logs (the alpha 23 playtest, part 2).
 *
 *   - Narration output grew over the session (551 → 919 tokens) and nothing
 *     said whether the prose or the fact block had grown: each Narrator Usage
 *     row now records how its reply split, and shows the output tokens for
 *     each.
 *   - The usage table's Time column had no date, so rows from the evening
 *     before read as out of order under the newer session's.
 *   - The API Log named each call's model and nothing else, so the ability
 *     scanner's call could not be told from the classifier's: every call site
 *     now passes a label, and the entry shows it.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { logNarratorUsage } from '../../src/pacing/telemetry.js';
import { interrogateScene } from '../../src/narration/narrator.js';
import { formatTransactionEntry } from '../../src/logging/apiTransactionLog.js';
import { productionSources } from '../helpers/sourceScan.js';

const MODULE_ID = 'starforged-companion';

let journal;
let savedJournal;
let savedJournalEntry;
let savedFetch;

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
const cells = (row) => [...row.matchAll(/<td>(.*?)<\/td>/g)].map(m => m[1]);
const rows = () => [...usagePage().content.matchAll(/<tr><td>.*?<\/tr>/g)].map(m => cells(m[0]));

beforeEach(() => {
  journal = makeJournal();
  savedJournal = game.journal;
  savedJournalEntry = globalThis.JournalEntry;
  savedFetch = globalThis.fetch;
  game.journal = { getName: (name) => (name === journal.name ? journal : null), find: () => null };
  globalThis.JournalEntry = { create: async () => journal };
});

afterEach(() => {
  game.journal = savedJournal;
  globalThis.JournalEntry = savedJournalEntry;
  globalThis.fetch = savedFetch;
  vi.restoreAllMocks();
});

describe('P2-24 — a usage row says how its reply split between prose and the fact block', () => {
  it('the output tokens are divided by each part\'s share of the reply', async () => {
    await logNarratorUsage({
      label: 'narrateResolution', model: 'claude-sonnet-5-5', elapsedMs: 5900, sessionId: 's1',
      usage: { input_tokens: 900, cache_read_input_tokens: 3600, cache_creation_input_tokens: 0, output_tokens: 800 },
      proseChars: 600, sidecarChars: 1800,
    });
    expect(usageEntries()).toMatchObject([{ outputTokens: 800, proseChars: 600, sidecarChars: 1800 }]);
    const [row] = rows();
    // Date and time · Call · Model · Input · Cache read · Cache write · Output · Prose · Fact block · ms
    expect(row.slice(1)).toEqual(['narrateResolution', 'claude-sonnet-5-5', '900', '3600', '0', '800', '200', '600', '5900']);
    expect(usagePage().content).toContain('<th>Prose</th><th>Fact block</th>');
  });

  it('a record without the counts (one from before they were kept) shows a dash, not a guess', async () => {
    await logNarratorUsage({
      label: 'narratePacedInput', model: 'm', elapsedMs: 10,
      usage: { input_tokens: 10, output_tokens: 300 },
    });
    const [row] = rows();
    expect(row.slice(6, 9)).toEqual(['300', '—', '—']);
  });

  it('a narration records its own split: the prose, and the fenced fact block it ended on', async () => {
    const prose   = 'Ozone and old grease.';
    const sidecar = '```json\n{"newTruths":[{"subject":"bridge","fact":"smells of ozone"}],"stateChanges":[]}\n```';
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-stub');
    game.settings._store.set(`${MODULE_ID}.campaignState`, { currentSessionId: 's1', sessionNumber: 1, currentSceneId: 'sc-1' });
    game.messages = { contents: [] };
    globalThis.fetch = vi.fn(async () => ({
      ok: true, status: 200, text: async () => '',
      json: async () => ({
        content: [{ type: 'text', text: `${prose}\n${sidecar}` }],
        usage:   { input_tokens: 700, cache_read_input_tokens: 2800, cache_creation_input_tokens: 0, output_tokens: 120 },
        stop_reason: 'end_turn',
      }),
    }));
    try {
      await interrogateScene('what does the bridge smell like?', game.settings.get(MODULE_ID, 'campaignState'));
      await vi.waitFor(() => expect(usageEntries().some(e => e.label === 'interrogateScene')).toBe(true));
      const entry = usageEntries().find(e => e.label === 'interrogateScene');
      expect(entry.proseChars).toBe(prose.length);
      expect(entry.sidecarChars).toBe(sidecar.length + 1);   // the line break before the fence
      expect(entry).toMatchObject({ outputTokens: 120, cacheReadTokens: 2800 });
    } finally {
      game.settings._store.delete(`${MODULE_ID}.claudeApiKey`);
      game.settings._store.delete(`${MODULE_ID}.campaignState`);
    }
  });
});

describe('P2-24 — the usage table says which day', () => {
  it('each row leads with its date and time, newest first', async () => {
    const spy = vi.spyOn(Date.prototype, 'toISOString');
    spy.mockReturnValueOnce('2026-11-12T21:09:00.000Z').mockReturnValueOnce('2026-11-13T20:46:00.000Z');
    await logNarratorUsage({ label: 'earlier', model: 'm', elapsedMs: 1, usage: { input_tokens: 1, output_tokens: 1 } });
    await logNarratorUsage({ label: 'later',   model: 'm', elapsedMs: 1, usage: { input_tokens: 1, output_tokens: 1 } });
    spy.mockRestore();

    expect(usagePage().content).toContain('<th>Date and time</th>');
    const [first, second] = rows();
    expect([first[1], second[1]]).toEqual(['later', 'earlier']);
    expect(first[0]).toBe(new Date('2026-11-13T20:46:00.000Z').toLocaleString());
    expect(second[0]).toBe(new Date('2026-11-12T21:09:00.000Z').toLocaleString());
    // The two rows are a day apart, and the cells say so.
    expect(first[0]).not.toBe(new Date('2026-11-13T20:46:00.000Z').toLocaleTimeString());
    expect(first[0]).not.toBe(second[0]);
  });
});

describe('P2-24 — an API Log entry names what made the call', () => {
  const ENTRY = { model: 'claude-haiku-5-5', inputTokens: 500, cacheWriteTokens: 0, cacheReadTokens: 0, outputTokens: 90 };

  it('the label follows the model', () => {
    const html = formatTransactionEntry({ ...ENTRY, label: 'abilityScanner' });
    expect(html).toMatch(/\] claude-haiku-5-5 · abilityScanner \| in: 500 \| out: 90<\/p>\n$/);
    expect(formatTransactionEntry({ ...ENTRY, label: 'pacingClassifier' })).toContain('claude-haiku-5-5 · pacingClassifier |');
    expect(formatTransactionEntry({ ...ENTRY, label: 'narrator:narrateResolution' })).toContain('· narrator:narrateResolution |');
  });

  it('an entry with no label reads as it did', () => {
    expect(formatTransactionEntry(ENTRY)).toMatch(/\] claude-haiku-5-5 \| in: 500 \| out: 90<\/p>\n$/);
    expect(formatTransactionEntry({ ...ENTRY, label: '   ' })).toMatch(/\] claude-haiku-5-5 \| in: 500/);
  });

  it('a label is page text, never markup', () => {
    const html = formatTransactionEntry({ ...ENTRY, label: '<img src=x onerror=alert(1)>' });
    expect(html).not.toMatch(/<img/);
    expect(html).not.toContain('onerror=');
  });

  it('apiPost hands its label to the log', async () => {
    const log = await import('../../src/logging/apiTransactionLog.js');
    log._reset();
    const savedReady = game.ready;
    game.ready = false;   // before ready an entry is buffered: read it there
    globalThis.fetch = vi.fn(async () => ({
      ok: true, status: 200, text: async () => '',
      json: async () => ({ content: [{ type: 'text', text: '{}' }], usage: { input_tokens: 12, output_tokens: 3 } }),
    }));
    try {
      const { apiPost } = await import('../../src/api-proxy.js');
      await apiPost('https://api.anthropic.com/v1/messages', { 'x-api-key': 'sk-ant-stub' }, { model: 'claude-haiku-5-5', messages: [] }, { label: 'abilityScanner' });
      await apiPost('https://api.anthropic.com/v1/messages', { 'x-api-key': 'sk-ant-stub' }, { model: 'claude-haiku-5-5', messages: [] });
      expect(log.pending).toHaveLength(2);
      expect(log.pending[0]).toContain('claude-haiku-5-5 · abilityScanner | in: 12 | out: 3');
      expect(log.pending[1]).toMatch(/claude-haiku-5-5 \| in: 12/);
    } finally {
      game.ready = savedReady;
      log._reset();
    }
  });

  // A new call site with no label is the bug again: its entry is a bare model name.
  it('every Claude call in src/ passes a label', () => {
    const unlabelled = [];
    let calls = 0;
    for (const { file, code } of productionSources()) {
      if (file === 'src/api-proxy.js') continue;
      for (const m of code.matchAll(/\bapiPost\(/g)) {
        // The call's arguments: to the parenthesis that closes it.
        let depth = 0, end = m.index + m[0].length - 1;
        for (let i = end; i < code.length; i += 1) {
          if (code[i] === '(') depth += 1;
          else if (code[i] === ')') { depth -= 1; if (!depth) { end = i; break; } }
        }
        const call = code.slice(m.index, end + 1);
        calls += 1;
        if (!/\blabel\s*:/.test(call)) unlabelled.push(`${file}: ${call.slice(0, 60).replace(/\s+/g, ' ')}…`);
      }
    }
    expect(calls).toBeGreaterThanOrEqual(19);   // control: the scan found the call sites
    expect(unlabelled).toEqual([]);
  });
});
