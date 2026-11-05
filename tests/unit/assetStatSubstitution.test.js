/**
 * STARFORGED COMPANION
 * tests/unit/assetStatSubstitution.test.js
 *
 * Issue #331 X23 (ASSET-STAT-SUB-FROM-OTHER-ROLL). extractStatReplacement read
 * any "roll +<stat>" in an ability as a stat substitution for whatever move
 * matched it: an Archer's Strike was offered "↻ +wits" from "To replenish your
 * ammo by crafting projectiles, roll +wits", and Engine Upgrade's "(+edge)"
 * condition became a +edge substitution on Undertake an Expedition through the
 * loose "+<stat> … instead" pattern ("take +2 momentum instead of +1"). The
 * book lets a player roll another stat only when the ability says so for the
 * move being made.
 *
 * Read against the vendored assets (skipped without the submodule): every
 * ability that names a stat, through the real scanner, for the moves it names.
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanForApplicableAbilities, extractStatReplacement } from "../../src/moves/abilityScanner.js";

const DIR = fileURLToPath(new URL("../../vendor/foundry-ironsworn/json-packs/starforged-assets", import.meta.url));
const HAVE_VENDOR = fs.existsSync(DIR) && fs.readdirSync(DIR).length > 0;
const strip = (s) => String(s ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

function abilityText(assetName, index) {
  const f = fs.readdirSync(DIR).find(n => n.toLowerCase().startsWith(assetName.toLowerCase().replace(/ /g, "_") + "_"));
  const d = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
  return strip(d.system.abilities[index].description);
}

async function substitutionOffered(assetName, index, moveId, moveName) {
  const text = abilityText(assetName, index);
  const found = await scanForApplicableAbilities({ moveId, moveName, narration: "test", apiKey: "", commandShipActor: null,
    characterActor: { id: "pc-1", name: "Kira", items: { contents: [{ id: "a1", name: assetName, type: "asset",
      system: { category: "Path", abilities: [{ enabled: true, description: `<p>${text}</p>` }] } }] } } });
  return found.map(a => a.statReplacement ?? null);
}

describe.skipIf(!HAVE_VENDOR)("X23 — a stat named for another roll is not a substitution for this move", () => {
  it("the abilities that let a move be rolled with another stat still offer it", async () => {
    expect(await substitutionOffered("Stealth Tech", 2, "strike", "Strike")).toEqual(["shadow"]);
    expect(await substitutionOffered("Vanguard", 2, "endure_stress", "Endure Stress")).toEqual(["wits"]);
    expect(await substitutionOffered("Revenant", 2, "gather_information", "Gather Information")).toEqual(["heart"]);
    expect(await substitutionOffered("Scoundrel", 1, "make_a_connection", "Make a Connection")).toEqual(["shadow"]);
    expect(await substitutionOffered("Sniper", 1, "strike", "Strike")).toEqual(["wits"]);
    expect(await substitutionOffered("Starship", 2, "withstand_damage", "Withstand Damage")).toEqual(["heart"]);
    expect(await substitutionOffered("Scavenger", 2, "check_your_gear", "Check Your Gear")).toEqual(["wits"]);
  });

  it("Archer's ammo-crafting '+wits' is not offered on Strike or Clash", async () => {
    expect(await substitutionOffered("Archer", 0, "strike", "Strike")).toEqual([null]);
    expect(await substitutionOffered("Archer", 0, "clash",  "Clash")).toEqual([null]);
  });

  it("Engine Upgrade's '(+edge)' condition is not a substitution on Undertake an Expedition", async () => {
    expect(await substitutionOffered("Engine Upgrade", 0, "undertake_an_expedition", "Undertake an Expedition")).toEqual([null]);
  });

  it("Tech's reroll '+wits instead of +integrity' after a miss is not a pre-roll substitution", async () => {
    expect(await substitutionOffered("Tech", 1, "withstand_damage", "Withstand Damage")).toEqual([null]);
  });

  it("an ability's own roll on a no-roll move offers nothing (Outcast on Sacrifice Resources)", async () => {
    expect(await substitutionOffered("Outcast", 1, "sacrifice_resources", "Sacrifice Resources")).toEqual([null]);
  });
});

describe("X23 — extractStatReplacement reads the sentence that names the move", () => {
  const link = (name) => `@Compendium[foundry-ironsworn.starforgedmoves.x]{${name}}`;

  it("a later sentence with no move link takes an explicit cue only", () => {
    expect(extractStatReplacement(`When you ${link("Strike")}, add +1. To craft arrows, roll +wits.`, "Strike")).toBeNull();
    expect(extractStatReplacement(`When you ${link("Strike")} from cover, take aim. You may roll +shadow.`, "Strike")).toBe("shadow");
  });

  it("a sentence naming another move belongs to that move", () => {
    const text = `When you ${link("Clash")}, you may roll +wits. When you ${link("Strike")}, add +1.`;
    expect(extractStatReplacement(text, "Strike")).toBeNull();
    expect(extractStatReplacement(text, "Clash")).toBe("wits");
  });

  it("a cost mention names no move", () => {
    expect(extractStatReplacement(`When you ${link("Strike")}, you may roll +heart. If you do, ${link("Endure Stress")} (-1).`, "Endure Stress")).toBeNull();
  });
});
