/**
 * STARFORGED COMPANION
 * tests/unit/spotlightScene.test.js
 *
 * Issue #381, slice 3 — the Begin card's Spotlight Vignette is what a
 * narration is built from. The third live run's Begin card read "Spotlight
 * vignette: External factors create new danger, urgency, or importance for a
 * quest", and the narration under it was noodles: the canonical GM was sent a
 * boolean. Now the GM is sent the d100, reads the result off the table
 * itself, and builds a short cutaway from it:
 *
 *   - the first seed is the card's own roll, never rolled again;
 *   - whom or what it is about is a die among the records of the kind its
 *     row names — two of them for "seemingly unrelated situations", none for
 *     "peril lies ahead", where the two pairs carry it;
 *   - an Action + Theme and a Descriptor + Focus;
 *   - it runs at the interaction latitude, discovery when its row introduces
 *     someone and the campaign has no one to give new detail to.
 *
 * The records are the stores' own readers, mocked at their source; the dice
 * are scripted.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/entities/connection.js', async (importOriginal) => ({ ...(await importOriginal()), listConnections: vi.fn(() => []) }));
vi.mock('../../src/entities/faction.js', async (importOriginal) => ({ ...(await importOriginal()), listFactions: vi.fn(() => []) }));
vi.mock('../../src/world/worldJournal.js', async (importOriginal) => ({ ...(await importOriginal()), getActiveThreats: vi.fn(() => []) }));
vi.mock('../../src/session/openThreads.js', async (importOriginal) => ({ ...(await importOriginal()), tableVows: vi.fn(() => []) }));

import { listConnections } from '../../src/entities/connection.js';
import { listFactions } from '../../src/entities/faction.js';
import { getActiveThreats } from '../../src/world/worldJournal.js';
import { tableVows } from '../../src/session/openThreads.js';
import { composeSpotlightScene, buildSpotlightVignetteUserMessage } from '../../src/session/spotlightVignette.js';
import { rollOracle } from '../../src/oracles/roller.js';

function scripted(faces) {
  const queue = [...faces];
  const asked = [];
  return Object.assign((sides) => { asked.push(sides); if (!queue.length) throw new Error('out of dice'); return queue.shift(); },
    { asked, left: () => queue.length });
}

const TAMSIN = { _id: 'c-tamsin', name: 'Tamsin Vey', bonded: true };
const DORAN  = { _id: 'c-doran', name: 'Doran Iske' };
const VOW    = (name, key, actorId = 'pc-mira') => ({ name, id: key, vowId: key, completed: false, actorId, actorName: 'Mira' });

beforeEach(() => {
  vi.clearAllMocks();
  listConnections.mockReturnValue([]);
  listFactions.mockReturnValue([]);
  getActiveThreats.mockReturnValue([]);
  tableVows.mockReturnValue([]);
  globalThis.game.users = Object.assign([], { contents: [] });
});

describe('the spotlight\'s material — the Begin card\'s result first', () => {
  it('the first seed is the card\'s roll, read off the registered table; then what happens and what it looks like', () => {
    // 85: "Peril lies ahead or lurks just out of view" — nothing to draw among.
    const draw = scripted([14, 20, 5, 6, 63, 18, 7, 8]);
    const scene = composeSpotlightScene({}, { roll: 85, draw });
    expect(scene.result).toBe(rollOracle('spotlight_vignette', { roll: 85 }).result);
    expect(scene.seeds.map(s => s.slot)).toEqual(['spotlight', 'happens', 'looks']);
    expect(scene.seeds[0]).toMatchObject({
      from: 'oracle', label: 'What the vignette shows', result: scene.result,
      tables: [{ id: 'spotlight_vignette', name: 'Spotlight Vignette', roll: 85, result: scene.result }],
    });
    expect(scene.seeds[0].second).toBeUndefined();
    expect(scene.seeds[1].result).toBe('Bolster Debt');
    expect(scene.seeds[2].result).toBe('Makeshift Container');
    // The card's d100 is handed in: the scene draws only its own dice.
    expect(draw.asked).toEqual([100, 100, 100, 100, 100, 100, 100, 100]);
    expect(scene.narratorClass).toBe('interaction');
  });

  it('a roll that is no face of the d100 is no spotlight', () => {
    for (const roll of [0, 101, 4.5, '46', null, undefined]) expect(composeSpotlightScene({}, { roll, draw: scripted([]) })).toBeNull();
  });

  it('"External factors … for a quest": a die among the open vows', () => {
    tableVows.mockReturnValue([VOW('Background vow', 'v-bg'), VOW('Recover the Wren\'s manifest', 'v-1'), VOW('Find my brother', 'v-2')]);
    const draw = scripted([2, 14, 20, 5, 6, 63, 18, 7, 8]);
    const scene = composeSpotlightScene({}, { roll: 46, draw });
    const about = scene.seeds.find(s => s.slot === 'about');
    // The background vow is no quest: two to choose between.
    expect(about).toMatchObject({ label: 'The quest it touches', from: 'state', source: 'the open vows', result: 'Find my brother',
      tables: [{ roll: 2, die: 2 }] });
    expect(draw.left()).toBe(0);
  });

  it('"Seemingly unrelated situations … connected": two of the open vows, threats and clocks', () => {
    tableVows.mockReturnValue([VOW('Background vow', 'v-bg'), VOW('Recover the manifest', 'v-1')]);
    getActiveThreats.mockReturnValue([{ name: 'The Cinder Choir', summary: 'Raiders' }]);
    const cs = { clocks: [
      { _id: 'k1', name: 'Reactor breach', segments: 6, filled: 2, active: true },
      { _id: 'k2', name: 'The quiet buyer', segments: 6, filled: 1, active: true, planId: 'p1' },   // a hidden plan's: never named
      { _id: 'k3', name: 'Done', segments: 4, filled: 4, active: true },
    ] };
    // A d3 among the three, face 1; then a d2 among the rest, face 2.
    const draw = scripted([1, 2, 14, 20, 5, 6, 63, 18, 7, 8]);
    const about = composeSpotlightScene(cs, { roll: 35, draw }).seeds.find(s => s.slot === 'about');
    expect(about.result).toBe('Recover the manifest; Reactor breach');
    expect(about.tables.map(t => [t.roll, t.die])).toEqual([[1, 3], [2, 2]]);
    expect(draw.asked.slice(0, 2)).toEqual([3, 2]);
  });

  it('"Important character is put in danger": a connection in play — none on record, the two pairs carry it', () => {
    listConnections.mockReturnValue([TAMSIN, DORAN, { _id: 'c-x', name: 'Vance', active: false }]);
    const about = composeSpotlightScene({}, { roll: 55, draw: scripted([2, 14, 20, 5, 6, 63, 18, 7, 8]) }).seeds.find(s => s.slot === 'about');
    expect(about).toMatchObject({ label: 'Who is put in danger', result: 'Doran Iske', ref: 'connection:c-doran', tables: [{ roll: 2, die: 2 }] });
    listConnections.mockReturnValue([]);
    expect(composeSpotlightScene({}, { roll: 55, draw: scripted([14, 20, 5, 6, 63, 18, 7, 8]) }).seeds.map(s => s.slot)).toEqual(['spotlight', 'happens', 'looks']);
  });

  it('"Influential character or faction is introduced": with nobody on record, the discovery latitude', () => {
    const scene = composeSpotlightScene({}, { roll: 25, draw: scripted([14, 20, 5, 6, 63, 18, 7, 8]) });
    expect(scene.narratorClass).toBe('discovery');
    expect(scene.userMessage).toMatch(/The figure it introduces is new/);
    listFactions.mockReturnValue([{ _id: 'f1', name: 'The Ascendancy' }]);
    const given = composeSpotlightScene({}, { roll: 25, draw: scripted([14, 20, 5, 6, 63, 18, 7, 8]) });
    expect(given.narratorClass).toBe('interaction');
    expect(given.seeds.find(s => s.slot === 'about')).toMatchObject({ label: 'Who is given new detail', result: 'The Ascendancy' });
  });
});

describe('the spotlight\'s message', () => {
  it('is found by its marker, carries the card\'s result first, and ends on its length', () => {
    const { userMessage } = composeSpotlightScene({ activeSectorId: 's1', sectors: [{ id: 's1', name: 'Cinder Expanse' }] },
      { roll: 46, draw: scripted([14, 20, 5, 6, 63, 18, 7, 8]) });
    const lines = userMessage.split('\n');
    expect(lines[0]).toBe('SPOTLIGHT VIGNETTE — begin-session.');
    expect(userMessage).toContain(`1. What the vignette shows — Spotlight Vignette (46): ${rollOracle('spotlight_vignette', { roll: 46 }).result}`);
    expect(userMessage).toMatch(/a scene the characters are not in, or a moment of the past — that the table\s+sees and the characters do not/);
    expect(userMessage).toMatch(/\(1\) is what the vignette shows\s+happening/);
    expect(userMessage).not.toMatch(/at the size of a quiet moment/);
    expect(userMessage).toContain('Ship is currently in: Cinder Expanse.');
    expect(lines.slice(-2).join(' ')).toBe('Length: three to five sentences, about 90 words — never more than five sentences. Count them.');
  });

  it('asks for no account when no fact block is written', () => {
    expect(buildSpotlightVignetteUserMessage({}, { seeds: [], account: false })).not.toMatch(/builtFrom/);
  });
});
