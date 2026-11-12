// tests/unit/ironswornAssets.test.js
// System asset integration — Phase 1, 3, 4, 9.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import {
  IS_BASE,
  IS_PATHS,
  IS_SYSTEM_ID,
  pickStarshipIcon,
  iconForPlanetType,
  iconForStellarObject,
} from '../../src/system/ironswornAssets.js';
import { PLANET_TYPE } from '../../src/oracles/tables/planets.js';

describe('Phase 1 — IS_PATHS constants', () => {
  it('IS_BASE matches systems/foundry-ironsworn/assets', () => {
    expect(IS_SYSTEM_ID).toBe('foundry-ironsworn');
    expect(IS_BASE).toBe('systems/foundry-ironsworn/assets');
  });

  it('IS_PATHS.PLANETS matches the legacy hardcoded path used in sceneBuilder.js', () => {
    expect(IS_PATHS.PLANETS).toBe('systems/foundry-ironsworn/assets/planets');
  });

  it('IS_PATHS.STELLAR matches the legacy hardcoded path used in sceneBuilder.js', () => {
    expect(IS_PATHS.STELLAR).toBe('systems/foundry-ironsworn/assets/stellar-objects');
  });

  it('IS_PATHS contains every documented sub-path', () => {
    for (const key of ['PLANETS', 'STELLAR', 'STARSHIPS',
                       'ASSETS', 'ORACLES', 'SECTORS', 'ICONS', 'DICE', 'MISC']) {
      expect(IS_PATHS[key]).toMatch(/^systems\/foundry-ironsworn\/assets\//);
    }
  });
});

describe('Phase 3 — pickStarshipIcon', () => {
  it('returns a path under IS_PATHS.STARSHIPS', () => {
    const path = pickStarshipIcon('Wayfinder');
    expect(path.startsWith(`${IS_PATHS.STARSHIPS}/`)).toBe(true);
    // The system ships assets/starships/Ship-NNs.webp (issue #321 U31).
    expect(path).toMatch(/\/Ship-\d{2}s\.webp$/);
  });

  it('is deterministic — same seed → same icon', () => {
    expect(pickStarshipIcon('Wayfinder')).toBe(pickStarshipIcon('Wayfinder'));
    expect(pickStarshipIcon('Iron Wraith')).toBe(pickStarshipIcon('Iron Wraith'));
  });

  it('different seeds may produce different icons (sanity)', () => {
    const seeds = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const icons = new Set(seeds.map(pickStarshipIcon));
    expect(icons.size).toBeGreaterThan(1);
  });

  it('produces a token in the 01..15 range', () => {
    for (const seed of ['x', 'y', 'z', 'foo', 'bar', 'baz', 'qux', 'quux', 'short', 'longer']) {
      const m = pickStarshipIcon(seed).match(/\/Ship-(\d{2})s\.webp$/);
      const num = parseInt(m[1], 10);
      expect(num).toBeGreaterThanOrEqual(1);
      expect(num).toBeLessThanOrEqual(15);
    }
  });
});

// Issue #321 U31 — the picked image must exist in the system. The runtime path
// maps back to the vendored source tree (systems/foundry-ironsworn/X →
// vendor/foundry-ironsworn/system/X, as ironswornAssets.js documents). CI checks
// the submodule out; a checkout without it skips these.
describe('pickStarshipIcon — against the vendored foundry-ironsworn', () => {
  const VENDOR = 'vendor/foundry-ironsworn/system';
  const vendored = fs.existsSync(`${VENDOR}/assets`);
  const toVendor = (runtimePath) => runtimePath.replace(`systems/${IS_SYSTEM_ID}/`, `${VENDOR}/`);

  it.skipIf(!vendored)('control: the system ships Ship-10s.webp (its own create-actor default) and the planet tokens', () => {
    expect(fs.existsSync(`${VENDOR}/assets/starships/Ship-10s.webp`)).toBe(true);
    expect(fs.existsSync(toVendor(iconForPlanetType('Desert World')))).toBe(true);
  });

  it.skipIf(!vendored)('every seed resolves to a starship image the system actually ships', () => {
    const seeds = ['Wayfinder', 'Iron Wraith', 'abc123def456ghij', 'Kestrel', 'x'];
    const missing = seeds.map(pickStarshipIcon).filter(p => !fs.existsSync(toVendor(p)));
    expect(missing).toEqual([]);
  });

  it.skipIf(!vendored)('control: all fifteen designs the picker spans exist', () => {
    const files = fs.readdirSync(`${VENDOR}/assets/starships`);
    for (let i = 1; i <= 15; i++) {
      expect(files).toContain(`Ship-${String(i).padStart(2, '0')}s.webp`);
    }
  });
});

// Issue #342 Z61 (TAINTED-WORLD-GENERIC-ICON) — a sector's planet pin takes its
// icon from iconForPlanetType(planet.type) (sceneBuilder.js). The map had ten
// of the eleven classes the Planet Type table rolls: a Tainted World (93–98,
// about one planet in seventeen) drew Foundry's generic circle, though the
// system ships its Tainted tokens beside the other ten.
describe('every rolled planet class gets the system token it ships', () => {
  const VENDOR = 'vendor/foundry-ironsworn/system';
  const vendored = fs.existsSync(`${VENDOR}/assets`);
  const toVendor = (runtimePath) => runtimePath.replace(`systems/${IS_SYSTEM_ID}/`, `${VENDOR}/`);

  it.skipIf(!vendored)('a Tainted World pin uses the vendor Tainted token, not the generic circle', () => {
    expect(fs.existsSync(`${VENDOR}/assets/planets/Starforged-Planet-Token-Tainted-01.webp`)).toBe(true);   // control: the vendor ships it
    const icon = iconForPlanetType('Tainted World');
    expect(icon).not.toBe('icons/svg/circle.svg');
    expect(icon.startsWith(`${IS_BASE}/planets/`) && fs.existsSync(toVendor(icon))).toBe(true);
  });

  it.skipIf(!vendored)('every class the Planet Type table rolls maps to a vendor file that exists', () => {
    const classes = [...new Set(PLANET_TYPE.map(r => r.result))];
    expect(classes).toHaveLength(11);
    for (const type of classes) {
      const icon = iconForPlanetType(type);
      expect(fs.existsSync(toVendor(icon)), `${type} → ${icon}`).toBe(true);
    }
  });
});

describe('iconForPlanetType / iconForStellarObject', () => {
  it('returns a known asset path for "Desert World"', () => {
    expect(iconForPlanetType('Desert World')).toBe(
      `${IS_PATHS.PLANETS}/Starforged-Planet-Token-Desert-01.webp`
    );
  });

  it('returns the generic circle for unknown planet types', () => {
    expect(iconForPlanetType('Made-up World')).toBe('icons/svg/circle.svg');
  });

  it('returns the Tainted token for "Tainted World" (issue #342 Z61)', () => {
    expect(iconForPlanetType('Tainted World')).toBe(
      `${IS_PATHS.PLANETS}/Starforged-Planet-Token-Tainted-01.webp`
    );
  });

  it('returns the bundled token for the black-hole stellar string', () => {
    expect(iconForStellarObject('Black hole allows nothing to escape—not even light'))
      .toBe(`${IS_PATHS.STELLAR}/Starforged-Stellar-Token-Black-Hole-01.webp`);
  });

  it('falls back to icons/svg/sun.svg for an unknown stellar string', () => {
    expect(iconForStellarObject('Made-up stellar object')).toBe('icons/svg/sun.svg');
  });
});

