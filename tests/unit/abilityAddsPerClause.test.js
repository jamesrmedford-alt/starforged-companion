/**
 * An ability adds what its own clause gives the move being made, never the
 * sum of every "add +N" in its text (issue #325 W12).
 *
 * abilityScanner.extractAdds summed every add: Gunner's "When you Clash with
 * it, add +1. When you Enter the Fray or Endure Stress while wielding it, add
 * +1 …" gave a Clash +2; Gunslinger's Gain Ground +2; Infiltrator's Face
 * Danger +2; Stealth Tech's "add +1 on your next Strike" landed on this
 * Strike; through the Haiku pass Diplomat and Tech gave +3. The confirm
 * dialog's checkbox is all or nothing, so the player took the wrong add or
 * none. The texts below are the vendored foundry-ironsworn asset abilities
 * (HTML stripped, links kept — collectEnabledAbilities' form); the second
 * block reads them from vendor/ when the submodule is checked out.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { extractAdds, scanForApplicableAbilities } from '../../src/moves/abilityScanner.js';

const link = (name) => `@Compendium[foundry-ironsworn.starforgedmoves.x]{${name}}`;
const TEXT = {
  gunner:      `Give your favorite gun a name. When you ${link('Clash')} with it, add +1. When you ${link('Enter the Fray')} or ${link('Endure Stress')} while wielding it, add +1 and take +1 momentum on a hit.`,
  gunslinger:  `When you ${link('Gain Ground')} or ${link('React Under Fire')} by moving into cover, add +1. On a strong hit, this cover gives you leverage; add +1 when you make a move to attack or defend at range. If you then score a miss, the cover is lost or compromised.`,
  infiltrator: `When you ${link('Face Danger')} or ${link('Secure an Advantage')} to establish a false identity, add +1. On a hit, you may add +1 when using that identity to deceive or influence others.`,
  stealthTech: `When you are poised to ${link('Strike')} from hiding, you may roll +shadow. If you do, choose one (before rolling). Strike true: Reroll any dice. Strike hard: Mark progress on a hit. On a strong hit with a match, you also remain totally undetected; take +2 momentum and add +1 on your next ${link('Strike')}.`,
  diplomat:    `When you make a move to defuse, reason, or negotiate, add +1. On a miss, you may take a different tack. Envision this new approach, reroll all dice, and add +2. If you score a miss yet again, face a dire complication or blow to your reputation as you ${link('Pay the Price')}.`,
  tech:        'When you make a move to configure, optimize, hack, or disrupt an electronic system, add +1. On a weak hit, you can choose to press your luck. If you do, reroll all dice and add +2 (instead of +1).',
  ace:         `When you ${link('Face Danger')} or ${link('React Under Fire')} by guiding your vehicle through a hazard or out of harm's way, add +1 and take +1 momentum on a hit.`,
};

describe('extractAdds — the clause for the move being made', () => {
  it('control: Ace\'s single clause gives Face Danger +1', () => {
    expect(extractAdds(TEXT.ace, 'Face Danger')).toBe(1);
  });

  it('Gunner: a Clash is +1, not +2; Enter the Fray +1; a Strike, which it does not name, nothing', () => {
    expect(extractAdds(TEXT.gunner, 'Clash')).toBe(1);
    expect(extractAdds(TEXT.gunner, 'Enter the Fray')).toBe(1);
    expect(extractAdds(TEXT.gunner, 'Strike')).toBe(0);
  });

  it('Gunslinger: Gain Ground into cover is +1, not +2', () => {
    expect(extractAdds(TEXT.gunslinger, 'Gain Ground')).toBe(1);
  });

  it('Infiltrator: Face Danger for a false identity is +1, not +2', () => {
    expect(extractAdds(TEXT.infiltrator, 'Face Danger')).toBe(1);
  });

  it('Stealth Tech: a Strike from hiding gets nothing — the +1 is for the NEXT Strike', () => {
    expect(extractAdds(TEXT.stealthTech, 'Strike')).toBe(0);
  });

  it('Diplomat and Tech (no move named — the Haiku pass): +1, not +3', () => {
    expect(extractAdds(TEXT.diplomat, 'Compel')).toBe(1);
    expect(extractAdds(TEXT.tech, 'Face Danger')).toBe(1);
    expect(extractAdds(TEXT.diplomat)).toBe(1);
  });
});

describe('scanForApplicableAbilities carries the move\'s own add', () => {
  const asset = (name, text) => ({ id: `asset-${name}`, name, type: 'asset',
    system: { category: 'Path', abilities: [{ enabled: true, description: `<p>${text}</p>` }] } });

  it('a structured Gunner match on Clash offers +1', async () => {
    const found = await scanForApplicableAbilities({
      moveId: 'clash', moveName: 'Clash', narration: 'test', commandShipActor: null, apiKey: '',
      characterActor: { id: 'pc-1', items: { contents: [asset('Gunner', TEXT.gunner)] } },
    });
    expect(found.map(a => a.adds)).toEqual([1]);
  });
});

const ASSET_DIR = path.resolve(__dirname, '../../vendor/foundry-ironsworn/json-packs/starforged-assets');
const HAVE_VENDOR = fs.existsSync(ASSET_DIR) && fs.readdirSync(ASSET_DIR).length > 0;

describe.skipIf(!HAVE_VENDOR)('the vendored asset texts', () => {
  function vendorAsset(name, enabledIdx) {
    const file = fs.readdirSync(ASSET_DIR).find(f => f.startsWith(`${name.replace(/ /g, '_')}_`));
    const data = JSON.parse(fs.readFileSync(path.join(ASSET_DIR, file), 'utf8'));
    return { id: `asset-${name}`, name: data.name, type: 'asset',
      system: { ...data.system, abilities: data.system.abilities.map((ab, i) => ({ ...ab, enabled: enabledIdx.includes(i) })) } };
  }
  async function addsFor(assetName, enabledIdx, moveId, moveName) {
    const characterActor = { id: 'pc-1', items: { contents: [vendorAsset(assetName, enabledIdx)] } };
    const found = await scanForApplicableAbilities({ moveId, moveName, narration: 'test', characterActor, commandShipActor: null, apiKey: '' });
    return found.map(a => a.adds);
  }

  it('Gunner Clash +1, Gunslinger Gain Ground +1, Infiltrator Face Danger +1, Stealth Tech Strike 0', async () => {
    expect(await addsFor('Gunner', [0, 1, 2], 'clash', 'Clash')).toEqual([1]);
    expect(await addsFor('Gunslinger', [0, 1], 'gain_ground', 'Gain Ground')).toEqual([1]);
    expect(await addsFor('Infiltrator', [0, 1], 'face_danger', 'Face Danger')).toEqual([1]);
    expect(await addsFor('Stealth Tech', [2], 'strike', 'Strike')).toEqual([0]);
  });
});
