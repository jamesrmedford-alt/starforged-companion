/**
 * STARFORGED COMPANION
 * tests/unit/abilityScanner.test.js
 *
 * Pure-function coverage for the ability scanner. The Haiku fallback
 * call is mocked via dependency injection; the Confirm dialog UI is
 * exercised in a live Quench batch.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  collectEnabledAbilities,
  structuredMatches,
  haikuFallback,
  scanForApplicableAbilities,
  extractAdds,
  extractStatReplacement,
  getCommandVehicleActor,
} from '../../src/moves/abilityScanner.js';

const MODULE_ID = 'starforged-companion';

function makeAssetItem({ id = 'a1', name = 'Path', category = 'Path', abilities = [] }) {
  return {
    id,
    name,
    type: 'asset',
    system: {
      category,
      abilities: abilities.map(a => ({
        enabled:     a.enabled ?? true,
        name:        a.name ?? '',
        description: a.description ?? '',
        hasClock:    false,
        clockTicks:  0,
        clockMax:    4,
      })),
    },
  };
}

beforeEach(() => {
  game.actors._reset();
});


// ─────────────────────────────────────────────────────────────────────────────
// collectEnabledAbilities
// ─────────────────────────────────────────────────────────────────────────────

describe('collectEnabledAbilities', () => {
  it('returns enabled abilities from character asset items', () => {
    const actor = makeTestActor({
      items: { contents: [
        makeAssetItem({ id: 'firebrand', name: 'Firebrand', category: 'Path',
          abilities: [
            { enabled: true,  description: '<p>Burn the world.</p>' },
            { enabled: false, description: '<p>Locked.</p>' },
          ],
        }),
      ]},
    });
    const out = collectEnabledAbilities(actor, null);
    expect(out).toHaveLength(1);
    expect(out[0].assetName).toBe('Firebrand');
    expect(out[0].text).toBe('Burn the world.');
    expect(out[0].source).toBe('character');
    expect(out[0].key).toBe('firebrand:0');
  });

  it('merges abilities from the command vehicle (modules)', () => {
    const character = makeTestActor({ items: { contents: [] } });
    const ship      = makeTestActor({
      id: 'cmd', type: 'starship',
      items: { contents: [
        makeAssetItem({ id: 'mod1', name: 'Mining Laser', category: 'Module',
          abilities: [{ enabled: true, description: 'When you cut through hull, add +1.' }],
        }),
      ]},
    });
    const out = collectEnabledAbilities(character, ship);
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe('command_vehicle');
    expect(out[0].assetName).toBe('Mining Laser');
  });

  it('ignores non-asset Items', () => {
    const actor = makeTestActor({ items: { contents: [
      { id: 'p1', type: 'progress', name: 'Vow', system: { abilities: [{ enabled: true, description: 'x' }] } },
    ]}});
    expect(collectEnabledAbilities(actor, null)).toEqual([]);
  });

  it('strips HTML tags from ability text', () => {
    const actor = makeTestActor({ items: { contents: [
      makeAssetItem({ abilities: [{ description: '<p>When you <em>act</em>, take <strong>+1</strong>.</p>' }] }),
    ]}});
    expect(collectEnabledAbilities(actor, null)[0].text).toBe('When you act , take +1 .');
  });

  it('returns empty when actor is null', () => {
    expect(collectEnabledAbilities(null, null)).toEqual([]);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// structuredMatches
// ─────────────────────────────────────────────────────────────────────────────

describe('structuredMatches', () => {
  it('returns abilities whose text @Compendium-links to the chosen move name', () => {
    const abilities = [
      { key: 'a:0', text: 'When you @Compendium[foundry-ironsworn.starforgedmoves.aaa]{Gather Information}, add +1.' },
      { key: 'b:0', text: 'When you @Compendium[foundry-ironsworn.starforgedmoves.bbb]{Endure Harm}, ignore harm.' },
    ];
    const out = structuredMatches(abilities, 'Gather Information');
    expect(out).toHaveLength(1);
    expect(out[0].key).toBe('a:0');
  });

  it('matches case-insensitively and ignores punctuation', () => {
    const abilities = [
      { key: 'a:0', text: 'See @Compendium[x]{gather   information}.' },
    ];
    expect(structuredMatches(abilities, 'Gather Information')).toHaveLength(1);
  });

  it('returns empty when no @Compendium reference matches', () => {
    const abilities = [
      { key: 'a:0', text: 'When you act, take +1.' },                // implicit, no link
      { key: 'b:0', text: '@Compendium[x]{Strike} hits hard.' },     // wrong move
    ];
    expect(structuredMatches(abilities, 'Gather Information')).toEqual([]);
  });

  it('handles empty / missing move name safely', () => {
    expect(structuredMatches([{ key: 'a:0', text: 'x' }], '')).toEqual([]);
    expect(structuredMatches([], 'Gather Information')).toEqual([]);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// extractAdds
// ─────────────────────────────────────────────────────────────────────────────

describe('extractAdds', () => {
  it('extracts the +N from "add +1" / "add +2" patterns', () => {
    expect(extractAdds('When you act, add +1.')).toBe(1);
    expect(extractAdds('Add +2 and suffer -1 fire.')).toBe(2);
  });

  it('extracts from "+N add" form', () => {
    expect(extractAdds('Take +1 add on the next move.')).toBe(1);
  });

  it('sums when multiple add clauses are present', () => {
    expect(extractAdds('add +1 to one roll, add +2 to another')).toBe(3);
  });

  it('returns 0 when no add modifier is present (momentum etc are not adds)', () => {
    expect(extractAdds('Take +1 momentum.')).toBe(0);
    expect(extractAdds('Roll +heart.')).toBe(0);
    expect(extractAdds('When you draw deep, regain spirit.')).toBe(0);
  });

  it('caps at 5 to filter accidental large numbers in prose', () => {
    expect(extractAdds('add +12')).toBe(0);
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// extractStatReplacement
// ─────────────────────────────────────────────────────────────────────────────

describe('extractStatReplacement', () => {
  it('returns the substituted stat for "roll +<stat>" phrasing', () => {
    expect(extractStatReplacement('When you act, you may roll +heart.')).toBe('heart');
    expect(extractStatReplacement('Roll +shadow when sneaking.')).toBe('shadow');
  });

  it('handles "roll +<stat> in place of the listed stat" (Empath)', () => {
    expect(extractStatReplacement(
      'When you face an emotion-laden challenge, you may roll +heart in place of the listed stat.',
    )).toBe('heart');
  });

  it('handles "roll +<stat> instead"', () => {
    expect(extractStatReplacement('Roll +iron instead of +edge.')).toBe('iron');
  });

  it('handles "use +<stat> instead" and similar cues', () => {
    expect(extractStatReplacement('You may use +wits instead of the listed stat.')).toBe('wits');
  });

  it('returns null for casual stat mentions ("heart of the matter")', () => {
    expect(extractStatReplacement('In the heart of the matter, take +1 momentum.')).toBeNull();
  });

  it('returns null for situational stats (supply, integrity, etc.)', () => {
    expect(extractStatReplacement('Roll +supply when checking your gear.')).toBeNull();
  });

  it('returns null on empty / null input', () => {
    expect(extractStatReplacement('')).toBeNull();
    expect(extractStatReplacement(null)).toBeNull();
  });

  it('picks the cued stat even when other stat words appear nearby', () => {
    // edge mentioned in passing but heart is the explicit cue
    expect(extractStatReplacement(
      'Edge cases aside, you may roll +heart in place of the listed stat.',
    )).toBe('heart');
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// haikuFallback (DI-mocked)
// ─────────────────────────────────────────────────────────────────────────────

describe('haikuFallback', () => {
  it('returns mapped ability records for LLM-identified matches', async () => {
    const abilities = [
      { key: 'a:0', assetName: 'Empath', text: 'When you draw deep…' },
      { key: 'b:0', assetName: 'Other',  text: 'Unrelated.' },
    ];
    const _call = vi.fn().mockResolvedValue(JSON.stringify({
      matches: [{ key: 'a:0', summary: 'Adds +heart on info gathering.' }],
    }));
    const out = await haikuFallback(abilities, 'gather_information', 'Gather Information', 'I look around', 'k', { _call });
    expect(out).toHaveLength(1);
    expect(out[0].key).toBe('a:0');
    expect(out[0].summary).toBe('Adds +heart on info gathering.');
  });

  it('returns empty array when API key is missing', async () => {
    const _call = vi.fn();
    const out = await haikuFallback([{ key: 'a:0', text: 'x' }], 'm', 'M', 'n', '', { _call });
    expect(out).toEqual([]);
    expect(_call).not.toHaveBeenCalled();
  });

  it('returns empty array on malformed JSON', async () => {
    const _call = vi.fn().mockResolvedValue('not json');
    silenceConsoleErrors();
    const out = await haikuFallback([{ key: 'a:0', text: 'x' }], 'm', 'M', 'n', 'k', { _call });
    expect(out).toEqual([]);
  });

  it('strips markdown fences from LLM response', async () => {
    const _call = vi.fn().mockResolvedValue('```json\n{"matches":[{"key":"a:0","summary":"ok"}]}\n```');
    const out = await haikuFallback([{ key: 'a:0', text: 'x' }], 'm', 'M', 'n', 'k', { _call });
    expect(out).toHaveLength(1);
  });

  it('threads statReplacement through the Haiku response', async () => {
    const abilities = [{ key: 'a:0', assetName: 'Empath', text: 'You may roll +heart…' }];
    const _call = vi.fn().mockResolvedValue(JSON.stringify({
      matches: [{ key: 'a:0', summary: 'Roll heart instead', statReplacement: 'heart' }],
    }));
    const out = await haikuFallback(abilities, 'gather_information', 'Gather Information', 'I read them', 'k', { _call });
    expect(out[0].statReplacement).toBe('heart');
  });

  it('rejects invalid stat replacements (supply, garbage, etc.)', async () => {
    const abilities = [{ key: 'a:0', assetName: 'X', text: 'plain text with no cue' }];
    const _call = vi.fn().mockResolvedValue(JSON.stringify({
      matches: [{ key: 'a:0', summary: 's', statReplacement: 'supply' }],
    }));
    const out = await haikuFallback(abilities, 'm', 'M', 'n', 'k', { _call });
    // Haiku returned an invalid stat; parser scrubs it to null AND the
    // regex fallback on the plain text doesn't find a substitution either.
    expect(out[0].statReplacement).toBeNull();
  });

  it('falls back to regex extraction when Haiku omits statReplacement', async () => {
    const abilities = [{ key: 'a:0', assetName: 'Empath', text: 'You may roll +heart in place of the listed stat.' }];
    const _call = vi.fn().mockResolvedValue(JSON.stringify({
      matches: [{ key: 'a:0', summary: 's' }],
    }));
    const out = await haikuFallback(abilities, 'm', 'M', 'n', 'k', { _call });
    expect(out[0].statReplacement).toBe('heart');
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// getCommandVehicleActor
// ─────────────────────────────────────────────────────────────────────────────

describe('getCommandVehicleActor', () => {
  it('returns the starship actor flagged as the command vehicle', () => {
    const cmd = makeTestActor({
      id: 'cmd', type: 'starship',
      flags: { [MODULE_ID]: { ship: { _id: 'ship1', isCommandVehicle: true } } },
    });
    const sup = makeTestActor({
      id: 'sup', type: 'starship',
      flags: { [MODULE_ID]: { ship: { _id: 'ship2', isCommandVehicle: false } } },
    });
    game.actors._set('cmd', cmd);
    game.actors._set('sup', sup);
    const state = { shipIds: ['sup', 'cmd'] };
    expect(getCommandVehicleActor(state)).toBe(cmd);
  });

  it('returns null when no command vehicle is registered', () => {
    expect(getCommandVehicleActor({ shipIds: [] })).toBeNull();
    expect(getCommandVehicleActor({})).toBeNull();
  });

  it('falls back to the sole tracked starship when none is flagged', () => {
    const only = makeTestActor({
      id: 'only', type: 'starship',
      flags: { [MODULE_ID]: { ship: { _id: 'shipX', isCommandVehicle: false }, entityType: 'ship', entityId: 'shipX' } },
    });
    game.actors._set('only', only);
    expect(getCommandVehicleActor({ shipIds: ['only'] })).toBe(only);
  });

  it('stays ambiguous (null) when multiple starships exist and none is flagged', () => {
    const a = makeTestActor({
      id: 'a', type: 'starship',
      flags: { [MODULE_ID]: { ship: { _id: 's1', isCommandVehicle: false }, entityType: 'ship', entityId: 's1' } },
    });
    const b = makeTestActor({
      id: 'b', type: 'starship',
      flags: { [MODULE_ID]: { ship: { _id: 's2', isCommandVehicle: false }, entityType: 'ship', entityId: 's2' } },
    });
    game.actors._set('a', a);
    game.actors._set('b', b);
    expect(getCommandVehicleActor({ shipIds: ['a', 'b'] })).toBeNull();
  });
});
