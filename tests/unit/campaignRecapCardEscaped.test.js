/**
 * STARFORGED COMPANION
 * tests/unit/campaignRecapCardEscaped.test.js
 *
 * Issue #331 X24 (CAMPAIGN-RECAP-CARD-UNESCAPED). `!recap campaign`, the
 * session-start auto-recap and the recap card's ↻ Refresh posted the model's
 * recap text into the card HTML raw (`<p>${p.trim()}</p>`): a phrase in
 * angle brackets ("<signal lost>") vanished as an unknown tag, `&` became an
 * entity and any markup the model (or a GM-edited chronicle entry it quotes)
 * emitted rendered live — the V18 / W71 class every other model-text card was
 * fixed for. Each paragraph now takes the narrator card's own sink shape:
 * escapeHtml(stripMarkup(p)).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/api-proxy.js", () => ({ apiPost: vi.fn() }));
vi.mock("../../src/system/campaignTruths.js", async () => {
  const actual = await vi.importActual("../../src/system/campaignTruths.js");
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => "") };
});

import { postCampaignRecap, postSessionRecap, postNarrationCard, campaignRecapCacheKey } from "../../src/narration/narrator.js";

const MODULE_ID = "starforged-companion";
const KEY = `${MODULE_ID}.campaignState`;
const SESSION = "sess-3";

beforeEach(() => {
  vi.clearAllMocks();
  ChatMessage._reset();
  game.settings._store.clear();
  game.actors._reset();
  global.game.messages = { contents: [] };
  global.game.user = { id: "gm-1", isGM: true };
});

/** Post the campaign recap from a cache End a Session left, holding `text`. */
async function recapCard(text) {
  const cs = { currentSessionId: SESSION, sessionNumber: 3, characterIds: [], connectionIds: [] };
  cs.campaignRecapCache = { text, generatedAt: new Date().toISOString(), ...(await campaignRecapCacheKey(cs)) };
  game.settings._store.set(KEY, cs);
  await postCampaignRecap(cs);
  const card = ChatMessage._created.at(-1);
  expect(card?.flags?.[MODULE_ID]).toMatchObject({ recapCard: true, recapType: "campaign" });
  return card.content;
}

describe("X24 — the campaign recap card escapes the model text it renders", () => {
  it("a phrase in angle brackets survives as text, and markup is text", async () => {
    const content = await recapCard(
      "Vex spoke over the comm: <signal lost>. Then silence.\n\n"
      + "The derelict's beacon read <script>alert(\"recap\")</script> on every pass.");
    expect(content).toContain("&lt;signal lost&gt;");
    expect(content).not.toContain("<script>");
    expect(content).toContain("&lt;script&gt;");
  });

  it("an ampersand and a GM's bold name are text; the paragraphs stay paragraphs", async () => {
    const content = await recapCard("At the <b>Rusty Lantern</b>, Vex & Kira struck a deal.\n\nThe <Vex> signal faded.");
    expect(content).toContain("Vex &amp; Kira");
    expect(content).not.toContain("<b>Rusty Lantern</b>");
    expect(content).toContain("&lt;Vex&gt;");
    expect(content.match(/<p>/g)).toHaveLength(2);
  });

  it("the narrator's NPC dialogue markup is stripped, its words kept", async () => {
    const content = await recapCard('Vex said <npc>"Run."</npc> and the lights died.');
    expect(content).toContain("Vex said &quot;Run.&quot; and the lights died.");
    expect(content).not.toMatch(/npc&gt;|<npc>/);
  });

  it("control: the session recap card escapes the sentence it quotes", async () => {
    const cs = { currentSessionId: SESSION, sessionNumber: 3 };
    game.settings._store.set(KEY, cs);
    await postNarrationCard("<signal lost> crackles through the deck. You wait.",
      { moveId: "face_danger", outcome: "weak_hit", _id: "res-1" }, cs, { narrationId: "nar-1" });
    global.game.messages = { contents: ChatMessage._created.slice() };

    await postSessionRecap(cs);

    const card = ChatMessage._created.at(-1);
    expect(card.flags[MODULE_ID].recapType).toBe("session");
    expect(card.content).toContain("&lt;signal lost&gt; crackles through the deck");
  });
});
