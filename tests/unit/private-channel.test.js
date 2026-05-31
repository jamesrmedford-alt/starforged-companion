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

const MODULE_ID = "starforged-companion";

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
