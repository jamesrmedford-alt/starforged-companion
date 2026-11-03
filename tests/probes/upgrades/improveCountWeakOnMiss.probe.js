/**
 * PROBE (moves-upgrade-suffer audit) — MU: IMPROVE-COUNT-WEAK-ON-MISS
 *
 * What the user does: a PC owns an asset whose ability reads "count a weak hit
 * as a strong hit" — Rockhorn's second ability ("When you make the Companion
 * Takes a Hit move for the rockhorn, count a weak hit as a strong hit"),
 * Heavy Cannons' second ("… when you Clash … count a weak hit as a strong
 * hit") — and rolls that move for a MISS.
 *
 * What happens: the ability scanner reads every "count … as a strong hit"
 * as `resultImprovement: { improveTo: "strong_hit" }` with no "from" outcome
 * (abilityScanner.js extractResultImprovement), and buildImproveState offers
 * the post-roll "✦ Improve to Strong Hit" button for any outcome below a
 * strong hit (improveResult.js:104). The miss card offers the upgrade, and a
 * click turns the miss into a strong hit — two steps.
 *
 * What should happen: such an ability turns a WEAK hit into a strong hit; a
 * miss is not improved (only Fugitive-style "improve the result to a strong
 * hit" lifts any result).
 *
 * Producers are the real ones: the vendored foundry-ironsworn asset data
 * (Rockhorn, Heavy Cannons), the real scanForApplicableAbilities (structured
 * @Compendium match — no Claude key needed) and the real buildImproveState.
 */

import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { scanForApplicableAbilities } from "../../../src/moves/abilityScanner.js";
import { buildImproveState } from "../../../src/moves/improveResult.js";

const ASSETS = path.resolve(__dirname, "../../../vendor/foundry-ironsworn/json-packs/starforged-assets");

/** The vendored asset as an embedded Item, every ability enabled (an upgraded asset). */
function assetItem(prefix) {
  const file = fs.readdirSync(ASSETS).find(f => f.startsWith(`${prefix}_`) && f.endsWith(".json"));
  const data = JSON.parse(fs.readFileSync(path.join(ASSETS, file), "utf8"));
  return {
    id: `item-${prefix.toLowerCase()}`, name: data.name, type: "asset",
    system: { ...data.system, abilities: data.system.abilities.map(a => ({ ...a, enabled: true })) },
  };
}

function pcWith(item) {
  return makeTestActor({ id: "pc-probe", name: "Kira", items: { contents: [item] } });
}

const resolution = (moveId, outcome) => ({
  _id: "res-probe", moveId, outcome, isMatch: false, isProgressMove: false, rollKind: "action",
  challengeDice: [6, 7], consequences: { momentumChange: 0 },
});

async function improveFor(prefix, moveId, moveName, outcome) {
  const actor = pcWith(assetItem(prefix));
  const abilities = await scanForApplicableAbilities({
    moveId, moveName, narration: "probe", characterActor: actor, commandShipActor: null, apiKey: null,
  });
  return { abilities, improve: buildImproveState(resolution(moveId, outcome), abilities, actor) };
}

beforeEach(() => { game.actors?._reset?.(); });

describe("IMPROVE-COUNT-WEAK-ON-MISS — Rockhorn (Companion Takes a Hit)", () => {
  it("control: the scanner finds the Rockhorn ability and a WEAK hit is offered the improvement", async () => {
    const { abilities, improve } = await improveFor("Rockhorn", "companion_takes_a_hit", "Companion Takes a Hit", "weak_hit");
    expect(abilities.some(a => a.resultImprovement?.improveTo === "strong_hit")).toBe(true);
    expect(improve?.canImprove).toBe(true);
  });

  it("a MISS on Companion Takes a Hit is not offered 'Improve to Strong Hit' (the ability counts a weak hit only)", async () => {
    const { improve } = await improveFor("Rockhorn", "companion_takes_a_hit", "Companion Takes a Hit", "miss");
    expect(improve).toBeNull();
  });
});

describe("IMPROVE-COUNT-WEAK-ON-MISS — Heavy Cannons (Clash)", () => {
  it("control: a weak-hit Clash is offered the improvement", async () => {
    const { improve } = await improveFor("Heavy_Cannons", "clash", "Clash", "weak_hit");
    expect(improve?.canImprove).toBe(true);
  });

  it("a MISS on Clash is not offered 'Improve to Strong Hit'", async () => {
    const { improve } = await improveFor("Heavy_Cannons", "clash", "Clash", "miss");
    expect(improve).toBeNull();
  });
});
