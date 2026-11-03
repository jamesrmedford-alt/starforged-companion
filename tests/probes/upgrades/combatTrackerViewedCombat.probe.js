/**
 * PROBE (moves-upgrade-suffer audit) — MU: COMBAT-BADGES-FIRST-COMBAT
 *
 * What the user does: two fights are open (Enter the Fray twice — issue #321
 * U16 lets a second foe open a second fight, each with its own Combat
 * document holding every PC), and the Combat Tracker shows the second one;
 * or the GM views a plain Foundry combat of their own while a Starforged
 * fight is open.
 *
 * What happens: the renderCombatTracker hook (combatTracker.js:241) decorates
 * `game.combats.find(c => c.getFlag(MODULE_ID, "trackId"))` — the FIRST
 * module combat in the collection — not the combat the tracker is showing
 * (`app.viewed` / `game.combat`). It looks up that combat's combatant ids in
 * the rendered rows, finds none, and adds no position / range badges; and it
 * adds `sf-starforged-combat` to the tracker root regardless, whose CSS hides
 * the initiative column and the Begin Combat / Next Turn controls — on the
 * GM's own, non-Starforged combat too.
 *
 * What should happen: the hook decorates the combat being viewed, and only
 * when that combat is a Starforged fight
 * (docs/foundry-reference/foundry-api-reference.md "renderCombatTracker
 * hook": iterate the viewed combat's combatants).
 */

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { parseHTML, StubElement } from "../../helpers/cardDom.js";
import { registerCombatTrackerHooks } from "../../../src/moves/combatTracker.js";

const MODULE_ID = "starforged-companion";

function combatant(id, actorId) {
  const flags = {};
  return {
    id, actorId, actor: { id: actorId, name: actorId, system: { combatPosition: "" } },
    getFlag: (mod, key) => flags[`${mod}.${key}`],
    setFlag: async (mod, key, val) => { flags[`${mod}.${key}`] = val; },
  };
}

function combat(id, trackId, combatants) {
  return {
    id,
    getFlag: (mod, key) => (mod === MODULE_ID && key === "trackId" ? trackId : undefined),
    combatants: Object.assign([...combatants], { find: (fn) => combatants.find(fn) ?? null }),
  };
}

/** The tracker's rendered rows for one combat. */
function trackerFor(c) {
  return parseHTML(`<ol class="combat-tracker">${[...c.combatants].map(cb =>
    `<li class="combatant" data-combatant-id="${cb.id}"><div class="combatant-controls"></div></li>`).join("")}</ol>`);
}

function render(viewed) {
  game.combat = viewed;
  const root = trackerFor(viewed);
  Hooks.call("renderCombatTracker", { viewed }, root);
  return root;
}

const fightA = combat("combat-a", "track-a", [combatant("ca-kira", "pc-kira"), combatant("ca-ash", "pc-ash")]);
const fightB = combat("combat-b", "track-b", [combatant("cb-kira", "pc-kira"), combatant("cb-ash", "pc-ash")]);
const native = combat("combat-gm", undefined, [combatant("cg-raider", "npc-raider")]);

beforeAll(() => {
  globalThis.HTMLElement ??= StubElement;
  globalThis.document ??= { createElement: (tag) => new StubElement(tag) };
  registerCombatTrackerHooks();
});

beforeEach(() => { game.user.isGM = true; });

describe("COMBAT-BADGES-FIRST-COMBAT", () => {
  it("control: with one fight open, its rows get the position and range badges", () => {
    game.combats = [fightA];
    const root = render(fightA);
    expect(root.querySelectorAll(".sf-combat-badges")).toHaveLength(2);
  });

  it("with two fights open, the fight the tracker shows gets its badges", () => {
    game.combats = [fightA, fightB];
    const root = render(fightB);
    expect(root.querySelectorAll(".sf-combat-badges")).toHaveLength(2);   // today: 0
  });

  it("a GM's own (non-Starforged) combat keeps its initiative and turn controls", () => {
    game.combats = [fightA, native];
    const root = render(native);
    expect(root.classList.contains("sf-starforged-combat")).toBe(false);  // today: true — the CSS hides them
  });
});
