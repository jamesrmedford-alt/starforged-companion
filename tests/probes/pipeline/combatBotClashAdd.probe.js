/**
 * PROBE — PIPE-01 COMBAT-BOT-CLASH-ADD (tenth audit, area pipeline)
 *
 * What the user does: a PC with the Combat Bot companion asset (its first
 * ability enabled) rolls Clash. The ability text — one sentence — reads
 * "When you Strike aided by the bot, add +1; if you Clash, take +1 momentum
 * on a hit." (vendor Combat_Bot). Clash is given momentum on a hit, no add.
 *
 * What happens: the ability scanner's structured pass keys the ability to
 * Clash (it is linked) and extractAdds reads the sentence's first add — the
 * +1 that belongs to Strike — so the confirm dialog offers Combat Bot "+1"
 * pre-checked on Clash, and the Clash rolls +1 it is not given.
 *
 * What should happen: the add offered is the one the text gives the move
 * being made (issue #325 W12; issue #329 X04: "an ability adds what its text
 * gives the move being made") — 0 for Clash, +1 for Strike.
 *
 * Control: the same text offers +1 on Strike; Sidekick's second ability
 * ("When you Enter the Fray … take +2 momentum on a hit. When you Clash
 * together, add +1.") offers 0 on Enter the Fray and +1 on Clash — the
 * per-sentence rule works when the grants are in separate sentences.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/pipeline/combatBotClashAdd.probe.js
 */

import { describe, it, expect } from "vitest";
import { extractAdds, structuredMatches, scanForApplicableAbilities } from "../../../src/moves/abilityScanner.js";

const LINK = (id, name) => `@Compendium[foundry-ironsworn.starforgedmoves.${id}]{${name}}`;
const STRIKE = LINK("ae5994ceb3cba098", "Strike");
const CLASH  = LINK("723192c97fec4fe2", "Clash");
const ETF    = LINK("2f2ba4090b22a122", "Enter the Fray");

// vendor/foundry-ironsworn/json-packs/starforged-assets/Combat_Bot_*.json, ability 1 (HTML stripped as readAssetAbilities does)
const COMBAT_BOT = `Your combat bot companion fights at your side. When you ${STRIKE} aided by the bot, add +1; if you ${CLASH}, take +1 momentum on a hit.`;
// Sidekick, ability 2
const SIDEKICK = `When you ${ETF} with the support of your sidekick, take +2 momentum on a hit. When you ${CLASH} together, add +1.`;

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

describe("PIPE-01 — Combat Bot's +1 is Strike's, not Clash's", () => {
  it("extractAdds gives Clash no add from the Combat Bot sentence", () => {
    expect(structuredMatches([{ text: COMBAT_BOT }], "Clash")).toHaveLength(1);   // sanity: the ability is keyed to Clash
    // Expected 0: "if you Clash, take +1 momentum on a hit" — momentum, not an add. Actual: 1.
    expect(extractAdds(COMBAT_BOT, "Clash")).toBe(0);
  });

  it("the scanner's structured pass offers Combat Bot with no add on Clash", async () => {
    const got = await offered("Combat Bot", COMBAT_BOT, "clash", "Clash");
    expect(got).toHaveLength(1);
    expect(got[0].detection).toBe("structured");
    // Expected adds 0 (the ability surfaces, unchecked). Actual: 1, pre-checked on the confirm dialog.
    expect(got[0].adds).toBe(0);
  });

  it("control: the same text gives Strike +1", async () => {
    expect(extractAdds(COMBAT_BOT, "Strike")).toBe(1);
    const got = await offered("Combat Bot", COMBAT_BOT, "strike", "Strike");
    expect(got).toEqual([{ detection: "structured", adds: 1 }]);
  });

  it("control: Sidekick's separate sentences give Enter the Fray 0 and Clash +1", async () => {
    expect(extractAdds(SIDEKICK, "Enter the Fray")).toBe(0);
    expect(extractAdds(SIDEKICK, "Clash")).toBe(1);
    expect(await offered("Sidekick", SIDEKICK, "enter_the_fray", "Enter the Fray")).toEqual([{ detection: "structured", adds: 0 }]);
    expect(await offered("Sidekick", SIDEKICK, "clash", "Clash")).toEqual([{ detection: "structured", adds: 1 }]);
  });
});
