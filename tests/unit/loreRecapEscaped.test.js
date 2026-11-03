// tests/unit/loreRecapEscaped.test.js
// `!lore` shows the model's prose as text (issue #326 W71). generateLoreRecap
// put the recap into its chat card and the "The Story So Far" page as raw
// HTML: "<signal lost>" vanished as an unknown tag (the issue #322 V18 class
// the narration cards fixed). Both now escape each paragraph, with <npc>
// voice markers stripped.

import { describe, it, expect, beforeEach, vi } from "vitest";

const reply = vi.hoisted(() => ({ text: "" }));
vi.mock("../../src/api-proxy.js", () => ({
  apiPost: vi.fn(async () => ({ content: [{ type: "text", text: reply.text }] })),
}));

import { generateLoreRecap } from "../../src/truths/generator.js";

const MODULE_ID = "starforged-companion";
const KEY = `${MODULE_ID}.campaignState`;
const loreCard = () => ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.loreCard);

describe("the !lore card escapes the narrator's prose (issue #326 W71)", () => {
  beforeEach(() => {
    ChatMessage._reset();
    game.settings._store.clear();
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, "sk-ant-test");
    game.settings._store.set(KEY, {
      loreRecap: "",
      worldTruths: { iron: { categoryName: "Iron", title: "Iron vows are sworn upon black iron." } },
    });
  });

  it("the World Lore card shows \"<signal lost>\" as text, and the recap stored keeps it as written", async () => {
    reply.text = "Out here the beacon still reads <signal lost>.\n\nNobody answers it.";
    const recap = await generateLoreRecap(game.settings.get(MODULE_ID, "campaignState"));
    expect(recap).toContain("<signal lost>");
    expect(loreCard().content).toContain("&lt;signal lost&gt;");
    expect(loreCard().content).toContain("<p>Nobody answers it.</p>");
    expect(game.settings.get(MODULE_ID, "campaignState").loreRecap).toContain("<signal lost>");
  });

  it("an <npc> voice marker is stripped, its words kept", async () => {
    reply.text = "The old pilot says: <npc>Never trust a quiet beacon.</npc>";
    await generateLoreRecap(game.settings.get(MODULE_ID, "campaignState"));
    expect(loreCard().content).toContain("Never trust a quiet beacon.");
    expect(loreCard().content).not.toMatch(/&lt;\/?npc&gt;|<\/?npc>/);
  });
});
