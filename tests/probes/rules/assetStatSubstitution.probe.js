/**
 * PROBE — RULES-02 ASSET-STAT-SUB-FROM-OTHER-ROLL
 * (src/moves/abilityScanner.js extractStatReplacement:381-401, annotate:323;
 *  offered as a "Stat substitution" radio by src/ui/settingsPanel.js
 *  renderApplicableAbilitiesBlock:2333-2345)
 *
 * What the user does: an Archer rolls Strike (or Clash); a crew with the
 * Engine Upgrade module rolls Undertake an Expedition (+wits, say).
 *
 * What happens: extractStatReplacement reads any "roll +<stat>" in the
 * ability as a substitution for the move being made. Archer: "When you Strike
 * or Clash, you may add +1 or +2 and suffer that amount as -ammo. To replenish
 * your ammo by crafting projectiles, roll +wits." — the +wits is the ammo
 * crafting roll, not a Strike stat, yet the confirm dialog offers "↻ +wits"
 * on the Archer row and a "+wits" radio: picked, the Strike rolls +wits
 * (index.js:1097 statSubstitutedFrom), a stat Strike does not list (decisions
 * "A typed move rolls a stat it lists"). Engine Upgrade: "When you Undertake
 * an Expedition (+edge) and score a strong hit, take +1 momentum; … take +2
 * momentum instead of +1" — "(+edge)" is the CONDITION (when you roll +edge),
 * read as a substitution by the loose "+<stat> … instead" pattern.
 *
 * What should happen: a substitution is offered only when the ability lets
 * the player roll that stat FOR THIS MOVE ("you may roll +shadow" for a
 * Strike from hiding; "you may roll +wits" when you Endure Stress). A stat
 * named for a different roll, or as a condition, offers nothing.
 *
 * Controls: Stealth Tech's Strike from hiding → shadow; Vanguard's Endure
 * Stress → wits; Revenant's Gather Information → heart.
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanForApplicableAbilities } from "../../../src/moves/abilityScanner.js";

const DIR = fileURLToPath(new URL("../../../vendor/foundry-ironsworn/json-packs/starforged-assets", import.meta.url));
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

describe.skipIf(!HAVE_VENDOR)("RULES-02 a stat named for another roll is not a substitution for this move", () => {
  it("control: Stealth Tech's Strike → shadow; Vanguard's Endure Stress → wits; Revenant's Gather Information → heart", async () => {
    expect(await substitutionOffered("Stealth Tech", 2, "strike", "Strike")).toEqual(["shadow"]);
    expect(await substitutionOffered("Vanguard", 2, "endure_stress", "Endure Stress")).toEqual(["wits"]);
    expect(await substitutionOffered("Revenant", 2, "gather_information", "Gather Information")).toEqual(["heart"]);
  });

  it("Archer's ammo-crafting '+wits' is not offered on Strike or Clash", async () => {
    expect.soft(await substitutionOffered("Archer", 0, "strike", "Strike")).toEqual([null]);   // actual: ["wits"]
    expect.soft(await substitutionOffered("Archer", 0, "clash",  "Clash")).toEqual([null]);    // actual: ["wits"]
  });

  it("Engine Upgrade's '(+edge)' condition is not offered as a substitution on Undertake an Expedition", async () => {
    expect(await substitutionOffered("Engine Upgrade", 0, "undertake_an_expedition", "Undertake an Expedition")).toEqual([null]); // actual: ["edge"]
  });
});
