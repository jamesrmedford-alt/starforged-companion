// tests/unit/private-channel.test.js
// Coverage for src/private-channel/* — slice 1 (persistence layer).
// Self-contained Foundry journal/users mock installed per-test, mirroring
// tests/unit/worldJournal.test.js.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  renderTurnsHtml,
  buildOwnership,
  appendToBuffer,
  scheduleDebouncedWrite,
  flushNow,
  loadCurrentSessionTranscript,
  _resetBuffers,
} from "../../src/private-channel/transcript.js";
import { getActiveCharacter, getRecentNarrationContext } from "../../src/narration/narrator.js";
import { buildPrivateContext } from "../../src/private-channel/context.js";
import { publishToMainChat } from "../../src/private-channel/publish.js";
import { requestPrivateNarration } from "../../src/private-channel/narrate.js";
import { PrivateChannelApp, CHANNEL_MODE } from "../../src/private-channel/app.js";
import { openPrivateChannel, isPrivateChannelEnabled } from "../../src/private-channel/index.js";
import { apiPost } from "../../src/api-proxy.js";

const MODULE_ID = "starforged-companion";

// Mocks for the context/publish slice. The transcript tests above don't import
// these modules, so these mocks are inert for them.
vi.mock("../../src/context/safety.js", () => ({
  formatSafetyContext: vi.fn(() => "## SAFETY CONFIGURATION\n\n(safety rules)"),
}));
vi.mock("../../src/system/campaignTruths.js", () => ({
  buildCampaignTruthsBlock: vi.fn(async () => "## WORLD TRUTHS\n\n(14 truths verbatim)"),
}));
vi.mock("../../src/narration/narrator.js", () => ({
  getActiveCharacter:        vi.fn(),
  getRecentNarrationContext: vi.fn(() => ""),
}));
vi.mock("../../src/api-proxy.js", () => ({ apiPost: vi.fn() }));

// ── in-memory Foundry doubles ───────────────────────────────────────────────

function makePage(doc) {
  const page = {
    id:    `page-${doc.name}-${Math.random().toString(36).slice(2, 8)}`,
    name:  doc.name,
    type:  doc.type ?? "text",
    text:  doc.text ?? { format: 1, content: "" },
    flags: JSON.parse(JSON.stringify(doc.flags ?? {})),
    setFlag: async (m, k, v) => { page.flags[m] = page.flags[m] ?? {}; page.flags[m][k] = v; },
    getFlag: (m, k) => page.flags?.[m]?.[k],
    update:  async (data) => Object.assign(page, data),
  };
  return page;
}

function makeJournal(data) {
  const pages = [];
  const journal = {
    id:    `journal-${data.name}`,
    name:  data.name,
    folder: data.folder ?? null,
    ownership: data.ownership ?? {},
    flags: JSON.parse(JSON.stringify(data.flags ?? {})),
    pages: { get contents() { return pages; }, find: (fn) => pages.find(fn) },
    createEmbeddedDocuments: async (_type, docs) => {
      const created = docs.map(makePage);
      pages.push(...created);
      return created;
    },
  };
  return journal;
}

let _journals, _users, _saved;

beforeEach(() => {
  _resetBuffers();
  _journals = new Map();
  _users = new Map([
    ["player-1", { id: "player-1", name: "Kira", isGM: false, active: true }],
    ["gm-1",     { id: "gm-1",     name: "GM",   isGM: true,  active: true }],
  ]);

  _saved = {
    journal: global.game.journal,
    users:   global.game.users,
    folders: global.game.folders,
    JE:      global.JournalEntry,
    Folder:  global.Folder,
  };

  global.game.journal = {
    getName: (n) => _journals.get(n) ?? null,
    find:    (fn) => [..._journals.values()].find(fn) ?? null,
  };
  global.game.users = {
    get: (id) => _users.get(id) ?? null,
    get contents() { return [..._users.values()]; },
    find: (fn) => [..._users.values()].find(fn) ?? null,
  };
  global.game.folders = { find: () => ({ id: "folder-sfc" }) };
  global.JournalEntry = {
    create: async (data) => { const j = makeJournal(data); _journals.set(data.name, j); return j; },
  };
  global.Folder = { create: async (d) => ({ id: `folder-${d.name}`, ...d }) };

  game.settings._store.clear();
  game.settings._store.set(`${MODULE_ID}.campaignState`, { currentSessionId: "ses-1" });
});

