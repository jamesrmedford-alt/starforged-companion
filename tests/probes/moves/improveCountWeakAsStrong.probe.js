/**
 * PROBE — MC-03 IMPROVE-WEAK-AS-STRONG-ON-MISS (eighth bug audit, moves-core)
 *
 * What the user does: a PC with Brawler's second ability ("When you Clash in
 * close quarters, you may draw on your momentum … Lose Momentum (-2) and
 * choose one (before rolling). Aggressive: Count a weak hit as a strong hit.
 * Defensive: Count a miss as a weak hit.") — or a ship with Heavy Cannons'
 * all-or-nothing Clash, or a Rockhorn companion taking a hit — rolls the move
 * and misses.
 *
 * What happens: the move card offers "✦ Improve to Strong Hit (Brawler)",
 * with no cost (the ability has no clock), and a click turns the miss into a
 * strong hit — mark progress twice, in control, the miss's Pay the Price
 * undone. abilityScanner.extractResultImprovement reads "count … as a strong
 * hit" as Fugitive's "improve the result to a strong hit" (any result, at the
 * cost of its clock), and improveResult.buildImproveState offers that for a
 * weak hit OR a miss. These abilities count a WEAK HIT as a strong hit — never
 * a miss — and Brawler's is chosen before rolling, for Lose Momentum (-2).
 *
 * What should happen: a "count a weak hit as a strong hit" ability never
 * improves a miss (decisions.md, "Post-roll 'improve the result' affordance":
 * "only an explicit 'improve … to a strong hit' phrasing triggers it").
 *
 * The texts are the vendored foundry-ironsworn asset data.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { scanForApplicableAbilities } from '../../../src/moves/abilityScanner.js';
import { buildImproveState } from '../../../src/moves/improveResult.js';

const ASSET_DIR = path.resolve(__dirname, '../../../vendor/foundry-ironsworn/json-packs/starforged-assets');

function vendorAsset(name, enabledIdx) {
  const file = fs.readdirSync(ASSET_DIR).find(f => f.startsWith(`${name.replace(/ /g, '_')}_`));
  const data = JSON.parse(fs.readFileSync(path.join(ASSET_DIR, file), 'utf8'));
  return {
    id: `asset-${name}`, name: data.name, type: 'asset',
    system: { ...data.system, abilities: data.system.abilities.map((ab, i) => ({ ...ab, enabled: enabledIdx.includes(i) })) },
  };
}

const actor = { id: 'pc-1' };
const resolution = (moveId, outcome) => ({
  _id: 'r1', moveId, outcome, isMatch: false, isProgressMove: false, rollKind: 'action',
  consequences: { momentumChange: 0 },
});

async function improveOnMiss(assetName, enabledIdx, moveId, moveName, holder = 'character') {
  const asset = vendorAsset(assetName, enabledIdx);
  const pc   = { id: 'pc-1', items: { contents: holder === 'character' ? [asset] : [] } };
  const ship = holder === 'ship' ? { id: 'ship-1', items: { contents: [asset] } } : null;
  const abilities = await scanForApplicableAbilities({
    moveId, moveName, narration: 'test', characterActor: pc, commandShipActor: ship, apiKey: '',
  });
  return buildImproveState(resolution(moveId, 'miss'), abilities, actor);
}

describe('a "count a weak hit as a strong hit" ability does not improve a miss', () => {
  it('control: Fugitive ("improve the result to a strong hit") is offered on a miss', () => {
    const fugitive = [{ assetId: 'f', abilityIndex: 0, assetName: 'Fugitive', resultImprovement: { improveTo: 'strong_hit' }, hasClock: true, clockMax: 4 }];
    expect(buildImproveState(resolution('face_danger', 'miss'), fugitive, actor)?.canImprove).toBe(true);
  });

  it('Brawler (second ability) on a Clash miss: no improvement offered', async () => {
    expect(await improveOnMiss('Brawler', [0, 1], 'clash', 'Clash')).toBeNull();
  });

  it('Heavy Cannons (ship module, second ability) on a Clash miss: no improvement offered', async () => {
    expect(await improveOnMiss('Heavy Cannons', [0, 1], 'clash', 'Clash', 'ship')).toBeNull();
  });

  it('Rockhorn (second ability) on a Companion Takes a Hit miss: no improvement offered', async () => {
    expect(await improveOnMiss('Rockhorn', [0, 1], 'companion_takes_a_hit', 'Companion Takes A Hit')).toBeNull();
  });
});
