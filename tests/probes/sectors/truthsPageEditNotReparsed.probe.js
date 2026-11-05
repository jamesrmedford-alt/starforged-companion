/**
 * PROBE — SECTORS-04 TRUTHS-PAGE-EDIT-NOT-REPARSED (tenth audit, area sectors)
 *
 * What the user does: the GM saved the World Truths in the system's dialog
 * (the "Setting Truths" journal the module parsed into
 * campaignState.worldTruths at the save — decisions.md "Truths saved in the
 * World Truths dialog reach the narrator"). Mid-session the GM opens that
 * journal page and edits a truth's text — the dialog has no edit mode (each
 * Save makes a new journal), so the page is where a wording is tweaked.
 *
 * What happens: only `createJournalEntryPage` is hooked (src/index.js); no
 * handler reads `updateJournalEntryPage` for the truths page. The narrator's
 * WORLD TRUTHS block and the vow scene's Iron truth keep the pre-edit text
 * until the next world load (reconcileSystemTruths re-parses the newest
 * journal then), while `!lore` reads the page live — the two stores disagree
 * for the rest of the session, the TRUTHS-TWO-STORES symptom the decision
 * closed for saves. The module's own journal (the Quickstart's) is the same
 * shape and never reconciles: its flag is the store and its page text a
 * render nothing reads back.
 *
 * What should happen: the truths page is a write-through source — an edit
 * re-parses it onto worldTruths as a save does (rules/reachability.md §5:
 * "updated on every change to the canonical value"), or the page is marked
 * read-only with the dialog as the one way to change the truths.
 *
 * Control: a save of the dialog (createJournalEntryPage) is parsed today.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/sectors/truthsPageEditNotReparsed.probe.js
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const TITLE   = 'Setting Truths';
const SAVED   = '<h2>Cataclysm</h2><p><strong>The Sun Plague</strong></p><p>The Sun Plague extinguished the stars.</p><p><em>Quest Starter: find the last sun.</em></p>';
const EDITED  = SAVED.replace('extinguished the stars', 'extinguished the stars, and the Forge alone endured');
let table;

const truthsJournal = (id, html, createdTime) => {
  const journal = { id, name: TITLE, flags: {}, _stats: { createdTime }, createEmbeddedDocuments: async () => [] };
  const page = { id: `${id}-p`, type: 'text', name: TITLE, flags: {}, text: { content: html }, parent: journal, update: async () => page };
  journal.pages = { contents: [page] };
  return { journal, page };
};

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

describe('SECTORS-04 the GM edits the saved Setting Truths page', () => {
  it('control: the save reached worldTruths', () => {
    expect(table.world.campaignState()).toMatchObject({ worldTruthsSet: true, worldTruthsJournalId: 'j-1' });
    expect(table.world.campaignState().worldTruths?.cataclysm?.description).toBe('The Sun Plague extinguished the stars.');
  });

  it('the edit reaches worldTruths, as the save did', async () => {
    saved.page.text.content = EDITED;
    table.fireDocumentHook('gm-1', 'updateJournalEntryPage', saved.page, { diff: true });
    await table.settle();

    // Expected: the narrator's copy follows the page. Actual: the pre-edit text until the next world load.
    expect(table.world.campaignState().worldTruths?.cataclysm?.description)
      .toBe('The Sun Plague extinguished the stars, and the Forge alone endured.');
  }, 30_000);
});