afterEach(() => {
  _resetBuffers();
  global.game.journal = _saved.journal;
  global.game.users   = _saved.users;
  global.game.folders = _saved.folders;
  global.JournalEntry = _saved.JE;
  global.Folder       = _saved.Folder;
});


describe("renderTurnsHtml", () => {
  it("renders speaker-attributed paragraphs with per-role classes", () => {
    const html = renderTurnsHtml([
      { who: "player",   name: "Kira",     text: "I keep replaying that look." },
      { who: "narrator", name: "Narrator", text: "The image stays with you." },
    ]);
    expect(html).toContain('<p class="pc-turn pc-turn-player"><strong>Kira:</strong> I keep replaying that look.</p>');
    expect(html).toContain('<p class="pc-turn pc-turn-narrator"><strong>Narrator:</strong> The image stays with you.</p>');
  });

  it("escapes HTML in both name and text", () => {
    const html = renderTurnsHtml([{ who: "player", name: "<b>x</b>", text: "1 < 2 & \"q\"" }]);
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).toContain("1 &lt; 2 &amp; &quot;q&quot;");
    expect(html).not.toContain("<b>x</b>");
  });

  it("drops empty/whitespace turns and defaults unknown roles to player", () => {
    expect(renderTurnsHtml([{ who: "player", text: "   " }])).toBe("");
    const html = renderTurnsHtml([{ who: "bogus", text: "hi" }]);
    expect(html).toContain("pc-turn-player");
  });
});


describe("buildOwnership", () => {
  it("gives the player OWNER and the connected GM OBSERVER", () => {
    const o = buildOwnership("player-1");
    expect(o.default).toBe(0);            // NONE
    expect(o["player-1"]).toBe(3);        // OWNER
    expect(o["gm-1"]).toBe(2);            // OBSERVER
  });

  it("collapses to a single OWNER when the player IS the GM", () => {
    const o = buildOwnership("gm-1");
    expect(o["gm-1"]).toBe(3);            // OWNER (not downgraded to OBSERVER)
    expect(Object.keys(o)).toEqual(["default", "gm-1"]);
  });

  it("omits the observer slot when no GM exists", () => {
    _users.delete("gm-1");
    const o = buildOwnership("player-1");
    expect(o["player-1"]).toBe(3);
    expect(Object.keys(o)).toEqual(["default", "player-1"]);
  });
});


describe("transcript write/read", () => {
  it("flushNow creates the journal + session page and writes the buffered turns", async () => {
    appendToBuffer("player-1", { who: "player",   name: "Kira", text: "Hello?" });
    appendToBuffer("player-1", { who: "narrator", name: "Narrator", text: "Yes." });
    const page = await flushNow("player-1");

    expect(page).not.toBeNull();
    const journal = _journals.get("Private Channel — Kira");
    expect(journal).toBeTruthy();
    expect(journal.ownership["player-1"]).toBe(3);     // player owns it
    expect(journal.pages.contents).toHaveLength(1);
    expect(page.text.content).toContain("Hello?");
    expect(page.text.content).toContain("Yes.");
    expect(page.getFlag(MODULE_ID, "privateChannelPage").sessionId).toBe("ses-1");
  });

  it("loadCurrentSessionTranscript reads back the written HTML", async () => {
    appendToBuffer("player-1", { who: "player", name: "Kira", text: "Remember this." });
    await flushNow("player-1");
    const html = await loadCurrentSessionTranscript("player-1", "ses-1");
    expect(html).toContain("Remember this.");
  });

  it("a second flush appends to the same session page (one page per session)", async () => {
    appendToBuffer("player-1", { who: "player", name: "Kira", text: "First." });
    await flushNow("player-1");
    appendToBuffer("player-1", { who: "player", name: "Kira", text: "Second." });
    await flushNow("player-1");

    const journal = _journals.get("Private Channel — Kira");
    expect(journal.pages.contents).toHaveLength(1);    // not a new page
    expect(journal.pages.contents[0].text.content).toContain("First.");
    expect(journal.pages.contents[0].text.content).toContain("Second.");
  });

  it("a new session writes to a separate page", async () => {
    appendToBuffer("player-1", { who: "player", name: "Kira", text: "Session one." });
    await flushNow("player-1");

    game.settings._store.set(`${MODULE_ID}.campaignState`, { currentSessionId: "ses-2" });
    appendToBuffer("player-1", { who: "player", name: "Kira", text: "Session two." });
    await flushNow("player-1");

    const journal = _journals.get("Private Channel — Kira");
    expect(journal.pages.contents).toHaveLength(2);
    expect(await loadCurrentSessionTranscript("player-1", "ses-1")).toContain("Session one.");
    expect(await loadCurrentSessionTranscript("player-1", "ses-2")).toContain("Session two.");
  });

  it("loadCurrentSessionTranscript returns '' when no journal or no matching page exists", async () => {
    expect(await loadCurrentSessionTranscript("player-1", "ses-1")).toBe("");
    appendToBuffer("player-1", { who: "player", name: "Kira", text: "x" });
    await flushNow("player-1");
    expect(await loadCurrentSessionTranscript("player-1", "ses-unknown")).toBe("");
  });
});


