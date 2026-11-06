/**
 * SECT-5 — an edit of the campaign's truths page is re-parsed only while its
 * journal keeps the name the system gave it.
 *
 * Issue #337 Y39 hooked `updateJournalEntryPage` so an edit of the saved
 * "Setting Truths" page reaches `campaignState.worldTruths` (the narrator's
 * WORLD TRUTHS, the vow scene's Iron truth) as its save did. The hook already
 * knows the journal by its stable id — it acts only on the campaign's LINKED
 * journal (`worldTruthsJournalId === entry.id`) — but it also requires the
 * journal's NAME to be the system's "Setting Truths". A GM who files the
 * journal under a name of their own ("Our Campaign Truths") and then tweaks a
 * truth on its page gets nothing re-parsed: the narrator keeps the pre-edit
 * text until the next world load (reconcileSystemTruths reads the linked
 * journal by id), while `!lore` — which reads the linked journal by id, live —
 * summarises the edit. The two stores disagree for the session, the
 * TRUTHS-TWO-STORES / Y39 symptom; rules/reachability.md "resolve by stable
 * id" (identity by a mutable name).
 *
 * Production wiring: the module's real hook on the multi-client harness, as
 * tests/unit/truthsPageEditReparsed.test.js drives it.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const TITLE  = 'Setting Truths';
const SAVED  = '<h2>Cataclysm</h2><p><strong>The Sun Plague</strong></p><p>The Sun Plague extinguished the stars.</p><p><em>Quest Starter: find the last sun.</em></p>';
const EDITED = SAVED.replace('extinguished the stars', 'extinguished the stars, and the Forge alone endured');
let table;

const truthsJournal = (id, html, createdTime) => {
  const journal = { id, name: TITLE, flags: {}, _stats: { createdTime }, createEmbeddedDocuments: async () => [] };
  const page = { id: `${id}-p`, type: 'text', name: TITLE, flags: {}, text: { content: html }, parent: journal, update: async () => page };
  journal.pages = { contents: [page] };
  return { journal, page };
};

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

describe('SECT-5: the linked truths journal, renamed, then its page edited', () => {
  it('the edit still reaches the narrator\'s worldTruths', async () => {
    expect(table.world.campaignState().worldTruthsJournalId).toBe('j-1');   // linked (the setup is real)
    // The GM files the journal under a name of their own.
    saved.journal.name = 'Our Campaign Truths';
    table.fireDocumentHook('gm-1', 'updateJournalEntry', saved.journal, { name: 'Our Campaign Truths' });
    await table.settle();

    editPage('gm-1', saved.page, EDITED);
    await table.settle();

    // actual: 'The Sun Plague extinguished the stars.' — the pre-edit text, until the next world load
    expect(cataclysm()).toBe('The Sun Plague extinguished the stars, and the Forge alone endured.');
  }, 30_000);

  it('control: under the system\'s name the same edit is re-parsed (issue #337 Y39)', async () => {
    editPage('gm-1', saved.page, EDITED);
    await table.settle();
    expect(cataclysm()).toBe('The Sun Plague extinguished the stars, and the Forge alone endured.');
  }, 30_000);
});

describe('SECT-5: two dialog saves, the newer one (the campaign\'s) renamed, then the world reloads', () => {
  const NEWER = SAVED.replace('The Sun Plague</strong>', 'The Long Night</strong>');

  async function secondSaveRenamed() {
    const newer = truthsJournal('j-2', NEWER, 2_000);
    table.journal.set('j-2', newer.journal);
    table.fireDocumentHook('gm-1', 'createJournalEntry', newer.journal);
    table.fireDocumentHook('gm-1', 'createJournalEntryPage', newer.page);
    await table.settle();
    return newer;
  }

  /** The world-load reconcile the canonical GM's ready hook runs (index.js). */
  async function reload() {
    const gm = table.client('gm-1');
    const { reconcileSystemTruths } = await gm.import('../../src/truths/generator.js');
    await gm.run(() => reconcileSystemTruths());
    await table.settle();
  }

  it('the campaign keeps its newest truths — the load does not relink the superseded save', async () => {
    const newer = await secondSaveRenamed();
    expect(table.world.campaignState()).toMatchObject({ worldTruthsJournalId: 'j-2' });   // the newest save is the campaign's
    expect(table.world.campaignState().worldTruths.cataclysm.title).toBe('The Long Night');
    newer.journal.name = 'Our Campaign Truths';

    await reload();

    // actual: 'j-1' / 'The Sun Plague' — the newest journal still NAMED "Setting Truths" is relinked
    expect(table.world.campaignState().worldTruthsJournalId).toBe('j-2');
    expect(table.world.campaignState().worldTruths.cataclysm.title).toBe('The Long Night');
  }, 30_000);

  it('control: renaming the superseded save instead, the load leaves the campaign\'s truths alone', async () => {
    await secondSaveRenamed();
    saved.journal.name = 'Setting Truths (old)';

    await reload();

    expect(table.world.campaignState().worldTruthsJournalId).toBe('j-2');
    expect(table.world.campaignState().worldTruths.cataclysm.title).toBe('The Long Night');
  }, 30_000);
});
