/**
 * Four consequence-map entries follow their move's text (issue #325 W17).
 *
 * (a) Compel's weak hit is "as above" — they agree and you take +1 momentum —
 *     "but their agreement comes with a demand or complication": it gave no
 *     momentum.
 * (b) Resupply's weak hit is "as above" after a cost: it left out the strong
 *     hit's third option, "acquire a specific item … take +1 momentum".
 * (c) Aid Your Ally ("Secure an Advantage or Gain Ground to take action. If
 *     you score a hit, they (instead of you) take the benefits of the move")
 *     returned the same text for every outcome: no Pay the Price on a miss, no
 *     benefit on a hit. It resolves as Secure an Advantage — as Gain Ground in
 *     a fight, with its positions — its hit's benefits marked for the ally.
 * (d) Companion Takes a Hit's miss with a match said "companion is dead or
 *     destroyed" on the match alone; the rule makes it conditional on 0 health.
 */

import { describe, it, expect } from 'vitest';
import { mapConsequences, resolveMove, aidYourAllyConsequences } from '../../src/moves/resolver.js';

describe('Compel', () => {
  it('control: the strong hit takes +1 momentum', () => {
    expect(mapConsequences('compel', 'strong_hit', false).momentumChange).toBe(1);
  });
  it('the weak hit takes +1 momentum, as the strong hit does', () => {
    expect(mapConsequences('compel', 'weak_hit', false).momentumChange).toBe(1);
  });
});

describe('Resupply', () => {
  const itemOption = (outcome) => (mapConsequences('resupply', outcome, false).sufferPrompt?.options ?? [])
    .find(o => /specific item/i.test(o.label) && o.momentum === 1);
  it('control: the strong hit offers the specific item with +1 momentum', () => {
    expect(itemOption('strong_hit')).toBeTruthy();
  });
  it('the weak hit offers it too', () => {
    expect(itemOption('weak_hit')).toBeTruthy();
  });
});

describe('Aid Your Ally', () => {
  it('a miss routes Pay the Price', () => {
    expect(mapConsequences('aid_your_ally', 'miss', false).routePayThePrice).toBe(true);
  });

  it("a strong hit is Secure an Advantage's +2 momentum and +1 on the next move — for the ally", () => {
    const c = mapConsequences('aid_your_ally', 'strong_hit', false);
    expect(c).toMatchObject({ momentumChange: 2, nextMoveBonus: 1, beneficiary: 'ally' });
  });

  it("a weak hit is Secure an Advantage's choice, for the ally", () => {
    const c = mapConsequences('aid_your_ally', 'weak_hit', false);
    expect(c.beneficiary).toBe('ally');
    expect(c.sufferPrompt.options.map(o => o.label)).toEqual(['+2 momentum', '+1 on your next move']);
  });

  it("in a fight: Gain Ground's — a strong hit puts you both in control, a weak hit your ally in control and you in a bad spot", () => {
    expect(aidYourAllyConsequences('strong_hit', false, true)).toMatchObject({ combatPosition: 'in_control', allyCombatPosition: 'in_control', beneficiary: 'ally' });
    expect(aidYourAllyConsequences('weak_hit', false, true)).toMatchObject({ combatPosition: 'bad_spot', allyCombatPosition: 'in_control' });
    expect(aidYourAllyConsequences('miss', false, true)).toMatchObject({ combatPosition: 'bad_spot', routePayThePrice: true });
  });

  it('resolveMove resolves it as Gain Ground only while a fight is open', () => {
    const interp = { moveId: 'aid_your_ally', moveName: 'Aid Your Ally', statUsed: 'edge', statValue: 9, adds: 0, playerNarration: 'x' };
    expect(resolveMove(interp, {}, { inFight: true }).consequences.allyCombatPosition).toBe('in_control');
    expect(resolveMove(interp, {}, {}).consequences.allyCombatPosition).toBeUndefined();
  });
});

describe('Companion Takes a Hit', () => {
  it('control: the miss still offers -1 companion health or Lose Momentum (-2)', () => {
    const labels = mapConsequences('companion_takes_a_hit', 'miss', true).sufferPrompt.options.map(o => o.label);
    expect(labels).toEqual(['-1 companion health', 'Lose Momentum (-2)']);
  });
  it('a miss with a match makes the death conditional on 0 health', () => {
    const text = mapConsequences('companion_takes_a_hit', 'miss', true).otherEffect;
    expect(text).toMatch(/health is 0[^.]*dead or destroyed/i);
  });
});
