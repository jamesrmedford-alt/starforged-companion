/* global silenceConsoleErrors */
/**
 * STARFORGED COMPANION
 * tests/unit/portraitUploadStall.test.js
 *
 * Issue #347 AB02 (UPLOADS-UNBOUNDED), the portrait's upload. A portrait is
 * put on an Actor-hosted entity's sheet and token by uploading its image to
 * the world's art folder — Foundry's FilePicker.upload, which has no deadline
 * of its own. One the server never answered held the generation, and its
 * per-entity in-flight slot (and the Entities panel's generating state), for
 * the rest of the page load; on a Make a Connection hit it held the table's
 * move lock too (AB01). The upload is bounded now (withFilePickerDeadline): an
 * unanswered one is a failed upload — the portrait is kept, linked to the
 * record, and the sheet keeps the image it had.
 *
 * Driven on a booted GM table: the real generator, the Art Cache storage, the
 * record writes and the upload stub of tests/setup.js, with the image call
 * stubbed (the portraitLinkRefused.test.js setup).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

const art = vi.hoisted(() => ({ calls: 0 }));
vi.mock('../../src/art/openRouterImage.js', () => ({
  generateOpenRouterImage: vi.fn(async () => { art.calls += 1; return 'A'.repeat(400); }),
}));

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const THIRTY_MINUTES = 30 * 60_000;   // far past any deadline an upload is given

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

const MYSTERY = 'icons/svg/mystery-man.svg';
let table;
let savedJournalEntry;
let fp;
let realUpload;
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
  fp = globalThis.foundry.applications.apps.FilePicker.implementation;
  fp._reset();
  realUpload = fp.upload;
  savedJournalEntry = globalThis.JournalEntry;
  globalThis.JournalEntry = {
    async create(data) {
      const j = makeJournal(data);
      globalThis.game.journal._set(j.id, j);
      return j;
    },
  };
  vance = table.addActor({
    id: 'npc-vance', name: 'Vance', type: 'character', img: MYSTERY,
    flags: { [MODULE_ID]: { entityType: 'connection', connection: {
      _id: 'rec-vance', name: 'Vance', role: 'Pilot', rank: 'dangerous', active: true, history: [],
      portraitSourceDescription: 'A weathered pilot in a patched flight suit',
    } } },
  });
  vance.documentName = 'Actor';   // a portrait is put on an Actor-hosted entity's sheet and token
  await table.settle();
  silenceConsoleErrors();
});
afterEach(() => {
  fp.upload = realUpload;
  globalThis.JournalEntry = savedJournalEntry;
  vi.useRealTimers();
});

function generate() {
  const gm = table.client('gm-1');
  return gm.import('../../src/art/generator.js').then(generator =>
    gm.run(() => generator.generatePortrait('npc-vance', 'connection', record(), game.settings.get(MODULE_ID, 'campaignState'))));
}

describe("a portrait whose upload the server never answers", () => {
  it('control: an upload that answers puts the portrait on the card', async () => {
    const out = await generate();
    await table.settle();
    expect(out?._id).toBeTruthy();
    expect(vance.img).toMatch(/^worlds\/test-world\/art\/npc-vance-.+\.png$/);
    expect(record().portraitId).toBe(out._id);
  });

  it('ends once the upload deadline passes: the portrait is kept and linked, the card keeps its image', async () => {
    let uploads = 0;
    fp.upload = () => { uploads += 1; return new Promise(() => {}); };   // no answer, no error
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    let out = 'pending';
    generate().then((r) => { out = r; }, (err) => { out = err; });
    await table.settle();
    expect(uploads, 'the upload was sent (setup)').toBe(1);
    expect(out, 'still waiting on the upload before its deadline').toBe('pending');

    await vi.advanceTimersByTimeAsync(THIRTY_MINUTES);
    await table.settle();

    expect(out, 'the generation ended').not.toBe('pending');
    expect(out?._id, 'it returns the portrait it made').toBeTruthy();
    expect(record().portraitId, 'the record names the portrait').toBe(out._id);
    expect(vance.img, 'the sheet keeps the image it had').toBe(MYSTERY);
    expect(art.calls, 'one image was bought').toBe(1);
  });
});
