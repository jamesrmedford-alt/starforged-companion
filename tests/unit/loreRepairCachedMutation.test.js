/**
 * STARFORGED COMPANION
 * tests/unit/loreRepairCachedMutation.test.js
 *
 * Issue #337 Y38 (LORE-REPAIR-CACHED-MUTATION). `!lore` in a world whose
 * recorded truths journal is gone (deleted, or re-created by a later Save in
 * the dialog): callLoreRecapNarrator falls back to the newest "Setting
 * Truths" journal and repairs the link. handleLoreCommand hands
 * generateLoreRecap the cached campaignState (`game.settings.get`, by
 * reference), and callLoreRecapNarrator set
 * `campaignState.worldTruthsJournalId = entry.id` on it BEFORE writeTruthsLink
 * — the write that can be refused. Refused (and the recap's write after it),
 * the GM's cache linked the new journal while the world did not: the next
 * `!lore` found the journal by the cached id and never repaired the link
 * again, so its truths never reached `worldTruths`, and the GM's next
 * whole-object write carried the id into the world without them
 * (rules/foundry-api.md: "set nothing on it before a write that can fail").
 * The id now lands on the caller's object only once the write has, as
 * storeWorldTruths / recordSystemTruths do.
 *
 * (From the tenth audit's probe tests/probes/sectors/loreRepairCachedMutation.probe.js.)
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { failWrites, campaignStateWrite } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const TITLE  = 'Setting Truths';
const TRUTHS = '<h2>Cataclysm</h2><p><strong>The Sun Plague</strong></p><p>The Sun Plague extinguished the stars.</p><p><em>Quest Starter: find the last sun.</em></p>';
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

beforeEach(async () => {
  await table.reset({ world: { settings: { campaignState: {
    ...CampaignStateSchema, sessionActive: true, worldTruthsSet: true, worldTruthsJournalId: 'j-deleted', worldTruths: {},
  } } } });
  table.journal.set('j-new', truthsJournal('j-new', TRUTHS, 2_000).journal);
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  table.claude.respond(() => 'The Forge remembers what the Sun Plague took.');
});

const cached = () => table.client('gm-1').getSetting('campaignState');

describe('issue #337 Y38 — !lore repairs a stale truths link only once the world takes it', () => {
  it("a refused repair leaves the GM's cached worldTruthsJournalId as the world has it", async () => {
    silenceConsoleErrors();
    failWrites(table, campaignStateWrite('gm-1'), { times: 2 });   // the link repair, then the recap

    await table.client('gm-1').chat('!lore');
    await table.settle();

    expect(table.world.campaignState().worldTruthsJournalId).toBe('j-deleted');   // nothing landed …
    expect(cached().worldTruthsJournalId).toBe('j-deleted');                      // … and the cache agrees
    expect(cached().worldTruths).toEqual({});
  }, 30_000);

  it('…so the next !lore repairs it, with its truths', async () => {
    silenceConsoleErrors();
    failWrites(table, campaignStateWrite('gm-1'), { times: 2 });
    await table.client('gm-1').chat('!lore');
    await table.settle();

    await table.client('gm-1').chat('!lore');                     // the writes land now
    await table.settle();
    expect(table.world.campaignState().worldTruthsJournalId).toBe('j-new');
    expect(table.world.campaignState().worldTruths?.cataclysm?.title).toBe('The Sun Plague');
  }, 30_000);

  it('control: with the writes accepted the world and the cache both link the newest journal, with its truths', async () => {
    await table.client('gm-1').chat('!lore');
    await table.settle();

    expect(table.world.campaignState().worldTruthsJournalId).toBe('j-new');
    expect(cached().worldTruthsJournalId).toBe('j-new');
    expect(table.world.campaignState().worldTruths?.cataclysm?.title).toBe('The Sun Plague');
  }, 30_000);
});
