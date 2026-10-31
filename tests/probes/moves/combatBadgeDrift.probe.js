/**
 * PROBE (moves audit) — COMBAT-BADGE-TRACK-DRIFT.
 *
 * A fight's position lives in three stores: the progress track's
 * `combatState` (canonical — getActiveCombatPosition feeds the interpreter's
 * position constraint, enrichProgressTicks feeds Take Decisive Action's
 * bad-spot downgrade, [4j] OPEN PROGRESS TRACKS tells the narrator), the
 * actor's `system.combatPosition`, and the Combatant badge flag.
 * applyCombatPositionToTrack writes all three; the tracker's own "Click to
 * toggle combat position" badge (registerCombatTrackerHooks) writes only the
 * Combatant flag and the actor. A GM who corrects "in a bad spot" → "in
 * control" on the badge still has every attack remapped to Clash and every
 * Take Decisive Action downgraded.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { StubElement, parseHTML } from "../../helpers/cardDom.js";

vi.mock("../../../src/ui/progressTracks.js", () => ({
  setCombatTrackPosition: vi.fn(async () => ({})),
}));
vi.mock("../../../src/character/actorBridge.js", () => ({
  setCombatPosition: vi.fn(async () => {}),
}));

import { registerCombatTrackerHooks } from "../../../src/moves/combatTracker.js";
import { setCombatTrackPosition } from "../../../src/ui/progressTracks.js";
import { setCombatPosition } from "../../../src/character/actorBridge.js";

const MODULE_ID = "starforged-companion";
const flush = () => new Promise(r => setTimeout(r, 0));

let savedHTMLElement, savedDocument;
beforeEach(() => {
  savedHTMLElement = globalThis.HTMLElement;
  savedDocument    = globalThis.document;
  globalThis.HTMLElement = StubElement;
  globalThis.document = { createElement: (tag) => new StubElement(tag) };
  Hooks._handlers.delete("renderCombatTracker");
  setCombatTrackPosition.mockClear();
  setCombatPosition.mockClear();
});
afterEach(() => {
  globalThis.HTMLElement = savedHTMLElement;
  globalThis.document    = savedDocument;
});

it("clicking the position badge writes the fight's track position too (the store every reader reads)", async () => {
  const actor = { id: "pc1", name: "Kira" };
  const cFlags = { [MODULE_ID]: { position: "none" } };
  const combatant = {
    id: "cmb1", actorId: "pc1", actor,
    getFlag: (m, k) => cFlags[m]?.[k],
    setFlag: vi.fn(async (m, k, v) => { cFlags[m][k] = v; }),
  };
  const combat = {
    id: "combat1",
    getFlag: (m, k) => (m === MODULE_ID && k === "trackId" ? "trk-1" : undefined),
    combatants: [combatant],
  };
  game.combats = { find: (fn) => [combat].find(fn) ?? null };
  const savedIsGM = game.user.isGM;
  game.user.isGM = true;

  registerCombatTrackerHooks();
  const root = parseHTML(`<ol><li data-combatant-id="cmb1"><div class="combatant-controls"></div></li></ol>`);
  Hooks.call("renderCombatTracker", {}, root);

  const badge = root.querySelector(".sf-pos-badge");
  expect(badge).toBeTruthy();
  badge.click();                       // none → inControl
  await flush(); await flush(); await flush();

  // Control: the two stores the badge does write.
  expect(combatant.setFlag).toHaveBeenCalledWith(MODULE_ID, "position", "inControl");
  expect(setCombatPosition).toHaveBeenCalledWith(actor, "inControl");
  // The canonical store: the track's combatState.
  expect(setCombatTrackPosition).toHaveBeenCalledWith("trk-1", "in_control");

  game.user.isGM = savedIsGM;
});
