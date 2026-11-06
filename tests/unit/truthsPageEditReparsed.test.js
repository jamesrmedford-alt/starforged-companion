/**
 * An edit of the saved Setting Truths page reaches the narrator's truths
 * (issue #337 Y39, TRUTHS-PAGE-EDIT-NOT-REPARSED).
 *
 * The GM saved the World Truths in the system's dialog — the "Setting Truths"
 * journal the module parsed into campaignState.worldTruths at the save
 * (decisions.md "Truths saved in the World Truths dialog reach the
 * narrator"). The dialog has no edit mode (each Save makes a new journal), so
 * a wording is tweaked on the page — and only `createJournalEntryPage` was
 * hooked: the narrator's WORLD TRUTHS block and the vow scene's Iron truth
 * kept the pre-edit text until the next world load, while `!lore` read the
 * page live (rules/reachability.md §5: a mirror is "updated on every change
 * to the canonical value").
 *
 * The module's own (Quickstart) journal is not re-read: its page's flag holds
 * the truths and the page text is a printout of them, which the system
 * parser cannot read back (its sub-table line is an italic paragraph before
 * the quest starter). The World Truths dialog revises them.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const TITLE   = 'Setting Truths';
const SAVED   = '<h2>Cataclysm</h2><p><strong>The Sun Plague</strong></p><p>The Sun Plague extinguished the stars.</p><p><em>Quest Starter: find the last sun.</em></p>';
const EDITED  = SAVED.replace('extinguished the stars', 'extinguished the stars, and the Forge alone endured');
let table;

const truthsJournal = (id, html, createdTime, { flags = {}, pageFlags = {}, name = TITLE } = {}) => {
  const journal = { id, name, flags, _stats: { createdTime }, createEmbeddedDocuments: async () => [] };
  const page = { id: `${id}-p`, type: 'text', name, flags: pageFlags, text: { content: html }, parent: journal, update: async () => page };
  journal.pages = { contents: [page] };
  return { journal, page };
};

/** An edit of a page's text, as Foundry fires it: (page, changed, options, userId). */
function editPage(fromUserId, page, html) {
  page.text.content = html;
  table.fireDocumentHook(fromUserId, 'updateJournalEntryPage', page, { text: { content: html } });
}

const cataclysm = () => table.world.campaignState().worldTruths?.cataclysm?.description;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1], i18n: { 'IRONSWORN.JOURNALENTRYPAGES.TypeTruth': TITLE } });
}, 30_000);
afterAll(() => table?.teardown());

let saved;
beforeEach(async () => {
  await table.reset({ world: { settings: { campaignState: {
    ...CampaignStateSchema, sessionActive: true, worldTruthsSet: false, worldTruthsJournalId: null,
  } } } });
  saved = truthsJournal('j-1', SAVED, 1_000);
  table.journal.set('j-1', saved.journal);
  // The dialog's Save: the journal, then its page — parsed by the hook.
  table.fireDocumentHook('gm-1', 'createJournalEntry', saved.journal);
  table.fireDocumentHook('gm-1', 'createJournalEntryPage', saved.page);
  await table.settle();
});

describe('the GM edits the saved Setting Truths page', () => {
  it('control: the save reached worldTruths', () => {
    expect(table.world.campaignState()).toMatchObject({ worldTruthsSet: true, worldTruthsJournalId: 'j-1' });
    expect(cataclysm()).toBe('The Sun Plague extinguished the stars.');
  });

  it('the edit reaches worldTruths, as the save did', async () => {
    editPage('gm-1', saved.page, EDITED);
    await table.settle();

    // The narrator's copy follows the page; it kept the pre-edit text until the next world load.
    expect(cataclysm()).toBe('The Sun Plague extinguished the stars, and the Forge alone endured.');
    expect(table.world.campaignState().worldTruthsJournalId).toBe('j-1');
  }, 30_000);

  it("a player's edit (the page shared with them) reaches it too — written once, on the canonical GM", async () => {
    editPage('pl-1', saved.page, EDITED);
    await table.settle();
    expect(cataclysm()).toBe('The Sun Plague extinguished the stars, and the Forge alone endured.');
  }, 30_000);

  it('an edit of a superseded save (not the campaign\'s linked journal) changes nothing', async () => {
    // A newer dialog save is the campaign's truths now (the newest save wins).
    const newer = truthsJournal('j-2', SAVED.replace('The Sun Plague</strong>', 'The Long Night</strong>'), 2_000);
    table.journal.set('j-2', newer.journal);
    table.fireDocumentHook('gm-1', 'createJournalEntryPage', newer.page);
    await table.settle();
    expect(table.world.campaignState().worldTruthsJournalId).toBe('j-2');

    editPage('gm-1', saved.page, EDITED);
    await table.settle();

    expect(table.world.campaignState().worldTruthsJournalId).toBe('j-2');
    expect(table.world.campaignState().worldTruths.cataclysm.title).toBe('The Long Night');
    expect(cataclysm()).toBe('The Sun Plague extinguished the stars.');
  }, 30_000);

  it('a page update that is not a text edit (a rename, its ownership) parses nothing', async () => {
    const before = table.world.campaignState().worldTruths;
    saved.page.text.content = EDITED;                       // not part of this update's change
    table.fireDocumentHook('gm-1', 'updateJournalEntryPage', saved.page, { name: 'Our Truths' });
    await table.settle();
    expect(table.world.campaignState().worldTruths).toEqual(before);
  }, 30_000);

  it("the Quickstart's own World Truths journal is not re-read: its flag holds the truths, the page is a printout", async () => {
    const quick = { cataclysm: { categoryId: 'cataclysm', categoryName: 'Cataclysm', roll: 82, title: 'We escaped a catastrophic war',
      description: 'The war consumed our home.', questStarter: 'Find the last survivors.',
      subTableId: 'cataclysm_foe', subTableLabel: 'Foe:', subRoll: 15, subResult: 'Artificial intelligence' } };
    const own = truthsJournal('j-own', '<h2>Cataclysm</h2><p><strong>We escaped a catastrophic war</strong></p><p>The war consumed our home.</p><p><em>Foe: Artificial intelligence</em></p><p><em>Quest Starter: Find the last survivors.</em></p>', 3_000,
      { name: 'World Truths', flags: { [MODULE_ID]: { entityType: 'worldTruths' } }, pageFlags: { [MODULE_ID]: { worldTruths: quick } } });
    table.journal.set('j-own', own.journal);
    table.world.setSetting('campaignState', { ...table.world.campaignState(), worldTruths: quick, worldTruthsSet: true, worldTruthsJournalId: 'j-own' });

    editPage('gm-1', own.page, own.page.text.content.replace('consumed our home', 'burned our home'));
    await table.settle();

    // The structured truths stand — the foe the narrator's WORLD TRUTHS line prints included.
    expect(table.world.campaignState().worldTruths).toEqual(quick);
    expect(table.world.campaignState().worldTruthsJournalId).toBe('j-own');
  }, 30_000);
});

