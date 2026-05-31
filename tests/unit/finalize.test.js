// tests/unit/finalize.test.js
// Coverage for src/entities/finalize.js — the entity finalize lifecycle (T1).
// Boundaries are mocked: the narrator call at apiPost, the entity getters/
// updaters, and the art pipeline at generatePortrait.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../src/art/generator.js', () => ({ generatePortrait: vi.fn() }));
vi.mock('../../src/entities/ship.js', () => ({
  getShip: vi.fn(), updateShip: vi.fn(async (_id, u) => ({ ...u })),
}));
vi.mock('../../src/entities/settlement.js', () => ({
  getSettlement: vi.fn(), updateSettlement: vi.fn(async (_id, u) => ({ ...u })),
}));
vi.mock('../../src/entities/planet.js', () => ({
  getPlanet: vi.fn(), updatePlanet: vi.fn(async (_id, u) => ({ ...u })),
}));
vi.mock('../../src/entities/location.js', () => ({
  getLocation: vi.fn(), updateLocation: vi.fn(async (_id, u) => ({ ...u })),
}));

import { apiPost } from '../../src/api-proxy.js';
import { generatePortrait } from '../../src/art/generator.js';
import { getSettlement, updateSettlement } from '../../src/entities/settlement.js';
import {
  buildEntityFlavorPrompt,
  finalizeEntity,
  supportsFinalize,
} from '../../src/entities/finalize.js';

const MODULE_ID = 'starforged-companion';

function apiText(text) {
  return { content: [{ type: 'text', text }] };
}

beforeEach(() => {
  apiPost.mockReset();
  generatePortrait.mockReset().mockResolvedValue({ _id: 'art-1' });
  getSettlement.mockReset();
  updateSettlement.mockReset().mockImplementation(async (_id, u) => ({ ...u }));
  game.settings._store.clear();
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
});


describe('supportsFinalize', () => {
  it('is true for the four Actor-backed types', () => {
    for (const t of ['ship', 'settlement', 'planet', 'location']) {
      expect(supportsFinalize(t)).toBe(true);
    }
  });
  it('is false for journal-backed types and unknowns', () => {
    for (const t of ['connection', 'faction', 'creature', 'bogus', undefined]) {
      expect(supportsFinalize(t)).toBe(false);
    }
  });
});


describe('buildEntityFlavorPrompt', () => {
  it('includes the name, type label, grounded fields, and stripped current notes', () => {
    const { system, user } = buildEntityFlavorPrompt('settlement', {
      name: 'Glimmer',
      location: 'Orbital',
      population: 'Thousands',
      authority: 'Notorious',
      description: '<p>A <em>rusting</em> ring station.</p>',
    }, 'wry');

    expect(system).toMatch(/Tone: wry/);
    expect(system).toMatch(/settlement description/);
    expect(system).toMatch(/Ground it\s+ONLY in the details provided/);
    expect(user).toContain('Settlement: Glimmer');
    expect(user).toContain('- location: Orbital');
    expect(user).toContain('- population: Thousands');
    expect(user).toContain('Current notes: A rusting ring station.'); // tags stripped
    expect(user).not.toContain('<p>');
  });

  it('omits empty / blank / empty-array fields and a missing notes line', () => {
    const { user } = buildEntityFlavorPrompt('ship', {
      name: 'Kobayashi IV',
      type: 'Shuttle',
      firstLook: '',
      mission: null,
    });
    expect(user).toContain('Starship: Kobayashi IV');
    expect(user).toContain('- type: Shuttle');
    expect(user).not.toContain('firstLook');
    expect(user).not.toContain('mission');
    expect(user).not.toContain('Current notes:');
  });
});


