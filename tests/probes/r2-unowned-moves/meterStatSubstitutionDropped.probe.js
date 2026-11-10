/**
 * PROBE R2U-1 — ASSET-METER-STAT-SUB-DROPPED (RULES)
 *
 * An asset that lets a move be rolled with a meter — "+supply", "+spirit" —
 * never offers the swap: the scanner only knows the five action stats.
 *
 *   src/moves/abilityScanner.js:58-65  SUBSTITUTABLE_STATS = edge/heart/iron/
 *     shadow/wits — "supply / integrity / health / spirit / companion_health
 *     are situational stats scoped to specific moves and never substitute"
 *   src/moves/abilityScanner.js:493 extractStatReplacement builds its cue
 *     regexes from SUBSTITUTABLE_STATS only (and parseHaikuResponse :304 drops
 *     any other stat the fallback pass names)
 *   src/moves/movePipeline.js:691-696 the pipeline would roll the picked stat
 *     (appliedStatReplacement → statUsed), and statEnrichment.resolveStatValue
 *     :400-406 reads supply / spirit off the sheet — the plumbing exists; only
 *     the offer is missing.
 *
 * The vendored assets say otherwise (vendor/foundry-ironsworn/json-packs/
 * starforged-assets):
 *   Trader #1          "When you Sojourn or Compel, you may roll +supply. If you
 *                       do, Sacrifice Resources (-1)."
 *   Weapon Master #3   "When you Secure an Advantage by suiting up …, you may
 *                       roll +supply. If you do, take +2 momentum on a hit."
 *   Seer #2            "When you focus or meditate to Gather Information …, roll
 *                       +spirit and take +1 momentum on a hit."
 *   (and +integrity / +its health: Overseer, Rover, Skiff, Snub Fighter, Ace,
 *    Service Pod, Sensor Array, Survey Bot, Combat Bot, Utility Bot, Banshee,
 *    Sidekick — about twenty abilities in all; Empath #3 "+spirit" too.)
 *
 * Scenario (the confirm dialog's offer is the scan's output):
 *   1. Kira has Trader. She types "I lean on the dockmaster — I can make this
 *      worth his while" → Compel.
 *   2. The confirm dialog lists Trader with no "Substitute +supply" radio
 *      (statReplacement null), and the dialog has no stat picker (issue #325
 *      W19), so the Compel rolls +heart — the ability's roll can never be made.
 *   Expected: Trader offers +supply on Compel (and Sojourn); Seer +spirit on
 *   Gather Information; Weapon Master +supply on Secure an Advantage.
 *   Actual: statReplacement null for every one of them.
 *
 * Control: an action-stat swap the same pass reads (Revenant's "you may roll
 * +heart" on Gather Information) is offered today.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanForApplicableAbilities } from '../../../src/moves/abilityScanner.js';

const DIR = fileURLToPath(new URL('../../../vendor/foundry-ironsworn/json-packs/starforged-assets', import.meta.url));
const HAVE_VENDOR = fs.existsSync(DIR) && fs.readdirSync(DIR).length > 0;

/** The vendored asset's ability HTML, as the system stores it on the Item. */
function vendoredAbility(assetName, index) {
  const f = fs.readdirSync(DIR).find(n => n.startsWith(assetName.replace(/ /g, '_') + '_'));
  const d = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  return { name: d.name, category: d.system.category, description: d.system.abilities[index].description };
}

/** The scan's stat offers for one enabled ability, as the confirm dialog gets them. */
async function offeredStats(assetName, index, moveId, moveName) {
  const ab = vendoredAbility(assetName, index);
  const characterActor = {
    id: 'pc-kira', name: 'Kira', type: 'character', system: { heart: 2, wits: 2, iron: 1, edge: 1, shadow: 1 },
    items: { contents: [{ id: 'asset-1', name: ab.name, type: 'asset',
      system: { category: ab.category, abilities: [{ enabled: true, description: ab.description }] } }] },
  };
  const found = await scanForApplicableAbilities({
    moveId, moveName, narration: 'test', apiKey: '', commandShipActor: null, characterActor,
  });
  return found.map(a => a.statReplacement ?? null);
}

describe.skipIf(!HAVE_VENDOR)('R2U-1 ASSET-METER-STAT-SUB-DROPPED — a meter an asset says to roll is never offered', () => {
  it("Trader's 'When you Sojourn or Compel, you may roll +supply' offers +supply on a Compel", async () => {
    expect(await offeredStats('Trader', 0, 'compel', 'Compel')).toEqual(['supply']);
  });

  it("Trader offers +supply on a Sojourn too", async () => {
    expect(await offeredStats('Trader', 0, 'sojourn', 'Sojourn')).toEqual(['supply']);
  });

  it("Weapon Master's 'you may roll +supply' offers +supply on Secure an Advantage", async () => {
    expect(await offeredStats('Weapon Master', 2, 'secure_an_advantage', 'Secure an Advantage')).toEqual(['supply']);
  });

  it("Seer's 'Gather Information …, roll +spirit' offers +spirit", async () => {
    expect(await offeredStats('Seer', 1, 'gather_information', 'Gather Information')).toEqual(['spirit']);
  });

  it('control: an action-stat swap (Revenant\'s "you may roll +heart" on Gather Information) is offered', async () => {
    expect(await offeredStats('Revenant', 2, 'gather_information', 'Gather Information')).toEqual(['heart']);
  });
});
