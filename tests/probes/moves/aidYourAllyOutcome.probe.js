/**
 * PROBE — MC-07 AID-ALLY-NO-OUTCOME (eighth bug audit, moves-core)
 *
 * What the user does: "I cover Kira while she cuts through the lock" — the
 * interpreter picks Aid Your Ally, which the module rolls as an action move
 * (its prompt: "This IS a rolled action move … Never leave statUsed null";
 * schemas.js gives it Secure an Advantage's stats) — and misses, or hits.
 *
 * What happens: nothing, either way. CONSEQUENCE_MAP.aid_your_ally returns the
 * same text-only consequences for every outcome ("Secure an Advantage or Gain
 * Ground — ally takes the benefits on a hit."): a miss routes no Pay the
 * Price — no card, no suffer route, no tension-clock tick, and no advisory
 * seed either (aid_your_ally is not in PAY_THE_PRICE_ON_MISS) — and a hit
 * gives no one the +2 momentum / +1 on the next move. The narrator is told the
 * consequence is "ally takes the benefits on a hit" on a miss.
 *
 * What should happen: the move's text (vendored starforged-moves Aid Your
 * Ally): "Secure an Advantage or Gain Ground to take action. If you score a
 * hit, they (instead of you) take the benefits of the move." The roll IS that
 * Secure an Advantage (or Gain Ground): its miss is Secure an Advantage's
 * "Pay the Price" (Gain Ground's: a bad spot and Pay the Price), and its hit's
 * benefits go to the ally.
 */

import { describe, it, expect } from 'vitest';
import { mapConsequences, resolveMove } from '../../../src/moves/resolver.js';

describe('Aid Your Ally resolves as the Secure an Advantage it is', () => {
  it('control: Secure an Advantage\'s miss routes Pay the Price', () => {
    expect(mapConsequences('secure_an_advantage', 'miss', false).routePayThePrice).toBe(true);
  });

  it('control: the pipeline rolls Aid Your Ally as an action move', () => {
    const r = resolveMove({ moveId: 'aid_your_ally', moveName: 'Aid Your Ally', statUsed: 'iron', statValue: 2 }, {});
    expect(r.rollKind).toBe('action');
    expect(['strong_hit', 'weak_hit', 'miss']).toContain(r.outcome);
  });

  it('a miss routes Pay the Price', () => {
    expect(mapConsequences('aid_your_ally', 'miss', false).routePayThePrice).toBe(true);
  });

  it('a strong hit carries a benefit (Secure an Advantage\'s +2 momentum and +1 on the next move) for the ally', () => {
    const c = mapConsequences('aid_your_ally', 'strong_hit', false);
    const benefit = (c.momentumChange ?? 0) + (c.nextMoveBonus ?? 0) + (c.sufferPrompt ? 1 : 0);
    expect(benefit).toBeGreaterThan(0);
  });
});
