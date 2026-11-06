/**
 * Eleventh audit — entities. TAINTED-WORLD-GENERIC-ICON.
 *
 * The sector map's planet pin takes its icon from
 * ironswornAssets.iconForPlanetType(planet.type) (sceneBuilder.js). The map
 * has ten of the eleven Starforged planet classes; "Tainted World" — rolled on
 * 93–98 of the Planet Type table (oracles/tables/planets.js), so about one
 * planet in seventeen — falls through to Foundry's generic
 * `icons/svg/circle.svg`, with a comment calling it a type that "has no
 * confirmed system asset". The vendored foundry-ironsworn system ships
 * Starforged-Planet-Token-Tainted-01.webp / -02.webp beside the other ten
 * classes' tokens (added in the same vendor commit, "Add planet tokens").
 */
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { iconForPlanetType, IS_BASE } from '../../../src/system/ironswornAssets.js';
import { PLANET_TYPE } from '../../../src/oracles/tables/planets.js';

const VENDOR_ASSETS = fileURLToPath(new URL('../../../vendor/foundry-ironsworn/system/assets', import.meta.url));
/** The vendored file a runtime `systems/foundry-ironsworn/assets/…` path names. */
const vendorFile = (runtimePath) => resolve(VENDOR_ASSETS, runtimePath.slice(`${IS_BASE}/`.length));

describe('every rolled planet class gets the system token it ships', () => {
  it('a Tainted World pin uses the vendor Tainted token, not the generic circle', () => {
    expect(existsSync(resolve(VENDOR_ASSETS, 'planets/Starforged-Planet-Token-Tainted-01.webp'))).toBe(true);   // control: the vendor ships it
    const icon = iconForPlanetType('Tainted World');
    expect(icon).not.toBe('icons/svg/circle.svg');
    expect(icon.startsWith(`${IS_BASE}/planets/`) && existsSync(vendorFile(icon))).toBe(true);
  });

  it('control: the other ten classes the Planet Type table rolls map to vendor files that exist', () => {
    const classes = [...new Set(PLANET_TYPE.map(r => r.result))].filter(t => t !== 'Tainted World');
    expect(classes).toHaveLength(10);
    for (const type of classes) {
      const icon = iconForPlanetType(type);
      expect(existsSync(vendorFile(icon)), `${type} → ${icon}`).toBe(true);
    }
  });
});
