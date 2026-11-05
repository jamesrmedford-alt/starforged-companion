/**
 * STARFORGED COMPANION
 * tests/unit/combatBadgePlayerClick.test.js
 *
 * Issue #331 X22 (TRACKER-BADGE-PLAYER-SILENT). The module injects a position
 * badge and a range badge (both "Click to toggle…" buttons) on every client's
 * combat tracker; a player's click hit `if (!game.user.isGM) return` —
 * nothing written, nothing relayed, nothing said. Now a player's own
 * character's position badge asks the canonical GM through the Progress
 * Tracks panel's relay (progressTrack.edit op position, issue #321 U05 /
 * U19), and every badge a player may not change renders disabled with a
 * title naming who can (rules/reachability.md §8 "No silent failures").
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { StubElement, parseHTML } from "../helpers/cardDom.js";

vi.mock("../../src/ui/progressTracks.js", () => ({
  setCombatTrackPosition: vi.fn(async () => ({})),
}));
vi.mock("../../src/character/actorBridge.js", () => ({
  setCombatPosition: vi.fn(async () => {}),
  isPlayerCharacterActor: (actor) => actor?.type === "character" && !actor?.flags?.["starforged-companion"]?.entityType,
}));
vi.mock("../../src/multiplayer/gmRelay.js", async (importOriginal) => ({
  ...(await importOriginal()),
  requestGmAction: vi.fn(async () => ({ ok: true, relayed: true })),
}));

import { registerCombatTrackerHooks } from "../../src/moves/combatTracker.js";
import { setCombatPosition } from "../../src/character/actorBridge.js";
import { requestGmAction } from "../../src/multiplayer/gmRelay.js";

const MODULE_ID = "starforged-companion";
const flush  = () => new Promise(r => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 6; i++) await flush(); };

let savedHTMLElement, savedDocument, savedCombats, savedCombat, savedIsGM, warnSpy;
beforeEach(() => {
  savedHTMLElement = globalThis.HTMLElement;
  savedDocument    = globalThis.document;
  savedCombats     = game.combats;
  savedCombat      = game.combat;
  savedIsGM        = game.user.isGM;
  globalThis.HTMLElement = StubElement;
  globalThis.document = { createElement: (tag) => new StubElement(tag) };
  Hooks._handlers.delete("renderCombatTracker");
  setCombatPosition.mockClear();
  requestGmAction.mockClear();
  requestGmAction.mockImplementation(async () => ({ ok: true, relayed: true }));
  warnSpy = vi.spyOn(ui.notifications, "warn");
});
afterEach(() => {
  globalThis.HTMLElement = savedHTMLElement;
  globalThis.document    = savedDocument;
  game.combats           = savedCombats;
  game.combat            = savedCombat;
  game.user.isGM         = savedIsGM;
  warnSpy.mockRestore();
});

/** A Starforged combat for track "trk-1" with one combatant, rendered in the tracker. */
function renderTracker({ position = "none", actor = { id: "pc1", name: "Kira", type: "character", isOwner: true } } = {}) {
  const cFlags = { [MODULE_ID]: { position, range: "close" } };
  const combatant = {
    id: "cmb1", actorId: actor?.id ?? null, actor, name: actor?.name ?? "Foe",
    getFlag: (m, k) => cFlags[m]?.[k],
    setFlag: vi.fn(async (m, k, v) => { cFlags[m][k] = v; }),
  };
  const combat = {
    id: "combat1",
    getFlag: (m, k) => (m === MODULE_ID && k === "trackId" ? "trk-1" : undefined),
    combatants: [combatant],
  };
  game.combats = { find: (fn) => [combat].find(fn) ?? null };
  game.combat  = combat;
  Hooks._handlers.delete("renderCombatTracker");
  registerCombatTrackerHooks();
  const root = parseHTML(`<ol><li data-combatant-id="cmb1"><div class="combatant-controls"></div></li></ol>`);
  Hooks.call("renderCombatTracker", { viewed: combat }, root);
  return { posBadge: root.querySelector(".sf-pos-badge"), rangeBadge: root.querySelector(".sf-range-badge"), combatant };
}

describe("X22 — a player's click on a combat tracker badge", () => {
  it("their own character's position badge asks the canonical GM (progressTrack.edit op position)", async () => {
    game.user.isGM = false;
    const { posBadge, combatant } = renderTracker();
    expect(posBadge.disabled).toBe(false);
    expect(posBadge.title).toBe("Click to toggle combat position");
    posBadge.click();
    await settle();
    expect(requestGmAction).toHaveBeenCalledWith("progressTrack.edit", { op: "position", trackId: "trk-1", actorId: "pc1" });
    expect(combatant.setFlag).not.toHaveBeenCalled();   // the GM writes it
    expect(setCombatPosition).not.toHaveBeenCalled();
  });

  it("a refused request is said", async () => {
    game.user.isGM = false;
    requestGmAction.mockImplementation(async () => ({ ok: true, result: { applied: false, reason: "no-track" } }));
    const { posBadge } = renderTracker();
    posBadge.click();
    await settle();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/combat position was not changed/));
  });

  it("another character's (or a foe's) position badge is shown disabled, naming who may change it", async () => {
    game.user.isGM = false;
    const { posBadge, combatant } = renderTracker({ actor: { id: "pc2", name: "Ren", type: "character", isOwner: false } });
    expect(posBadge.disabled).toBe(true);
    expect(posBadge.title).toBe("Combat position — Ren's player or a GM can change it");
    posBadge.click();                                   // a disabled control swallows it, as in a browser
    await settle();
    expect(requestGmAction).not.toHaveBeenCalled();
    expect(combatant.setFlag).not.toHaveBeenCalled();

    const foe = renderTracker({ actor: { id: "npc1", name: "Corsair", type: "foe", isOwner: false } });
    expect(foe.posBadge.disabled).toBe(true);
  });

  it("the range badge is the GM's: disabled for a player, its title says so", async () => {
    game.user.isGM = false;
    const { rangeBadge, combatant } = renderTracker();
    expect(rangeBadge.disabled).toBe(true);
    expect(rangeBadge.title).toMatch(/set by the GM/);
    rangeBadge.click();
    await settle();
    expect(combatant.setFlag).not.toHaveBeenCalled();
    expect(requestGmAction).not.toHaveBeenCalled();
  });

  it("control: a GM's click on the position badge writes the position, and on the range badge the range", async () => {
    game.user.isGM = true;
    const { posBadge, rangeBadge, combatant } = renderTracker();
    expect(posBadge.disabled).toBe(false);
    expect(rangeBadge.disabled).toBe(false);
    posBadge.click();
    await settle();
    expect(combatant.setFlag).toHaveBeenCalledWith(MODULE_ID, "position", "inControl");
    expect(setCombatPosition).toHaveBeenCalledWith(combatant.actor, "inControl");
    rangeBadge.click();
    await settle();
    expect(combatant.setFlag).toHaveBeenCalledWith(MODULE_ID, "range", "far");
    expect(requestGmAction).not.toHaveBeenCalled();
  });
});
