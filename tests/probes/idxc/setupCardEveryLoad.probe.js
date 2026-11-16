/**
 * PROBE — IDXC-05 · SETUP-CARD-STACKS-PER-LOAD
 *
 * Scenario: a new campaign with no World Truths yet. The GM opens the world,
 * closes it, and opens it again on another day — session-zero prep — and then
 * saves the World Truths in the system's dialog.
 *
 * Correct: once the truths are saved, no card in chat still tells the GMs "No
 * World Truths have been established for this campaign." (index.js: "Dismiss
 * the setup notification card if it is still in chat").
 *
 * Today: every world load posts ANOTHER "◈ Campaign Setup" card while
 * `worldTruthsSet` is false (index.js `ready`: an unconditional
 * ChatMessage.create — no check for a card already in chat), and the save
 * dismisses only the first one it finds
 * (`game.messages.contents.find(m => m.flags…setupCard)`). After two loads
 * and a save, one card stays, saying no truths are established, its "Set
 * World Truths ▸" button live.
 *
 * On a booted table; the dialog's save is what the system writes (vendor
 * sf-truths.vue saveTruths), as tests/unit/worldTruthsDialogNarrator.test.js
 * builds it.
 */

import { describe, it, expect, afterEach } from "vitest";
import { simulateTable, USERS } from "../../helpers/multiClient.js";
import { CampaignStateSchema } from "../../../src/schemas.js";

const TITLE = "Setting Truths";

const IRON_SHARDS = `<h2>Iron</h2>
<p><strong>Iron vows are sworn upon the remnants of ships that carried our people to the Forge.</strong></p>
<p>Many of our outposts were built from the iron bones of the Exodus ships.</p>
<p><em>The iron shard you carry is a small piece of the outer hull of an Exodus ship.</em></p><p>What do you swear vows upon?</p>`;

/** A journal the dialog's Save creates — no module flags — with its one page. */
const dialogSave = (id, html, createdTime) => {
  const journal = { id, name: TITLE, flags: {}, _stats: { createdTime }, createEmbeddedDocuments: async () => [] };
  const page = { id: `${id}-p`, type: "text", name: TITLE, flags: {}, text: { content: html }, parent: journal, update: async () => page };
  journal.pages = { contents: [page] };
  return { journal, page };
};

let table;
const setupCards = () => table.cards(f => f.setupCard);

async function newCampaign() {
  table = await simulateTable({
    users: [USERS.GM],
    i18n: { "IRONSWORN.JOURNALENTRYPAGES.TypeTruth": TITLE },
    world: { settings: { campaignState: { ...CampaignStateSchema, worldTruthsSet: false, worldTruthsJournalId: null } } },
  });
  await table.settle();
}

/** The GM saves the dialog: the system creates the journal, then its page. */
async function saveTruths() {
  const { journal, page } = dialogSave("j-truths", IRON_SHARDS, 1_000);
  table.journal.set(journal.id, journal);
  table.fireDocumentHook("gm-1", "createJournalEntry", journal);
  table.fireDocumentHook("gm-1", "createJournalEntryPage", page);
  await table.settle(); await table.drain();
}

afterEach(() => { table?.teardown(); table = null; });

describe("IDXC-05 — the Campaign Setup card across world loads", () => {
  it("control: one load, then the truths are saved — the setup card is dismissed", async () => {
    await newCampaign();
    expect(setupCards()).toHaveLength(1);
    await saveTruths();
    expect(table.world.campaignState().worldTruthsSet).toBe(true);
    expect(setupCards()).toEqual([]);
  }, 60_000);

  it("two loads, then the truths are saved — no card still says no World Truths are established", async () => {
    await newCampaign();
    await table.reload("gm-1");        // the GM opens the world again another day
    await table.settle();
    await saveTruths();

    expect(table.world.campaignState().worldTruthsSet).toBe(true);
    expect(setupCards().map(c => c.content.replace(/\s+/g, " ").trim())).toEqual([]);
  }, 60_000);
});
