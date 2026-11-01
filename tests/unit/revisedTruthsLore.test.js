/**
 * STARFORGED COMPANION
 * tests/unit/revisedTruthsLore.test.js
 *
 * After the World Truths are revised, `!lore` summarises the revised truths
 * (issue #321 U65).
 *
 * The help journal says `!truths` opens the system dialog "so the campaign's
 * canonical truths can be set or revised". Each Save in that dialog creates a
 * NEW "Setting Truths" journal (vendor sf-truths.vue saveTruths →
 * IronswornJournalEntry.create). The module's capture hook
 * (src/index.js createJournalEntryPage) returned early once
 * `campaignState.worldTruthsSet` was true, so `worldTruthsJournalId` kept
 * naming the FIRST journal, and generateLoreRecap → callLoreRecapNarrator
 * (src/truths/generator.js), which prefers that id, summarised — and wrote
 * "The Story So Far" into — the superseded truths. Its fallback for a stale
 * id took the first matching journal, which is the oldest.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { simulateTable, USERS } from "../helpers/multiClient.js";
import { CampaignStateSchema } from "../../src/schemas.js";

const { GM, P1 } = USERS;
const TITLE = "Setting Truths";
const OLD_TRUTHS = "<h2>Cataclysm</h2><p>The Sun Plague extinguished the stars.</p><h2>Exodus</h2><p>Ironhomes.</p>";
const NEW_TRUTHS = "<h2>Cataclysm</h2><p>Interdimensional entities invaded our reality.</p><h2>Exodus</h2><p>Ironhomes.</p>";
let table;

const truthsJournal = (id, html, createdTime) => {
  const journal = { id, name: TITLE, flags: {}, _stats: { createdTime }, createEmbeddedDocuments: async () => [] };
  const page = { id: `${id}-p`, type: "text", name: TITLE, flags: {}, text: { content: html }, parent: journal, update: async () => page };
  journal.pages = { contents: [page] };
  return { journal, page };
};

async function loreRequest() {
  await table.setClaudeKey("gm-1", "sk-ant-gina");
  table.claude.respond(() => "The Forge remembers what came through the rift.");
  await table.client("gm-1").chat("!lore");
  await table.settle();
  return table.claude.calls.find(c => /world-weary spacer narrator/.test(c.system));
}

beforeAll(async () => {
  table = await simulateTable({ users: [GM, P1], i18n: { "IRONSWORN.JOURNALENTRYPAGES.TypeTruth": TITLE } });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({
    world: {
      settings: {
        // Truths were set once already — the hooks recorded the first journal.
        campaignState: { ...CampaignStateSchema, sessionActive: true, worldTruthsSet: true, worldTruthsJournalId: "j-old" },
      },
    },
  });
});

describe("after the truths are revised, !lore summarises the revised truths (issue #321 U65)", () => {
  it("a second Save in the truths dialog becomes the journal !lore reads", async () => {
    const old = truthsJournal("j-old", OLD_TRUTHS, 1_000);
    const revised = truthsJournal("j-new", NEW_TRUTHS, 2_000);
    table.journal.set(old.journal.id, old.journal);
    table.journal.set(revised.journal.id, revised.journal);

    // The GM re-runs !truths and saves: the system creates the new journal, then its page.
    table.fireDocumentHook("gm-1", "createJournalEntry", revised.journal);
    table.fireDocumentHook("gm-1", "createJournalEntryPage", revised.page);
    await table.settle();
    expect(table.world.campaignState()).toMatchObject({ worldTruthsSet: true, worldTruthsJournalId: "j-new" });

    const loreCall = await loreRequest();
    expect(loreCall).toBeTruthy();
    expect(loreCall.userText).not.toContain("Sun Plague");
    expect(loreCall.userText).toContain("Interdimensional entities");
  });

  it("a page with no truth selections (the dialog's empty save) does not move the record", async () => {
    const empty = truthsJournal("j-empty", "<p></p>", 3_000);
    table.journal.set(empty.journal.id, empty.journal);
    table.fireDocumentHook("gm-1", "createJournalEntryPage", empty.page);
    await table.settle();
    expect(table.world.campaignState().worldTruthsJournalId).toBe("j-old");
  });

  it("with the recorded journal gone, !lore falls back to the newest truths journal and records it", async () => {
    await table.reset({
      world: {
        settings: {
          campaignState: { ...CampaignStateSchema, sessionActive: true, worldTruthsSet: true, worldTruthsJournalId: "j-deleted" },
        },
      },
    });
    // Collection order: the oldest first, the newest second, and one saved in
    // between listed last — Foundry's creation stamp decides, not the order.
    table.journal.set("j-old", truthsJournal("j-old", OLD_TRUTHS, 1_000).journal);
    table.journal.set("j-new", truthsJournal("j-new", NEW_TRUTHS, 3_000).journal);
    table.journal.set("j-mid", truthsJournal("j-mid", OLD_TRUTHS.replace("Sun Plague", "Long Night"), 2_000).journal);

    const loreCall = await loreRequest();
    expect(loreCall.userText).toContain("Interdimensional entities");
    expect(loreCall.userText).not.toContain("Sun Plague");
    expect(table.world.campaignState().worldTruthsJournalId).toBe("j-new");
  });
});
