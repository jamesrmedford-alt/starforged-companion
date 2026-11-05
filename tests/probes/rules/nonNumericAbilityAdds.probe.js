/**
 * PROBE — RULES-06 NON-NUMERIC-ABILITY-ADDS-LOST (tenth audit, area rules)
 *
 * What the user does: Kira has the Bonded deed ("When you Set a Course back
 * to your bond-mate's location, add +heart") and heart 2; she Sets a Course
 * home and confirms the move. Her crewmate's Glowcat (health 3): "When you
 * Secure an Advantage by studying the glowcat's reactions in a charged
 * interaction, add +its health."
 *
 * What happens: the scanner's structured pass keys both abilities to the move
 * but extractAdds (src/moves/abilityScanner.js:490-520) reads numeric adds
 * only — "add +heart" and "add +its health" (Glowcat, Sprite, Symbiote; Expanded
 * Hold's "+cargo"; Sniper's "add that amount") are 0 — so the confirm dialog
 * lists the ability unchecked with no add (settingsPanel.js:2305-2311) and the
 * roll is made without the bonus. There is nowhere to type it: decisions.md
 * (issue #322 V02) rejected a manual adds input "because it asks the player to
 * remember a bonus the module already holds" — and these bonuses the module
 * holds (the PC's heart; the companion asset's track value, readCompanionHealth).
 * The scanner's header claim ("the player reads the text and decides what to
 * do") has no path to the roll.
 *
 * What should happen: the add the text gives is resolved from the sheet, as
 * every other bonus the module holds is — "+heart" is the roller's heart,
 * "+its health" the companion's health — and offered on the confirm dialog.
 *
 * Control: a numeric add (Blademaster's Clash +1, Shuttle's Face Danger +1)
 * is offered.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/rules/nonNumericAbilityAdds.probe.js
 */

import { describe, it, expect } from "vitest";
import { scanForApplicableAbilities } from "../../../src/moves/abilityScanner.js";

const link = (name) => `@Compendium[foundry-ironsworn.starforgedmoves.x]{${name}}`;
// The vendored texts (HTML stripped, links kept — collectEnabledAbilities' form).
const TEXT = {
  bonded:      `When you ${link("Set a Course")} back to your bond-mate's location, add +heart. On a strong hit with a match, envision a special reunion and mark two ticks on your bonds legacy track.`,
  glowcat:     `Your glowcat companion perceives the inner emotions and intentions of people and creatures in its vicinity, and embodies those impressions through the colors and intensity of its luminescent fur. When you ${link("Secure an Advantage")} by studying the glowcat’s reactions in a charged interaction, add +its health.`,
  blademaster: `When you ${link("Clash")} or ${link("Strike")} in close quarters, add +1. On a strong hit with a match, you are unstoppable; mark progress.`,
  shuttle:     `When you ${link("Face Danger")} or ${link("React Under Fire")} to navigate through hazardous skies, avoid obstacles, or evade an attack, add +1 and take +1 momentum on a hit.`,
};

function kira({ assetName, category, text, track = null }) {
  const item = { id: "a1", name: assetName, type: "asset",
    system: { category, abilities: [{ enabled: true, description: `<p>${text}</p>` }], ...(track ? { track } : {}) } };
  return { id: "pc-kira", name: "Kira", type: "character",
    system: { edge: 1, heart: 2, iron: 1, shadow: 1, wits: 2 },
    items: { contents: [item], get: (id) => (id === item.id ? item : undefined) } };
}

async function offered(actor, moveId, moveName) {
  const found = await scanForApplicableAbilities({ moveId, moveName, narration: "test", apiKey: "", commandShipActor: null, characterActor: actor });
  return found.map(a => a.adds);
}

describe("PROBE RULES-06 NON-NUMERIC-ABILITY-ADDS-LOST", () => {
  it("Bonded's 'add +heart' on Set a Course is the roller's heart (2) — the module holds it", async () => {
    // Expected [2]; actual [0] — the ability surfaces with no add and nowhere to enter one.
    expect(await offered(kira({ assetName: "Bonded", category: "Deed", text: TEXT.bonded }), "set_a_course", "Set a Course")).toEqual([2]);
  });

  it("Glowcat's 'add +its health' on Secure an Advantage is the companion's health (3)", async () => {
    const actor = kira({ assetName: "Glowcat", category: "Companion", text: TEXT.glowcat, track: { value: 3, max: 3, min: 0 } });
    expect(await offered(actor, "secure_an_advantage", "Secure an Advantage")).toEqual([3]);
  });

  it("control: numeric adds are offered — Blademaster's Clash +1, Shuttle's Face Danger +1", async () => {
    expect(await offered(kira({ assetName: "Blademaster", category: "Path", text: TEXT.blademaster }), "clash", "Clash")).toEqual([1]);
    expect(await offered(kira({ assetName: "Shuttle", category: "Support Vehicle", text: TEXT.shuttle }), "face_danger", "Face Danger")).toEqual([1]);
  });
});
