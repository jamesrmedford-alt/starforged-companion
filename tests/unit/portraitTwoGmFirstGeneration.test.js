/* global silenceConsoleErrors */
/**
 * STARFORGED COMPANION
 * tests/unit/portraitTwoGmFirstGeneration.test.js
 *
 * Known-issues PORTRAIT-TWO-GM-FIRST-GENERATION (PORTRAIT-LATE-FIRST-
 * GENERATION's residual). generatePortrait's one-image-at-a-time slot is per
 * client, and its re-read of the record helps only once the other GM's link
 * has landed: two GMs generating the same entity's first portrait within one
 * image call both bought it, and the later link won. The first portrait is
 * now claimed on the record (`portraitClaim`) before its image is bought; a
 * second GM's generation that finds another GM's standing claim buys nothing
 * and says so. The claim goes with the link (or is released when nothing was
 * linked), and one whose GM left, or that has stood past its bound, does not
 * stand.
 *
 * Driven on a booted table of two GMs: the real generator, the Art Cache
 * storage and the record writes, with the image call stubbed (held on demand).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

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
import { deferred } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

let nextId = 0;

/** A JournalEntry that keeps its pages — the Art Cache's entries. */
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
const told = (id) => table.client(id).notifications.filter(n => /Another GM is already generating/.test(n.message));

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

/** Start generatePortrait on a GM's client, with the record as that GM's panel read it; its promise. */
async function generate(id, report = {}) {
  const gm = table.client(id);
  const generator = await gm.import('../../src/art/generator.js');
  return gm.run(() => generator.generatePortrait('npc-vance', 'connection', record(), game.settings.get(MODULE_ID, 'campaignState'), report));
}

/** gm-1's generation with its image held until `image.resolve()`. */
async function heldOnGm1() {
  const image = deferred();
  art.next = [{ hold: image.promise }];
  const first = generate('gm-1');
  await vi.waitFor(() => expect(art.calls).toBe(1));
  return { first, image };
}

describe('PORTRAIT-TWO-GM-FIRST-GENERATION — the first portrait is claimed on the record', () => {
  it('a second GM generating while the first GM\'s image is out buys nothing, is told why, and the first GM\'s portrait is the entity\'s', async () => {
    const { first, image } = await heldOnGm1();

    const report = {};
    const second = await generate('gm-2', report);
    image.resolve();
    const landed = await first;
    await table.settle();

    // Both bought the image, and the later link won.
    expect(art.calls).toBe(1);
    expect(second).toBeNull();
    expect(told('gm-2')).toHaveLength(1);
    expect(report.told, 'the panel adds no generic "failed" beside it').toBe(true);
    expect(record().portraitId).toBe(landed._id);
    expect(vancePortraits()).toHaveLength(1);
    expect(record().portraitClaim ?? null, 'the claim went with the link').toBeNull();
  }, 30_000);

  it('a claim whose GM left the game does not stand', async () => {
    const { first, image } = await heldOnGm1();
    await table.leave('gm-1');
    const second = await generate('gm-2');
    await table.settle();
    expect(art.calls).toBe(2);
    expect(record().portraitId).toBe(second._id);
    image.resolve();
    await first.catch(() => null);
    await table.settle();
  }, 30_000);

  it('a claim past its bound does not stand', async () => {
    await vance.setFlag(MODULE_ID, 'connection', {
      ...record(), portraitClaim: { by: 'gm-1', at: Date.now() - 10 * 60 * 1000, token: 'old-claim' },
    });
    const made = await generate('gm-2');
    await table.settle();
    expect(art.calls).toBe(1);
    expect(record().portraitId).toBe(made._id);
  }, 30_000);

  it('a generation whose image could not be made releases its claim — the other GM can then generate', async () => {
    art.next = [{ fail: true }];
    expect(await generate('gm-1')).toBeNull();
    await table.settle();
    expect(record().portraitClaim ?? null, 'released').toBeNull();

    const made = await generate('gm-2');
    await table.settle();
    expect(art.calls).toBe(2);
    expect(record().portraitId).toBe(made._id);
  }, 30_000);

  it('control: one GM\'s Generate makes one portrait, links it and leaves no claim', async () => {
    const made = await generate('gm-1');
    await table.settle();
    expect(art.calls).toBe(1);
    expect(record().portraitId).toBe(made._id);
    expect(record().portraitClaim ?? null).toBeNull();
  }, 30_000);
});
