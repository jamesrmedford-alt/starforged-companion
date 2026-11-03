// tests/unit/combatTrackerViewedCombat.test.js
// The combat tracker decorates the combat it shows, and only a Starforged
// fight (issue #326 W55). The renderCombatTracker hook found the first
// module combat in game.combats: with two fights open the viewed fight got
// no position / range badges, and the `sf-starforged-combat` class — which
// hides initiative and the turn controls — went on the tracker whatever
// combat it showed, the GM's own non-Starforged combat included.

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { parseHTML, StubElement } from "../helpers/cardDom.js";
import { registerCombatTrackerHooks } from "../../src/moves/combatTracker.js";

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

describe("the combat tracker decorates the combat it shows (issue #326 W55)", () => {
  it("control: with one fight open, its rows get the position and range badges", () => {
    game.combats = [fightA];
    const root = render(fightA);
    expect(root.querySelectorAll(".sf-combat-badges")).toHaveLength(2);
  });

  it("with two fights open, the fight the tracker shows gets its badges", () => {
    game.combats = [fightA, fightB];
    const root = render(fightB);
    expect(root.querySelectorAll(".sf-combat-badges")).toHaveLength(2);   // was 0
  });

  it("a GM's own (non-Starforged) combat keeps its initiative and turn controls", () => {
    game.combats = [fightA, native];
    const root = render(native);
    expect(root.classList.contains("sf-starforged-combat")).toBe(false);  // was true — the CSS hid them
    expect(root.querySelectorAll(".sf-combat-badges")).toHaveLength(0);
  });
  it("with no app.viewed, the tracker reads game.combat — the viewed combat", () => {
    game.combats = [fightA, fightB];
    game.combat = fightB;
    const root = trackerFor(fightB);
    Hooks.call("renderCombatTracker", {}, root);
    expect(root.querySelectorAll(".sf-combat-badges")).toHaveLength(2);
    expect(root.classList.contains("sf-starforged-combat")).toBe(true);
  });
});
