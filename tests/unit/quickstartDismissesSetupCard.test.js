/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/quickstartDismissesSetupCard.test.js
 *
 * Issue #364 QUICKSTART-SETUP-CARD (found while fixing issue #362 AC58).
 *
 * A new world's first load posts the "◈ Campaign Setup" card to the GMs: "No
 * World Truths have been established for this campaign." Only the hook on the
 * system dialog's save dismissed it. The Playtest Quickstart rolls and stores
 * all 14 World Truths itself (truths/generator.js storeWorldTruths) — and the
 * card stayed in chat, its "Set World Truths ▸" button live, beside the
 * Quickstart's own summary saying the truths were stored. So did a card an
 * earlier load posted when the next load's reconcile linked a save, and one
 * left when the truths arrived by an edit of the linked page.
 *
 * The dismissal is the truths store's own now: every write that establishes
 * the World Truths removes the setup cards (dismissSetupCards).
 *
 * On a booted table (tests/helpers/multiClient.js): the real world load posts
 * the card, the real Quickstart runs on the GM's client (its sector pipeline,
 * starship seed and asset packs stubbed — they need a live Foundry).
 */

import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('../../src/sectors/sectorPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  runSectorCreationPipeline: vi.fn(async (sector) => ({ name: sector?.name ?? 'Test Sector', sceneId: null })),
}));
vi.mock('../../src/entities/ship.js', async (importOriginal) => ({
  ...(await importOriginal()),
  seedStarshipActor: vi.fn(async () => null),
}));
vi.mock('../../src/system/ironswornPacks.js', async (importOriginal) => ({
  ...(await importOriginal()),
  listCanonicalAssetsByCategory: vi.fn(async () => []),
  getCanonicalAsset: vi.fn(async () => null),
}));

import { simulateTable, USERS } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const TITLE = 'Setting Truths';
const IRON_SHARDS = `<h2>Iron</h2>
<p><strong>Iron vows are sworn upon the remnants of ships that carried our people to the Forge.</strong></p>
<p>Many of our outposts were built from the iron bones of the Exodus ships.</p>
<p><em>The iron shard you carry is a small piece of the outer hull of an Exodus ship.</em></p><p>What do you swear vows upon?</p>`;

/** A journal the system dialog's Save creates — no module flags — with its one page. */
const dialogSave = (id, html, createdTime) => {
  const journal = { id, name: TITLE, flags: {}, _stats: { createdTime }, createEmbeddedDocuments: async () => [] };
  const page = { id: `${id}-p`, type: 'text', name: TITLE, flags: {}, text: { content: html }, parent: journal, update: async () => page };
  journal.pages = { contents: [page] };
  return { journal, page };
};

let table;
const setupCards = () => table.cards(f => f.setupCard);
const world = () => table.world.campaignState();

async function newCampaign(users = [USERS.GM]) {
  table = await simulateTable({
    users,
    i18n: { 'IRONSWORN.JOURNALENTRYPAGES.TypeTruth': TITLE },
    world: { settings: { campaignState: { ...CampaignStateSchema, worldTruthsSet: false, worldTruthsJournalId: null } } },
  });
  await table.settle();
  expect(setupCards(), 'setup: the load posted the Campaign Setup card').toHaveLength(1);
}

/** The GM runs the ✦ Playtest Quickstart (its Macro's call, the confirm answered). */
async function runQuickstart(userId = 'gm-1') {
  const client = table.client(userId);
  const quickstart = await client.import('../../src/session/quickstart.js');
  const result = await client.run(() => quickstart.runPlaytestQuickstart({ skipConfirm: true }));
  await table.settle(); await table.drain();
  return result;
}

afterEach(() => { table?.teardown(); table = null; });

describe('issue #364 QUICKSTART-SETUP-CARD — the Campaign Setup card goes once the World Truths are established, however they were', () => {
  it('the Playtest Quickstart stores the truths and the setup card is removed', async () => {
    await newCampaign();
    silenceConsoleErrors();
    const result = await runQuickstart();

    expect(result?.phases?.find(p => p.phase === 'World Truths'), 'setup: the Quickstart stored the truths').toMatchObject({ ok: true });
    expect(world().worldTruthsSet).toBe(true);
    expect(Object.keys(world().worldTruths ?? {})).toHaveLength(14);
    expect(setupCards()).toEqual([]);
    expect(table.cards(f => f.quickstartCard), 'control: its summary card posted').toHaveLength(1);
  }, 60_000);

  it('run by a GM who is not the one whose load posted the card: it is removed all the same', async () => {
    await newCampaign([USERS.GM, USERS.GM2]);
    silenceConsoleErrors();
    await runQuickstart('gm-2');
    expect(world().worldTruthsSet).toBe(true);
    expect(setupCards()).toEqual([]);
  }, 60_000);

  it('truths that arrive by an edit of the linked dialog page remove it', async () => {
    await newCampaign();
    // The dialog's Save created its journal and an empty page (the system's
    // async gap): the journal is linked, no truth read, the card stays.
    const { journal, page } = dialogSave('j-truths', '', 1_000);
    table.journal.set(journal.id, journal);
    table.fireDocumentHook('gm-1', 'createJournalEntry', journal);
    table.fireDocumentHook('gm-1', 'createJournalEntryPage', page);
    await table.settle(); await table.drain();
    expect(world()).toMatchObject({ worldTruthsSet: false, worldTruthsJournalId: 'j-truths' });
    expect(setupCards(), 'setup: no truths yet — the card still asks').toHaveLength(1);

    // The GM writes the truths onto the page.
    page.text.content = IRON_SHARDS;
    table.fireDocumentHook('gm-1', 'updateJournalEntryPage', page, { text: { content: IRON_SHARDS } });
    await table.settle(); await table.drain();
    expect(world().worldTruthsSet).toBe(true);
    expect(setupCards()).toEqual([]);
  }, 60_000);

  it("a save the next load's reconcile links removes the card the load before it posted", async () => {
    await newCampaign();
    // Saved where no hook of this module heard it (the module off for a night).
    const { journal } = dialogSave('j-truths', IRON_SHARDS, 1_000);
    table.journal.set(journal.id, journal);
    await table.reload('gm-1');
    await table.settle(); await table.drain();
    expect(world()).toMatchObject({ worldTruthsSet: true, worldTruthsJournalId: 'j-truths' });
    expect(setupCards()).toEqual([]);
  }, 60_000);
});
