/**
 * STARFORGED COMPANION
 * tests/unit/portraitRegenerationCap.test.js
 *
 * Known-issues GENERATE-PORTRAIT-AFTER-REGEN (found while fixing issue #342
 * Z60, unverified): the entry read `art/generator.js`'s generatePortrait as
 * making a new portrait whenever the existing one has `regenerationUsed` — a
 * way past "one generation, one permitted regeneration, then locked"
 * (decisions.md → "Portrait generation") for its callers that do not check
 * the record's `portraitId` first (the NPC card's and the ship's seeds,
 * seedConnectionActor / seedStarshipActor). Not so at this version: the one
 * regeneration (regeneratePortrait) stores its portrait `regenerationUsed`
 * AND `locked` in one write, and generatePortrait refuses a locked portrait
 * before it reads `regenerationUsed` — no image is requested. Its only way on
 * with a `portraitId` set is a portrait no Art Cache entry holds any more,
 * which it replaces (the record's link names nothing). This pins the cap
 * through the real generator, storage and record writes.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

const art = vi.hoisted(() => ({ calls: 0 }));
vi.mock('../../src/art/openRouterImage.js', () => ({
  generateOpenRouterImage: vi.fn(async () => { art.calls += 1; return 'A'.repeat(400); }),
}));

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';

let nextId = 0;

/** A JournalEntry that keeps its pages (the tests/setup.js stub keeps none) — the Art Cache's entries. */
function makeJournal(data) {
  const id = `jrnl${String(++nextId).padStart(12, '0')}`;
  const journal = {
    id, name: data.name, folder: data.folder ?? null,
    flags: JSON.parse(JSON.stringify(data.flags ?? {})),
    pages: { contents: [] },
    async createEmbeddedDocuments(_type, list) {
      return list.map((d) => {
        const page = {
          id: `page${String(++nextId).padStart(12, '0')}`,
          name: d.name, type: d.type ?? 'text', text: d.text ?? {},
          flags: JSON.parse(JSON.stringify(d.flags ?? {})),
          getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
          async setFlag(scope, key, value) { (this.flags[scope] ??= {})[key] = JSON.parse(JSON.stringify(value)); return this; },
          async update() { return this; },
        };
        journal.pages.contents.push(page);
        return page;
      });
    },
    getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
    async setFlag(scope, key, value) { (this.flags[scope] ??= {})[key] = value; return this; },
    async update(changes) { Object.assign(this, changes); return this; },
  };
  return journal;
}

let table;
let savedJournalEntry;
let vance;
const record = () => vance.flags[MODULE_ID].connection;

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  art.calls = 0;
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, autoSeedConnection: false,
    campaignState: { ...CampaignStateSchema, connectionIds: ['npc-vance'] },
  } } });
  await table.client('gm-1').setSetting('openRouterApiKey', 'sk-or-test');
  savedJournalEntry = globalThis.JournalEntry;
  globalThis.JournalEntry = {
    async create(data) {
      const j = makeJournal(data);
      globalThis.game.journal._set(j.id, j);
      return j;
    },
  };
  vance = table.addActor({
    id: 'npc-vance', name: 'Vance', type: 'character',
    flags: { [MODULE_ID]: { entityType: 'connection', connection: {
      _id: 'rec-vance', name: 'Vance', role: 'Pilot', rank: 'dangerous', active: true, history: [],
      portraitSourceDescription: 'A weathered pilot in a patched flight suit',
    } } },
  });
  await table.settle();
});
afterEach(() => { globalThis.JournalEntry = savedJournalEntry; });

async function gmRun(fn) {
  const gm = table.client('gm-1');
  const generator = await gm.import('../../src/art/generator.js');
  const out = await gm.run(() => fn(generator, game.settings.get(MODULE_ID, 'campaignState')));
  await table.settle();
  return out;
}

describe('a portrait regenerated once stays the entity\'s (GENERATE-PORTRAIT-AFTER-REGEN)', () => {
  it('after the one regeneration, a seed\'s generatePortrait requests no image and keeps the locked portrait', async () => {
    const first = await gmRun((g, cs) => g.generatePortrait('npc-vance', 'connection', record(), cs));
    const regen = await gmRun((g, cs) => g.regeneratePortrait('npc-vance', 'connection', record(), cs));
    expect(art.calls, 'one generation, one regeneration (setup)').toBe(2);
    expect(regen).toMatchObject({ regenerationUsed: true, locked: true });
    expect(record().portraitId).toBe(regen._id);
    expect(regen._id).not.toBe(first._id);

    // The seeds call it with no portraitId check of their own.
    const again = await gmRun((g, cs) => g.generatePortrait('npc-vance', 'connection', record(), cs));

    expect(again).toBeNull();
    expect(art.calls).toBe(2);
    expect(record().portraitId).toBe(regen._id);
  }, 30_000);

  it('control: before any regeneration, a second generatePortrait returns the portrait it has, billing nothing', async () => {
    const first = await gmRun((g, cs) => g.generatePortrait('npc-vance', 'connection', record(), cs));
    const again = await gmRun((g, cs) => g.generatePortrait('npc-vance', 'connection', record(), cs));

    expect(again?._id).toBe(first._id);
    expect(art.calls).toBe(1);
  }, 30_000);

  it('control: a second regeneration is refused and requests no image', async () => {
    await gmRun((g, cs) => g.generatePortrait('npc-vance', 'connection', record(), cs));
    const regen = await gmRun((g, cs) => g.regeneratePortrait('npc-vance', 'connection', record(), cs));
    const second = await gmRun((g, cs) => g.regeneratePortrait('npc-vance', 'connection', record(), cs));

    expect(second).toBeNull();
    expect(art.calls).toBe(2);
    expect(record().portraitId).toBe(regen._id);
  }, 30_000);
});
