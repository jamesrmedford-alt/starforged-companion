/**
 * A "count a weak hit as a strong hit" ability never improves a miss (issue
 * #325 W13).
 *
 * extractResultImprovement read "count … as a strong hit" (Brawler, Heavy
 * Cannons, Rockhorn, Demolitionist, Engine Upgrade) like Fugitive's "improve
 * the result to a strong hit", and buildImproveState offered the upgrade for
 * any result below a strong hit: a Clash miss turned into a strong hit at no
 * cost — two steps, the miss's Pay the Price undone. decisions.md
 * ("Post-roll 'improve the result' affordance"): only an explicit "improve …
 * to a strong hit" improves any result. The ability texts are the vendored
 * foundry-ironsworn ones (HTML stripped, links kept).
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { scanForApplicableAbilities, extractResultImprovement } from '../../src/moves/abilityScanner.js';
import { buildImproveState } from '../../src/moves/improveResult.js';

const link = (name) => `@Compendium[foundry-ironsworn.starforgedmoves.x]{${name}}`;
const ABILITIES = {
  Rockhorn:      `When you make the ${link('Companion Takes a Hit')} move for the rockhorn, count a weak hit as a strong hit. On a strong hit with a match, its rapid healing makes it unstoppable; give it another +1 health or take +1 momentum.`,
  HeavyCannons:  `Once per fight, when you ${link('Clash')} by committing to an all-or-nothing exchange of fire, add +1, count a weak hit as a strong hit, and mark progress on a hit. On a miss, you must suffer a dire outcome.`,
  Brawler:       `When you ${link('Clash')} in close quarters, you may draw on your momentum to gain advantage. If you do, ${link('Lose Momentum')} (-2) and choose one (before rolling). Aggressive: Count a weak hit as a strong hit. Defensive: Count a miss as a weak hit.`,
  Fugitive:      'You are hunted by a power or authority. When you make a move, you may improve the result to a strong hit. If you do, fill one segment of a four-segment clock to represent hunters closing in.',
};

function assetItem(name) {
  return { id: `asset-${name}`, name, type: 'asset',
    system: { category: 'Path', abilities: [{ enabled: true, description: `<p>${ABILITIES[name]}</p>` }] } };
}

const resolution = (moveId, outcome) => ({
  _id: 'res-1', moveId, outcome, isMatch: false, isProgressMove: false, rollKind: 'action',
  challengeDice: [6, 7], consequences: { momentumChange: 0 },
});

async function improveFor(asset, moveId, moveName, outcome) {
  const actor = makeTestActor({ id: 'pc-kira', name: 'Kira', items: { contents: [assetItem(asset)] } });
  const abilities = await scanForApplicableAbilities({
    moveId, moveName, narration: 'test', characterActor: actor, commandShipActor: null, apiKey: null,
  });
  return buildImproveState(resolution(moveId, outcome), abilities, actor);
}

beforeEach(() => { game.actors?._reset?.(); });

describe('count a weak hit as a strong hit', () => {
  it('Rockhorn: a weak hit on Companion Takes a Hit is offered the improvement; a miss is not', async () => {
    expect((await improveFor('Rockhorn', 'companion_takes_a_hit', 'Companion Takes a Hit', 'weak_hit'))?.canImprove).toBe(true);
    expect(await improveFor('Rockhorn', 'companion_takes_a_hit', 'Companion Takes a Hit', 'miss')).toBeNull();
  });

  it('Heavy Cannons and Brawler: a Clash miss is not improved', async () => {
    expect((await improveFor('HeavyCannons', 'clash', 'Clash', 'weak_hit'))?.canImprove).toBe(true);
    expect(await improveFor('HeavyCannons', 'clash', 'Clash', 'miss')).toBeNull();
    expect(await improveFor('Brawler', 'clash', 'Clash', 'miss')).toBeNull();
  });

  // Fugitive's names no move, so the scan finds it through the Haiku pass:
  // its descriptor is built here as that pass annotates it.
  it("control: Fugitive's 'improve the result to a strong hit' is offered on a miss", () => {
    const actor = makeTestActor({ id: 'pc-kira', name: 'Kira', items: { contents: [] } });
    const fugitive = { assetName: 'Fugitive', resultImprovement: extractResultImprovement(ABILITIES.Fugitive) };
    expect(buildImproveState(resolution('face_danger', 'miss'), [fugitive], actor)?.canImprove).toBe(true);
  });
});
