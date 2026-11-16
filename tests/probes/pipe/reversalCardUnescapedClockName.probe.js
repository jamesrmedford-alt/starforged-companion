/**
 * PIPE-05 · REVERSAL-CARD-NAMES-UNESCAPED  (WRONG-DETAIL — HTML)
 *
 * Scenario: a tension clock's name comes from text the module does not write —
 * a countdown the narrator's sidecar started (secrets.js createClock({ name:
 * countdown.label })), a scene challenge's label, an inciting crisis, or a GM's
 * `!clock`. A miss's Pay the Price advances it; the roller burns momentum (or
 * improves the result), and the price is reverted.
 *
 * Correct: the "⏰ Burn reversal" card names the clock as text — the name
 * HTML-escaped, as the Pay the Price clock card escapes it
 * (payThePriceClocks.js `escapeChatHtml(a.name)`) and as the same reversal
 * card escapes a vehicle's or a character's name two steps later.
 *
 * Today: revertPayThePrice builds `${c.name} clock rewound` (and a vow clock's
 * `${v.name} clock rewound`) and drops it into `<li>…</li>` unescaped: a name
 * with `<`, `>` or `&` is written into the chat card as markup.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { revertPayThePrice } from "../../../src/moves/resultUpgrade.js";
import { renderImproveButtonHtml } from "../../../src/moves/improveResult.js";

const MODULE_ID = "starforged-companion";
const KEY = `${MODULE_ID}.campaignState`;
const NAME = 'Hull <b>breach</b> & <img src="x">';

let messages;
const reversalCards = () => ChatMessage._created?.filter?.(m => m.flags?.[MODULE_ID]?.burnReversal) ?? [];

beforeEach(() => {
  game.settings._store.clear();
  ChatMessage._reset();
  game.actors._reset();
  messages = [];
  global.game.messages = { get contents() { return messages; }, get: (id) => messages.find(m => m.id === id) };
  game.settings._store.set(KEY, {
    currentSessionId: "pipe05-s1", sessionNumber: 1, currentSceneId: "sc-1",
    clocks: [{ _id: "t1", name: NAME, type: "tension", segments: 4, filled: 2, active: true }],
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: "sc-1" }, sceneFrame: null,
  });
});

describe("PIPE-05 — the reversal card writes a rewound clock's name as text", () => {
  it("control: the clock is rewound and the reversal card is posted", async () => {
    const failures = [];
    const reverted = await revertPayThePrice(
      { clocksAdvanced: [{ _id: "t1", name: NAME, type: "tension", filled: 2, segments: 4 }], sufferMeterDeltas: [] },
      null, { kind: "burn", failures });
    expect(failures).toEqual([]);
    expect(reverted).toHaveLength(1);
    expect(game.settings.get(MODULE_ID, "campaignState").clocks[0].filled).toBe(1);
    expect(reversalCards()).toHaveLength(1);
    expect(reversalCards()[0].content).toContain("clock rewound");
  });

  it("the clock's name reaches the card HTML-escaped", async () => {
    await revertPayThePrice(
      { clocksAdvanced: [{ _id: "t1", name: NAME, type: "tension", filled: 2, segments: 4 }], sufferMeterDeltas: [] },
      null, { kind: "burn", failures: [] });
    const html = reversalCards()[0].content;
    expect(html).not.toContain("<b>breach</b>");
    expect(html).not.toContain('<img src="x">');
    expect(html).toContain("Hull &lt;b&gt;breach&lt;/b&gt; &amp; &lt;img");
  });

  it("the same for the asset's name on the move card's Improve Result button (a player names their own asset Items)", () => {
    const html = renderImproveButtonHtml({ canImprove: true, assetName: 'Fugitive <i>mk2</i> & co', hasClock: true, clockMax: 4 });
    expect(html).toContain("Improve to Strong Hit");            // control: the button renders
    expect(html).not.toContain("<i>mk2</i>");
    expect(html).toContain("Fugitive &lt;i&gt;mk2&lt;/i&gt; &amp; co");
  });
});
