/**
 * STARFORGED COMPANION
 * tests/unit/truthsSingleCategorySave.test.js
 *
 * Issue #325 W35: a World Truths dialog save with one category was ignored.
 * The createJournalEntryPage hook returned unless the page had at least two
 * `<h2>`, and holdsTruths made reconcileSystemTruths skip it at the next load:
 * a GM who saved only the Iron truth (the dialog calls creating truths
 * optional) got no WORLD TRUTHS block, no Iron truth for the oath, and "No
 * World Truths have been established" on every load. One `<h2>` that holds a
 * truth is now a save; an empty page (the dialog's timing gap) is still not.
 *
 * Converted from the audit probe sectors/truthsSingleCategorySave, plus the
 * load-time reconcile and the empty-page guard.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { holdsTruths } from '../../src/truths/generator.js';

const TITLE = 'Setting Truths';

// What the dialog saves for one chosen option (truth-category.vue /
// truth-selectable.vue markdown, the vendored Starforged text).
const IRON_ONLY = `<h2>Iron</h2>
<p><strong>Iron vows are sworn upon the remnants of ships that carried our people to the Forge.</strong></p>
<p>Many of our outposts were built from the iron bones of the Exodus ships. Fragments of the ships were also given to survivors as a remembrance, and passed from one generation to the next. Today, the Ironsworn swear vows upon the shards to honor the sacrifice of their forebears, the essence of the places left behind, and the souls of those great ships.</p>
<p><em>The iron shard you carry is a small piece of the outer hull of an Exodus ship.</em></p><p>What do you swear vows upon? Why is this object meaningful to you?</p>`;

const CATACLYSM_WAR = `<h2>Cataclysm</h2>
<p><strong>We escaped the ravages of a catastrophic war.</strong></p>
<p>Over millennia, we consumed resources and shattered lives as we fueled the engines of industry, expansion, and war.</p>
<p>In this final war, we were set upon by:</p>
<blockquote>
<p>Artificial intelligence</p>
</blockquote>
<p><em>A delegation of your dreaded foe arrives in the Forge.</em></p>`;

const IRON_TITLE = 'Iron vows are sworn upon the remnants of ships that carried our people to the Forge.';

const dialogSave = (id, html, createdTime) => {
  const journal = { id, name: TITLE, flags: {}, _stats: { createdTime }, createEmbeddedDocuments: async () => [] };
  const page = { id: `${id}-p`, type: 'text', name: TITLE, flags: {}, text: { content: html }, parent: journal, update: async () => page };
  journal.pages = { contents: [page] };
  return { journal, page };
};

describe('holdsTruths — one category with a truth under it is a save', () => {
  it('one category, two categories: truths; an empty page or a bare heading: none', () => {
    expect(holdsTruths(IRON_ONLY)).toBe(true);
    expect(holdsTruths([CATACLYSM_WAR, IRON_ONLY].join('\n\n'))).toBe(true);
    expect(holdsTruths('')).toBe(false);
    expect(holdsTruths('<h2>Iron</h2>')).toBe(false);
    expect(holdsTruths(null)).toBe(false);
  });
});

describe('a one-truth save of the World Truths dialog is recorded (booted table)', () => {
  let table;
  beforeAll(async () => {
    table = await simulateTable({ users: [USERS.GM, USERS.P1], i18n: { 'IRONSWORN.JOURNALENTRYPAGES.TypeTruth': TITLE } });
  }, 30_000);
  afterAll(() => table?.teardown());

  const unset = () => ({ world: { settings: { campaignState: {
    ...CampaignStateSchema, worldTruthsSet: false, worldTruthsJournalId: null, worldTruths: {},
  } } } });

  async function save(id, html, createdTime) {
    const { journal, page } = dialogSave(id, html, createdTime);
    table.journal.set(journal.id, journal);
    table.fireDocumentHook('gm-1', 'createJournalEntry', journal);
    table.fireDocumentHook('gm-1', 'createJournalEntryPage', page);
    await table.settle();
  }

  it('the GM saves only the Iron truth: it becomes the campaign\'s truths', async () => {
    await table.reset(unset());
    await save('j-iron', IRON_ONLY, 1_000);

    const state = table.world.campaignState();
    expect({ linked: state.worldTruthsJournalId, set: state.worldTruthsSet, iron: state.worldTruths?.iron?.title })
      .toEqual({ linked: 'j-iron', set: true, iron: IRON_TITLE });
  });

  it('an empty page (the dialog\'s timing gap) is not a save', async () => {
    await table.reset(unset());
    await save('j-empty', '', 1_000);

    const state = table.world.campaignState();
    expect({ set: state.worldTruthsSet, truths: state.worldTruths }).toEqual({ set: false, truths: {} });
  });

  it('control: a two-truth save is recorded', async () => {
    await table.reset(unset());
    await save('j-two', [CATACLYSM_WAR, IRON_ONLY].join('\n\n'), 1_000);

    const state = table.world.campaignState();
    expect(state.worldTruthsSet).toBe(true);
    expect(Object.keys(state.worldTruths)).toEqual(['cataclysm', 'iron']);
  });

  it('a one-truth save made before the fix is recorded when the world loads', async () => {
    await table.reset(unset());
    const { journal } = dialogSave('j-old', IRON_ONLY, 1_000);
    table.journal.set(journal.id, journal);

    const gm = table.client('gm-1');
    const { reconcileSystemTruths } = await gm.import('../../src/truths/generator.js');
    const wrote = await gm.run(() => reconcileSystemTruths());
    await table.settle();

    const state = table.world.campaignState();
    expect({ wrote, linked: state.worldTruthsJournalId, set: state.worldTruthsSet, iron: state.worldTruths?.iron?.title })
      .toEqual({ wrote: true, linked: 'j-old', set: true, iron: IRON_TITLE });
  });
});
