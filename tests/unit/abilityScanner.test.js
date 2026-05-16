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
});
