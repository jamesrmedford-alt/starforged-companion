/**
 * STARFORGED COMPANION
 * tests/unit/errorLog.test.js
 *
 * Persistent Error Log — console interceptor and journal write path.
 * Pure functions (matchesModule, formatEntry) are tested directly.
 * The capture/buffer flow is tested with a stubbed game global.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// isCanonicalGM gates the GM-side relay-write handler; control it per test.
vi.mock("../../src/multiplayer/gmGate.js", () => ({ isCanonicalGM: vi.fn(() => true) }));

import {
  matchesModule,
  formatEntry,
  attributeHtml,
  installConsoleInterceptor,
  flushErrorLogBuffer,
  registerErrorLogSocket,
  pending,
  _reset,
  JOURNAL_NAME,
  PAGE_NAME,
} from "../../src/logging/errorLog.js";
import { isCanonicalGM } from "../../src/multiplayer/gmGate.js";

// ── matchesModule ─────────────────────────────────────────────────────────────

describe("matchesModule", () => {
  it("returns true for module-prefixed strings", () => {
    expect(matchesModule(["starforged-companion | some warning", "extra"])).toBe(true);
    expect(matchesModule(["starforged-companion: detection failed"])).toBe(true);
  });

  it("returns false when first arg does not start with the module prefix", () => {
    expect(matchesModule(["foundry | something"])).toBe(false);
    expect(matchesModule(["Starforged-Companion | case sensitive"])).toBe(false);
  });

  it("returns false for empty args or non-string first arg", () => {
    expect(matchesModule([])).toBe(false);
    expect(matchesModule([42])).toBe(false);
    expect(matchesModule([null])).toBe(false);
  });
});

// ── formatEntry ───────────────────────────────────────────────────────────────

describe("formatEntry", () => {
  it("includes the level and the message text", () => {
    const html = formatEntry("WARN", ["starforged-companion | network blip"]);
    expect(html).toContain("WARN:");
    expect(html).toContain("starforged-companion | network blip");
    expect(html).toMatch(/^<p>\[.+\] WARN: /);
    expect(html).toMatch(/<\/p>\n$/);
  });

  it("escapes HTML characters in the message", () => {
    const html = formatEntry("ERROR", ["starforged-companion | <script>alert(1)</script>"]);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("serialises Error objects and converts stack newlines to <br>", () => {
    const err = new Error("boom");
    err.stack = "Error: boom\n  at fn (file.js:1:1)";
    const html = formatEntry("ERROR", ["starforged-companion | failed:", err]);
    expect(html).toContain("boom");
    // Newlines within the message become <br> so the journal renders them.
    expect(html).toContain("Error: boom<br>");
    // No bare newlines inside the <p> content itself (trailing </p>\n is OK).
    const inner = html.replace(/<\/p>\n$/, "");
    expect(inner).not.toContain("\n");
  });

  it("JSON-serialises plain objects", () => {
    const html = formatEntry("WARN", ["starforged-companion | data:", { code: 429 }]);
    expect(html).toContain('{"code":429}');
  });
});

// ── Capture / pre-ready buffer ────────────────────────────────────────────────

describe("installConsoleInterceptor + pre-ready buffer", () => {
  let origWarn, origError;

  beforeEach(() => {
    origWarn  = console.warn;
    origError = console.error;
    _reset(origWarn, origError);
    pending.length = 0;
  });

  afterEach(() => {
    _reset(origWarn, origError);
  });

  it("buffers module-prefixed errors before game.ready is true", () => {
    expectConsoleError(/starforged-companion/);
    vi.stubGlobal("game", { ready: false });
    installConsoleInterceptor();
    console.error("starforged-companion | detection API failed:", new Error("timeout"));
    expect(pending.length).toBe(1);
    expect(pending[0]).toContain("ERROR");
    expect(pending[0]).toContain("detection API failed");
    vi.unstubAllGlobals();
  });

  it("does NOT buffer errors from other modules", () => {
    vi.stubGlobal("game", { ready: false });
    installConsoleInterceptor();
    console.warn("some-other-module | something went wrong");
    expect(pending.length).toBe(0);
    vi.unstubAllGlobals();
  });

  it("is idempotent — calling install twice doesn't double-buffer", () => {
    vi.stubGlobal("game", { ready: false });
    installConsoleInterceptor();
    installConsoleInterceptor(); // second call must be a no-op
    console.warn("starforged-companion | once");
    expect(pending.length).toBe(1);
    vi.unstubAllGlobals();
  });
});

// ── flushErrorLogBuffer — GM gate ─────────────────────────────────────────────

describe("flushErrorLogBuffer", () => {
  let origWarn, origError;

  beforeEach(() => {
    origWarn  = console.warn;
    origError = console.error;
    _reset(origWarn, origError);
    pending.push("<p>[test] WARN: buffered entry</p>\n");
  });

  afterEach(() => {
    _reset(origWarn, origError);
    vi.unstubAllGlobals();
  });

  it("clears the pending buffer without writing for non-GM users", async () => {
    vi.stubGlobal("game", {
      ready: true,
      user:  { isGM: false },
    });
    await flushErrorLogBuffer();
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
    pending.push("<p>[t2] ERROR: second</p>\n");

    await flushErrorLogBuffer();
    // Drain the write queue — give microtasks time to settle.
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(pending.length).toBe(0);
    // At least one journal page write should have been called.
    expect(mockUpdate).toHaveBeenCalled();
  });
});

// ── attributeHtml ─────────────────────────────────────────────────────────────

describe("attributeHtml", () => {
  it("injects the client name after the timestamp", () => {
    const out = attributeHtml("<p>[6/28] ERROR: boom</p>\n", "Kish");
    expect(out).toBe("<p>[6/28] (Kish) ERROR: boom</p>\n");
  });
  it("returns html unchanged when no user is given", () => {
    expect(attributeHtml("<p>[6/28] ERROR: boom</p>\n")).toBe("<p>[6/28] ERROR: boom</p>\n");
  });
  it("strips angle-bracket characters from the injected name", () => {
    expect(attributeHtml("<p>[t] WARN: x</p>\n", "<b>")).toBe("<p>[t] (b) WARN: x</p>\n");
  });
});

// ── Non-GM relay (all errors reach the log regardless of client) ──────────────

describe("non-GM client relays errors to the GM", () => {
  let origWarn, origError, emit;
  beforeEach(() => {
    origWarn = console.warn; origError = console.error;
    _reset(origWarn, origError);
    pending.length = 0;
    emit = vi.fn();
  });
  afterEach(() => { _reset(origWarn, origError); vi.unstubAllGlobals(); });

  it("relays a post-ready error over the socket instead of dropping it", () => {
    expectConsoleError(/starforged-companion/);
    vi.stubGlobal("game", {
      ready: true,
      user:  { isGM: false, name: "Kish" },
      socket: { emit },
    });
    installConsoleInterceptor();
    console.error("starforged-companion | audio playback failed:", new Error("nope"));
    expect(emit).toHaveBeenCalledTimes(1);
    const [event, payload] = emit.mock.calls[0];
    expect(event).toBe("module.starforged-companion");
    expect(payload).toMatchObject({ kind: "errorLog.append", user: "Kish" });
    expect(payload.html).toContain("audio playback failed");
  });

  it("relays the pre-ready buffer at flush instead of discarding it", async () => {
    vi.stubGlobal("game", { ready: true, user: { isGM: false, name: "Kish" }, socket: { emit } });
    pending.push("<p>[t] ERROR: buffered</p>\n");
    await flushErrorLogBuffer();
    expect(pending.length).toBe(0);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0][1]).toMatchObject({ kind: "errorLog.append" });
  });
});

// ── GM-side relay handler writes attributed entries ───────────────────────────

describe("registerErrorLogSocket — GM writes relayed entries", () => {
  let origWarn, origError, handler, mockUpdate;
  beforeEach(() => {
    origWarn = console.warn; origError = console.error;
    _reset(origWarn, origError);
    vi.mocked(isCanonicalGM).mockReturnValue(true);
    mockUpdate = vi.fn().mockResolvedValue({});
    const mockPage = { id: "p1", text: { content: "" }, update: mockUpdate };
    const mockJournal = { id: "j1", pages: { get: () => mockPage, contents: [mockPage] }, getName: () => null };
    vi.stubGlobal("game", {
      ready: true,
      user: { isGM: true },
      journal: { get: () => null, getName: () => mockJournal },
      socket: { on: (_evt, fn) => { handler = fn; } },
    });
    vi.stubGlobal("JournalEntry", { create: vi.fn().mockResolvedValue(mockJournal) });
  });
  afterEach(() => { _reset(origWarn, origError); vi.unstubAllGlobals(); });

  it("writes a relayed entry (attributed) when canonical GM", async () => {
    registerErrorLogSocket();
    await handler({ kind: "errorLog.append", user: "Kish", html: "<p>[t] ERROR: relayed</p>\n" });
    await new Promise(r => setTimeout(r, 0));
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockUpdate.mock.calls.at(-1)[0]["text.content"]).toContain("(Kish)");
  });

  it("ignores relayed entries when not the canonical GM", async () => {
    vi.mocked(isCanonicalGM).mockReturnValue(false);
    registerErrorLogSocket();
    await handler({ kind: "errorLog.append", user: "Kish", html: "<p>[t] ERROR: x</p>\n" });
    await new Promise(r => setTimeout(r, 0));
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("ignores non-errorLog socket payloads", async () => {
    registerErrorLogSocket();
    await handler({ kind: "audio.cache.write", hash: "x" });
    await new Promise(r => setTimeout(r, 0));
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
