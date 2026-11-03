/**
 * STARFORGED COMPANION
 * tests/unit/combatPositionStores.test.js
 *
 * Issue #321 U19 — a fight's position is written everywhere it lives. It has
 * three stores: the progress track's `combatState` (canonical —
 * getActiveCombatPosition feeds the interpreter's position constraint,
 * enrichProgressTicks feeds Take Decisive Action's bad-spot downgrade, [4j]
 * OPEN PROGRESS TRACKS tells the narrator), the actor's
 * `system.combatPosition`, and the combat tracker's badge flag.
 * applyCombatPositionToTrack writes all three; the tracker's "Click to toggle
 * combat position" badge wrote only the Combatant flag and the actor, so a GM
 * who corrected "in a bad spot" → "in control" on the badge still had every
 * attack remapped to Clash and every Take Decisive Action downgraded. The
 * badge now goes through applyCombatPositionToTrack too (and the Progress
 * Tracks panel's toggle — tests/unit/progressTracksPanelRelay.test.js).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { StubElement, parseHTML } from "../helpers/cardDom.js";

vi.mock("../../src/ui/progressTracks.js", () => ({
  setCombatTrackPosition: vi.fn(async () => ({})),
}));
vi.mock("../../src/character/actorBridge.js", () => ({
  setCombatPosition: vi.fn(async () => {}),
  // The real predicate: a character Actor that is no NPC card.
  isPlayerCharacterActor: (actor) => actor?.type === "character" && !actor?.flags?.["starforged-companion"]?.entityType,
}));

import { registerCombatTrackerHooks, applyCombatPositionToTrack } from "../../src/moves/combatTracker.js";
import { setCombatTrackPosition } from "../../src/ui/progressTracks.js";
import { setCombatPosition } from "../../src/character/actorBridge.js";

const MODULE_ID = "starforged-companion";
const flush = () => new Promise(r => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 6; i++) await flush(); };

let savedHTMLElement, savedDocument, savedCombats, savedCombat, savedIsGM;
beforeEach(() => {
  savedHTMLElement = globalThis.HTMLElement;
  savedDocument    = globalThis.document;
  savedCombats     = game.combats;
  savedCombat      = game.combat;
  savedIsGM        = game.user.isGM;
  globalThis.HTMLElement = StubElement;
  globalThis.document = { createElement: (tag) => new StubElement(tag) };
  Hooks._handlers.delete("renderCombatTracker");
  setCombatTrackPosition.mockReset();
  setCombatTrackPosition.mockImplementation(async () => ({}));
  setCombatPosition.mockClear();
  game.user.isGM = true;
});
afterEach(() => {
  globalThis.HTMLElement = savedHTMLElement;
  globalThis.document    = savedDocument;
  game.combats           = savedCombats;
  game.combat            = savedCombat;
  game.user.isGM         = savedIsGM;
});

/** A Starforged combat for track "trk-1" with one combatant, rendered in the tracker. */
function renderTracker({ position = "none", actor = { id: "pc1", name: "Kira", type: "character" } } = {}) {
  const cFlags = { [MODULE_ID]: { position } };
  const combatant = {
    id: "cmb1", actorId: actor?.id ?? null, actor,
    getFlag: (m, k) => cFlags[m]?.[k],
    setFlag: vi.fn(async (m, k, v) => { cFlags[m][k] = v; }),
  };
  const combat = {
    id: "combat1",
    getFlag: (m, k) => (m === MODULE_ID && k === "trackId" ? "trk-1" : undefined),
    combatants: [combatant],
  };
  game.combats = { find: (fn) => [combat].find(fn) ?? null };
  // The tracker decorates the combat it shows (app.viewed / game.combat —
  // issue #326 W55).
  game.combat  = combat;
  Hooks._handlers.delete("renderCombatTracker");
  registerCombatTrackerHooks();
  const root = parseHTML(`<ol><li data-combatant-id="cmb1"><div class="combatant-controls"></div></li></ol>`);
  Hooks.call("renderCombatTracker", { viewed: combat }, root);
  return { badge: root.querySelector(".sf-pos-badge"), combatant };
}