describe("debounced write", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("scheduleDebouncedWrite delays the write until the timer elapses", async () => {
    appendToBuffer("player-1", { who: "player", name: "Kira", text: "later" });
    scheduleDebouncedWrite("player-1", 5000);
    expect(_journals.get("Private Channel — Kira")).toBeUndefined();   // nothing written yet

    await vi.advanceTimersByTimeAsync(5000);
    expect(_journals.get("Private Channel — Kira")).toBeTruthy();
    expect(_journals.get("Private Channel — Kira").pages.contents[0].text.content).toContain("later");
  });

  it("a subsequent schedule resets the timer", async () => {
    appendToBuffer("player-1", { who: "player", name: "Kira", text: "x" });
    scheduleDebouncedWrite("player-1", 5000);
    await vi.advanceTimersByTimeAsync(3000);
    scheduleDebouncedWrite("player-1", 5000);          // reset
    await vi.advanceTimersByTimeAsync(3000);            // 6s total, but only 3s since reset
    expect(_journals.get("Private Channel — Kira")).toBeUndefined();
    await vi.advanceTimersByTimeAsync(2000);            // now 5s since reset
    expect(_journals.get("Private Channel — Kira")).toBeTruthy();
  });

  it("flushNow is a no-op when the buffer is empty", async () => {
    const page = await flushNow("player-1");
    expect(page).toBeNull();
    expect(_journals.size).toBe(0);
  });

  it("flushNow cancels a pending debounce timer", async () => {
    appendToBuffer("player-1", { who: "player", name: "Kira", text: "once" });
    scheduleDebouncedWrite("player-1", 5000);
    await flushNow("player-1");                          // immediate write, clears timer + buffer
    const pagesAfterFlush = _journals.get("Private Channel — Kira").pages.contents.length;
    await vi.advanceTimersByTimeAsync(5000);             // timer must NOT fire a second write
    expect(_journals.get("Private Channel — Kira").pages.contents.length).toBe(pagesAfterFlush);
    expect(pagesAfterFlush).toBe(1);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// buildPrivateContext (context.js) — §4 context packet, cacheable-prefix split
// ─────────────────────────────────────────────────────────────────────────────

describe("buildPrivateContext", () => {
  beforeEach(() => {
    getActiveCharacter.mockReset().mockReturnValue({
      name: "Kira", description: "A wry pilot.", meters: { health: 4, spirit: 3 }, narratorNotes: "",
    });
    getRecentNarrationContext.mockReset().mockReturnValue("The airlock cycled, slow and deliberate.");
  });

  it("assembles a cacheable system prefix: safety + role + world truths + character", async () => {
    const { system } = await buildPrivateContext({
      campaignState: { currentSessionId: "s1" }, userId: "u1", playerMessage: "hi",
    });
    expect(system).toContain("## SAFETY CONFIGURATION");
    expect(system).toContain("## ROLE");
    expect(system).toContain("private channel session");
    expect(system).toContain("WORLD TRUTHS");
    expect(system).toContain("## CHARACTER");
    expect(system).toContain("Kira");
    expect(system).toContain("Meters: health 4, spirit 3");
  });

  it("puts scene context, transcript, and player message in the volatile user block", async () => {
    const { system, user, cacheBreakpoint } = await buildPrivateContext({
      campaignState: { currentSessionId: "s1" }, userId: "u1",
      transcriptTurns: ["Kira: an earlier line"], playerMessage: "what now?",
    });
    expect(user).toContain("## CURRENT SCENE CONTEXT");
    expect(user).toContain("The airlock cycled, slow and deliberate."); // recent narration
    expect(user).toContain("## PRIVATE TRANSCRIPT THIS SESSION");
    expect(user).toContain("Kira: an earlier line");
    expect(user).toContain("## PLAYER MESSAGE");
    expect(user).toContain("what now?");
    // The volatile content must NOT be inside the cached prefix.
    expect(system).not.toContain("CURRENT SCENE CONTEXT");
    expect(cacheBreakpoint).toBe(system.length);
  });

  it("omits the transcript block when there are no prior turns", async () => {
    const { user } = await buildPrivateContext({ campaignState: {}, userId: "u1", playerMessage: "first" });
    expect(user).not.toContain("PRIVATE TRANSCRIPT");
    expect(user).toContain("## PLAYER MESSAGE");
  });

  it("throws when no active character can be resolved", async () => {
    getActiveCharacter.mockReturnValue(null);
    await expect(
      buildPrivateContext({ campaignState: {}, userId: "u1", playerMessage: "x" }),
    ).rejects.toThrow(/no active character/i);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// publishToMainChat (publish.js) — opt-in publish to main chat
// ─────────────────────────────────────────────────────────────────────────────

describe("publishToMainChat", () => {
  let createSpy;
  beforeEach(() => {
    getActiveCharacter.mockReset().mockReturnValue({ name: "Kira" });
    createSpy = vi.spyOn(global.ChatMessage, "create").mockResolvedValue({ id: "msg-1" });
  });
  afterEach(() => createSpy.mockRestore());

  it("posts a card attributed to the character with the published-reflection flag", async () => {
    await publishToMainChat({ userId: "u1", content: "I think I trust Vance now." });
    expect(createSpy).toHaveBeenCalledTimes(1);
    const arg = createSpy.mock.calls[0][0];
    expect(arg.speaker.alias).toBe("Kira");
    expect(arg.flags[MODULE_ID].kind).toBe("published-reflection");
    expect(arg.flags[MODULE_ID].publishedReflection).toBe(true);
    expect(arg.content).toContain("I think I trust Vance now.");
  });

  it("escapes HTML in the character-name attribution", async () => {
    getActiveCharacter.mockReturnValue({ name: "<b>Kira</b>" });
    await publishToMainChat({ userId: "u1", content: "hi" });
    const arg = createSpy.mock.calls[0][0];
    expect(arg.content).toContain("&lt;b&gt;Kira&lt;/b&gt;");
    expect(arg.content).not.toContain("<b>Kira</b>");
  });

  it("returns null and posts nothing for empty content", async () => {
    const r = await publishToMainChat({ userId: "u1", content: "   " });
    expect(r).toBeNull();
    expect(createSpy).not.toHaveBeenCalled();
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// requestPrivateNarration (narrate.js) — the send-flow core
// ─────────────────────────────────────────────────────────────────────────────

describe("requestPrivateNarration", () => {
  beforeEach(() => {
    apiPost.mockReset();
    getActiveCharacter.mockReset().mockReturnValue({ name: "Kira", meters: {} });
    getRecentNarrationContext.mockReset().mockReturnValue("");
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, "sk-ant-test");
  });

  it("returns the narrator text on success, using Haiku with a cached system prefix", async () => {
    apiPost.mockResolvedValue({ content: [{ type: "text", text: "The image stays with you." }] });
    const r = await requestPrivateNarration({
      campaignState: { currentSessionId: "s1" }, userId: "u1", playerMessage: "hi",
    });
    expect(r).toEqual({ ok: true, text: "The image stays with you." });
    const body = apiPost.mock.calls[0][2];
    expect(body.model).toMatch(/haiku/);
    expect(body.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(body.messages[0].role).toBe("user");
  });

  it("returns no-key (and skips the call) when the Claude key is unset", async () => {
    game.settings._store.delete(`${MODULE_ID}.claudeApiKey`);
    const r = await requestPrivateNarration({ campaignState: {}, userId: "u1", playerMessage: "hi" });
    expect(r).toEqual({ ok: false, reason: "no-key" });
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("returns no-character (and skips the call) when none resolves", async () => {
    getActiveCharacter.mockReturnValue(null);
    const r = await requestPrivateNarration({ campaignState: {}, userId: "u1", playerMessage: "hi" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("no-character");
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("returns empty when the model yields no text", async () => {
    apiPost.mockResolvedValue({ content: [{ type: "text", text: "   " }] });
    const r = await requestPrivateNarration({ campaignState: {}, userId: "u1", playerMessage: "hi" });
    expect(r.reason).toBe("empty");
  });

  it("returns error (message preserved by the caller) when the API call throws", async () => {
    apiPost.mockRejectedValue(new Error("401"));
    const r = await requestPrivateNarration({ campaignState: {}, userId: "u1", playerMessage: "hi" });
    expect(r.reason).toBe("error");
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// PrivateChannelApp.open (app.js) — per-user window lifecycle
// ─────────────────────────────────────────────────────────────────────────────

describe("PrivateChannelApp.open", () => {
  beforeEach(() => PrivateChannelApp._resetInstances());
  afterEach(() => PrivateChannelApp._resetInstances());

  it("creates a window with the given userId and mode", async () => {
    const app = await PrivateChannelApp.open({ userId: "u1", mode: CHANNEL_MODE.PRIVATE });
    expect(app.userId).toBe("u1");
    expect(app.mode).toBe("private");
    expect(PrivateChannelApp._hasInstance("u1")).toBe(true);
  });

  it("defaults mode to PRIVATE", async () => {
    const app = await PrivateChannelApp.open({ userId: "u1" });
    expect(app.mode).toBe(CHANNEL_MODE.PRIVATE);
  });

  it("returns the same instance for the same user (no duplicate window)", async () => {
    const a = await PrivateChannelApp.open({ userId: "u1" });
    const b = await PrivateChannelApp.open({ userId: "u1" });
    expect(b).toBe(a);
  });

  it("tracks separate windows per user", async () => {
    const a = await PrivateChannelApp.open({ userId: "u1" });
    const b = await PrivateChannelApp.open({ userId: "u2" });
    expect(b).not.toBe(a);
    expect(PrivateChannelApp._hasInstance("u1")).toBe(true);
    expect(PrivateChannelApp._hasInstance("u2")).toBe(true);
  });

  it("applies initialMessage when provided", async () => {
    const app = await PrivateChannelApp.open({ userId: "u1", initialMessage: "draft text" });
    expect(app.initialMessage).toBe("draft text");
  });

  it("rejects an unknown mode value", async () => {
    await expect(PrivateChannelApp.open({ userId: "u1", mode: "bogus" }))
      .rejects.toThrow(/unknown mode/i);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// private-channel index — enable gate + open wrapper (toolbar target)
// ─────────────────────────────────────────────────────────────────────────────

describe("private-channel index", () => {
  beforeEach(() => PrivateChannelApp._resetInstances());
  afterEach(() => {
    vi.restoreAllMocks();
    game.settings._store.delete(`${MODULE_ID}.privateChannel.enabled`);
  });

  it("isPrivateChannelEnabled defaults to true and respects the setting", () => {
    expect(isPrivateChannelEnabled()).toBe(true);                 // unset → enabled
    game.settings._store.set(`${MODULE_ID}.privateChannel.enabled`, false);
    expect(isPrivateChannelEnabled()).toBe(false);
  });

  it("openPrivateChannel opens the window for the calling user when enabled", () => {
    const spy = vi.spyOn(PrivateChannelApp, "open").mockReturnValue("APP");
    const r = openPrivateChannel();
    expect(spy).toHaveBeenCalledWith({ userId: game.user.id });
    expect(r).toBe("APP");
  });

  it("openPrivateChannel no-ops (null, no window) when the feature is disabled", () => {
    game.settings._store.set(`${MODULE_ID}.privateChannel.enabled`, false);
    const spy = vi.spyOn(PrivateChannelApp, "open").mockReturnValue("APP");
    const r = openPrivateChannel();
    expect(r).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});
