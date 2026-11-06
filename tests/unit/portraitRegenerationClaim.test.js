/* global silenceConsoleErrors */
/**
 * STARFORGED COMPANION
 * tests/unit/portraitRegenerationClaim.test.js
 *
 * Known-issues REGEN-LINK-REFUSED-SECOND-REGEN (found while confirming
 * GENERATE-PORTRAIT-AFTER-REGEN): a portrait's one regeneration is claimed
 * before its image is bought, so it is spent once (decisions.md → "Portrait
 * generation: generate once, one regeneration, then locked").
 *
 * regeneratePortrait marked the first portrait superseded, stored the new
 * locked one and then linked it to the entity's record — and the link
 * (linkPortraitToEntity) swallowed a refused write. The record still named
 * the first portrait, which carried no sign of the regeneration (not
 * `regenerationUsed`, not locked), so the Entities panel offered Regenerate
 * again and a second regeneration was billed. And nothing claimed the
 * regeneration until its image came back: a second GM's Regenerate pressed
 * meanwhile bought a second image too. Now the link reports whether it
 * landed, and the regeneration is claimed on the portrait the record names
 * (`regenerationUsed`) before the image is bought — given back only if the
 * image could not be made. A refused link spends it: the earlier portrait
 * stays the entity's, locked, and the GM is told. While the claim stands,
 * generatePortrait returns the portrait the record names (a seed's call
 * bills nothing).
 *
 * Driven on a booted table of two GMs: the real generator, the Art Cache
 * storage and the record writes, with the image call stubbed.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

// Each image call takes the next step: { hold: Promise } waits, { fail: true } errors.
const art = vi.hoisted(() => ({ calls: 0, next: [] }));
vi.mock('../../src/art/openRouterImage.js', () => ({
  generateOpenRouterImage: vi.fn(async () => {
    art.calls += 1;
    const step = art.next.shift();
    if (step?.hold) await step.hold;
    if (step?.fail) throw new Error('OpenRouter 500 (test fault)');
    return 'A'.repeat(400);
  }),
}));

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { failWrites, deferred } from '../helpers/faults.js';
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

/** The asset an Art Cache entry holds, by id. */
function storedAsset(id) {
  for (const entry of table.journal.contents) {
    const asset = entry.pages?.contents?.[0]?.flags?.[MODULE_ID]?.artAsset;
    if (asset?._id === id) return asset;
  }
  return null;
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.GM2] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  art.calls = 0;
  art.next = [];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, autoSeedConnection: false,
    campaignState: { ...CampaignStateSchema, connectionIds: ['npc-vance'] },
  } } });
  for (const id of ['gm-1', 'gm-2']) await table.client(id).setSetting('openRouterApiKey', 'sk-or-test');
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
  silenceConsoleErrors();
});
afterEach(() => { globalThis.JournalEntry = savedJournalEntry; });

/** Run fn(generator, campaignState) on a GM's client. */
async function onGm(id, fn) {
  const gm = table.client(id);
  const generator = await gm.import('../../src/art/generator.js');
  const out = await gm.run(() => fn(generator, game.settings.get(MODULE_ID, 'campaignState')));
  await table.settle();
  return out;
}
const generate   = (id = 'gm-1') => onGm(id, (g, cs) => g.generatePortrait('npc-vance', 'connection', record(), cs));
const regenerate = (id = 'gm-1') => onGm(id, (g, cs) => g.regeneratePortrait('npc-vance', 'connection', record(), cs));

// The record write a portrait's link makes.
const linkWrite = (w) => w.kind === 'actor.update' && w.id === 'npc-vance'
  && Object.keys(w.changes ?? {}).some(k => k === `flags.${MODULE_ID}.connection`);

describe('a portrait\'s one regeneration is claimed before its image is bought', () => {
  it('a regeneration whose record write the world refused is spent: the earlier portrait stays, locked, and a second Regenerate bills nothing', async () => {
    const first = await generate();
    failWrites(table, linkWrite);
    const refused = await regenerate();
    expect(art.calls, 'its image was bought (setup)').toBe(2);

    // It was offered and billed again, and the second one linked.
    await regenerate();
    expect(art.calls).toBe(2);
    expect(record().portraitId, 'the record still names the earlier portrait').toBe(first._id);
    expect(refused, 'the regenerated portrait is not the entity\'s').toBeNull();
    expect(storedAsset(first._id)).toMatchObject({ regenerationUsed: true, locked: true });
    expect(table.client('gm-1').notifications.some(n => /could not be saved/.test(n.message)), 'the GM is told').toBe(true);
  }, 30_000);

  it('a second GM\'s Regenerate pressed while the first GM\'s image is out bills nothing', async () => {
    await generate();
    const image = deferred();
    art.next = [{ hold: image.promise }];
    const firstGm = regenerate('gm-1');
    await vi.waitFor(() => expect(art.calls).toBe(2));   // gm-1's image is out

    const second = await regenerate('gm-2');
    image.resolve();
    const landed = await firstGm;

    // It bought a second image, and whichever landed last was the entity's.
    expect(art.calls).toBe(2);
    expect(second).toBeNull();
    expect(landed).toMatchObject({ regenerationUsed: true, locked: true });
    expect(record().portraitId).toBe(landed._id);
  }, 30_000);

  it('while a regeneration\'s image is out, a seed\'s generatePortrait bills nothing and keeps the portrait the record names', async () => {
    const first = await generate();
    const image = deferred();
    art.next = [{ hold: image.promise }];
    const regen = regenerate('gm-1');
    await vi.waitFor(() => expect(art.calls).toBe(2));

    const seeded = await generate('gm-1');   // the NPC card's seed calls it with no portraitId check of its own
    expect(seeded?._id ?? null).toBe(first._id);
    expect(art.calls).toBe(2);

    image.resolve();
    const landed = await regen;
    expect(record().portraitId).toBe(landed._id);
  }, 30_000);

  it('control: a regeneration whose image could not be made gives the regeneration back — the next one lands, locked', async () => {
    const first = await generate();
    art.next = [{ fail: true }];

    expect(await regenerate()).toBeNull();
    expect(storedAsset(first._id)).toMatchObject({ regenerationUsed: false, locked: false });
    expect(record().portraitId).toBe(first._id);

    const landed = await regenerate();
    expect(art.calls).toBe(3);
    expect(landed).toMatchObject({ regenerationUsed: true, locked: true });
    expect(record().portraitId).toBe(landed._id);
  }, 30_000);

  it('control: a regeneration that lands supersedes the earlier portrait and is locked', async () => {
    const first = await generate();
    const landed = await regenerate();

    expect(art.calls).toBe(2);
    expect(landed).toMatchObject({ regenerationUsed: true, locked: true });
    expect(record().portraitId).toBe(landed._id);
    expect(storedAsset(first._id)?.superseded).toBe(true);
  }, 30_000);
});
