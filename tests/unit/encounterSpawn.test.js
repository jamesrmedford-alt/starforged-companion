// tests/unit/encounterSpawn.test.js
// Phase 7 — !sfc encounter command parser and chat-card builder.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  parseEncounterCommand,
  isEncounterCommand,
  buildEncounterCard,
  spawnEncounter,
} from '../../src/system/encounterSpawn.js';
import { _clearPackCache, IS_PACKS } from '../../src/system/ironswornPacks.js';

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

// Issue #306 R12 — the GM's `!sfc encounter` built the token from the
// COMPENDIUM Actor (getTokenDocument on it), with no world-Actor import, so the
// placed token named a compendium id no world Actor has. Foundry's
// TokenDocument.baseActor is a world Actor: such a token has no sheet and no
// actor to act on. The modelled contract here: a token's actorId must name a
// world Actor.
describe('spawnEncounter places a token backed by a world Actor (issue #306 R12)', () => {
  const UUID = `Compendium.${IS_PACKS.FOE_ACTORS_SF}.Actor.compendium-foe`;
  let placed, saved, pack, canonical;

  function worldFoe(id, extra = {}) {
    return {
      id, name: 'Iron Wraith', type: 'foe', ...extra,
      getTokenDocument: async (data) => ({ toObject: () => ({ ...data, name: 'Iron Wraith', actorId: id }) }),
    };
  }

  beforeEach(() => {
    _clearPackCache();
    game.actors._reset();
    saved = { packs: game.packs, canvas: globalThis.canvas, user: game.user, importer: game.actors.importFromCompendium };
    game.user = { id: 'gm-1', isGM: true };
    canonical = {
      id: 'compendium-foe', uuid: UUID, name: 'Iron Wraith', pack: IS_PACKS.FOE_ACTORS_SF, system: { rank: 'formidable' },
      getTokenDocument: vi.fn(async () => ({ toObject: () => ({ name: 'Iron Wraith', actorId: 'compendium-foe' }) })),
    };
    const index = [{ _id: canonical.id, name: canonical.name }];
    pack = { index, getDocument: async () => canonical };
    game.packs = new Map([[IS_PACKS.FOE_ACTORS_SF, pack]]);
    placed = [];
    globalThis.canvas = { scene: { width: 1000, height: 1000, createEmbeddedDocuments: async (_type, docs) => { placed.push(...docs); return docs; } } };
    game.actors.importFromCompendium = vi.fn(async (fromPack, id) => {
      expect([fromPack, id]).toEqual([pack, 'compendium-foe']);
      const actor = worldFoe('world-foe', { _stats: { compendiumSource: UUID } });
      game.actors._set(actor.id, actor);
      return actor;
    });
  });

  afterEach(() => {
    game.packs = saved.packs;
    globalThis.canvas = saved.canvas;
    game.user = saved.user;
    if (saved.importer) game.actors.importFromCompendium = saved.importer;
    else delete game.actors.importFromCompendium;
    game.actors._reset();
  });

  it('imports the foe on first use, and the token names the world Actor', async () => {
    const result = await spawnEncounter('Iron Wraith');
    expect(result.placed).toBe(true);
    expect(game.actors.importFromCompendium).toHaveBeenCalledTimes(1);
    expect(placed).toHaveLength(1);
    expect(placed[0]).toMatchObject({ actorId: 'world-foe', x: 500, y: 500, hidden: false });
    expect(game.actors.get(placed[0].actorId)).toBeTruthy();
    expect(canonical.getTokenDocument).not.toHaveBeenCalled();
  });

  it('reuses a world Actor already imported from that entry — no second import', async () => {
    game.actors._set('earlier-import', worldFoe('earlier-import', { _stats: { compendiumSource: UUID } }));
    await spawnEncounter('Iron Wraith');
    expect(game.actors.importFromCompendium).not.toHaveBeenCalled();
    expect(placed.map(t => t.actorId)).toEqual(['earlier-import']);
  });

  it('reuses an older import marked with flags.core.sourceId', async () => {
    game.actors._set('legacy-import', worldFoe('legacy-import', { flags: { core: { sourceId: UUID } } }));
    await spawnEncounter('Iron Wraith');
    expect(game.actors.importFromCompendium).not.toHaveBeenCalled();
    expect(placed.map(t => t.actorId)).toEqual(['legacy-import']);
  });

  it('when the import fails, posts the stat card instead of a token for a compendium-only id', async () => {
    game.actors.importFromCompendium = vi.fn(async () => undefined);
    ChatMessage._reset();
    const result = await spawnEncounter('Iron Wraith');
    expect(result.placed).toBe(false);
    expect(placed).toEqual([]);
    expect(ChatMessage._created.at(-1).flags['starforged-companion'].encounterCard).toBe(true);
  });
});