describe("the combat tracker's position badge writes the fight's track (issue #321 U19)", () => {
  it("clicking the position badge writes the fight's track position too (the store every reader reads)", async () => {
    const { badge, combatant } = renderTracker();
    expect(badge).toBeTruthy();
    badge.click();                       // none → inControl
    await settle();

    // The two stores the badge always wrote …
    expect(combatant.setFlag).toHaveBeenCalledWith(MODULE_ID, "position", "inControl");
    expect(setCombatPosition).toHaveBeenCalledWith(combatant.actor, "inControl");
    // … and the canonical one: the fight's, as Kira's own (issue #322 V03).
    expect(setCombatTrackPosition).toHaveBeenCalledWith("trk-1", "in_control", "pc1");
  });

  // Issue #322 V03: position is per character. A foe's badge sets the fight's
  // position alone — no foe is recorded as one of the crew.
  it("a foe's badge writes the fight's position, not a character's own", async () => {
    const { badge } = renderTracker({ actor: { id: "npc-raider", name: "Raider", type: "foe" } });
    badge.click();
    await settle();
    expect(setCombatTrackPosition).toHaveBeenCalledWith("trk-1", "in_control", null);
  });

  it("each step of the cycle reaches the track: in control → in a bad spot → neutral", async () => {
    renderTracker({ position: "inControl" }).badge.click();
    await settle();
    expect(setCombatTrackPosition).toHaveBeenLastCalledWith("trk-1", "bad_spot", "pc1");

    renderTracker({ position: "inABadSpot" }).badge.click();
    await settle();
    expect(setCombatTrackPosition).toHaveBeenLastCalledWith("trk-1", null, "pc1");
    expect(setCombatPosition).toHaveBeenLastCalledWith(expect.objectContaining({ id: "pc1" }), "none");
  });

  it("a refused track write changes neither mirror, and says so", async () => {
    setCombatTrackPosition.mockRejectedValue(new Error("the server refused the update"));
    const warn = vi.spyOn(ui.notifications, "warn");
    const { badge, combatant } = renderTracker();
    badge.click();
    await settle();
    expect(combatant.setFlag).not.toHaveBeenCalled();
    expect(setCombatPosition).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/combat position could not be saved/));
  });

  it("control: a player's click changes nothing (the badge is the GM's)", async () => {
    game.user.isGM = false;
    const { badge, combatant } = renderTracker();
    badge.click();
    await settle();
    expect(setCombatTrackPosition).not.toHaveBeenCalled();
    expect(combatant.setFlag).not.toHaveBeenCalled();
  });
});

describe("applyCombatPositionToTrack — neutral, and the canonical store first (issue #321 U19)", () => {
  it("null clears the position everywhere (the toggles' neutral step)", async () => {
    const actor = { id: "pc1", name: "Kira", type: "character" };
    await applyCombatPositionToTrack("trk-1", null, actor);
    expect(setCombatTrackPosition).toHaveBeenCalledWith("trk-1", null, "pc1");
    expect(setCombatPosition).toHaveBeenCalledWith(actor, "none");
  });

  it("an unknown or missing position writes nothing", async () => {
    await applyCombatPositionToTrack("trk-1", undefined, { id: "pc1" });
    await applyCombatPositionToTrack("trk-1", "flanking", { id: "pc1" });
    expect(setCombatTrackPosition).not.toHaveBeenCalled();
    expect(setCombatPosition).not.toHaveBeenCalled();
  });

  it("a refused track write rejects before the mirrors change", async () => {
    setCombatTrackPosition.mockRejectedValue(new Error("the server refused the update"));
    await expect(applyCombatPositionToTrack("trk-1", "bad_spot", { id: "pc1" })).rejects.toThrow(/refused/);
    expect(setCombatPosition).not.toHaveBeenCalled();
  });
});
