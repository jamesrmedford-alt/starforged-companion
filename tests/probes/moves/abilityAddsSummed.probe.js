/**
 * PROBE — MC-02 ABILITY-ADDS-SUMMED (eighth bug audit, moves-core)
 *
 * What the user does: a PC with an upgraded asset makes a move the asset
 * names — a Gunner who Clashes with their named gun, a Gunslinger who Gains
 * Ground by moving into cover, an Infiltrator who Faces Danger to establish a
 * false identity, a Stealth Tech ship that Enters the Fray from ambush, a
 * Stealth Tech ship that Strikes from hiding.
 *
 * What happens: the confirm dialog lists the ability pre-checked with the
 * wrong add, and Accept rolls with it. abilityScanner.extractAdds sums EVERY
 * "add +N" in the ability's text, though the clauses belong to different
 * triggers or later rolls: Gunner's "When you Clash with it, add +1. When you
 * Enter the Fray or Endure Stress while wielding it, add +1 …" gives a Clash
 * +2; Gunslinger's "add +1. On a strong hit … add +1 when you make a move to
 * attack or defend at range" gives Gain Ground +2; Stealth Tech's "add +1 on
 * your next Strike" (after a strong hit with a match) is added to THIS Strike.
 * Through the Haiku pass, Diplomat ("add +1 … reroll all dice, and add +2")
 * and Tech ("add +1 … reroll all dice and add +2 (instead of +1)") give +3.
 * The checkbox is all or nothing, so the player can only take the wrong add
 * or none (the confirm dialog has no adds input).
 *
 * What should happen: the add the move gets is the one its own clause gives:
 * +1 for each of these.
 *
 * tests/unit/abilityScanner.test.js "sums when multiple add clauses are
 * present" pins the sum with a hand-written string ("add +1 to one roll,
 * add +2 to another") — a sentence that itself names two different rolls.
 *
 * The texts are the vendored foundry-ironsworn asset data
 * (vendor/foundry-ironsworn/json-packs/starforged-assets).
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { extractAdds, scanForApplicableAbilities } from '../../../src/moves/abilityScanner.js';

const ASSET_DIR = path.resolve(__dirname, '../../../vendor/foundry-ironsworn/json-packs/starforged-assets');

/** The vendored asset whose name is `name`, as an embedded Item with `enabled` abilities. */
function vendorAsset(name, enabledIdx) {
  const file = fs.readdirSync(ASSET_DIR).find(f => f.startsWith(`${name.replace(/ /g, '_')}_`));
  const data = JSON.parse(fs.readFileSync(path.join(ASSET_DIR, file), 'utf8'));
  return {
    id: `asset-${name}`, name: data.name, type: 'asset',
    system: {
      ...data.system,
      abilities: data.system.abilities.map((ab, i) => ({ ...ab, enabled: enabledIdx.includes(i) })),
    },
  };
}

const textOf = (name, idx) => {
  const a = vendorAsset(name, [idx]);
  return a.system.abilities[idx].description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
};

async function addsFor(assetName, enabledIdx, moveId, moveName) {
  const characterActor = { id: 'pc-1', items: { contents: [vendorAsset(assetName, enabledIdx)] } };
  const found = await scanForApplicableAbilities({
    moveId, moveName, narration: 'test', characterActor, commandShipActor: null, apiKey: '',
  });
  return found.map(a => a.adds);
}

describe('the adds an ability gives the move being rolled', () => {
  it('control: Ace\'s first ability (one "add +1") gives Face Danger +1', async () => {
    expect(await addsFor('Ace', [0], 'face_danger', 'Face Danger')).toEqual([1]);
  });

  it('Gunner (third ability): a Clash with the named gun is +1, not +2', async () => {
    expect(await addsFor('Gunner', [0, 1, 2], 'clash', 'Clash')).toEqual([1]);
  });

  it('Gunslinger (second ability): Gain Ground into cover is +1, not +2', async () => {
    expect(await addsFor('Gunslinger', [0, 1], 'gain_ground', 'Gain Ground')).toEqual([1]);
  });

  it('Infiltrator (second ability): Face Danger to establish a false identity is +1, not +2', async () => {
    expect(await addsFor('Infiltrator', [0, 1], 'face_danger', 'Face Danger')).toEqual([1]);
  });

  it('Stealth Tech (third ability): Strike from hiding gets no add — the +1 is for the NEXT Strike', async () => {
    expect(await addsFor('Stealth Tech', [2], 'strike', 'Strike')).toEqual([0]);
  });

  it('Diplomat (second ability, Haiku pass): a negotiation adds +1, not +3', () => {
    expect(extractAdds(textOf('Diplomat', 1))).toBe(1);
  });

  it('Tech (first ability, Haiku pass): hacking a system adds +1, not +3', () => {
    expect(extractAdds(textOf('Tech', 0))).toBe(1);
  });
});
