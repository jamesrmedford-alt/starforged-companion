// tests/unit/encounterSpawn.test.js
// Phase 7 — !sfc encounter command parser and chat-card builder.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseEncounterCommand,
  isEncounterCommand,
  buildEncounterCard,
} from '../../src/system/encounterSpawn.js';

describe('Phase 7 — parseEncounterCommand', () => {
  it('extracts the name from a basic command', () => {
    expect(parseEncounterCommand('!sfc encounter Iron Wraith')).toBe('Iron Wraith');
  });

  it('trims whitespace', () => {
    expect(parseEncounterCommand('  !sfc encounter   Hunter  ')).toBe('Hunter');
  });

  it('supports multi-word names with internal spaces', () => {
    expect(parseEncounterCommand('!sfc encounter The Burned')).toBe('The Burned');
  });

  it('is case-insensitive on the command prefix', () => {
    expect(parseEncounterCommand('!SFC ENCOUNTER Adept')).toBe('Adept');
  });

  it('returns null for a non-matching command', () => {
    expect(parseEncounterCommand('!sector new')).toBeNull();
    expect(parseEncounterCommand('!journal lore "x" — y')).toBeNull();
    expect(parseEncounterCommand('player narration')).toBeNull();
  });

  it('returns null when no name is given', () => {
    expect(parseEncounterCommand('!sfc encounter ')).toBeNull();
    expect(parseEncounterCommand('!sfc encounter')).toBeNull();
  });

  it('isEncounterCommand returns true only for matching messages', () => {
    expect(isEncounterCommand({ content: '!sfc encounter Iron Wraith' })).toBe(true);
    expect(isEncounterCommand({ content: '!sector list' })).toBe(false);
    expect(isEncounterCommand({})).toBe(false);
  });
});

describe('Phase 7 — buildEncounterCard', () => {
  it('returns an HTML card with the actor name', () => {
    const card = buildEncounterCard({ name: 'Iron Wraith', system: {} });
    expect(card).toContain('Iron Wraith');
    expect(card).toContain('<h3>');
  });

  it('includes the rank when present', () => {
    const card = buildEncounterCard({
      name: 'Adept',
      system: { rank: 'formidable' },
    });
    expect(card).toContain('Rank');
    expect(card).toContain('formidable');
  });

  it('renders features and drives as lists', () => {
    const card = buildEncounterCard({
      name: 'Hunter',
      system: {
        features: ['Tracks tirelessly', 'Knows your scent'],
        drives:   ['Complete the contract'],
      },
    });
    expect(card).toContain('Features');
    expect(card).toContain('<li>Tracks tirelessly</li>');
    expect(card).toContain('Drives');
    expect(card).toContain('<li>Complete the contract</li>');
  });

  it('escapes HTML in the actor name', () => {
    const card = buildEncounterCard({ name: '<script>alert(1)</script>', system: {} });
    expect(card).not.toContain('<script>');
    expect(card).toContain('&lt;script&gt;');
  });

  it('returns a placeholder card when actor is null', () => {
    expect(buildEncounterCard(null)).toContain('not found');
  });
});
