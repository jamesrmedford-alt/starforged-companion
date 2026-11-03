/**
 * PROBE — MC-06 RESUPPLY-WEAK-NO-ITEM (eighth bug audit, moves-core)
 *
 * What the user does: needs a specific item (a coolant cell, a part) and
 * Resupplies for it; rolls a weak hit.
 *
 * What happens: the choice card offers only supply — "Clear unprepared + +1
 * supply" (unprepared) or "+2 supply" (not unprepared) — so a PC who is not
 * unprepared has one live option, and the item with its +1 momentum is not
 * on the card. resolver.js CONSEQUENCE_MAP.resupply's weak hit dropped the
 * strong hit's third option.
 *
 * What should happen: the move's text (vendored starforged-moves Resupply):
 * "On a strong hit, choose one. • If you are unprepared, clear the impact and
 * take +1 supply. Otherwise, take +2 supply. • If you are in need of a
 * specific item or resource that can reasonably be obtained, you acquire it.
 * Take +1 momentum. On a weak hit, as above, but you must first deal with a
 * cost, complication, or demand." The weak hit offers the same choice — the
 * item and its +1 momentum included. Issue #314 Q01 fixed the supply branches'
 * gates and left this option out.
 */

import { describe, it, expect } from 'vitest';
import { mapConsequences } from '../../../src/moves/resolver.js';

const options = (outcome) => mapConsequences('resupply', outcome, false).sufferPrompt.options;
const itemOption = (opts) => opts.find(o => o.momentum === 1 || (o.chain ?? []).some(s => s.momentum === 1));

describe('Resupply\'s weak hit offers the strong hit\'s choice', () => {
  it('control: the strong hit offers the specific item with +1 momentum', () => {
    expect(itemOption(options('strong_hit'))).toBeTruthy();
  });

  it('the weak hit offers the specific item with +1 momentum too', () => {
    expect(itemOption(options('weak_hit'))).toBeTruthy();
  });
});
