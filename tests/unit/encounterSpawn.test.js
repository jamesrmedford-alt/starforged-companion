// tests/unit/encounterSpawn.test.js
// Phase 7 — !sfc encounter command parser and chat-card builder.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
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

  // Issue #321 U32 — a foundry-ironsworn foe (FoeModel: system = { dfid })
  // keeps its rank and stat text on its embedded `progress` Item. These tests
  // used to feed a `system.rank / features / drives` shape no foe has.
  const foe = (name, progress) => {
    const items = [{ type: 'progress', name, system: { subtype: 'progress', current: 0, ...progress } }];
    items.contents = items;
    return { name, type: 'foe', system: { dfid: '' }, items };
  };

  it('shows the rank of the progress item by name', () => {
    const card = buildEncounterCard(foe('Adept', { rank: 3, description: '' }));
    expect(card).toContain('<strong>Rank:</strong> Formidable');
  });

  it('renders the progress item\'s Features / Drives / Tactics text', () => {
    const card = buildEncounterCard(foe('Hunter', {
      rank: 2,
      description: '<h4>Features</h4><p>Tracks tirelessly</p><h4>Drives</h4><p>Complete the contract</p>',
    }));
    expect(card).toContain('<strong>Rank:</strong> Dangerous');
    expect(card).toContain('<p>Tracks tirelessly</p>');
    expect(card).toContain('<p>Complete the contract</p>');
  });

  it('control: a foe without a progress item is just its name', () => {
    const card = buildEncounterCard({ name: 'Odd', system: { dfid: '' }, items: [] });
    expect(card).toBe('<h3>Odd</h3>');
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

// Issue #321 U32 — the card from the REAL compendium entry of the vendored
// `foe-actors-sf` pack (the pack getCanonicalEncounterActor reads). CI checks
// the submodule out; a checkout without it skips these.
describe('buildEncounterCard — a real foundry-ironsworn foe', () => {
  const PACK_DIR = path.resolve('vendor/foundry-ironsworn/json-packs/foe-actors-sf');
  const CHITON = path.join(PACK_DIR, 'Chiton_95667d6a269e99a0.json');
  const vendored = fs.existsSync(CHITON);

  /** A Foundry-shaped foe Actor built from the vendored compendium JSON. */
  function vendorFoe(file) {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const items = (raw.items ?? []).map(i => ({ ...i }));
    items.contents = items;            // EmbeddedCollection-ish: .contents
    return { ...raw, items };
  }

  it.skipIf(!vendored)('control: the vendored foe keeps rank + features on its progress item, not on system', () => {
    const chiton = vendorFoe(CHITON);
    expect(chiton.system).toEqual({ dfid: '' });
    const progress = chiton.items.find(i => i.type === 'progress');
    expect(progress.system.rank).toBe(2);
    expect(progress.system.description).toContain('Arachnid monsters with blade-like limbs');
  });

  it.skipIf(!vendored)('the !sfc encounter card shows the foe rank by name and its features', () => {
    const card = buildEncounterCard(vendorFoe(CHITON));
    expect(card).toContain('<h3>Chiton</h3>');
    expect(card).toContain('<strong>Rank:</strong> Dangerous');
    expect(card).toContain('Arachnid monsters with blade-like limbs');
    expect(card).toContain('Feed and protect the queen');
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
    // Centred: a 1×1 token's middle on the unpadded 1000×1000 scene's middle (issue #322 V24).
    expect(placed[0]).toMatchObject({ actorId: 'world-foe', x: 450, y: 450, hidden: false });
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
