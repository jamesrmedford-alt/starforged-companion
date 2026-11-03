/**
 * PROBE (sectors audit, SO-06) — a World Truths dialog save with one category
 * chosen is ignored: it never reaches the narrator, and the world keeps
 * asking for World Truths.
 *
 * What the user does: the GM opens `!truths` (the system's dialog says
 * "Creating truths is an optional step"), chooses one truth — say Iron, the
 * truth the vow scene is grounded in — and clicks Save Your Truths.
 * What happens: the dialog (vendor sf-truths.vue saveTruths) writes a
 * "Setting Truths" page with one `<h2>` section. The createJournalEntryPage
 * hook (src/index.js) returns early unless the page has at least two `<h2>`
 * ("a real truths journal has up to 14"), and truthsPageHtml
 * (src/truths/generator.js holdsTruths, ≥2 `<h2>`) makes reconcileSystemTruths
 * skip it at the next load too. recordSystemTruths never runs: worldTruths is
 * not written, worldTruthsSet stays false (only the createJournalEntry hook
 * links the id), the narrator has no WORLD TRUTHS block and no Iron truth for
 * the oath, and every world load posts "No World Truths have been
 * established for this campaign." A two-category save, by contrast, becomes
 * the campaign's truths whole (decisions.md, "Truths saved in the World
 * Truths dialog reach the narrator": every save is written through, the
 * newest wins; an empty save moves nothing).
 * What should happen: a save holding one truth that reads is recorded like
 * any other save.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { simulateTable, USERS } from "../../helpers/multiClient.js";
import { CampaignStateSchema } from "../../../src/schemas.js";

const TITLE = "Setting Truths";

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

const dialogSave = (id, html, createdTime) => {
  const journal = { id, name: TITLE, flags: {}, _stats: { createdTime }, createEmbeddedDocuments: async () => [] };
  const page = { id: `${id}-p`, type: "text", name: TITLE, flags: {}, text: { content: html }, parent: journal, update: async () => page };
  journal.pages = { contents: [page] };
  return { journal, page };
};

describe("PROBE SO-06: a one-truth save of the World Truths dialog is recorded", () => {
  let table;
  beforeAll(async () => {
    table = await simulateTable({ users: [USERS.GM, USERS.P1], i18n: { "IRONSWORN.JOURNALENTRYPAGES.TypeTruth": TITLE } });
  }, 30_000);
  afterAll(() => table?.teardown());

  async function save(id, html, createdTime) {
    const { journal, page } = dialogSave(id, html, createdTime);
    table.journal.set(journal.id, journal);
    table.fireDocumentHook("gm-1", "createJournalEntry", journal);
    table.fireDocumentHook("gm-1", "createJournalEntryPage", page);
    await table.settle();
  }

  it("the GM saves only the Iron truth: it becomes the campaign's truths", async () => {
    await table.reset({ world: { settings: { campaignState: {
      ...CampaignStateSchema, worldTruthsSet: false, worldTruthsJournalId: null, worldTruths: {},
    } } } });
    await save("j-iron", IRON_ONLY, 1_000);

    const state = table.world.campaignState();
    expect(state.worldTruthsJournalId).toBe("j-iron");   // linked by the createJournalEntry hook
    // FAILS today: worldTruthsSet false, worldTruths {} — the page hook skipped a one-<h2> save.
    expect(state.worldTruthsSet).toBe(true);
    expect(state.worldTruths?.iron?.title).toBe("Iron vows are sworn upon the remnants of ships that carried our people to the Forge.");
  });

  it("control: a two-truth save is recorded", async () => {
    await table.reset({ world: { settings: { campaignState: {
      ...CampaignStateSchema, worldTruthsSet: false, worldTruthsJournalId: null, worldTruths: {},
    } } } });
    await save("j-two", [CATACLYSM_WAR, IRON_ONLY].join("\n\n"), 1_000);

    const state = table.world.campaignState();
    expect(state.worldTruthsSet).toBe(true);
    expect(Object.keys(state.worldTruths)).toEqual(["cataclysm", "iron"]);
  });
});
