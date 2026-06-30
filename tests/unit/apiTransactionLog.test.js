/**
 * STARFORGED COMPANION
 * tests/unit/apiTransactionLog.test.js
 *
 * API Transaction Log — pure helpers and buffer behaviour tested with a
 * stubbed game global, mirroring the errorLog.test.js pattern.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  formatTransactionEntry,
  isEnabled,
  logApiTransaction,
  flushApiTransactionLogBuffer,
  pending,
  _reset,
  JOURNAL_NAME,
  PAGE_NAME,
} from "../../src/logging/apiTransactionLog.js";

// ── formatTransactionEntry ────────────────────────────────────────────────────

describe("formatTransactionEntry", () => {
  it("includes model, input, and output tokens", () => {
    const html = formatTransactionEntry({
      model: "claude-sonnet-4-5",
      inputTokens: 1000,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
      outputTokens: 250,
    });
    expect(html).toContain("claude-sonnet-4-5");
    expect(html).toContain("in: 1000");
    expect(html).toContain("out: 250");
    expect(html).toMatch(/^<p>\[.+\] /);
    expect(html).toMatch(/<\/p>\n$/);
  });

  it("includes cache-write and cache-read only when non-zero", () => {
    const withCache = formatTransactionEntry({
      model: "claude-haiku-4-5",
      inputTokens: 500,
      cacheWriteTokens: 2048,
      cacheReadTokens: 4096,
      outputTokens: 100,
    });
    expect(withCache).toContain("cache-write: 2048");
    expect(withCache).toContain("cache-read: 4096");

    const noCache = formatTransactionEntry({
      model: "claude-haiku-4-5",
      inputTokens: 500,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
      outputTokens: 100,
    });
    expect(noCache).not.toContain("cache-write");
    expect(noCache).not.toContain("cache-read");
  });

  it("appends round-trip latency: seconds at >=1s, ms below, omitted when absent", () => {
    const slow = formatTransactionEntry({
      model: "claude-sonnet-4-5", inputTokens: 1000, cacheWriteTokens: 0, cacheReadTokens: 0,
      outputTokens: 250, durationMs: 4200,
    });
    expect(slow).toContain("4.2s");

    const fast = formatTransactionEntry({
      model: "claude-haiku-4-5", inputTokens: 500, cacheWriteTokens: 0, cacheReadTokens: 0,
      outputTokens: 100, durationMs: 750,
    });
    expect(fast).toContain("750ms");

    const none = formatTransactionEntry({
      model: "claude-haiku-4-5", inputTokens: 500, cacheWriteTokens: 0, cacheReadTokens: 0,
      outputTokens: 100,
    });
    expect(none).toMatch(/out: 100<\/p>\n$/);   // no latency segment appended
  });
});

// ── isEnabled ────────────────────────────────────────────────────────────────

describe("isEnabled", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns true when game is not ready (pre-init default)", () => {
    expect(isEnabled()).toBe(true);
  });

  it("returns the setting value when game is available", () => {
    vi.stubGlobal("game", {
      settings: { get: vi.fn().mockReturnValue(false) },
    });
    expect(isEnabled()).toBe(false);
  });

  it("returns true when the setting throws", () => {
    vi.stubGlobal("game", {
      settings: { get: vi.fn().mockImplementation(() => { throw new Error("no setting"); }) },
    });
    expect(isEnabled()).toBe(true);
  });
});

// ── logApiTransaction + pre-ready buffer ─────────────────────────────────────

describe("logApiTransaction — pre-ready buffering", () => {
  beforeEach(() => {
    _reset();
    pending.length = 0;
  });

  afterEach(() => {
    _reset();
    vi.unstubAllGlobals();
  });

  it("buffers transactions before game.ready is true", () => {
    vi.stubGlobal("game", { ready: false, user: { isGM: true } });
    logApiTransaction({ model: "claude-sonnet-4-5", inputTokens: 100, cacheWriteTokens: 0, cacheReadTokens: 0, outputTokens: 50 });
    expect(pending.length).toBe(1);
    expect(pending[0]).toContain("claude-sonnet-4-5");
    expect(pending[0]).toContain("in: 100");
    expect(pending[0]).toContain("out: 50");
  });

  it("does NOT buffer when the setting is disabled", () => {
    vi.stubGlobal("game", {
      ready: false,
      user: { isGM: true },
      settings: { get: vi.fn().mockReturnValue(false) },
    });
    logApiTransaction({ model: "m", inputTokens: 1, cacheWriteTokens: 0, cacheReadTokens: 0, outputTokens: 1 });
    expect(pending.length).toBe(0);
  });
});

// ── flushApiTransactionLogBuffer — GM gate ────────────────────────────────────

describe("flushApiTransactionLogBuffer", () => {
  beforeEach(() => {
    _reset();
    pending.push("<p>[test] claude-sonnet-4-5 | in: 50 | out: 20</p>\n");
  });

  afterEach(() => {
    _reset();
    vi.unstubAllGlobals();
  });

  it("clears the pending buffer without writing for non-GM users", async () => {
    vi.stubGlobal("game", {
      ready: true,
      user:  { isGM: false },
    });
    await flushApiTransactionLogBuffer();
    expect(pending.length).toBe(0);
  });

  it("queues writes and drains pending for GM users (journal stub)", async () => {
    const mockUpdate  = vi.fn().mockResolvedValue({});
    const mockPage    = { id: "page-1", text: { content: "" }, update: mockUpdate };
    const mockJournal = {
      id:     "j-1",
      pages:  { get: () => mockPage, contents: [mockPage] },
      getName: () => null,
    };
    vi.stubGlobal("game", {
      ready:   true,
      user:    { isGM: true },
      journal: {
        get:     () => null,
        getName: () => mockJournal,
      },
    });
    vi.stubGlobal("JournalEntry", {
      create: vi.fn().mockResolvedValue(mockJournal),
    });

    pending.push("<p>[t2] claude-haiku-4-5 | in: 200 | out: 80</p>\n");

    await flushApiTransactionLogBuffer();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(pending.length).toBe(0);
    expect(mockUpdate).toHaveBeenCalled();
  });
});
