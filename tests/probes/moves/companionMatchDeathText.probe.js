/**
 * PROBE — MC-08 COMPANION-MATCH-DEATH-UNCONDITIONAL (eighth bug audit, moves-core)
 *
 * What the user does: their companion is hurt but standing (health 3), and
 * they choose to test its resilience — "my drone shrugs off the shrapnel" —
 * rolling Companion Takes a Hit; the result is a miss with a match.
 *
 * What happens: the move card and the narrator's MOVE OUTCOME
 * ([CONSEQUENCE: …], narratorPrompt.buildNarratorUserMessage, "Narrate the
 * consequence … embody it") both say "Miss with a match — companion is dead
 * or destroyed. Discard the asset." CONSEQUENCE_MAP.companion_takes_a_hit
 * picks that text on isMatch alone.
 *
 * What should happen: the move's text (vendored starforged-moves Companion
 * Takes a Hit): "If their health is 0 and you rolled a miss with a match on
 * this move, they are dead or destroyed; discard the asset." With health
 * above 0 the miss is "-1 health or Lose Momentum (-2)", and the death is
 * conditional on reaching 0.
 */

import { describe, it, expect } from 'vitest';
import { mapConsequences } from '../../../src/moves/resolver.js';

describe('Companion Takes a Hit: a miss with a match kills only at 0 health', () => {
  it('control: the miss still offers -1 companion health or Lose Momentum (-2)', () => {
    const labels = mapConsequences('companion_takes_a_hit', 'miss', true).sufferPrompt.options.map(o => o.label);
    expect(labels).toEqual(['-1 companion health', 'Lose Momentum (-2)']);
  });

  it('the consequence text makes the death conditional on 0 health', () => {
    const text = mapConsequences('companion_takes_a_hit', 'miss', true).otherEffect;
    expect(text).toMatch(/(health is 0|at 0|0 health|health 0)/i);
  });
});
