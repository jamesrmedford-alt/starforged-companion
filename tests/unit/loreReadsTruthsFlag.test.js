/**
 * STARFORGED COMPANION
 * tests/unit/loreReadsTruthsFlag.test.js
 *
 * `!lore` summarises the campaign's truths from the Playtest Quickstart's
 * journal FLAG, not its printout (known-issues LORE-READS-QUICKSTART-PRINTOUT).
 *
 * The Quickstart stores its rolled truths as the module journal's page flag
 * and in campaignState.worldTruths, and prints them as the page's text. Issue
 * #337 Y39 decided the flag is the store: an edit of that printout is not read
 * back into the narrator's truths. But callLoreRecapNarrator read the page's
 * text live, so a GM's edit of the printout reached a `!lore` recap — and the
 * "The Story So Far" page it writes — while the narrator's WORLD TRUTHS block
 * kept the flag's truths: two answers to "what are this world's truths?".
 * `!lore` now reads the module journal's flag, printed as the page prints it.
 * The system dialog's "Setting Truths" page — a save the GM may edit, which
 * Y39 re-parses — is still read from its page.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const TITLE = 'Setting Truths';
let table;

// The Quickstart's rolled Cataclysm truth, as storeWorldTruths stores it.
const QUICK = { cataclysm: {
  categoryId: 'cataclysm', categoryName: 'Cataclysm', roll: 82, title: 'We escaped a catastrophic war',
  description: 'The war consumed our home.', questStarter: 'Find the last survivors.',
  subTableId: 'cataclysm_foe', subTableLabel: 'Foe:', subRoll: 15, subResult: 'Artificial intelligence',
} };
const PRINTOUT = '<h2>Cataclysm</h2><p><strong>We escaped a catastrophic war</strong></p><p>The war consumed our home.</p>' +
  '<p><em>Foe: Artificial intelligence</em></p><p><em>Quest Starter: Find the last survivors.</em></p>';

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

async function loreRequest() {
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.claude.respond(() => 'The Forge remembers the war that drove us out.');
  await table.client('gm-1').chat('!lore');
  await table.settle();
  return table.claude.calls.find(c => /world-weary spacer narrator/.test(c.system));
}

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1], i18n: { 'IRONSWORN.JOURNALENTRYPAGES.TypeTruth': TITLE } });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: { campaignState: {
    ...CampaignStateSchema, sessionActive: true, worldTruths: QUICK, worldTruthsSet: true, worldTruthsJournalId: 'j-own',
  } } } });
});

describe("!lore and the Playtest Quickstart's World Truths journal", () => {
  it("an edit of the printout does not reach the recap: it summarises the truths the narrator holds", async () => {
    const own = truthsJournal('j-own', PRINTOUT, 1_000,
      { name: 'World Truths', flags: { [MODULE_ID]: { entityType: 'worldTruths' } }, pageFlags: { [MODULE_ID]: { worldTruths: QUICK } } });
    table.journal.set('j-own', own.journal);

    editPage('gm-1', own.page, PRINTOUT.replace('consumed our home', 'burned our home'));
    await table.settle();
    expect(table.world.campaignState().worldTruths).toEqual(QUICK);   // control: Y39 — the narrator's truths stand

    const loreCall = await loreRequest();
    expect(loreCall).toBeTruthy();
    expect(loreCall.userText).not.toContain('burned our home');
    // The flag's truths, as the page prints them: title, text, the sub-table's
    // result and the quest starter.
    expect(loreCall.userText).toContain('We escaped a catastrophic war');
    expect(loreCall.userText).toContain('The war consumed our home.');
    expect(loreCall.userText).toContain('Foe: Artificial intelligence');
    expect(loreCall.userText).toContain('Quest Starter: Find the last survivors.');
  }, 30_000);

  it("a printout emptied by hand still gives the recap the flag's truths", async () => {
    const own = truthsJournal('j-own', '<p></p>', 1_000,
      { name: 'World Truths', flags: { [MODULE_ID]: { entityType: 'worldTruths' } }, pageFlags: { [MODULE_ID]: { worldTruths: QUICK } } });
    table.journal.set('j-own', own.journal);

    const loreCall = await loreRequest();
    expect(loreCall?.userText).toContain('The war consumed our home.');
  }, 30_000);

  it("control: a World Truths dialog save is read from its page — the GM's edit of it is the campaign's (Y39)", async () => {
    await table.reset({ world: { settings: { campaignState: {
      ...CampaignStateSchema, sessionActive: true, worldTruthsSet: false, worldTruthsJournalId: null,
    } } } });
    const saved = truthsJournal('j-dialog', PRINTOUT, 1_000);
    table.journal.set('j-dialog', saved.journal);
    table.fireDocumentHook('gm-1', 'createJournalEntry', saved.journal);
    table.fireDocumentHook('gm-1', 'createJournalEntryPage', saved.page);
    await table.settle();
    editPage('gm-1', saved.page, PRINTOUT.replace('consumed our home', 'burned our home'));
    await table.settle();
    expect(table.world.campaignState().worldTruthsJournalId).toBe('j-dialog');

    const loreCall = await loreRequest();
    expect(loreCall.userText).toContain('The war burned our home.');
  }, 30_000);
});
