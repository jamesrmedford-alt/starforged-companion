/**
 * STARFORGED COMPANION
 * tests/unit/setupCardOneAtATime.test.js
 *
 * Issue #362 AC58 SETUP-CARD-STACKS-PER-LOAD — a new campaign with no World
 * Truths yet: the GM opens the world, closes it, opens it again another day,
 * and then saves the World Truths in the system's dialog. Every world load
 * posted ANOTHER "◈ Campaign Setup" card while `worldTruthsSet` was false (no
 * check for one already in chat), and the save dismissed only the first one
 * it found — the rest kept saying "No World Truths have been established for
 * this campaign.", their "Set World Truths ▸" button live. A load now replaces
 * the card an earlier load posted, and the save removes every one.
 *
 * On a booted table; the dialog's save is what the system writes (vendor
 * sf-truths.vue saveTruths), as tests/unit/worldTruthsDialogNarrator.test.js
 * builds it.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const TITLE = 'Setting Truths';

const IRON_SHARDS = `<h2>Iron</h2>
<p><strong>Iron vows are sworn upon the remnants of ships that carried our people to the Forge.</strong></p>
<p>Many of our outposts were built from the iron bones of the Exodus ships.</p>
<p><em>The iron shard you carry is a small piece of the outer hull of an Exodus ship.</em></p><p>What do you swear vows upon?</p>`;

/** A journal the dialog's Save creates — no module flags — with its one page. */
const dialogSave = (id, html, createdTime) => {
  const journal = { id, name: TITLE, flags: {}, _stats: { createdTime }, createEmbeddedDocuments: async () => [] };
  const page = { id: `${id}-p`, type: 'text', name: TITLE, flags: {}, text: { content: html }, parent: journal, update: async () => page };
  journal.pages = { contents: [page] };
  return { journal, page };
};

let table;
const setupCards = () => table.cards(f => f.setupCard);

async function newCampaign() {
  table = await simulateTable({
    users: [USERS.GM],
    i18n: { 'IRONSWORN.JOURNALENTRYPAGES.TypeTruth': TITLE },
    world: { settings: { campaignState: { ...CampaignStateSchema, worldTruthsSet: false, worldTruthsJournalId: null } } },
  });
  await table.settle();
}

/** The GM saves the dialog: the system creates the journal, then its page. */
async function saveTruths() {
  const { journal, page } = dialogSave('j-truths', IRON_SHARDS, 1_000);
  table.journal.set(journal.id, journal);
  table.fireDocumentHook('gm-1', 'createJournalEntry', journal);
  table.fireDocumentHook('gm-1', 'createJournalEntryPage', page);
  await table.settle(); await table.drain();
}

afterEach(() => { table?.teardown(); table = null; });

describe('issue #362 AC58 — one Campaign Setup card at a time, and the save removes it', () => {
  it('control: one load, then the truths are saved — the setup card is dismissed', async () => {
    await newCampaign();
    expect(setupCards()).toHaveLength(1);
    await saveTruths();
    expect(table.world.campaignState().worldTruthsSet).toBe(true);
    expect(setupCards()).toEqual([]);
  }, 60_000);

  it('three loads before the truths are saved: one card in chat — the first load\'s, where it was', async () => {
    await newCampaign();
    const first = setupCards()[0];
    await table.reload('gm-1');
    await table.settle();
    await table.reload('gm-1');
    await table.settle();
    const cards = setupCards();
    expect(cards).toHaveLength(1);
    // WORLD-TRUTHS-REMINDER-ON-RELOAD: replaced, it moved to the foot of the
    // chat on every load — mid-fight, in six live rounds' reloads.
    expect(cards[0]._id).toBe(first._id);
    expect(cards[0].content).toContain('No World Truths have been established');
  }, 60_000);

  it('once a session has been begun, a load posts no card — the table plays without them', async () => {
    table = await simulateTable({
      users: [USERS.GM],
      i18n: { 'IRONSWORN.JOURNALENTRYPAGES.TypeTruth': TITLE },
      world: { settings: { campaignState: { ...CampaignStateSchema, worldTruthsSet: false, worldTruthsJournalId: null,
        currentSessionId: 'sess-1', sessionNumber: 1, sessionStartedId: 'sess-1' } } },
    });
    await table.settle();
    expect(setupCards()).toEqual([]);
    await table.reload('gm-1');
    await table.settle();
    expect(setupCards()).toEqual([]);
  }, 60_000);

  it('two loads, then the truths are saved — no card still says no World Truths are established', async () => {
    await newCampaign();
    await table.reload('gm-1');        // the GM opens the world again another day
    await table.settle();
    await saveTruths();

    expect(table.world.campaignState().worldTruthsSet).toBe(true);
    expect(setupCards().map(c => c.content.replace(/\s+/g, ' ').trim())).toEqual([]);
  }, 60_000);

  it('control: a load after the truths are saved posts no card', async () => {
    await newCampaign();
    await saveTruths();
    await table.reload('gm-1');
    await table.settle();
    expect(setupCards()).toEqual([]);
  }, 60_000);
});
