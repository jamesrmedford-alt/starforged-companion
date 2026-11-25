/**
 * STARFORGED COMPANION
 * tests/unit/upgradeCardNamesEscaped.test.js
 *
 * Issue #362 AC83 REVERSAL-CARD-NAMES-UNESCAPED. Names the module does not
 * write reached chat cards as raw HTML: a rewound clock's (or vow clock's)
 * name on the "⏰ Burn / Improve reversal" card — since issue #353 a clock's
 * name can be the narrator's countdown label — the asset's name on the Improve
 * Result button and on the improved card's banner (a player names their own
 * asset Items), and a PC's name in the move card's consequence text (a
 * Forsake Your Vow with no vow to forsake). The Pay the Price clock card and
 * the reversal card's own vehicle / character lines already escape theirs.
 *
 * Fixed: each name (each consequence text) is HTML-escaped where the line is
 * built or rendered.
 *
 * From the probe tests/probes/pipe/reversalCardUnescapedClockName.probe.js,
 * with its control; plus the vow clock, the improved banner and the move
 * card's consequence text.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], interpretation: null, abilities: [] }));
vi.mock("../../src/pacing/router.js", async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../src/moves/interpreter.js", async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: "chat" })),
}));
vi.mock("../../src/moves/abilityScanner.js", async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => control.abilities),
}));
vi.mock("../../src/ui/settingsPanel.js", async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock("../../src/moves/resolver.js", async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, "random");
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";
import { revertPayThePrice } from "../../src/moves/resultUpgrade.js";
import { renderImproveButtonHtml } from "../../src/moves/improveResult.js";

const KEY  = `${MODULE_ID}.campaignState`;
const NAME = 'Hull <b>breach</b> & <img src="x">';
const ESCAPED = "Hull &lt;b&gt;breach&lt;/b&gt; &amp; &lt;img";

describe("issue #362 AC83 — the reversal card and the Improve Result button name things as text", () => {
  let messages;
  const reversalCards = () => ChatMessage._created?.filter?.(m => m.flags?.[MODULE_ID]?.burnReversal) ?? [];

  beforeEach(() => {
    game.settings._store.clear();
    ChatMessage._reset();
    game.actors._reset();
    messages = [];
    global.game.messages = { get contents() { return messages; }, get: (id) => messages.find(m => m.id === id) };
    game.settings._store.set(KEY, {
      currentSessionId: "ac83-s1", sessionNumber: 1, currentSceneId: "sc-1",
      clocks: [{ _id: "t1", name: NAME, type: "tension", segments: 4, filled: 2, active: true }],
      sceneTruths: [], sceneState: { bySubject: {}, sceneId: "sc-1" }, sceneFrame: null,
    });
  });

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

  it("a rewound tension clock's name reaches the card HTML-escaped", async () => {
    await revertPayThePrice(
      { clocksAdvanced: [{ _id: "t1", name: NAME, type: "tension", filled: 2, segments: 4 }], sufferMeterDeltas: [] },
      null, { kind: "burn", failures: [] });
    const html = reversalCards()[0].content;
    expect(html).not.toContain("<b>breach</b>");
    expect(html).not.toContain('<img src="x">');
    expect(html).toContain(`${ESCAPED}`);
  });

  it("a rewound vow clock's name too", async () => {
    // A vow Item's countdown clock, as actorBridge.revertVowClocksForBurn reads and rewinds it.
    const vow = { id: "vow-1", name: NAME, type: "progress", system: { subtype: "vow", clockTicks: 2, clockMax: 4 },
      flags: { [MODULE_ID]: { vowId: "v-1" } },
      async update(patch) { if (patch["system.clockTicks"] != null) this.system.clockTicks = patch["system.clockTicks"]; return this; } };
    const actor = { id: "pc-1", name: "Kira", type: "character",
      items: { find: (fn) => [vow].find(fn), contents: [vow], get: (id) => (id === "vow-1" ? vow : null) } };
    game.actors._set("pc-1", actor);
    const failures = [];
    await revertPayThePrice(
      { clocksAdvanced: [{ type: "vow", actorId: "pc-1", itemId: "vow-1", vowId: "v-1", name: NAME }], sufferMeterDeltas: [] },
      actor, { kind: "burn", failures });
    expect(failures).toEqual([]);
    expect(vow.system.clockTicks, "the vow's clock was rewound (setup)").toBe(1);
    const html = reversalCards().map(c => c.content).join("\n");
    expect(html).toContain("clock rewound");
    expect(html).not.toContain("<b>breach</b>");
    expect(html).toContain(ESCAPED);
  });

  it("the asset's name on the move card's Improve Result button", () => {
    const html = renderImproveButtonHtml({ canImprove: true, assetName: "Fugitive <i>mk2</i> & co", hasClock: true, clockMax: 4 });
    expect(html).toContain("Improve to Strong Hit");            // control: the button renders
    expect(html).not.toContain("<i>mk2</i>");
    expect(html).toContain("Fugitive &lt;i&gt;mk2&lt;/i&gt; &amp; co");
  });
});

// ── On a booted table: the improved card's banner, and the move card's consequence text ──

let table, pc;
const content = (id) => String(table.world.message(id).content);
const MISS = [0.55, 0.65, 0.1];   // challenge 6, 7; action die 1 — a miss

async function roll(moveId, line, dice = MISS) {
  control.interpretation = { moveId, moveName: moveId, statUsed: "wits", adds: 0, rationale: "test", mischiefApplied: false };
  control.dice = dice;
  await table.client("pl-1").chat(line, { speaker: { actor: pc.id } });
  await table.settle(); await table.drain();
  return table.cards(f => f.moveResolution).at(-1);
}

describe("issue #362 AC83 — the improved card and the move card's consequence text", () => {
  beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
  afterAll(() => table?.teardown());
  beforeEach(async () => {
    control.abilities = [];
    await table.reset({ world: { settings: {
      chronicleAutoEntry: false, narratorSessionSummary: false,
      campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "ac83-s2", sessionNumber: 1,
        currentSceneId: "ac83-scene", sceneTruths: [], clocks: [] },
    } } });
    await table.setClaudeKey("gm-1", "sk-ant-test");
    pc = table.addActor({ id: "pc-kira-83", name: "Kira <b>Vex</b>", ownership: { "pl-1": 3 }, system: { momentum: { value: 2 } } });
    scriptClaude(table, { fallback: () => 'The moment turns.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  });

  it("an improved result's banner names the asset as text", async () => {
    control.abilities = [{ assetId: null, assetName: "Fugitive <i>mk2</i>", resultImprovement: { improveTo: "strong_hit" }, hasClock: false }];
    const card = await roll("gather_information", "I comb the logs.");
    expect(content(card._id)).toContain("Fugitive &lt;i&gt;mk2&lt;/i&gt;");   // the button (setup)
    await table.client("pl-1").click(card._id, '[data-action="sf-improve-result"]');
    await table.settle(); await table.drain();

    expect(table.world.message(card._id).flags[MODULE_ID].improve.consumed).toBe(true);
    expect(content(card._id)).toContain("Result improved to a strong hit");
    expect(content(card._id)).not.toContain("<i>mk2</i>");
  }, 30_000);

  it("a Forsake Your Vow with no vow to forsake names the PC as text in the line's card (the move gate's refusal, overhaul 4)", async () => {
    // Not rolled now: the gate refuses it before any dice (OPEN_VOW of the
    // roller's), and the paced card the line is narrated on says why.
    expect(await roll("forsake_your_vow", "I walk away from the oath."), "not rolled").toBeUndefined();
    const told = table.cards(f => f.pacedNarrative && f.cannotMake).at(-1);
    expect(content(told._id)).toContain("No Forsake Your Vow — Kira &lt;b&gt;Vex&lt;/b&gt; has no open vow.");
    expect(content(told._id)).not.toContain("<b>Vex</b>");
  }, 30_000);
});
