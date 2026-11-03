/**
 * PROBE — MC-05 COMPEL-WEAK-NO-MOMENTUM (eighth bug audit, moves-core)
 *
 * What the user does: Compels an NPC and rolls a weak hit.
 *
 * What happens: no momentum. resolver.js CONSEQUENCE_MAP.compel's weak hit is
 * text only ("Agreement comes with a demand or complication").
 *
 * What should happen: +1 momentum. The move's text (vendored
 * starforged-moves Compel): "On a strong hit, they'll do what you want or
 * agree to your conditions. Take +1 momentum. On a weak hit, as above, but
 * their agreement comes with a demand or complication." — "as above" is the
 * whole strong hit, momentum included. The module reads "as above" that way
 * for every other move: Heal / Hearten (decisions.md issue #311 P02: "a weak
 * recovery is the strong one plus its cost"), Resupply's supply, Make a
 * Connection, Forge a Bond, Fulfill Your Vow, Finish an Expedition, Undertake
 * an Expedition.
 */

import { describe, it, expect } from 'vitest';
import { mapConsequences } from '../../../src/moves/resolver.js';

describe('Compel pays its momentum on a weak hit too ("as above")', () => {
  it('control: the strong hit takes +1 momentum', () => {
    expect(mapConsequences('compel', 'strong_hit', false).momentumChange).toBe(1);
  });

  it('control: Heal\'s weak hit is "as above" — the strong hit\'s recovery, then its cost', () => {
    const strong = mapConsequences('heal', 'strong_hit', false).sufferPrompt.options.map(o => o.label);
    const weak   = mapConsequences('heal', 'weak_hit', false).sufferPrompt.options.map(o => o.label);
    for (const s of strong) expect(weak.some(w => w.startsWith(s))).toBe(true);
  });

  it('the weak hit takes +1 momentum, as the strong hit does', () => {
    expect(mapConsequences('compel', 'weak_hit', false).momentumChange).toBe(1);
  });
});
