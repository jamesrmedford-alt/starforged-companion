/**
 * STARFORGED COMPANION
 * tests/unit/combatBotClashAdd.test.js
 *
 * Issue #336 Y15 (COMBAT-BOT-CLASH-ADD). A PC with the Combat Bot companion
 * (its first ability) rolls Clash. The vendored text is one sentence: "When
 * you Strike aided by the bot, add +1; if you Clash, take +1 momentum on a
 * hit." The structured pass keys the ability to Clash (it is linked) and
 * extractAdds read the sentence's first add — the Strike's +1 — so the confirm
 * dialog offered Combat Bot "+1" pre-checked on Clash. An ability adds its
 * clause for the move (issue #325 W12; issue #329 X04): the sentence splits at
 * ";" (and before a mid-sentence "if you <Move>"), and Clash's clause gives
 * momentum, not an add.
 *
 * The pipeline and rules auditors' twin probes, merged; the vendored texts are
 * read from the submodule when it is checked out.
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractAdds, structuredMatches, scanForApplicableAbilities } from "../../src/moves/abilityScanner.js";

const LINK = (id, name) => `@Compendium[foundry-ironsworn.starforgedmoves.${id}]{${name}}`;
const STRIKE = LINK("ae5994ceb3cba098", "Strike");
const CLASH  = LINK("723192c97fec4fe2", "Clash");
const ETF    = LINK("2f2ba4090b22a122", "Enter the Fray");
const HEARTEN = LINK("c2c2f31f564caa06", "Hearten");

// The vendored texts, HTML stripped as readAssetAbilities does (links kept).
const LITERAL = {
  combatBot: `Your combat bot companion fights at your side. When you ${STRIKE} aided by the bot, add +1; if you ${CLASH}, take +1 momentum on a hit.`,
  sidekick:  `When you ${ETF} with the support of your sidekick, take +2 momentum on a hit. When you ${CLASH} together, add +1.`,
};

const DIR = fileURLToPath(new URL("../../vendor/foundry-ironsworn/json-packs/starforged-assets", import.meta.url));
const HAVE_VENDOR = fs.existsSync(DIR) && fs.readdirSync(DIR).length > 0;
const strip = (s) => String(s ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

function vendoredAbility(assetName, index) {
  if (!HAVE_VENDOR) return null;
  const f = fs.readdirSync(DIR).find(n => n.toLowerCase().startsWith(assetName.toLowerCase().replace(/ /g, "_") + "_"));
  if (!f) return null;
  const d = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
  return strip(d.system.abilities[index].description);
}

const COMBAT_BOT = vendoredAbility("Combat Bot", 0) ?? LITERAL.combatBot;
const SIDEKICK   = vendoredAbility("Sidekick", 1)   ?? LITERAL.sidekick;

function actorWith(assetName, description) {
  return globalThis.makeTestActor({
    id: "pc-kira", name: "Kira",
    items: { contents: [{
      id: "asset-1", type: "asset", name: assetName,
      system: { category: "Companion", abilities: [{ enabled: true, description: `<p>${description}</p>` }] },
    }] },
  });
}

async function offered(assetName, description, moveId, moveName) {
  const matches = await scanForApplicableAbilities({
    moveId, moveName, narration: `Kira attempts ${moveName}.`,
    characterActor: actorWith(assetName, description), commandShipActor: null, apiKey: null,
  });
  return matches.map(m => ({ detection: m.detection, adds: m.adds }));
}

describe("Combat Bot's +1 is Strike's, not Clash's (issue #336 Y15)", () => {
  it("extractAdds gives Clash no add from the Combat Bot sentence — its clause is +1 momentum on a hit", () => {
    expect(structuredMatches([{ text: COMBAT_BOT }], "Clash")).toHaveLength(1);   // the ability is keyed to Clash
    expect(extractAdds(COMBAT_BOT, "Clash")).toBe(0);
    // The literal text too, whether or not the submodule is checked out.
    expect(extractAdds(LITERAL.combatBot, "Clash")).toBe(0);
  });

  it("the scanner's structured pass offers Combat Bot on Clash with no add (unchecked on the dialog)", async () => {
    const got = await offered("Combat Bot", COMBAT_BOT, "clash", "Clash");
    expect(got).toEqual([{ detection: "structured", adds: 0 }]);
  });

  it("a mid-sentence 'if you <Move>' after a comma starts its own clause too", () => {
    const text = `When you ${STRIKE} aided by the bot, add +1, and if you ${CLASH}, take +1 momentum on a hit.`;
    expect(extractAdds(text, "Strike")).toBe(1);
    expect(extractAdds(text, "Clash")).toBe(0);
  });

  it("control: a clause naming no move continues the one before it (Explorer's Hearten add)", () => {
    const explorer = `When you come across a wondrous sight, choose one: Find inspiration: Take +1 momentum Soak it all in: ${HEARTEN}; add +1, and take +1 momentum on a hit.`;
    expect(extractAdds(explorer, "Hearten")).toBe(1);
    expect(extractAdds(explorer, "Face Danger")).toBe(0);   // not a general trigger's add
  });

  it("control: the same text gives Strike +1", async () => {
    expect(extractAdds(COMBAT_BOT, "Strike")).toBe(1);
    expect(await offered("Combat Bot", COMBAT_BOT, "strike", "Strike")).toEqual([{ detection: "structured", adds: 1 }]);
  });

  it("control: Sidekick's two sentences give Enter the Fray 0 and Clash +1", async () => {
    expect(extractAdds(SIDEKICK, "Enter the Fray")).toBe(0);
    expect(extractAdds(SIDEKICK, "Clash")).toBe(1);
    expect(await offered("Sidekick", SIDEKICK, "enter_the_fray", "Enter the Fray")).toEqual([{ detection: "structured", adds: 0 }]);
    expect(await offered("Sidekick", SIDEKICK, "clash", "Clash")).toEqual([{ detection: "structured", adds: 1 }]);
  });
});
