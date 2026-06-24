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
import { resolveStatValue, enrichInterpretationStatValue, resolveCompanionHealth } from '../../src/moves/statEnrichment.js';
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
  function actorWithCompanions(companions) {
    const base = makeActor();
    base.items = {
      contents: companions.map((c, idx) => ({
        type: 'asset',
        name: c.name ?? `Companion-${idx}`,
        system: {
          category: c.category ?? 'Companion',
          track:    { enabled: c.enabled ?? true, value: c.value ?? 0, name: 'health', min: 0, max: 5 },
          abilities: [],
        },
      })),
    };
    return base;
  }

  it('returns the single Companion asset track value', () => {
    const actor = actorWithCompanions([{ name: 'Rover', value: 4 }]);
    expect(resolveStatValue(actor, 'companion_health', {})).toBe(4);
  });

  it('picks the highest track value across multiple companions and notifies', () => {
    const info = vi.fn();
    global.ui.notifications.info = info;
    const actor = actorWithCompanions([
      { name: 'Rover', value: 2 },
      { name: 'Kestrel', value: 5 },
      { name: 'Drake', value: 3 },
    ]);
    expect(resolveStatValue(actor, 'companion_health', {})).toBe(5);
    expect(info).toHaveBeenCalledWith(expect.stringContaining('Kestrel'));
    expect(info.mock.calls[0][0]).toMatch(/track 5/);
  });

  it('does NOT notify when there is exactly one companion (no ambiguity)', () => {
    const info = vi.fn();
    global.ui.notifications.info = info;
    const actor = actorWithCompanions([{ name: 'Rover', value: 4 }]);
    resolveStatValue(actor, 'companion_health', {});
    expect(info).not.toHaveBeenCalled();
  });

  it('skips Companion assets with track.enabled === false', () => {
    const actor = actorWithCompanions([
      { name: 'Disabled', value: 5, enabled: false },
      { name: 'Active',   value: 2, enabled: true  },
    ]);
    expect(resolveStatValue(actor, 'companion_health', {})).toBe(2);
  });

  it('matches category case-insensitively (covers user-renamed or localised categories)', () => {
    const actor = actorWithCompanions([
      { name: 'Rover', value: 3, category: 'COMPANION' },
    ]);
    expect(resolveStatValue(actor, 'companion_health', {})).toBe(3);
  });

  it('ignores non-Companion assets that happen to have a track', () => {
    const actor = actorWithCompanions([
      { name: 'Module', value: 9, category: 'Module' },
    ]);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolveStatValue(actor, 'companion_health', {})).toBe(0);
    expect(warn).toHaveBeenCalled();
  });

  it('returns 0 + warns when the actor has no Companion assets', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolveStatValue(makeActor(), 'companion_health', {})).toBe(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('companion_health'));
  });

  it('returns 0 + warns when actor is null', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolveCompanionHealth(null)).toBe(0);
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

  // Aid Your Ally is a rolled action move (Secure an Advantage / Gain Ground);
  // now that it carries a stat set, the interpreter supplies a real statUsed
  // and enrichment resolves it without the "no statUsed" warning that used to
  // leave the assist roll at action-die-only.
  it('resolves aid_your_ally with a supplied stat and does not warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const interp = { moveId: 'aid_your_ally', statUsed: 'iron', statValue: 0, isProgressMove: false };
    enrichInterpretationStatValue(makeActor({ iron: 3 }), interp, {});
    expect(interp.statValue).toBe(3);
    expect(warn).not.toHaveBeenCalled();
  });

  // ── Play-kit "whichever is higher" rule (Endure Harm / Stress) ──────────
  describe('higher-of-two-stat for Endure Harm / Stress', () => {
    it('picks +iron over +health for Endure Harm when iron is higher', () => {
      const actor = makeActor({ iron: 4, health: 2 });
      const interp = { moveId: 'endure_harm', statUsed: 'health', statValue: 0, isProgressMove: false };
      enrichInterpretationStatValue(actor, interp, {});
      expect(interp.statUsed).toBe('iron');
      expect(interp.statValue).toBe(4);
    });

    it('picks +health over +iron for Endure Harm when health is higher', () => {
      const actor = makeActor({ iron: 1, health: 5 });
      const interp = { moveId: 'endure_harm', statUsed: 'iron', statValue: 0, isProgressMove: false };
      enrichInterpretationStatValue(actor, interp, {});
      expect(interp.statUsed).toBe('health');
      expect(interp.statValue).toBe(5);
    });

    it('picks +heart over +spirit for Endure Stress when heart is higher', () => {
      const actor = makeActor({ heart: 3, spirit: 1 });
      const interp = { moveId: 'endure_stress', statUsed: 'spirit', statValue: 0, isProgressMove: false };
      enrichInterpretationStatValue(actor, interp, {});
      expect(interp.statUsed).toBe('heart');
      expect(interp.statValue).toBe(3);
    });

    it('breaks ties by keeping the first stat in the play-kit ordering', () => {
      // Endure Harm: ["health", "iron"] — both equal → health (the first listed)
      const actor = makeActor({ iron: 3, health: 3 });
      const interp = { moveId: 'endure_harm', statUsed: 'iron', statValue: 0, isProgressMove: false };
      enrichInterpretationStatValue(actor, interp, {});
      expect(interp.statUsed).toBe('health');
      expect(interp.statValue).toBe(3);
    });

    it('does NOT override stat for moves without the rule (Face Danger)', () => {
      const actor = makeActor({ iron: 5, heart: 1 });
      const interp = { moveId: 'face_danger', statUsed: 'heart', statValue: 0, isProgressMove: false };
      enrichInterpretationStatValue(actor, interp, {});
      expect(interp.statUsed).toBe('heart');
      expect(interp.statValue).toBe(1);
    });
  });
});
