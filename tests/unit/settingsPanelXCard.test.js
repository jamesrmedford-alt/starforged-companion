/**
 * STARFORGED COMPANION
 * tests/unit/settingsPanelXCard.test.js
 *
 * src/ui/settingsPanel.js coverage for the 2026-10 multiplayer audit:
 *   - the typed `!x` / `!x clear` pre-creation hook (B1 / B2) — `!x` relays
 *     the pause through the GM relay instead of writing campaignState on the
 *     player's client; `!x clear` is GM-only;
 *   - the X-Card card's resume-button render binding is installed by
 *     registerSettingsHooks (B2);
 *   - the dead settings are no longer registered (B5);
 *   - the move-confirm dialog shows localised move / stat labels, escaped (B6).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  registerSettings,
  registerSettingsHooks,
  MoveConfirmDialog,
} from "../../src/ui/settingsPanel.js";
import * as settingsPanel from "../../src/ui/settingsPanel.js";
import { XCARD_RESUME_ACTION } from "../../src/context/safety.js";
import { _resetI18nWarnGuard } from "../../src/system/i18n.js";

const MODULE_ID = "starforged-companion";

const GM     = { id: "gm-1", name: "Gina", isGM: true,  active: true };
const PLAYER = { id: "pl-1", name: "Pat",  isGM: false, active: true };

// The chat-render shim unwraps `html instanceof HTMLElement ? html : html[0]`;
// node has no DOM, so provide a minimal HTMLElement for the duration.
class HTMLElementStub {}

let savedUsers;
let savedUser;

function setUsers(users, currentUserId) {
  game.users = Object.assign([...users], {
    get: (id) => users.find(u => u.id === id) ?? null,
  });
  game.user = users.find(u => u.id === currentUserId) ?? null;
}

function lastHandler(event) {
  const list = Hooks._handlers.get(event) ?? [];
  return list[list.length - 1];
}

beforeEach(() => {
  globalThis.HTMLElement = HTMLElementStub;
  savedUsers = game.users;
  savedUser  = game.user;
  Hooks._handlers.clear();
  game.socket._reset();
  ChatMessage._reset();
  game.settings._store.set(`${MODULE_ID}.campaignState`, { xCardActive: false });
});

afterEach(() => {
  delete globalThis.HTMLElement;
  game.users = savedUsers;
  game.user  = savedUser;
  game.settings._store.delete(`${MODULE_ID}.campaignState`);
});

// ─────────────────────────────────────────────────────────────────────────────

describe("X-Card chat hook (registerSettingsHooks)", () => {
  function installAs(userId) {
    setUsers([GM, PLAYER], userId);
    registerSettingsHooks();
    return lastHandler("chatMessage");
  }

  it("player `!x` is consumed, relays xcard.activate, and posts a recorded card", async () => {
    const hook = installAs("pl-1");
    expect(hook(null, "  !X  ", {})).toBe(false);
    await vi.waitFor(() => expect(ChatMessage._created).toHaveLength(1));
    // registerSettingsHooks also relays this player's Private Lines to the GM
    // on load (safety.syncPrivateLines) — count only the X-Card relay here.
    const xcardRelays = game.socket._emitted.filter(e => e.payload.kind === "gmRelay.xcard.activate");
    expect(xcardRelays).toHaveLength(1);
    expect(game.settings.get(MODULE_ID, "campaignState").xCardActive).toBe(false);
    expect(ChatMessage._created[0].flags[MODULE_ID]).toMatchObject({ xcardCard: true, xcardRecorded: true });
  });

  it("canonical-GM `!x` activates the X-Card locally", async () => {
    const hook = installAs("gm-1");
    expect(hook(null, "!x", {})).toBe(false);
    await vi.waitFor(() => expect(ChatMessage._created).toHaveLength(1));
    expect(game.settings.get(MODULE_ID, "campaignState").xCardActive).toBe(true);
  });

  it("keeps exact-match semantics — `!xyz` and `!x foo` pass through", () => {
    const hook = installAs("pl-1");
    expect(hook(null, "!xyz", {})).toBe(true);
    expect(hook(null, "!x foo", {})).toBe(true);
    expect(hook(null, "hello", {})).toBe(true);
    expect(game.socket._emitted ?? []).toHaveLength(0);
  });

  it("GM `!x clear` clears the X-Card and posts a cleared card", async () => {
    game.settings._store.set(`${MODULE_ID}.campaignState`, { xCardActive: true });
    game.messages = { contents: [] };
    const hook = installAs("gm-1");
    expect(hook(null, "!x clear", {})).toBe(false);
    await vi.waitFor(() => expect(ChatMessage._created).toHaveLength(1));
    expect(game.settings.get(MODULE_ID, "campaignState").xCardActive).toBe(false);
    expect(ChatMessage._created[0].flags[MODULE_ID].xcardClearedCard).toBe(true);
    delete game.messages;
  });

  it("player `!x clear` is consumed but refused with a warning", async () => {
    game.settings._store.set(`${MODULE_ID}.campaignState`, { xCardActive: true });
    const warn = vi.spyOn(ui.notifications, "warn");
    const hook = installAs("pl-1");
    expect(hook(null, "!x clear", {})).toBe(false);
    await vi.waitFor(() => expect(warn).toHaveBeenCalled());
    expect(game.settings.get(MODULE_ID, "campaignState").xCardActive).toBe(true);
    expect(ChatMessage._created).toHaveLength(0);
  });

  it("installs the X-Card card render binding (resume button removed for players)", () => {
    installAs("pl-1");
    const render = lastHandler("renderChatMessageHTML");
    expect(typeof render).toBe("function");

    const btn  = { removed: false, remove() { this.removed = true; } };
    const root = Object.assign(Object.create(HTMLElementStub.prototype), {
      querySelector: (sel) => (sel === `[data-action="${XCARD_RESUME_ACTION}"]` ? btn : null),
    });
    render({ flags: { [MODULE_ID]: { xcardCard: true } } }, root);
    expect(btn.removed).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("dead settings removed (B5)", () => {
  it("registerSettings no longer registers the five dead keys", () => {
    const keys = [];
    const spy = vi.spyOn(game.settings, "register").mockImplementation((_mod, key) => { keys.push(key); });
    game.settings.registerMenu ??= () => {};
    registerSettings();
    spy.mockRestore();
    expect(keys.length).toBeGreaterThan(10);
    for (const dead of [
      "worldJournalEnabled",
      "worldJournalAutoDetect",
      "characterContextEnabled",
      "chronicleContextCount",
      "activeCharacterId",
    ]) {
      expect(keys).not.toContain(dead);
    }
  });

  it("getSafetyConfig is no longer exported", () => {
    expect(settingsPanel.getSafetyConfig).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("MoveConfirmDialog — localised labels (B6)", () => {
  beforeEach(() => {
    _resetI18nWarnGuard();
    globalThis.document = {
      createElement: () => ({
        innerHTML: "",
        get firstElementChild() { return { html: this.innerHTML }; },
      }),
    };
  });
  afterEach(() => { delete globalThis.document; });

  async function render(context) {
    const dialog = new MoveConfirmDialog();
    const out = await dialog._renderHTML({
      rationale: "",
      mischiefApplied: false,
      mischiefAside: "",
      applicableAbilities: [],
      dialLabel: "Balanced",
      ...context,
    });
    return out.html;
  }

  it("shows the localised move title and stat instead of raw slugs", async () => {
    const html = await render({ moveId: "face_danger", statUsed: "wits" });
    expect(html).toContain(">Face Danger<");
    expect(html).toContain(">Wits<");
    expect(html).not.toContain(">face_danger<");
    expect(html).toContain('data-move-id="face_danger"');
  });

  it("localises meter stats and humanises other slugs", async () => {
    expect(await render({ moveId: "check_your_gear", statUsed: "supply" })).toContain(">Supply<");
    expect(await render({ moveId: "repair", statUsed: "companion_health" })).toContain(">Companion Health<");
  });

  it("passes the '—' placeholder through untouched", async () => {
    const html = await render({ moveId: "—", statUsed: "—" });
    expect(html).toMatch(/confirm-move-id"[^>]*>—</);
  });

  it("escapes interpolated model text", async () => {
    const html = await render({
      moveId: "face_danger",
      statUsed: "wits",
      rationale: "<img src=x onerror=alert(1)>",
      mischiefApplied: true,
      mischiefAside: "<b>sly</b>",
    });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
    expect(html).toContain("&lt;b&gt;sly&lt;/b&gt;");
  });
});
