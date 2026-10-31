/**
 * PROBE (oracles audit) — revising the World Truths leaves `!lore` reading the
 * old ones.
 *
 * The help journal says `!truths` opens the system dialog "so the campaign's
 * canonical truths can be set or revised". Each Save in that dialog creates a
 * NEW "Setting Truths" journal (vendor sf-truths.vue saveTruths →
 * IronswornJournalEntry.create). The module's capture hooks (src/index.js
 * createJournalEntry / createJournalEntryPage) both return early once
 * `campaignState.worldTruthsSet` is true, so `worldTruthsJournalId` keeps
 * naming the FIRST journal. generateLoreRecap → callLoreRecapNarrator
 * (src/truths/generator.js) prefers that stored id, so `!lore` summarises —
 * and writes "The Story So Far" into — the superseded truths, and the
 * narrator's World Lore block (campaignState.loreRecap) carries them.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { simulateTable, USERS } from "../../helpers/multiClient.js";
import { CampaignStateSchema } from "../../../src/schemas.js";

const { GM, P1 } = USERS;
const TITLE = "Setting Truths";
let table;

const truthsJournal = (id, html) => {
  const journal = { id, name: TITLE, flags: {}, createEmbeddedDocuments: async () => [] };
  const page = { id: `${id}-p`, type: "text", name: TITLE, flags: {}, text: { content: html }, parent: journal, update: async () => page };
  journal.pages = { contents: [page] };
  return { journal, page };
};

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

describe("PROBE: after the truths are revised, !lore summarises the revised truths", () => {
  it("a second Save in the truths dialog becomes the journal !lore reads", async () => {
    const old = truthsJournal("j-old", "<h2>Cataclysm</h2><p>The Sun Plague extinguished the stars.</p><h2>Exodus</h2><p>Ironhomes.</p>");
    const revised = truthsJournal("j-new", "<h2>Cataclysm</h2><p>Interdimensional entities invaded our reality.</p><h2>Exodus</h2><p>Ironhomes.</p>");
    table.journal.set(old.journal.id, old.journal);
    table.journal.set(revised.journal.id, revised.journal);

    // The GM re-runs !truths and saves: the system creates the new journal, then its page.
    table.fireDocumentHook("gm-1", "createJournalEntry", revised.journal);
    table.fireDocumentHook("gm-1", "createJournalEntryPage", revised.page);
    await table.settle();

    await table.setClaudeKey("gm-1", "sk-ant-gina");
    table.claude.respond(() => "The Forge remembers what came through the rift.");
    await table.client("gm-1").chat("!lore");
    await table.settle();

    const loreCall = table.claude.calls.find(c => /world-weary spacer narrator/.test(c.system));
    expect(loreCall).toBeTruthy();
    expect(loreCall.userText).not.toContain("Sun Plague");                     // FAILS today: summarises the superseded truths
    expect(loreCall.userText).toContain("Interdimensional entities");
    expect(table.world.campaignState().worldTruthsJournalId).toBe("j-new");   // (today: "j-old")
  });
});
