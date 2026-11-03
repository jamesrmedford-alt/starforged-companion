/**
 * PROBE (sectors audit, SO-07) — `!lore` puts the model's prose into its
 * chat card (and "The Story So Far" journal page) as raw HTML.
 *
 * What the user does: the GM types `!lore`; the lore narrator's recap
 * mentions something in angle brackets ("the beacon still reads <signal
 * lost>") or carries markdown.
 * What happens: generateLoreRecap (src/truths/generator.js) builds the card as
 * recap.split(/\n\n+/).map(p => `<p>${p.trim()}</p>`) — unescaped — so
 * "<signal lost>" is parsed as an unknown element and vanishes from the World
 * Lore card; writeLoreRecapToJournal writes the same unescaped HTML into the
 * journal page.
 * What should happen: as for every other narrator card since issue #322 V18
 * (decisions.md: "Narrator prose, paced prose and `@scene` text go into card
 * HTML through escapeHtml(stripMarkup(…))"), the recap is escaped text.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../../src/api-proxy.js", () => ({
  apiPost: vi.fn(async () => ({
    content: [{ type: "text", text: "Out here the beacon still reads <signal lost>.\n\nNobody answers it." }],
  })),
}));

import { generateLoreRecap } from "../../../src/truths/generator.js";

const MODULE_ID = "starforged-companion";
const KEY = `${MODULE_ID}.campaignState`;

describe("PROBE SO-07: the !lore card escapes the narrator's prose", () => {
  beforeEach(() => {
    ChatMessage._reset();
    game.settings._store.clear();
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, "sk-ant-test");
    game.settings._store.set(KEY, {
      loreRecap: "",
      worldTruths: { iron: { categoryName: "Iron", title: "Iron vows are sworn upon black iron." } },
    });
  });

  it("the World Lore card shows \"<signal lost>\" as text", async () => {
    const recap = await generateLoreRecap(game.settings.get(MODULE_ID, "campaignState"));
    expect(recap).toContain("<signal lost>");
    const card = ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.loreCard);
    expect(card).toBeTruthy();
    // FAILS today: the card holds the raw "<signal lost>" tag, which the chat log drops.
    expect(card.content).toContain("&lt;signal lost&gt;");
  });
});
