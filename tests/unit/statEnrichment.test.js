/**
 * STARFORGED COMPANION
 * tests/unit/statEnrichment.test.js
 *
 * Regression coverage for the long-standing "all rolls register stats
 * as 0" bug. The interpreter system prompt told Claude to return
 * statValue:0 and have the calling code fill it in; the calling code
 * never did, so every action move resolved as actionDie + 0 + adds.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resolveStatValue, enrichInterpretationStatValue } from '../../src/moves/statEnrichment.js';
import { invalidateActorCache } from '../../src/character/actorBridge.js';

const MODULE_ID = 'starforged-companion';

let _actorIdSeq = 0;
function makeActor({
  iron = 0, edge = 0, heart = 0, shadow = 0, wits = 0,
  health = 5, spirit = 5, supply = 5, momentum = 2,
} = {}) {
  // Unique id per call — readCharacterSnapshot caches by actor.id, and
  // tests in this file create many actors with different stats. Reusing
  // an id (e.g. 'pc-1') would return the first-built snapshot every time.
  const id = `pc-${++_actorIdSeq}`;
  return {
    id,
    name:   'Iaa',
    type:   'character',
    system: {
      iron, edge, heart, shadow, wits,
      health:   { value: health,   max: 5 },
      spirit:   { value: spirit,   max: 5 },
      supply:   { value: supply,   max: 5 },
      momentum: { value: momentum, max: 10, min: -6, resetValue: 2 },
      debility: { wounded: false, shaken: false, unprepared: false,
                  encumbered: false, maimed: false, corrupted: false,
                  cursed: false, tormented: false },
      xp: 0,
    },
    items:  { contents: [] },
    getFlag: () => undefined,
  };
}

beforeEach(() => {
  global.game.actors._reset();
  _actorIdSeq = 0;
  // Defensive: clear the snapshot cache between tests in case prior
  // test runs (in any file) hydrated the same ids.
  for (let i = 0; i < 20; i++) invalidateActorCache(`pc-${i}`);
});


describe('resolveStatValue — action stats', () => {
  it('reads iron from the character snapshot', () => {
    const actor = makeActor({ iron: 3 });
    expect(resolveStatValue(actor, 'iron', {})).toBe(3);
  });

  it('reads each of edge/heart/iron/shadow/wits independently', () => {
    const actor = makeActor({ edge: 1, heart: 2, iron: 3, shadow: 4, wits: 0 });
    expect(resolveStatValue(actor, 'edge'  , {})).toBe(1);
    expect(resolveStatValue(actor, 'heart' , {})).toBe(2);
    expect(resolveStatValue(actor, 'iron'  , {})).toBe(3);
    expect(resolveStatValue(actor, 'shadow', {})).toBe(4);
    expect(resolveStatValue(actor, 'wits'  , {})).toBe(0);
  });

  it('returns 0 with a warn when actor is null (no speaker resolved)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolveStatValue(null, 'iron', {})).toBe(0);
    expect(warn).toHaveBeenCalled();
  });
});


describe('resolveStatValue — player meters', () => {
  it('reads health (endure_harm)', () => {
    const actor = makeActor({ health: 3 });
    expect(resolveStatValue(actor, 'health', {})).toBe(3);
  });

  it('reads spirit (endure_stress)', () => {
    const actor = makeActor({ spirit: 4 });
    expect(resolveStatValue(actor, 'spirit', {})).toBe(4);
  });

  it('reads supply (resupply)', () => {
    const actor = makeActor({ supply: 2 });
    expect(resolveStatValue(actor, 'supply', {})).toBe(2);
  });

  it('reads momentum', () => {
    const actor = makeActor({ momentum: 5 });
    expect(resolveStatValue(actor, 'momentum', {})).toBe(5);
  });
});


describe('resolveStatValue — vehicle integrity', () => {
  it('reads integrity off the command vehicle Actor flag', () => {
    const ship = {
      id:    'ship-1',
      type:  'starship',
      flags: { [MODULE_ID]: { ship: { isCommandVehicle: true, integrity: 4 } } },
      system: {},
    };
    global.game.actors._set('ship-1', ship);

    const state = { shipIds: ['ship-1'] };
    expect(resolveStatValue(makeActor(), 'integrity', state)).toBe(4);
  });

  it('returns 0 + warns when no command vehicle is registered', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolveStatValue(makeActor(), 'integrity', { shipIds: [] })).toBe(0);
    expect(warn).toHaveBeenCalled();
  });
});


describe('resolveStatValue — companion_health', () => {
  it('returns 0 + warns — companion_health enrichment is a follow-up', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolveStatValue(makeActor(), 'companion_health', {})).toBe(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('companion_health'));
  });
});


describe('resolveStatValue — unknown', () => {
  it('returns 0 + warns on an unknown statUsed', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolveStatValue(makeActor(), 'fictitious_stat', {})).toBe(0);
    expect(warn).toHaveBeenCalled();
  });
});


describe('enrichInterpretationStatValue', () => {
  it('mutates interpretation.statValue with the resolved value', () => {
    const actor = makeActor({ iron: 3 });
    const interpretation = { statUsed: 'iron', statValue: 0, isProgressMove: false };
    enrichInterpretationStatValue(actor, interpretation, {});
    expect(interpretation.statValue).toBe(3);
  });

  it('returns the resolved value as well', () => {
    const actor = makeActor({ wits: 2 });
    const interp = { statUsed: 'wits', statValue: 0, isProgressMove: false };
    expect(enrichInterpretationStatValue(actor, interp, {})).toBe(2);
  });

  it('leaves progress-move statValue alone (resolver reads progressTicks separately)', () => {
    const actor = makeActor({ iron: 99 });
    const interp = {
      statUsed:       'iron',
      statValue:      7,      // pre-populated by interpreter as ticks (legacy)
      isProgressMove: true,
      progressTicks:  7,
    };
    enrichInterpretationStatValue(actor, interp, {});
    expect(interp.statValue).toBe(7);
  });

  it('warns and zeros when statUsed is missing entirely', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const interp = { moveId: 'face_danger', statValue: 0, isProgressMove: false };
    enrichInterpretationStatValue(makeActor({ iron: 3 }), interp, {});
    expect(interp.statValue).toBe(0);
    expect(warn).toHaveBeenCalled();
  });
});