describe('finalizeEntity', () => {
  it('generates grounded flavour and writes description + source + finalizedAt', async () => {
    getSettlement.mockReturnValue({ _id: 's1', name: 'Glimmer', location: 'Orbital' });
    apiPost.mockResolvedValue(apiText('A rusting ring station, half its lights dead.'));

    const result = await finalizeEntity('settlement', 'actor-1', {});

    expect(result.ok).toBe(true);
    expect(result.reason).toBe('finalized');
    expect(apiPost).toHaveBeenCalledTimes(1);
    expect(updateSettlement).toHaveBeenCalledTimes(1);
    const [id, updates] = updateSettlement.mock.calls[0];
    expect(id).toBe('actor-1');
    expect(updates.description).toBe('A rusting ring station, half its lights dead.');
    expect(updates.portraitSourceDescription).toBe('A rusting ring station, half its lights dead.');
    expect(typeof updates.finalizedAt).toBe('string');
  });

  it('triggers a first-time portrait when the entity has none', async () => {
    getSettlement.mockReturnValue({ _id: 's1', name: 'Glimmer' });
    apiPost.mockResolvedValue(apiText('Prose.'));

    const result = await finalizeEntity('settlement', 'actor-1', {});

    expect(generatePortrait).toHaveBeenCalledTimes(1);
    expect(generatePortrait).toHaveBeenCalledWith('actor-1', 'settlement', expect.any(Object), {});
    expect(result.artTriggered).toBe(true);
  });

  it('does NOT trigger a portrait when one already exists (generate-once)', async () => {
    getSettlement.mockReturnValue({ _id: 's1', name: 'Glimmer', portraitId: 'art-existing' });
    apiPost.mockResolvedValue(apiText('Prose.'));

    const result = await finalizeEntity('settlement', 'actor-1', {});

    expect(generatePortrait).not.toHaveBeenCalled();
    expect(result.artTriggered).toBe(false);
    expect(result.ok).toBe(true);
  });

  it('preserves an existing portraitSourceDescription instead of overwriting it', async () => {
    getSettlement.mockReturnValue({ _id: 's1', name: 'Glimmer', portraitSourceDescription: 'seed text' });
    apiPost.mockResolvedValue(apiText('Longer prose.'));

    await finalizeEntity('settlement', 'actor-1', {});

    expect(updateSettlement.mock.calls[0][1].portraitSourceDescription).toBe('seed text');
    expect(updateSettlement.mock.calls[0][1].description).toBe('Longer prose.');
  });

  it('is idempotent — a finalized record is left untouched without force', async () => {
    getSettlement.mockReturnValue({ _id: 's1', name: 'Glimmer', finalizedAt: '2026-05-01T00:00:00.000Z' });

    const result = await finalizeEntity('settlement', 'actor-1', {});

    expect(result.reason).toBe('already-finalized');
    expect(apiPost).not.toHaveBeenCalled();
    expect(updateSettlement).not.toHaveBeenCalled();
  });

  it('regenerates when force is set, even if already finalized', async () => {
    getSettlement.mockReturnValue({ _id: 's1', name: 'Glimmer', finalizedAt: '2026-05-01T00:00:00.000Z', portraitId: 'art-x' });
    apiPost.mockResolvedValue(apiText('Fresh prose.'));

    const result = await finalizeEntity('settlement', 'actor-1', {}, { force: true });

    expect(result.reason).toBe('regenerated');
    expect(apiPost).toHaveBeenCalledTimes(1);
    expect(updateSettlement).toHaveBeenCalledTimes(1);
    expect(generatePortrait).not.toHaveBeenCalled(); // already has a portrait → not re-billed
  });

  it('returns no-flavor and writes nothing when the Claude key is unset', async () => {
    game.settings._store.delete(`${MODULE_ID}.claudeApiKey`);
    getSettlement.mockReturnValue({ _id: 's1', name: 'Glimmer' });

    const result = await finalizeEntity('settlement', 'actor-1', {});

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('no-flavor');
    expect(apiPost).not.toHaveBeenCalled();
    expect(updateSettlement).not.toHaveBeenCalled();
  });

  it('returns not-found when the record is missing', async () => {
    getSettlement.mockReturnValue(null);
    const result = await finalizeEntity('settlement', 'missing', {});
    expect(result.reason).toBe('not-found');
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('returns unsupported-type for journal-backed types', async () => {
    const result = await finalizeEntity('faction', 'actor-1', {});
    expect(result.reason).toBe('unsupported-type');
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('returns no-flavor when the model yields empty text (no write, no art)', async () => {
    getSettlement.mockReturnValue({ _id: 's1', name: 'Glimmer' });
    apiPost.mockResolvedValue(apiText('   '));

    const result = await finalizeEntity('settlement', 'actor-1', {});

    expect(result.reason).toBe('no-flavor');
    expect(updateSettlement).not.toHaveBeenCalled();
    expect(generatePortrait).not.toHaveBeenCalled();
  });
});
