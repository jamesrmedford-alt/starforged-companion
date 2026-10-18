/**
 * STARFORGED COMPANION
 * tests/unit/privateLinesGmPull.test.js
 *
 * Review findings #1 / #11 / #17 — a player's Private Lines re-send used to
 * fire on `userConnected` for a GM, which happens at the START of the GM's
 * page load, before the GM's `ready` hook installs the relay listener; the
 * relay reached no handler and was dropped. The GM now pulls instead: once
 * its listener is installed it broadcasts relay-ready (gmRelay
 * announceGmRelayReady), and every player answers with its lines through
 * onGmRelayReady. The on-load relay (player ready, GM already connected) is
 * kept.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registerSettingsHooks } from "../../src/ui/settingsPanel.js";
import {
  GM_RELAY_SOCKET,
  GM_RELAY_READY_KIND,
  _resetGmRelayForTests,
} from "../../src/multiplayer/gmRelay.js";

const MODULE_ID = "starforged-companion";

const GM     = { id: "gm-1", name: "Gina", isGM: true,  active: true };
const PLAYER = { id: "pl-1", name: "Pat",  isGM: false, active: true };

let savedUsers;
let savedUser;

function setUsers(users, currentUserId) {
  game.users = Object.assign([...users], {
    get: (id) => users.find(u => u.id === id) ?? null,
  });
  game.user = users.find(u => u.id === currentUserId) ?? null;
}

function linesRelays() {
  return (game.socket._emitted ?? []).filter(e => e.payload?.kind === "gmRelay.safety.syncPrivateLines");
}

function broadcastGmReady() {
  for (const fn of game.socket._handlers.get(GM_RELAY_SOCKET) ?? []) fn({ kind: GM_RELAY_READY_KIND });
}

beforeEach(() => {
  savedUsers = game.users;
  savedUser  = game.user;
  Hooks._handlers.clear();
  game.socket._reset();
  _resetGmRelayForTests();
  game.settings._store.set(`${MODULE_ID}.campaignState`, { safety: { lines: [], veils: [], privateLines: [] } });
  game.settings._store.set(`${MODULE_ID}.privateLines`, ["spiders"]);
});

afterEach(() => {
  game.users = savedUsers;
  game.user  = savedUser;
  game.settings._store.delete(`${MODULE_ID}.campaignState`);
  game.settings._store.delete(`${MODULE_ID}.privateLines`);
});

describe("Private Lines — GM pull on relay-ready", () => {
  it("no longer re-sends on userConnected (that fires before the GM's listener exists)", () => {
    setUsers([GM, PLAYER], "pl-1");
    registerSettingsHooks();
    expect(Hooks._handlers.get("userConnected")).toBeUndefined();
  });

  it("player answers the canonical GM's relay-ready broadcast with its lines", async () => {
    // Player loads before any GM: the on-load sync defers (no relay).
    setUsers([{ ...GM, active: false }, PLAYER], "pl-1");
    registerSettingsHooks();
    await vi.waitFor(() => expect(game.socket._handlers.get(GM_RELAY_SOCKET)?.length).toBeGreaterThan(0));
    expect(linesRelays()).toHaveLength(0);

    // The GM finishes loading and announces its relay listener.
    setUsers([GM, PLAYER], "pl-1");
    broadcastGmReady();
    await vi.waitFor(() => expect(linesRelays()).toHaveLength(1));
    expect(linesRelays()[0].payload).toMatchObject({
      payload:     { lines: ["spiders"] },
      requesterId: "pl-1",
    });
  });

  it("keeps the on-load relay when a GM is already connected", async () => {
    setUsers([GM, PLAYER], "pl-1");
    registerSettingsHooks();
    await vi.waitFor(() => expect(linesRelays()).toHaveLength(1));
  });

  it("re-sends on every relay-ready announcement (e.g. the GM reloads)", async () => {
    setUsers([GM, PLAYER], "pl-1");
    registerSettingsHooks();
    await vi.waitFor(() => expect(linesRelays()).toHaveLength(1));
    await vi.waitFor(() => expect(game.socket._handlers.get(GM_RELAY_SOCKET)?.length).toBeGreaterThan(0));
    broadcastGmReady();
    await vi.waitFor(() => expect(linesRelays()).toHaveLength(2));
  });

  it("a GM client does not register the pull (it writes its own lines directly)", async () => {
    setUsers([GM, PLAYER], "gm-1");
    registerSettingsHooks();
    await vi.waitFor(() =>
      expect(game.settings.get(MODULE_ID, "campaignState").safety.privateLines)
        .toEqual([{ playerId: "gm-1", lines: ["spiders"] }]));
    // Let any pending dynamic import settle, then confirm nothing listens for relay-ready.
    await new Promise(r => setTimeout(r, 0));
    expect(game.socket._handlers.get(GM_RELAY_SOCKET)).toBeUndefined();
    expect(linesRelays()).toHaveLength(0);
  });
});
