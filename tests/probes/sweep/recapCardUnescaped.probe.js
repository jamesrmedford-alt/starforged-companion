/**
 * PROBE — SWEEP-07 RECAP-CARD-UNESCAPED (sweep auditor, family 8: HTML sinks;
 * the issue #322 V18 / #326 W71 class at a card those fixes did not reach)
 *
 * What the user does: types `!recap` (or a new session's auto-recap fires, or
 * a GM presses ↻ Refresh on the campaign recap card).
 *
 * What happens: postCampaignRecap (src/narration/narrator.js:1748-1785) takes
 * the model's recap text and builds the card as
 * `text.split(/\n\n+/).map(p => `<p>${p.trim()}</p>`)` (:1774) — the prose goes
 * into chat HTML raw. A `<` the model writes (an angle-bracketed name, a
 * "<signal lost>" aside, stray markup) becomes an unknown tag and vanishes or
 * breaks the card; an `&` renders as an entity. The narration cards escape
 * the same prose (`escapeHtml(stripMarkup(…))`, V18), the `!lore` card does
 * (src/truths/generator.js:579-583, W71), the session recap escapes its
 * quoted sentences (:1391-1395) — the campaign recap card is the one left.
 *
 * What should happen: the recap prose is text — escaped (markup stripped) like
 * every other model-prose card (decisions.md → "Card text is escaped").
 *
 * Controls: a narration card escapes the same text.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/sweep/recapCardUnescaped.probe.js
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { postCampaignRecap, postNarrationCard } from "../../../src/narration/narrator.js";

const MODULE_ID = "starforged-companion";
const KEY = `${MODULE_ID}.campaignState`;
const RECAP = "Kira met <Vex> & \"the Red\" Harlan at the <b>Rusty Lantern</b>.";

/** A PC's Chronicle journal, found by name (recap.test.js installChronicleJournal). */
function installChronicleJournal(actorName, entries) {
  const flags = { [MODULE_ID]: { chronicle: entries } };
  const page = { id: `page-${actorName}`, name: "Chronicle", flags, getFlag: (m, k) => flags?.[m]?.[k], setFlag: async () => {} };
  const journal = { id: `journal-chronicle-${actorName}`, name: `Chronicle — ${actorName}`, pages: { contents: [page] }, flags: {} };
  const previousGet = game.journal.get, previousGetName = game.journal.getName;
  game.journal.get     = (id) => (id === journal.id ? journal : previousGet(id));
  game.journal.getName = (n)  => (n === journal.name ? journal : previousGetName(n));
  return { restore() { game.journal.get = previousGet; game.journal.getName = previousGetName; } };
}

const state = () => ({
  currentSessionId: "test-session", sessionNumber: 3, lastSessionTimestamp: null,
  campaignRecapCache: { text: "", generatedAt: null, chronicleLength: 0 },
  characterIds: ["pc-1"], connectionIds: [],
});

let installed, origFetch;
beforeEach(() => {
  ChatMessage._reset();
  game.actors._reset();
  game.actors._set("pc-1", makeTestActor({ id: "pc-1", name: "Kira" }));
  installed = installChronicleJournal("Kira", [
    { id: "k1", timestamp: "2026-01-01T00:00:00Z", text: "Kira set out." },
  ]);
  game.settings._store.set(KEY, state());
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, "sk-ant-stub");
  origFetch = global.fetch;
  global.fetch = vi.fn(async () => ({
    ok: true, status: 200,
    json: async () => ({ content: [{ type: "text", text: RECAP }] }),
    text: async () => "",
  }));
});
afterEach(() => {
  global.fetch = origFetch;
  installed.restore();
  game.settings._store.delete(`${MODULE_ID}.claudeApiKey`);
  game.actors._reset();
});

const campaignCard = () => ChatMessage._created.find(c => c.flags?.[MODULE_ID]?.recapCard && c.flags[MODULE_ID].recapType === "campaign");

describe("PROBE SWEEP-07 RECAP-CARD-UNESCAPED", () => {
  it("the campaign recap card shows the model's prose as text — angle brackets and ampersands escaped", async () => {
    const text = await postCampaignRecap(state(), { forceRefresh: true });
    expect(text).toBe(RECAP);                                   // the recap was generated
    const card = campaignCard();
    expect(card, "no campaign recap card posted").toBeTruthy();
    // Expected: escaped text. Today: raw — `<Vex>` is an unknown tag, `<b>` is markup, `&` an entity.
    expect.soft(card.content).toContain("&lt;Vex&gt;");
    expect.soft(card.content).toContain("&amp;");
    expect.soft(card.content).not.toContain("<b>Rusty Lantern</b>");
  });

  it("control: a narration card escapes the same prose", async () => {
    await postNarrationCard("Kira met Vex & co. at the <b>Rusty Lantern</b>.",
      { moveId: "face_danger", outcome: "miss", _id: "res-1" }, state(),
      { playerText: "I look around.", playerName: "Kira", narrationId: "n-1" });
    const card = ChatMessage._created.find(c => c.flags?.[MODULE_ID]?.narratorCard);
    expect(card).toBeTruthy();
    expect(card.content).toContain("&amp;");
    expect(card.content).not.toContain("<b>Rusty Lantern</b>");
  });
});
