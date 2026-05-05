// tests/unit/ironswornAssets.test.js
// System asset integration — Phase 1, 3, 4, 9.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  IS_BASE,
  IS_PATHS,
  IS_SYSTEM_ID,
  isIronswornAvailable,
  _resetIronswornAvailabilityCache,
  pickStarshipIcon,
  resolveLocationArt,
  iconForPlanetType,
  iconForStellarObject,
  statIcon,
  assetIcon,
  oracleIcon,
} from '../../src/system/ironswornAssets.js';

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
    for (const key of ['PLANETS', 'STELLAR', 'STARSHIPS', 'LOCATIONS',
                       'ASSETS', 'ORACLES', 'SECTORS', 'ICONS', 'DICE', 'MISC']) {
      expect(IS_PATHS[key]).toMatch(/^systems\/foundry-ironsworn\/assets\//);
    }
  });
});

describe('Phase 1 — isIronswornAvailable', () => {
  beforeEach(() => {
    _resetIronswornAvailabilityCache();
  });

  it('returns true when game.system.id matches', async () => {
    const original = global.game.system;
    global.game.system = { id: 'foundry-ironsworn' };
    try {
      expect(await isIronswornAvailable()).toBe(true);
    } finally {
      global.game.system = original;
    }
  });

  it('returns true when game.systems has foundry-ironsworn entry', async () => {
    const originalSystems = global.game.systems;
    global.game.systems = { get: (id) => id === 'foundry-ironsworn' ? { id } : null };
    try {
      expect(await isIronswornAvailable()).toBe(true);
    } finally {
      global.game.systems = originalSystems;
    }
  });

  it('returns false when neither system match nor registered system is found', async () => {
    const origSystem = global.game.system;
    const origSystems = global.game.systems;
    global.game.system = { id: 'other' };
    global.game.systems = { get: () => null };
    try {
      expect(await isIronswornAvailable()).toBe(false);
    } finally {
      global.game.system = origSystem;
      global.game.systems = origSystems;
    }
  });

  it('caches the result so repeat probes do not re-read game state', async () => {
    global.game.system = { id: 'foundry-ironsworn' };
    expect(await isIronswornAvailable()).toBe(true);
    global.game.system = { id: 'changed-after-cache' };
    // Still true because cached
    expect(await isIronswornAvailable()).toBe(true);
  });
});

describe('Phase 3 — pickStarshipIcon', () => {
  it('returns a path under IS_PATHS.STARSHIPS', () => {
    const path = pickStarshipIcon('Wayfinder');
    expect(path.startsWith(`${IS_PATHS.STARSHIPS}/`)).toBe(true);
    expect(path).toMatch(/Starforged-Starship-Token-\d{2}\.webp$/);
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
      const m = pickStarshipIcon(seed).match(/Token-(\d{2})\.webp$/);
      const num = parseInt(m[1], 10);
      expect(num).toBeGreaterThanOrEqual(1);
      expect(num).toBeLessThanOrEqual(15);
    }
  });
});

describe('Phase 4 — resolveLocationArt', () => {
  it('resolves every category × environment combination under "auto"', () => {
    for (const cat of ['settlement', 'vault', 'derelict']) {
      for (const env of ['deep-space', 'orbital', 'planetside']) {
        const path = resolveLocationArt(cat, env, 'auto');
        expect(path).toMatch(new RegExp(`^${IS_PATHS.LOCATIONS}/Kirin/`));
      }
    }
  });

  it('honours kirin preference', () => {
    const path = resolveLocationArt('settlement', 'orbital', 'kirin');
    expect(path).toBe(`${IS_PATHS.LOCATIONS}/Kirin/Settlement-Orbital.svg`);
  });

  it('honours rains preference (.webp)', () => {
    const path = resolveLocationArt('vault', 'planetside', 'rains');
    expect(path).toBe(`${IS_PATHS.LOCATIONS}/Rains/Vault-Planetside.webp`);
  });

  it('default preference is "auto"', () => {
    expect(resolveLocationArt('derelict', 'deep-space'))
      .toBe(`${IS_PATHS.LOCATIONS}/Kirin/Derelict-DeepSpace.svg`);
  });

  it('returns null for unknown category', () => {
    expect(resolveLocationArt('mystery', 'orbital')).toBeNull();
  });

  it('returns null for unknown environment', () => {
    expect(resolveLocationArt('settlement', 'underground')).toBeNull();
  });
});

describe('iconForPlanetType / iconForStellarObject', () => {
  it('returns a known asset path for "Desert World"', () => {
    expect(iconForPlanetType('Desert World')).toBe(
      `${IS_PATHS.PLANETS}/Starforged-Planet-Token-Desert-01.webp`
    );
  });

  it('returns the generic circle for unknown planet types', () => {
    expect(iconForPlanetType('Tainted World')).toBe('icons/svg/circle.svg');
  });

  it('returns the bundled token for the black-hole stellar string', () => {
    expect(iconForStellarObject('Black hole allows nothing to escape—not even light'))
      .toBe(`${IS_PATHS.STELLAR}/Starforged-Stellar-Token-Black-Hole-01.webp`);
  });

  it('falls back to icons/svg/sun.svg for an unknown stellar string', () => {
    expect(iconForStellarObject('Made-up stellar object')).toBe('icons/svg/sun.svg');
  });
});

describe('Phase 9 — stat / asset / oracle icon resolvers', () => {
  it('statIcon returns paths under IS_PATHS.ICONS for known stats', () => {
    expect(statIcon('edge')).toBe(`${IS_PATHS.ICONS}/edge.svg`);
    expect(statIcon('heart')).toBe(`${IS_PATHS.ICONS}/heart.svg`);
    expect(statIcon('iron')).toBe(`${IS_PATHS.ICONS}/iron.svg`);
    expect(statIcon('shadow')).toBe(`${IS_PATHS.ICONS}/shadow.svg`);
    expect(statIcon('wits')).toBe(`${IS_PATHS.ICONS}/wits.svg`);
  });

  it('statIcon returns null for unknown slugs', () => {
    expect(statIcon('mystery')).toBeNull();
    expect(statIcon('')).toBeNull();
    expect(statIcon(undefined)).toBeNull();
  });

  it('assetIcon and oracleIcon kebab-case the input', () => {
    expect(assetIcon('Command Vehicle')).toBe(`${IS_PATHS.ASSETS}/command-vehicle.svg`);
    expect(oracleIcon('Action_Oracle')).toBe(`${IS_PATHS.ORACLES}/action-oracle.svg`);
  });

  it('assetIcon and oracleIcon return null for empty input', () => {
    expect(assetIcon('')).toBeNull();
    expect(oracleIcon(null)).toBeNull();
  });
});