// Issue #342 Z16 (TRUTHS-JOURNAL-BY-NAME): the campaign's truths journal is
// known by its id (`worldTruthsJournalId`), but the edit hook also required
// the system's "Setting Truths" title, and the world-load reconcile took the
// newest journal so TITLED over the linked one. A GM who files the journal
// under a name of their own — natural with two same-named saves in the
// sidebar — then had an edit go unparsed, and every load relinked the
// superseded save: the narrator's truths silently reverted to it.
describe('the linked truths journal, renamed by the GM', () => {
  it('an edit of its page still reaches worldTruths', async () => {
    expect(table.world.campaignState().worldTruthsJournalId).toBe('j-1');   // linked (the setup is real)
    saved.journal.name = 'Our Campaign Truths';
    table.fireDocumentHook('gm-1', 'updateJournalEntry', saved.journal, { name: 'Our Campaign Truths' });
    await table.settle();

    editPage('gm-1', saved.page, EDITED);
    await table.settle();

    // It kept 'The Sun Plague extinguished the stars.' — the pre-edit text — until the next load.
    expect(cataclysm()).toBe('The Sun Plague extinguished the stars, and the Forge alone endured.');
    expect(table.world.campaignState().worldTruthsJournalId).toBe('j-1');
  }, 30_000);
});

describe('two dialog saves, then the world reloads', () => {
  const NEWER = SAVED.replace('The Sun Plague</strong>', 'The Long Night</strong>');

  async function secondSave({ hooks = true } = {}) {
    const newer = truthsJournal('j-2', NEWER, 2_000);
    table.journal.set('j-2', newer.journal);
    if (hooks) {
      table.fireDocumentHook('gm-1', 'createJournalEntry', newer.journal);
      table.fireDocumentHook('gm-1', 'createJournalEntryPage', newer.page);
      await table.settle();
    }
    return newer;
  }

  /** The world-load reconcile the canonical GM's ready hook runs (index.js). */
  async function reload() {
    const gm = table.client('gm-1');
    const { reconcileSystemTruths } = await gm.import('../../src/truths/generator.js');
    await gm.run(() => reconcileSystemTruths());
    await table.settle();
  }

  it('the newer save renamed: the load keeps it, and does not relink the superseded one still titled "Setting Truths"', async () => {
    const newer = await secondSave();
    expect(table.world.campaignState()).toMatchObject({ worldTruthsJournalId: 'j-2' });   // the newest save is the campaign's
    expect(table.world.campaignState().worldTruths.cataclysm.title).toBe('The Long Night');
    newer.journal.name = 'Our Campaign Truths';

    await reload();

    // It relinked 'j-1', and the truths reverted to 'The Sun Plague'.
    expect(table.world.campaignState().worldTruthsJournalId).toBe('j-2');
    expect(table.world.campaignState().worldTruths.cataclysm.title).toBe('The Long Night');
  }, 30_000);

  it('control: the superseded save renamed instead, the load leaves the campaign\'s truths alone', async () => {
    await secondSave();
    saved.journal.name = 'Setting Truths (old)';

    await reload();

    expect(table.world.campaignState().worldTruthsJournalId).toBe('j-2');
    expect(table.world.campaignState().worldTruths.cataclysm.title).toBe('The Long Night');
  }, 30_000);

  it('control: a newer save the world never recorded is still brought in at load — the newest save wins (issue #321 U65)', async () => {
    await secondSave({ hooks: false });
    expect(table.world.campaignState().worldTruthsJournalId).toBe('j-1');

    await reload();

    expect(table.world.campaignState().worldTruthsJournalId).toBe('j-2');
    expect(table.world.campaignState().worldTruths.cataclysm.title).toBe('The Long Night');
  }, 30_000);
});
