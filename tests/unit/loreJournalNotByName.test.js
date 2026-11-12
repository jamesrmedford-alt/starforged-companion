/**
 * STARFORGED COMPANION
 * tests/unit/loreJournalNotByName.test.js
 *
 * LORE-JOURNAL-BY-NAME (WRONG-DETAIL). `!lore` found the campaign's truths
 * journal by its stored id, and — when the id named none — by name: the
 * system dialog's "Setting Truths", or ANY journal named "World Truths". A
 * GM's own notes of that name (no module flag, no saved truths) were taken
 * for the truths: read as the truths the recap summarises, linked as the
 * campaign's truths journal, and given a "The Story So Far" page.
 * `writeLoreRecapToJournal` fell back by name the same way.
 *
 * Now a truths journal is found by what it is — the module's own (its flag),
 * or a system dialog save — never by the name "World Truths" alone.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const TITLE = 'Setting Truths';
let table;

const QUICK = { cataclysm: {
  categoryId: 'cataclysm', categoryName: 'Cataclysm', roll: 82, title: 'We escaped a catastrophic war',
  description: 'The war consumed our home.', questStarter: 'Find the last survivors.',
} };
const PRINTOUT = '<h2>Cataclysm</h2><p><strong>We escaped a catastrophic war</strong></p><p>The war consumed our home.</p>' +
  '<p><em>Quest Starter: Find the last survivors.</em></p>';

/** A journal with one text page; `createEmbeddedDocuments` adds pages to it. */
function makeJournal(id, name, html, { flags = {}, pageFlags = {}, createdTime = 1_000 } = {}) {
  const journal = { id, name, flags, _stats: { createdTime } };
  const page = { id: `${id}-p`, type: 'text', name, flags: pageFlags, text: { content: html }, parent: journal, update: async () => page };
  journal.pages = { contents: [page] };
  journal.createEmbeddedDocuments = async (_type, docs) => docs.map(d => {
    const created = { id: `${id}-p${journal.pages.contents.length + 1}`, ...d, parent: journal, update: async () => created };
    journal.pages.contents.push(created);
    return created;
  });
  return journal;
}

const pageNames = (journal) => journal.pages.contents.map(p => p.name);

async function lore() {
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
  // The campaign's truths are stored, but no journal it links exists (the
  // Quickstart's was deleted).
  await table.reset({ world: { settings: { campaignState: {
    ...CampaignStateSchema, sessionActive: true, worldTruths: QUICK, worldTruthsSet: true, worldTruthsJournalId: 'j-gone',
  } } } });
});

describe("LORE-JOURNAL-BY-NAME — a GM's own \"World Truths\" journal is not the campaign's", () => {
  it('the GM\'s notes are not summarised, not linked, and get no "The Story So Far" page', async () => {
    const notes = makeJournal('j-notes', 'World Truths', '<p>Secret plan: the Archivist is the traitor.</p>');
    table.journal.set('j-notes', notes);

    const call = await lore();

    expect(call).toBeTruthy();
    expect(call.userText).not.toContain('the Archivist is the traitor');
    expect(call.userText).toContain('We escaped a catastrophic war');      // the stored truths instead
    expect(pageNames(notes)).toEqual(['World Truths']);                    // no "The Story So Far"
    expect(table.world.campaignState().worldTruthsJournalId).not.toBe('j-notes');
  }, 30_000);

  it('control: the module\'s own truths journal (its flag) is still found, read and given the page', async () => {
    const notes = makeJournal('j-notes', 'World Truths', '<p>Secret plan: the Archivist is the traitor.</p>', { createdTime: 2_000 });
    const own = makeJournal('j-own', 'World Truths', PRINTOUT,
      { flags: { [MODULE_ID]: { entityType: 'worldTruths' } }, pageFlags: { [MODULE_ID]: { worldTruths: QUICK } } });
    table.journal.set('j-notes', notes);
    table.journal.set('j-own', own);

    const call = await lore();

    expect(call.userText).not.toContain('the Archivist is the traitor');
    expect(pageNames(own)).toContain('The Story So Far');
    expect(pageNames(notes)).toEqual(['World Truths']);
    expect(table.world.campaignState().worldTruthsJournalId).toBe('j-own');
  }, 30_000);

  it('control: a system dialog save is still found by the system\'s title', async () => {
    const saved = makeJournal('j-dialog', TITLE, PRINTOUT);
    table.journal.set('j-dialog', saved);

    await lore();

    expect(pageNames(saved)).toContain('The Story So Far');
    expect(table.world.campaignState().worldTruthsJournalId).toBe('j-dialog');
  }, 30_000);

  it('a GM\'s notes an earlier `!lore` linked by name are not read or written', async () => {
    await table.reset({ world: { settings: { campaignState: {
      ...CampaignStateSchema, sessionActive: true, worldTruths: QUICK, worldTruthsSet: true, worldTruthsJournalId: 'j-notes',
    } } } });
    const notes = makeJournal('j-notes', 'World Truths', '<p>Secret plan: the Archivist is the traitor.</p>');
    table.journal.set('j-notes', notes);

    const call = await lore();

    expect(call.userText).not.toContain('the Archivist is the traitor');
    expect(pageNames(notes)).toEqual(['World Truths']);
  }, 30_000);
});
