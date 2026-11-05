/**
 * PROBE — SECTORS-03 LORE-REPAIR-CACHED-MUTATION (tenth audit, area sectors)
 *
 * What the user does: the GM types `!lore` in a world whose recorded truths
 * journal is gone (deleted, or re-created by a later Save in the dialog):
 * `worldTruthsJournalId` names no journal, so callLoreRecapNarrator
 * (src/truths/generator.js) falls back to the newest "Setting Truths"
 * journal and repairs the link. The world refuses the write (a server error,
 * a dropped socket — the fault the fault matrix drives), and refuses the
 * recap's write after it.
 *
 * What happens: handleLoreCommand (src/index.js) hands generateLoreRecap the
 * cached campaignState (`game.settings.get`, by reference), and
 * callLoreRecapNarrator sets `campaignState.worldTruthsJournalId = entry.id`
 * on it BEFORE writeTruthsLink — the write that can be refused. Refused, the
 * GM's cache now links the new journal while the world does not: the next
 * `!lore` finds the journal by the cached id and never repairs the link, the
 * narrator's WORLD TRUTHS stay the old ones (the repair carried the journal's
 * truths too — decisions.md "Truths saved in the World Truths dialog reach
 * the narrator"), and the GM's next whole-object write carries the id into
 * the world without them. rules/foundry-api.md: "set nothing on it before a
 * write that can fail"; the known PROMOTE-SUBJECTS-CACHED-MUTATE is this
 * shape at another site, and the #331 X25/X26/X35/X38/X40/X42 fixes removed
 * it from six more.
 *
 * What should happen: the id is set on the caller's object only once the
 * write has landed (every other truths writer here — storeWorldTruths,
 * recordSystemTruths — does so), so a refused repair leaves the GM's cache
 * as the world has it and the next `!lore` repairs it again.
 *
 * Control: with the writes accepted, the world and the cache both link the
 * newest journal.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/sectors/loreRepairCachedMutation.probe.js
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { failWrites, campaignStateWrite } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

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

describe('SECTORS-03 !lore repairs a stale truths link and the world refuses the write', () => {
  it("leaves the GM's cached worldTruthsJournalId as the world has it", async () => {
    silenceConsoleErrors();
    failWrites(table, campaignStateWrite('gm-1'), { times: 2 });   // the link repair, then the recap

    await table.client('gm-1').chat('!lore');
    await table.settle();

    expect(table.world.campaignState().worldTruthsJournalId).toBe('j-deleted');   // nothing landed …
    // Expected: the cache agrees with the world. Actual: 'j-new' — set on the
    // cached object before the refused write.
    expect(cached().worldTruthsJournalId).toBe('j-deleted');
    expect.soft(cached().worldTruths).toEqual({});
  }, 30_000);

  it('control: with the writes accepted the world and the cache both link the newest journal, with its truths', async () => {
    await table.client('gm-1').chat('!lore');
    await table.settle();

    expect(table.world.campaignState().worldTruthsJournalId).toBe('j-new');
    expect(cached().worldTruthsJournalId).toBe('j-new');
    expect(table.world.campaignState().worldTruths?.cataclysm?.title).toBe('The Sun Plague');
  }, 30_000);
});
