// tests/probes/infra/starshipIconPath.probe.test.js
//
// PROBE (infra audit) — STARSHIP-ICON-404.
//
// `pickStarshipIcon` builds `systems/foundry-ironsworn/assets/starships/
// Starforged-Starship-Token-NN.webp`. The vendored foundry-ironsworn (v1.27.0)
// ships its starship art as `assets/starships/Ship-NNs.webp` — the system's
// own createActorDialog uses `Ship-10s.webp` — and has no
// `Starforged-Starship-Token-*` file at all. seedStarshipActor (ship.js) stamps
// this path on every non-command starship's `img` + prototype token, and the
// sector scene's command-vehicle token falls back to it, so those images 404.
//
// Maps the runtime path back to the vendored source tree
// (systems/foundry-ironsworn/X → vendor/foundry-ironsworn/system/X, the same
// mapping ironswornAssets.js documents) and asserts the file exists.
// FAILS today.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { pickStarshipIcon, IS_SYSTEM_ID } from '../../../src/system/ironswornAssets.js';

const toVendor = (runtimePath) =>
  runtimePath.replace(`systems/${IS_SYSTEM_ID}/`, 'vendor/foundry-ironsworn/system/');

describe('PROBE STARSHIP-ICON-404 — picked starship icon exists in the system', () => {
  it('the planet-icon mapping (same convention) does resolve — control', () => {
    expect(fs.existsSync('vendor/foundry-ironsworn/system/assets/planets/Starforged-Planet-Token-Desert-01.webp')).toBe(true);
    expect(fs.existsSync('vendor/foundry-ironsworn/system/assets/starships/Ship-10s.webp')).toBe(true);
  });

  it('every seed resolves to a starship image the system actually ships', () => {
    const seeds = ['Wayfinder', 'Iron Wraith', 'abc123def456ghij', 'Kestrel', 'x'];
    const missing = seeds
      .map(pickStarshipIcon)
      .filter(p => !fs.existsSync(toVendor(p)));
    // Actual today: every path, e.g. ".../starships/Starforged-Starship-Token-07.webp".
    expect(missing).toEqual([]);
  });
});
