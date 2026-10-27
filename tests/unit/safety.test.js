/**
 * STARFORGED COMPANION
 * tests/unit/safety.test.js
 *
 * Dedicated units for src/context/safety.js (2026-07 test-suite review).
 * This module's only unit coverage previously lived in assembler.test.js,
 * which was deleted with the assembler retirement (#271) — leaving the
 * X-Card write paths at 55% branch coverage. Safety is the one surface the
 * module promises is never omitted or overridden, so it gets its own suite.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  formatSafetyContext,
  formatNarratorSafetyContext,
  suppressScene,
  clearXCard,
  playXCard,
  postXCardCard,
  resumeNarrationAfterXCard,
  bindXCardCard,
  XCARD_RESUME_ACTION,
} from "../../src/context/safety.js";

const MODULE_ID = "starforged-companion";

function campaign(overrides = {}) {
  return {
    safety: {
      lines: [],
      veils: [],
      privateLines: [],
      ...overrides,
    },
  };
}

describe("formatSafetyContext", () => {
  it("always produces the hard-ceiling header, even for an empty campaign", () => {
    for (const state of [undefined, null, {}, campaign()]) {
      const out = formatSafetyContext(state);
      expect(out).toMatch(/^SAFETY CONFIGURATION/);
      expect(out).toContain("hard ceiling");
      expect(out.length).toBeGreaterThan(0);
    }
  });

  it("renders campaign lines and veils under their headers", () => {
    const out = formatSafetyContext(campaign({
      lines: ["No harm to children"],
      veils: ["Torture happens off-screen"],
    }));
    expect(out).toMatch(/### LINES[\s\S]*- No harm to children/);
    expect(out).toMatch(/### VEILS[\s\S]*- Torture happens off-screen/);
  });

  it("omits the LINES/VEILS sections entirely when empty (no empty headers)", () => {
    const out = formatSafetyContext(campaign());
    expect(out).not.toContain("### LINES");
    expect(out).not.toContain("### VEILS");
    expect(out).not.toContain("### PRIVATE LINES");
  });

  it("merges session-level overrides and deduplicates", () => {
    const session = {
      safetyOverrides: {
        additionalLines: ["No harm to children", "No spiders"],
        additionalVeils: ["Plague detail"],
      },
    };
    const out = formatSafetyContext(
      campaign({ lines: ["No harm to children"], veils: [] }),
      session,
    );
    // deduped: the shared line appears exactly once
    expect(out.match(/No harm to children/g)).toHaveLength(1);
    expect(out).toContain("- No spiders");
    expect(out).toMatch(/### VEILS[\s\S]*- Plague detail/);
  });

  describe("private lines visibility", () => {
    const state = campaign({
      privateLines: [
        { playerId: "user-a", lines: ["No dogs harmed"] },
        { playerId: "user-b", lines: ["No body horror"] },
      ],
    });

    it("system calls (no user) see no private lines", () => {
      expect(formatSafetyContext(state, null, null)).not.toContain("PRIVATE LINES");
    });

    it("a player sees exactly their own private lines", () => {
      const out = formatSafetyContext(state, null, "user-a");
      expect(out).toContain("- No dogs harmed");
      expect(out).not.toContain("No body horror");
    });

    it("the GM sees every player's private lines", () => {
      const out = formatSafetyContext(state, null, "gm");
      expect(out).toContain("- No dogs harmed");
      expect(out).toContain("- No body horror");
    });

    it("the GM's list renders a line two players share once", () => {
      const out = formatSafetyContext(campaign({
        privateLines: [
          { playerId: "user-a", lines: ["No spiders"] },
          { playerId: "user-b", lines: ["No spiders", "No drowning"] },
        ],
      }), null, "gm");
      expect(out.match(/No spiders/g)).toHaveLength(1);
      expect(out).toContain("- No drowning");
    });
  });
});

// Shared narration (SAFETY-PRIVATE-LINES-SHARED): the narrator system prompt
// passed no user id, so it carried no Private Line at all — not even the GM's.
describe("formatNarratorSafetyContext — Private Lines in shared narration", () => {
  const state = campaign({
    lines: ["No harm to children"],
    privateLines: [
      { playerId: "test-user-player", lines: ["Stale copy of my line"] },
      { playerId: "user-b", lines: ["No body horror"] },
      { playerId: "test-user-gm", lines: ["No drowning"] },
    ],
  });

  afterEach(() => {
    game.settings._store.delete(`${MODULE_ID}.privateLines`);
  });

  it("on a GM's client carries every player's private lines", () => {
    const out = formatNarratorSafetyContext(state);
    expect(out).toContain("- No harm to children");
    expect(out).toMatch(/### PRIVATE LINES[\s\S]*- No body horror/);
    expect(out).toContain("- Stale copy of my line");
    expect(out).toContain("- No drowning");
  });

  it("on a player's client carries only that player's own lines, from their client setting", () => {
    game.settings._store.set(`${MODULE_ID}.privateLines`, ["No needles", "  "]);
    const restore = asPlayer();
    try {
      const out = formatNarratorSafetyContext(state);
      expect(out).toContain("- No harm to children");
      expect(out).toContain("- No needles");
      expect(out).not.toContain("Stale copy of my line");
      expect(out).not.toContain("No body horror");
      expect(out).not.toContain("No drowning");
    } finally {
      restore();
    }
  });

  it("on a player's client with no lines of their own renders no PRIVATE LINES section", () => {
    const restore = asPlayer();
    try {
      const out = formatNarratorSafetyContext(state);
      expect(out).not.toContain("PRIVATE LINES");
      expect(out).not.toContain("No body horror");
    } finally {
      restore();
    }
  });

  it("never mutates the caller's campaignState", () => {
    game.settings._store.set(`${MODULE_ID}.privateLines`, ["No needles"]);
    const restore = asPlayer();
    try {
      formatNarratorSafetyContext(state);
    } finally {
      restore();
    }
    expect(state.safety.privateLines).toHaveLength(3);
  });
});

describe("X-Card write paths (suppressScene / clearXCard)", () => {
  beforeEach(() => {
    game.settings._store.set(`${MODULE_ID}.campaignState`, { xCardActive: false });
  });
  afterEach(() => {
    game.settings._store.delete(`${MODULE_ID}.campaignState`);
    vi.restoreAllMocks();
  });

  it("suppressScene persists xCardActive = true", async () => {
    await expect(suppressScene()).resolves.toBe(true);
    expect(game.settings.get(MODULE_ID, "campaignState").xCardActive).toBe(true);
  });

  it("clearXCard persists xCardActive = false", async () => {
    game.settings._store.set(`${MODULE_ID}.campaignState`, { xCardActive: true });
    await expect(clearXCard()).resolves.toBe(true);
    expect(game.settings.get(MODULE_ID, "campaignState").xCardActive).toBe(false);
  });

  it("both fail open (warn, no throw, return false) when settings are unavailable", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(game.settings, "get").mockImplementation(() => { throw new Error("no settings"); });
    await expect(suppressScene()).resolves.toBe(false);
    await expect(clearXCard()).resolves.toBe(false);
    expect(warn).toHaveBeenCalledTimes(2);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// X-Card play / card / resume (B1 / B2)
// ─────────────────────────────────────────────────────────────────────────────

const GM     = { id: "gm-1", name: "Gina", isGM: true,  active: true };
const PLAYER = { id: "pl-1", name: "Pat",  isGM: false, active: true };

describe("X-Card play / resume", () => {
  let savedUsers;
  let savedUser;
  let savedMessages;

  function setUsers(users, currentUserId) {
    game.users = Object.assign([...users], {
      get: (id) => users.find(u => u.id === id) ?? null,
    });
    game.user = users.find(u => u.id === currentUserId) ?? null;
  }

  function fakeMessage(flags, id = "m1") {
    const msg = {
      id,
      flags: { [MODULE_ID]: { ...flags } },
      update: vi.fn(async (changes) => {
        for (const [path, val] of Object.entries(changes)) {
          const key = path.split(".").pop();
          msg.flags[MODULE_ID][key] = val;
        }
      }),
    };
    return msg;
  }

  function fakeRoot() {
    const listeners = {};
    const btn = {
      disabled: false,
      textContent: "Resume narration",
      removed: false,
      remove() { this.removed = true; },
      addEventListener: (ev, fn) => { listeners[ev] = fn; },
      click: () => listeners.click?.({ preventDefault() {} }),
    };
    return {
      btn,
      querySelector: (sel) => (sel === `[data-action="${XCARD_RESUME_ACTION}"]` ? btn : null),
    };
  }

  beforeEach(() => {
    savedUsers    = game.users;
    savedUser     = game.user;
    savedMessages = game.messages;
    game.settings._store.set(`${MODULE_ID}.campaignState`, { xCardActive: false });
    game.socket._reset();
    ChatMessage._reset();
  });
  afterEach(() => {
    game.users    = savedUsers;
    game.user     = savedUser;
    game.messages = savedMessages;
    game.settings._store.delete(`${MODULE_ID}.campaignState`);
    vi.restoreAllMocks();
  });

  it("postXCardCard (recorded) carries the resume button and the xcard flags", async () => {
    await postXCardCard({ recorded: true });
    const card = ChatMessage._created[0];
    expect(card.content).toContain(`data-action="${XCARD_RESUME_ACTION}"`);
    expect(card.content).toContain("Scene paused");
    expect(card.flags[MODULE_ID]).toMatchObject({ type: "xcard", xcardCard: true, xcardRecorded: true });
  });

  it("postXCardCard (not recorded) says so and offers no resume button", async () => {
    await postXCardCard({ recorded: false });
    const card = ChatMessage._created[0];
    expect(card.content).toMatch(/could not be recorded — no GM is connected/);
    expect(card.content).not.toContain(XCARD_RESUME_ACTION);
    expect(card.flags[MODULE_ID].xcardRecorded).toBe(false);
  });

  it("postXCardCard (not saved) says the pause could not be saved, with no resume button", async () => {
    await postXCardCard({ recorded: false, reason: "not-saved" });
    const card = ChatMessage._created[0];
    expect(card.content).toMatch(/The pause could not be saved/);
    expect(card.content).not.toMatch(/no GM is connected/);
    expect(card.content).not.toContain(XCARD_RESUME_ACTION);
    expect(card.flags[MODULE_ID].xcardRecorded).toBe(false);
  });

  // Issue #302: the canonical GM's own write failing used to post "Scene
  // paused … Current content is suppressed" with a resume button.
  it("playXCard on the canonical GM whose write fails says the pause was not saved", async () => {
    setUsers([GM, PLAYER], "gm-1");
    const set = vi.spyOn(game.settings, "set").mockRejectedValueOnce(new Error("refused"));
    await expect(playXCard()).resolves.toEqual({ recorded: false });
    expect(set).toHaveBeenCalledTimes(1);
    expect(game.settings.get(MODULE_ID, "campaignState").xCardActive).not.toBe(true);
    expect(ChatMessage._created[0].content).toMatch(/could not be saved/);
    expect(ChatMessage._created[0].flags[MODULE_ID].xcardRecorded).toBe(false);
  });

  it("playXCard on the canonical GM records the pause locally and posts the card", async () => {
    setUsers([GM, PLAYER], "gm-1");
    await expect(playXCard()).resolves.toEqual({ recorded: true });
    expect(game.settings.get(MODULE_ID, "campaignState").xCardActive).toBe(true);
    expect(game.socket._emitted ?? []).toHaveLength(0);
    expect(ChatMessage._created[0].flags[MODULE_ID].xcardRecorded).toBe(true);
  });

  it("playXCard from a player relays xcard.activate to the GM (no local write)", async () => {
    setUsers([GM, PLAYER], "pl-1");
    await expect(playXCard()).resolves.toEqual({ recorded: true });
    expect(game.socket._emitted).toHaveLength(1);
    expect(game.socket._emitted[0].payload).toMatchObject({
      kind: "gmRelay.xcard.activate", requesterId: "pl-1",
    });
    // The player's client never writes the world setting itself.
    expect(game.settings.get(MODULE_ID, "campaignState").xCardActive).toBe(false);
    expect(ChatMessage._created).toHaveLength(1);
  });

  it("playXCard with no GM connected posts an honest 'not recorded' card and warns", async () => {
    setUsers([PLAYER], "pl-1");
    const warn = vi.spyOn(ui.notifications, "warn");
    await expect(playXCard()).resolves.toEqual({ recorded: false });
    expect(warn).toHaveBeenCalled();
    expect(ChatMessage._created[0].content).toMatch(/could not be recorded/);
    expect(game.settings.get(MODULE_ID, "campaignState").xCardActive).toBe(false);
  });

  it("resumeNarrationAfterXCard (GM) clears the flag, resolves open cards, posts a cleared card", async () => {
    setUsers([GM], "gm-1");
    game.settings._store.set(`${MODULE_ID}.campaignState`, { xCardActive: true });
    const open     = fakeMessage({ xcardCard: true }, "a");
    const resolved = fakeMessage({ xcardCard: true, xcardResolved: true }, "b");
    const other    = fakeMessage({ narratorCard: true }, "c");
    game.messages = { contents: [open, resolved, other] };

    await expect(resumeNarrationAfterXCard()).resolves.toBe(true);
    expect(game.settings.get(MODULE_ID, "campaignState").xCardActive).toBe(false);
    expect(open.update).toHaveBeenCalledWith({ [`flags.${MODULE_ID}.xcardResolved`]: true });
    expect(resolved.update).not.toHaveBeenCalled();
    expect(other.update).not.toHaveBeenCalled();
    const card = ChatMessage._created[0];
    expect(card.flags[MODULE_ID].xcardClearedCard).toBe(true);
    expect(card.content).toContain("X-Card cleared");
  });

  it("resumeNarrationAfterXCard refuses a non-GM (flag stays set, warning shown)", async () => {
    setUsers([GM, PLAYER], "pl-1");
    game.settings._store.set(`${MODULE_ID}.campaignState`, { xCardActive: true });
    const warn = vi.spyOn(ui.notifications, "warn");
    await expect(resumeNarrationAfterXCard()).resolves.toBe(false);
    expect(warn).toHaveBeenCalled();
    expect(game.settings.get(MODULE_ID, "campaignState").xCardActive).toBe(true);
    expect(ChatMessage._created).toHaveLength(0);
  });

  it("bindXCardCard removes the resume button for players", () => {
    setUsers([GM, PLAYER], "pl-1");
    const root = fakeRoot();
    bindXCardCard(fakeMessage({ xcardCard: true }), root);
    expect(root.btn.removed).toBe(true);
  });

  it("bindXCardCard renders a resolved card's button disabled for the GM", () => {
    setUsers([GM], "gm-1");
    const root = fakeRoot();
    bindXCardCard(fakeMessage({ xcardCard: true, xcardResolved: true }), root);
    expect(root.btn.removed).toBe(false);
    expect(root.btn.disabled).toBe(true);
    expect(root.btn.textContent).toBe("Narration resumed");
  });

  it("bindXCardCard ignores non-X-Card messages", () => {
    setUsers([GM], "gm-1");
    const root = fakeRoot();
    bindXCardCard(fakeMessage({ narratorCard: true }), root);
    expect(root.btn.disabled).toBe(false);
    expect(root.btn.removed).toBe(false);
  });

  it("GM click on the resume button clears the X-Card and resolves the card", async () => {
    setUsers([GM], "gm-1");
    game.settings._store.set(`${MODULE_ID}.campaignState`, { xCardActive: true });
    const msg  = fakeMessage({ xcardCard: true });
    game.messages = { contents: [msg] };
    const root = fakeRoot();
    bindXCardCard(msg, root);
    await root.btn.click();
    expect(game.settings.get(MODULE_ID, "campaignState").xCardActive).toBe(false);
    expect(msg.flags[MODULE_ID].xcardResolved).toBe(true);
    expect(root.btn.disabled).toBe(true);
  });
});
