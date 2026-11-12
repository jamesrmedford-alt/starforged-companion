/* global silenceConsoleErrors */
/**
 * STARFORGED COMPANION
 * tests/unit/portraitLinkRefused.test.js
 *
 * Known-issues FIRST-PORTRAIT-LINK-REFUSED (found while fixing
 * REGEN-LINK-REFUSED-SECOND-REGEN): a first portrait whose record write the
 * world refused is neither shown as the entity's nor bought again.
 *
 * generatePortrait stored the image, linked it to the entity's record (the
 * link swallowed a refused write) and put it on the Actor regardless: the
 * card and its token showed a portrait the record did not name, the panel
 * said "Portrait generated" and then offered Generate again — and the next
 * press, the card's seed or a Finalise (which generates only for a record
 * with no portrait) bought a second image. Now a refused link leaves the
 * Actor as it was and tells the GM, and the stored image waits: the next
 * generation for that entity links it, buying nothing.
 *
 * Driven on a booted GM table: the real generator, the Art Cache storage, the
 * record writes and the Actor's portrait (the upload stub of tests/setup.js),
 * with the image call stubbed.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

const art = vi.hoisted(() => ({ calls: 0 }));
vi.mock('../../src/art/openRouterImage.js', () => ({
  generateOpenRouterImage: vi.fn(async () => { art.calls += 1; return 'A'.repeat(400); }),
}));

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { failWrites } from '../helpers/faults.js';
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
const vancePortraits = () => table.journal.contents
  .map(e => e.pages?.contents?.[0]?.flags?.[MODULE_ID]?.artAsset)
  .filter(a => a?.entityId === 'rec-vance');
const told = () => table.client('gm-1').notifications.filter(n => /portrait for Vance could not be saved/.test(n.message));

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  art.calls = 0;
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, autoSeedConnection: false,
    campaignState: { ...CampaignStateSchema, connectionIds: ['npc-vance'] },
  } } });
  await table.client('gm-1').setSetting('openRouterApiKey', 'sk-or-test');
  globalThis.foundry.applications.apps.FilePicker.implementation._reset();
  savedJournalEntry = globalThis.JournalEntry;
  globalThis.JournalEntry = {
    async create(data) {
      const j = makeJournal(data);
      globalThis.game.journal._set(j.id, j);
      return j;
    },
  };
  vance = table.addActor({
    id: 'npc-vance', name: 'Vance', type: 'character', img: 'icons/svg/mystery-man.svg',
    flags: { [MODULE_ID]: { entityType: 'connection', connection: {
      _id: 'rec-vance', name: 'Vance', role: 'Pilot', rank: 'dangerous', active: true, history: [],
      portraitSourceDescription: 'A weathered pilot in a patched flight suit',
    } } },
  });
  vance.documentName = 'Actor';   // a portrait is put on an Actor-hosted entity's sheet and token
  await table.settle();
  silenceConsoleErrors();
});
afterEach(() => { globalThis.JournalEntry = savedJournalEntry; });

async function generate() {
  const gm = table.client('gm-1');
  const generator = await gm.import('../../src/art/generator.js');
  const out = await gm.run(() => generator.generatePortrait('npc-vance', 'connection', record(), game.settings.get(MODULE_ID, 'campaignState')));
  await table.settle();
  return out;
}

// The record write a portrait's link makes — the one naming a portrait (the
// first-portrait claim written before the image is a record write too:
// PORTRAIT-TWO-GM-FIRST-GENERATION).
const linkWrite = (w) => w.kind === 'actor.update' && w.id === 'npc-vance'
  && !!w.changes?.[`flags.${MODULE_ID}.connection`]?.portraitId;

describe('a first portrait whose record write the world refused (FIRST-PORTRAIT-LINK-REFUSED)', () => {
  it('is not put on the card, and the GM is told', async () => {
    failWrites(table, linkWrite);
    const made = await generate();

    expect(art.calls, 'the image was bought (setup)').toBe(1);
    expect(record().portraitId ?? null, 'the record names no portrait (setup)').toBeNull();
    // The card and its token showed it, though the record did not name it.
    expect(vance.img).toBe('icons/svg/mystery-man.svg');
    expect(made, 'not reported as generated').toBeNull();
    expect(told()).toHaveLength(1);
  }, 30_000);

  it('the next generation saves that portrait — no second image is bought', async () => {
    failWrites(table, linkWrite);
    await generate();

    const saved = await generate();

    // It bought a second image.
    expect(art.calls).toBe(1);
    expect(record().portraitId).toBe(saved?._id);
    expect(vancePortraits()).toHaveLength(1);
    expect(vance.img).not.toBe('icons/svg/mystery-man.svg');
  }, 30_000);

  it('a link refused again on that retry still buys nothing, and the GM is told again', async () => {
    failWrites(table, linkWrite, { times: 2 });
    await generate();
    const retried = await generate();

    expect(art.calls).toBe(1);
    expect(retried).toBeNull();
    expect(record().portraitId ?? null).toBeNull();
    expect(told()).toHaveLength(2);
  }, 30_000);

  it('control: with the link taken, one Generate makes the portrait, links it and puts it on the card', async () => {
    const made = await generate();

    expect(art.calls).toBe(1);
    expect(record().portraitId).toBe(made._id);
    expect(vance.img).not.toBe('icons/svg/mystery-man.svg');
    expect(told()).toHaveLength(0);
  }, 30_000);
});
