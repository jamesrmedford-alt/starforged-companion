// tests/unit/ironswornPacks.test.js
// Phase 5 — canonical compendium lookup.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  IS_PACKS,
  getCanonicalMove,
  getCanonicalOracle,
  getCanonicalEncounterActor,
  listCanonicalEncounters,
  listCanonicalTruths,
  _clearPackCache,
} from '../../src/system/ironswornPacks.js';

function makeFakePack({ id, entries }) {
  const docs = new Map();
  for (const e of entries) docs.set(e._id, e);
  const index = entries.slice();
  index.find = (fn) => entries.find(fn);
  index.size = entries.length;
  return {
    metadata: { id },
    index,
    getIndex: async () => index,
    getDocument: async (id) => docs.get(id) ?? null,
  };
}

describe('Phase 5 — IS_PACKS constants', () => {
  it('exposes Starforged-prefixed pack IDs', () => {
    expect(IS_PACKS.STARFORGED_MOVES).toBe('foundry-ironsworn.starforged-moves');
    expect(IS_PACKS.STARFORGED_ORACLES).toBe('foundry-ironsworn.starforged-oracles');
    expect(IS_PACKS.FOE_ACTORS_SF).toBe('foundry-ironsworn.foe-actors-sf');
    expect(IS_PACKS.STARFORGED_TRUTHS).toBe('foundry-ironsworn.starforged-truths');
  });
});

describe('Phase 5 — getCanonicalMove', () => {
  let originalPacks;

  beforeEach(() => {
    _clearPackCache();
    originalPacks = global.game.packs;
  });

  afterEach(() => {
    global.game.packs = originalPacks;
  });

  it('returns the move document when found by slug', async () => {
    const move = {
      _id: 'm1',
      name: 'Pay the Price',
      flags: { 'foundry-ironsworn': { dfid: 'starforged/moves/fate/pay_the_price' } },
      system: { description: 'You face a price.' },
    };
    global.game.packs = {
      get: (id) => id === IS_PACKS.STARFORGED_MOVES
        ? makeFakePack({ id, entries: [move] })
        : null,
    };
    const result = await getCanonicalMove('pay_the_price');
    expect(result).toBe(move);
  });

  it('matches by name slug when dfid is absent', async () => {
    const move = { _id: 'm2', name: 'Face Danger', system: { description: 'fd' } };
    global.game.packs = {
      get: () => makeFakePack({ id: IS_PACKS.STARFORGED_MOVES, entries: [move] }),
    };
    const result = await getCanonicalMove('face_danger');
    expect(result).toBe(move);
  });

  it('returns null when the slug is not found', async () => {
    global.game.packs = {
      get: () => makeFakePack({ id: IS_PACKS.STARFORGED_MOVES, entries: [] }),
    };
    expect(await getCanonicalMove('mystery_move')).toBeNull();
  });

  it('returns null when no pack is registered', async () => {
    global.game.packs = { get: () => null };
    expect(await getCanonicalMove('pay_the_price')).toBeNull();
  });

  it('returns null when slug is empty', async () => {
    expect(await getCanonicalMove('')).toBeNull();
    expect(await getCanonicalMove(null)).toBeNull();
  });

  it('caches results — second lookup does not call getDocument again', async () => {
    let calls = 0;
    const move = { _id: 'm3', name: 'Sojourn', system: { description: 's' } };
    const pack = {
      index: (() => { const a = [move]; a.find = (fn) => a.find_unwrapped?.(fn) ?? Array.prototype.find.call(a, fn); a.size = 1; return a; })(),
      getDocument: async (id) => { calls++; return id === 'm3' ? move : null; },
    };
    global.game.packs = { get: () => pack };
    await getCanonicalMove('sojourn');
    await getCanonicalMove('sojourn');
    expect(calls).toBe(1);
  });
});

describe('Phase 5 — getCanonicalEncounterActor / listCanonicalEncounters', () => {
  beforeEach(() => { _clearPackCache(); });

  it('finds an encounter by exact (case-insensitive) name', async () => {
    const wraith = { _id: 'a1', name: 'Iron Wraith', system: { rank: 'formidable' } };
    global.game.packs = {
      get: (id) => id === IS_PACKS.FOE_ACTORS_SF
        ? makeFakePack({ id, entries: [wraith] })
        : null,
    };
    const result = await getCanonicalEncounterActor('iron wraith');
    expect(result).toBe(wraith);
  });

  it('returns null when name is missing', async () => {
    global.game.packs = { get: () => null };
    expect(await getCanonicalEncounterActor('')).toBeNull();
  });

  it('listCanonicalEncounters returns the index sorted by name', async () => {
    const entries = [
      { _id: 'a1', name: 'Zealot' },
      { _id: 'a2', name: 'Adept' },
      { _id: 'a3', name: 'Hunter' },
    ];
    global.game.packs = {
      get: (id) => id === IS_PACKS.FOE_ACTORS_SF
        ? makeFakePack({ id, entries })
        : null,
    };
    const list = await listCanonicalEncounters();
    expect(list.map(x => x.name)).toEqual(['Adept', 'Hunter', 'Zealot']);
  });

  it('returns [] when the foe pack is unavailable', async () => {
    global.game.packs = { get: () => null };
    expect(await listCanonicalEncounters()).toEqual([]);
  });
});

describe('Phase 5 — getCanonicalOracle / listCanonicalTruths', () => {
  beforeEach(() => { _clearPackCache(); });

  it('getCanonicalOracle finds by name slug', async () => {
    const oracle = { _id: 'o1', name: 'Action Oracle', system: {} };
    global.game.packs = {
      get: (id) => id === IS_PACKS.STARFORGED_ORACLES
        ? makeFakePack({ id, entries: [oracle] })
        : null,
    };
    expect(await getCanonicalOracle('action_oracle')).toBe(oracle);
  });

  it('listCanonicalTruths loads each truth document via the pack', async () => {
    const truths = [
      { _id: 't1', name: 'Cataclysm' },
      { _id: 't2', name: 'Exodus' },
    ];
    global.game.packs = {
      get: (id) => id === IS_PACKS.STARFORGED_TRUTHS
        ? makeFakePack({ id, entries: truths })
        : null,
    };
    const docs = await listCanonicalTruths();
    expect(docs.map(d => d.name).sort()).toEqual(['Cataclysm', 'Exodus']);
  });
});
