/**
 * STARFORGED COMPANION
 * tests/unit/battleStations.test.js — pure coverage for the Battle Stations!
 * shipboard-combat framework module.
 */

import { describe, it, expect } from 'vitest';
import {
  SHIPBOARD_ROLES,
  shouldInjectShipboardGuidance,
  buildShipboardCombatGuidance,
  isBattleStationsCommand,
  renderBattleStationsCardHtml,
} from '../../src/moves/battleStations.js';

describe('SHIPBOARD_ROLES', () => {
  it('lists the 11 canonical crew roles in rulebook order', () => {
    expect(SHIPBOARD_ROLES).toHaveLength(11);
    expect(SHIPBOARD_ROLES.map(r => r.label)).toEqual([
      'Command', 'Countermeasures', 'Damage Control', 'Engineering', 'Escort',
      'Gunnery', 'Infantry', 'Medical', 'Piloting', 'Sensors', 'Systems',
    ]);
  });

  it('each role has id, label, and a non-empty description', () => {
    for (const r of SHIPBOARD_ROLES) {
      expect(r.id).toBeTruthy();
      expect(r.label).toBeTruthy();
      expect(r.description.length).toBeGreaterThan(0);
    }
  });
});

describe('shouldInjectShipboardGuidance', () => {
  const ship = 'ISV Wayfarer';

  it('injects when combat track names a vessel and a command vehicle exists', () => {
    expect(shouldInjectShipboardGuidance({ label: 'Escape the pirate fleet' }, ship)).toBe(true);
    expect(shouldInjectShipboardGuidance({ label: 'Enemy frigate' }, ship)).toBe(true);
    expect(shouldInjectShipboardGuidance({ label: 'Repel boarders' }, ship)).toBe(true);
  });

  it('does NOT inject for a planetside foe even with a command vehicle', () => {
    expect(shouldInjectShipboardGuidance({ label: 'Cult enforcers' }, ship)).toBe(false);
    expect(shouldInjectShipboardGuidance({ label: 'Bar brawl' }, ship)).toBe(false);
  });

  it('injects a generic-labelled fight when the ship is underway', () => {
    expect(shouldInjectShipboardGuidance({ label: 'The ambush' }, ship, { underway: true })).toBe(true);
  });

  it('injects when forced regardless of label', () => {
    expect(shouldInjectShipboardGuidance({ label: 'whatever' }, ship, { force: true })).toBe(true);
  });

  it('does not inject without a command vehicle name', () => {
    expect(shouldInjectShipboardGuidance({ label: 'Enemy cruiser' }, null)).toBe(false);
    expect(shouldInjectShipboardGuidance({ label: 'Enemy cruiser' }, '   ')).toBe(false);
  });

  it('does not inject when the combat track is missing or completed', () => {
    expect(shouldInjectShipboardGuidance(null, ship)).toBe(false);
    expect(shouldInjectShipboardGuidance({ label: 'Enemy cruiser', completed: true }, ship)).toBe(false);
  });

  it('tolerates a label-less track (no keyword match, no underway → skip)', () => {
    expect(shouldInjectShipboardGuidance({}, ship)).toBe(false);
    expect(shouldInjectShipboardGuidance({}, ship, { underway: true })).toBe(true);
  });
});

describe('buildShipboardCombatGuidance', () => {
  it('names the ship when provided', () => {
    const block = buildShipboardCombatGuidance({ shipName: 'ISV Wayfarer' });
    expect(block).toContain('## SHIPBOARD COMBAT — BATTLE STATIONS');
    expect(block).toContain('ISV Wayfarer');
    expect(block).toContain('Aid Your Ally');
  });

  it('falls back to a generic phrase with no ship name', () => {
    const block = buildShipboardCombatGuidance();
    expect(block).toContain("the crew's starship or a support vehicle");
  });

  it('lists every canonical role label', () => {
    const block = buildShipboardCombatGuidance({ shipName: 'X' });
    for (const r of SHIPBOARD_ROLES) {
      expect(block).toContain(r.label);
    }
  });

  it('mentions per-character position and the proactive/reactive move split', () => {
    const block = buildShipboardCombatGuidance({ shipName: 'X' });
    expect(block).toMatch(/own position/i);
    expect(block).toMatch(/Gain Ground|Strike/);
    expect(block).toMatch(/React Under Fire|Clash/);
  });
});

describe('isBattleStationsCommand', () => {
  it('matches !stations and its aliases', () => {
    expect(isBattleStationsCommand({ content: '!stations' })).toBe(true);
    expect(isBattleStationsCommand({ content: '!battlestations' })).toBe(true);
    expect(isBattleStationsCommand({ content: '!battle-stations' })).toBe(true);
    expect(isBattleStationsCommand({ content: '  !stations  ' })).toBe(true);
  });

  it('does not match other commands or prose', () => {
    expect(isBattleStationsCommand({ content: '!station-keeping' })).toBe(false);
    expect(isBattleStationsCommand({ content: 'man your stations' })).toBe(false);
    expect(isBattleStationsCommand({ content: '!clock list' })).toBe(false);
  });

  it('ignores our own re-posted card', () => {
    expect(isBattleStationsCommand({
      content: '!stations',
      flags: { 'starforged-companion': { battleStationsCard: true } },
    })).toBe(false);
  });

  it('tolerates missing content', () => {
    expect(isBattleStationsCommand({})).toBe(false);
    expect(isBattleStationsCommand(null)).toBe(false);
  });
});

describe('renderBattleStationsCardHtml', () => {
  it('renders a card with all 11 roles and the key framing', () => {
    const html = renderBattleStationsCardHtml();
    expect(html).toContain('Battle Stations!');
    expect(html).toContain('Aid Your Ally');
    for (const r of SHIPBOARD_ROLES) {
      expect(html).toContain(r.label);
    }
    expect(html).toContain('battleStationsCard'.length ? 'sf-card--battle-stations' : '');
  });

  it('escapes nothing unsafe in the static role text (well-formed HTML)', () => {
    const html = renderBattleStationsCardHtml();
    expect(html).not.toContain('<script');
    expect((html.match(/<tr>/g) ?? []).length).toBe(SHIPBOARD_ROLES.length);
  });
});
