/* global silenceConsoleErrors */
/**
 * CHAR-03 · REGEN-CLAIM-STRANDED-BY-RELOAD — fourteenth bug audit probe
 *
 * Scenario: the GM presses Regenerate on an entity's portrait. The one
 * permitted regeneration is claimed on the stored portrait before the image
 * is bought (`regenerationUsed: true`, REGEN-LINK-REFUSED-SECOND-REGEN) and is
 * given back only by the same call, when its image could not be made. The
 * image call takes a while (up to two minutes, and a retry); the GM's page is
 * reloaded — or its tab closed, or its connection dropped — before it comes
 * back. No image was made, nothing was billed for a stored portrait, and the
 * call that would have given the claim back no longer exists.
 *
 * Correct: the regeneration is not spent — after the reload (and, to be fair
 *   to a time-limited claim, ten minutes later) Regenerate makes the one
 *   regenerated portrait. The first portrait's own claim already works this
 *   way (generator.js standingClaimOfAnother: "this user's own claim with no
 *   generation in flight here is one a reload left: it does not stand", and a
 *   five-minute lifetime).
 * Today:   the claim carries no owner, time or token, so it reads as a spent
 *   regeneration for good: the next press says "One regeneration has already
 *   been used for this portrait. It is now locked", locks the first portrait,
 *   and the entity never gets its regeneration.
 *
 * Driven as tests/unit/portraitRegenerationClaim.test.js is: the real
 * generator, Art Cache storage and record writes on a booted table, the image
 * call stubbed. The reload is the first call left waiting for good (the page
 * that ran it is gone); the generator keeps no regeneration state in memory.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

// Each image call takes the next step: { hold: Promise } waits, { fail: true } errors.
const art = vi.hoisted(() => ({ calls: 0, next: [] }));
vi.mock('../../../src/art/openRouterImage.js', () => ({
  generateOpenRouterImage: vi.fn(async () => {
    art.calls += 1;
    const step = art.next.shift();
    if (step?.hold) await step.hold;
    if (step?.fail) throw new Error('OpenRouter 500 (test fault)');
    return 'A'.repeat(400);
  }),
}));

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

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

function storedAsset(id) {
  for (const entry of table.journal.contents) {
    const asset = entry.pages?.contents?.[0]?.flags?.[MODULE_ID]?.artAsset;
    if (asset?._id === id) return asset;
  }
  return null;
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  art.calls = 0;
  art.next = [];
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
  silenceConsoleErrors();
});
afterEach(() => { globalThis.JournalEntry = savedJournalEntry; vi.restoreAllMocks(); });

/** Run fn(generator, campaignState) on the GM's client. */
async function onGm(fn, { wait = true } = {}) {
  const gm = table.client('gm-1');
  const generator = await gm.import('../../src/art/generator.js');
  const run = gm.run(() => fn(generator, game.settings.get(MODULE_ID, 'campaignState')));
  if (!wait) return run;
  const out = await run;
  await table.settle();
  return out;
}
const generate   = () => onGm((g, cs) => g.generatePortrait('npc-vance', 'connection', record(), cs));
const regenerate = (opts) => onGm((g, cs) => g.regeneratePortrait('npc-vance', 'connection', record(), cs), opts);

describe('CHAR-03 — a regeneration whose page was reloaded before its image came back is not spent', () => {
  it('control: an image that could not be made gives the regeneration back', async () => {
    const first = await generate();
    art.next = [{ fail: true }];
    expect(await regenerate()).toBeNull();
    expect(storedAsset(first._id)).toMatchObject({ regenerationUsed: false, locked: false });

    const landed = await regenerate();
    expect(landed).toMatchObject({ regenerationUsed: true, locked: true });
    expect(record().portraitId).toBe(landed._id);
  }, 30_000);

  it('the page reloaded while the image was out: the next Regenerate still makes the one regenerated portrait', async () => {
    const first = await generate();
    expect(first?._id, 'a first portrait (setup)').toBeTruthy();

    // Regenerate pressed; the image request never comes back to this page — it is reloaded.
    art.next = [{ hold: new Promise(() => {}) }];
    regenerate({ wait: false }).catch(() => {});
    await vi.waitFor(() => expect(art.calls).toBe(2));
    expect(storedAsset(first._id).regenerationUsed, 'the claim is on the stored portrait (setup)').toBe(true);

    // After the reload — ten minutes on, past any claim lifetime.
    const later = Date.now() + 10 * 60 * 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => later);

    const landed = await regenerate();

    // Fails today: null — "One regeneration has already been used… now locked", with no regenerated portrait.
    expect(landed, 'the regenerated portrait').toMatchObject({ regenerationUsed: true, locked: true });
    expect(art.calls, 'its image was made').toBe(3);
    expect(record().portraitId).toBe(landed._id);
  }, 30_000);
});
