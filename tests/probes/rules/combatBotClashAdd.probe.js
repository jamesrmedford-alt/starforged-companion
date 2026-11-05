/**
 * PROBE — RULES-01 COMBAT-BOT-CLASH-ADD (tenth audit, area rules)
 *
 * What the user does: Kira has the Combat Bot companion asset — "Your combat
 * bot companion fights at your side. When you Strike aided by the bot, add
 * +1; if you Clash, take +1 momentum on a hit." In a bad spot she Clashes
 * with the bot at her side and confirms the move.
 *
 * What happens: the confirm dialog lists Combat Bot pre-checked "+1" on the
 * Clash (settingsPanel.js renderApplicableAbilitiesBlock pre-checks adds > 0)
 * and the roll takes it. extractAdds (src/moves/abilityScanner.js:490-503)
 * reads "the first add in a sentence that names the move": the bot's Strike
 * clause and its Clash clause share one sentence (a semicolon, no full stop),
 * so the Strike's "add +1" is read as the Clash's.
 *
 * What should happen: a Clash with the bot adds nothing — its clause gives
 * "+1 momentum on a hit", a rider, not an add; only a Strike adds +1. "An
 * ability adds its clause for the move" (decisions.md, issue #325 W12).
 *
 * Control: the same ability gives Strike +1; Sidekick's two-sentence twin
 * ("When you Enter the Fray with the support of your sidekick, take +2
 * momentum on a hit. When you Clash together, add +1.") reads Enter the Fray
 * 0 and Clash 1.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/rules/combatBotClashAdd.probe.js
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractAdds, scanForApplicableAbilities } from "../../../src/moves/abilityScanner.js";

const DIR = fileURLToPath(new URL("../../../vendor/foundry-ironsworn/json-packs/starforged-assets", import.meta.url));
const HAVE_VENDOR = fs.existsSync(DIR) && fs.readdirSync(DIR).length > 0;
const strip = (s) => String(s ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const link = (name) => `@Compendium[foundry-ironsworn.starforgedmoves.x]{${name}}`;

// The vendored texts (HTML stripped, links kept — collectEnabledAbilities' form);
// read from vendor/ when the submodule is checked out.
const LITERAL = {
  combatBot: `Your combat bot companion fights at your side. When you ${link("Strike")} aided by the bot, add +1; if you ${link("Clash")}, take +1 momentum on a hit.`,
  sidekick:  `When you ${link("Enter the Fray")} with the support of your sidekick, take +2 momentum on a hit. When you ${link("Clash")} together, add +1.`,
};

function vendoredAbility(assetName, index) {
  if (!HAVE_VENDOR) return null;
  const f = fs.readdirSync(DIR).find(n => n.toLowerCase().startsWith(assetName.toLowerCase().replace(/ /g, "_") + "_"));
  if (!f) return null;
  const d = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
  return strip(d.system.abilities[index].description);
}

const combatBot = vendoredAbility("Combat Bot", 0) ?? LITERAL.combatBot;
const sidekick  = vendoredAbility("Sidekick", 1)   ?? LITERAL.sidekick;

async function offered(assetName, text, moveId, moveName) {
  const found = await scanForApplicableAbilities({ moveId, moveName, narration: "test", apiKey: "", commandShipActor: null,
    characterActor: { id: "pc-1", name: "Kira", items: { contents: [{ id: "a1", name: assetName, type: "asset",
      system: { category: "Companion", abilities: [{ enabled: true, description: `<p>${text}</p>` }] } }] } } });
  return found.map(a => a.adds);
}

describe("PROBE RULES-01 COMBAT-BOT-CLASH-ADD", () => {
  it("a Clash with the Combat Bot takes no add — its clause is +1 momentum on a hit, the Strike's is the add", async () => {
    // Expected 0; actual 1 — the Strike clause's add, read from the shared sentence.
    expect(extractAdds(combatBot, "Clash")).toBe(0);
    expect.soft(await offered("Combat Bot", combatBot, "clash", "Clash")).toEqual([0]);
  });

  it("control: a Strike aided by the bot adds +1", async () => {
    expect(extractAdds(combatBot, "Strike")).toBe(1);
    expect(await offered("Combat Bot", combatBot, "strike", "Strike")).toEqual([1]);
  });

  it("control: Sidekick's two-sentence twin reads Enter the Fray 0 and Clash 1", () => {
    expect(extractAdds(sidekick, "Enter the Fray")).toBe(0);
    expect(extractAdds(sidekick, "Clash")).toBe(1);
  });
});
