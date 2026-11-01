/**
 * STARFORGED COMPANION
 * tests/unit/narrationCardHtml.test.js
 *
 * Issue #322 V18 (the audit's narrationCardHtml probe, NARR-CARD-UNESCAPED):
 * postNarrationCard, the paced-narrative card and postSceneCard put the
 * model's prose into card HTML through stripMarkup alone (it removes <npc>
 * tags; nothing was escaped), and the @scene question went in raw. Sci-fi
 * prose writes comm and system text in angle brackets — "<signal lost>",
 * "<ACCESS DENIED>" — which the browser parses as unknown elements, so the
 * words vanished from the card while narrationText kept them (the narrator
 * remembered text the table never saw). The oracle follow-up and vow-scene
 * cards already escaped; these do too now.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/api-proxy.js", () => ({ apiPost: vi.fn() }));

import { postNarrationCard } from "../../src/narration/narrator.js";

const MODULE_ID = "starforged-companion";

beforeEach(() => { ChatMessage._reset(); });

describe("narration card HTML keeps the prose the narrator wrote (NARR-CARD-UNESCAPED)", () => {
  it("angle-bracketed comm text is escaped, not parsed as markup", async () => {
    const prose = 'The comm crackles once: <signal lost>. Then only the hum of the reactor.';
    await postNarrationCard(prose, { moveId: "face_danger", outcome: "weak_hit", _id: "r1" }, { currentSessionId: "s1" });
    const card = ChatMessage._created.at(-1);
    expect(card.content).toContain("&lt;signal lost&gt;");
    expect(card.content).not.toContain("<signal lost>");
    expect(card.flags[MODULE_ID].narrationText).toBe(prose);    // the store keeps the words as written
  });

  it("an NPC tag is still stripped, and its line kept, before the escape", async () => {
    await postNarrationCard('Vance smiles. <npc>"Not <yet>."</npc>', { moveId: "compel", outcome: "strong_hit", _id: "r2" }, { currentSessionId: "s1" });
    const content = ChatMessage._created.at(-1).content;
    expect(content).toContain("Vance smiles. &quot;Not &lt;yet&gt;.&quot;");
    expect(content).not.toMatch(/&lt;\/?npc&gt;/);
  });
});

describe("the @scene card escapes the question and the answer", () => {
  it("a player's <b> and a reply's <ACCESS DENIED> show as text", async () => {
    const { apiPost } = await import("../../src/api-proxy.js");
    apiPost.mockResolvedValue({
      content: [{ type: "text", text: 'The panel flashes <ACCESS DENIED>.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' }],
      stop_reason: "end_turn",
    });
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, "sk-ant-test");
    global.game.messages = { contents: [] };
    const { interrogateScene } = await import("../../src/narration/narrator.js");

    await interrogateScene("what does the <b>panel</b> say?", { currentSessionId: "s1", sessionNumber: 1 });

    const card = ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.sceneResponse);
    expect(card, "the scene card posted").toBeTruthy();
    expect(card.content).toContain("&lt;ACCESS DENIED&gt;");
    expect(card.content).toContain("what does the &lt;b&gt;panel&lt;/b&gt; say?");
    expect(card.content).not.toContain("<b>panel</b>");
  });
});
