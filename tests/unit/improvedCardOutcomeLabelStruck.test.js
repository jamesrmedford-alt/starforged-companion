/**
 * STARFORGED COMPANION
 * tests/unit/improvedCardOutcomeLabelStruck.test.js
 *
 * Issue #364 IMPROVED-CARD-OUTCOME-LABEL-UNSTRUCK (left open by
 * UPGRADED-CARD-FIRST-EFFECT-UNSTRUCK). A move card improved to a strong hit
 * (an asset's "improve the result") struck the first outcome's consequence and
 * match lines but left its outcome label standing — a live "Miss" over "Result
 * improved to a strong hit" — and its banner said nothing of what the strong
 * hit brings, where the burned card's block states the burned outcome's own
 * consequence.
 *
 * Fixed: the improved card strikes the label as the burned card does
 * (burnMomentum.js struckOutcomeLine, which the burn's rewriter now uses too),
 * and its banner carries the strong hit's consequence line — the consequences
 * the click applied.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], interpretation: null, abilities: [], ptp: [78] }));
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
vi.mock("../../src/oracles/roller.js", async (original) => {
  const real = await original();
  return { ...real, rollOracle: (...args) => {
    if (args[0] !== "pay_the_price") return real.rollOracle(...args);
    const rng = vi.spyOn(Math, "random");
    for (const value of control.ptp) rng.mockReturnValueOnce((value - 0.5) / 100);
    try { return real.rollOracle(...args); } finally { rng.mockRestore(); }
  } };
});

import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";
import { struckOutcomeLine } from "../../src/moves/burnMomentum.js";
import { mapConsequences } from "../../src/moves/resolver.js";

let table, pc;
const flags   = (id) => table.world.message(id).flags[MODULE_ID];
const content = (id) => String(table.world.message(id).content);
// What the card still says once struck-through text is set aside.
const standing = (id) => content(id).replace(/<s>[\s\S]*?<\/s>/g, "");

// [challenge, challenge, action] Math.random values.
const MISS       = [0.55, 0.65, 0.1];   // challenge 6, 7; action die 1 + wits 2 = 3: a miss
const MISS_MATCH = [0.55, 0.55, 0.1];   // challenge 6, 6 — a match; a miss
const WEAK       = [0.15, 0.65, 0.1];   // challenge 2, 7; action 3: a weak hit
const BURN    = '[data-action="sf-burn-momentum"]';
const IMPROVE = '[data-action="sf-improve-result"]';
const FUGITIVE = [{ assetId: null, assetName: "Fugitive", resultImprovement: { improveTo: "strong_hit" }, hasClock: false }];
const MISS_COST   = "Dire threat or unwelcome truth uncovered. Pay the Price.";
const STRONG_GAIN = "Path or action to make progress is clear. Take +2 momentum.";
// The label the roll rendered, live; and the same label struck.
const LIVE_LABEL   = /<div class="sf-move-outcome">/;
const struckLabel  = (text, modifier = "struck") =>
  new RegExp(`<div class="sf-move-outcome sf-move-outcome--${modifier}"><s>${text}[^<]*</s></div>`);

async function roll(dice) {
  control.interpretation = { moveId: "gather_information", moveName: "Gather Information", statUsed: "wits", adds: 0, rationale: "test", mischiefApplied: false };
  control.dice = dice;
  await table.client("pl-1").chat("I search the wreck for what happened here.", { speaker: { actor: pc.id } });
  await table.settle(); await table.drain();
  return table.cards(f => f.moveResolution).at(-1);
}

async function click(card, selector) {
  await table.client("pl-1").click(card._id, selector);
  await table.settle(); await table.drain();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  control.ptp = [78];
  control.abilities = [];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "i364-label-s1", sessionNumber: 1,
      currentSceneId: "i364-label-scene", sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  // Momentum 2: no burn to offer — the asset's improvement alone.
  pc = table.addActor({ id: "pc-kira-i364-label", name: "Kira", ownership: { "pl-1": 3 }, system: { momentum: { value: 2 } } });
  scriptClaude(table, { fallback: () => 'The moment turns.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
});

describe("issue #364 IMPROVED-CARD-OUTCOME-LABEL-UNSTRUCK — an improved card reads as the burned card does", () => {
  it("control: a miss's card states its outcome label, unstruck", async () => {
    control.abilities = FUGITIVE;
    const card = await roll(MISS);
    expect(flags(card._id).improve).toMatchObject({ canImprove: true, originalOutcome: "miss" });
    expect(content(card._id)).toContain('<div class="sf-move-outcome">Miss</div>');
    expect(standing(card._id)).not.toContain(STRONG_GAIN);
  }, 30_000);

  it("a miss improved to a strong hit: the \"Miss\" label is struck with its lines", async () => {
    control.abilities = FUGITIVE;
    const card = await roll(MISS);

    await click(card, IMPROVE);

    expect(flags(card._id).improve).toMatchObject({ consumed: true });
    expect(content(card._id)).toContain("Result improved to a strong hit");
    expect(content(card._id), "no outcome label reads as live").not.toMatch(LIVE_LABEL);
    expect(content(card._id), "struck, as the burned card strikes it").toMatch(struckLabel("Miss"));
    expect(content(card._id), "its consequence line is struck with it").toContain(`<s>${MISS_COST}</s>`);
  }, 30_000);

  it("a miss improved to a strong hit: the banner states the strong hit's own consequence", async () => {
    control.abilities = FUGITIVE;
    const card = await roll(MISS);
    const momentumBefore = pc.system.momentum.value;

    await click(card, IMPROVE);

    // The consequence the click applied: the strong hit's +2 momentum …
    const applied = mapConsequences("gather_information", "strong_hit", false);
    expect(applied.otherEffect).toBe(STRONG_GAIN);
    expect(pc.system.momentum.value - momentumBefore).toBe(applied.momentumChange);
    // … is the one the banner states, unstruck, inside the improved block.
    expect(standing(card._id)).toContain(STRONG_GAIN);
    expect(content(card._id)).toMatch(
      /<div class="sf-improve-applied"><em>✦ Result improved to a strong hit\.[^<]*<\/em><div class="sf-move-effect">Path or action to make progress is clear\. Take \+2 momentum\.<\/div>/);
    expect(standing(card._id), "the miss's price no longer reads as live").not.toContain("Pay the Price");
  }, 30_000);

  it("a weak hit improved to a strong hit: \"Weak Hit\" is struck and the strong hit's consequence stands", async () => {
    control.abilities = FUGITIVE;
    const card = await roll(WEAK);
    expect(flags(card._id).improve).toMatchObject({ canImprove: true, originalOutcome: "weak_hit" });
    const weakGain = mapConsequences("gather_information", "weak_hit", false).otherEffect;
    expect(standing(card._id)).toContain(weakGain);

    await click(card, IMPROVE);

    expect(flags(card._id).improve).toMatchObject({ consumed: true });
    expect(content(card._id)).not.toMatch(LIVE_LABEL);
    expect(content(card._id)).toMatch(struckLabel("Weak Hit"));
    expect(standing(card._id)).not.toContain(weakGain);
    expect(standing(card._id)).toContain(STRONG_GAIN);
  }, 30_000);

  it("a matched miss improved: the label is struck with its match, and the banner's lines keep their order", async () => {
    control.abilities = FUGITIVE;
    const card = await roll(MISS_MATCH);

    await click(card, IMPROVE);

    expect(content(card._id)).not.toMatch(LIVE_LABEL);
    expect(content(card._id)).toMatch(struckLabel("Miss"));
    const banner = content(card._id).slice(content(card._id).indexOf('<div class="sf-improve-applied">'));
    // Match line, then the consequence line — as the burned block orders them.
    expect(banner.indexOf("sf-move-match")).toBeGreaterThan(-1);
    expect(banner.indexOf(STRONG_GAIN)).toBeGreaterThan(banner.indexOf("sf-move-match"));
  }, 30_000);

  it("the burned card is unchanged: its label struck, the burned block right behind it", async () => {
    pc.system.momentum.value = 9;      // beats 6 and 7: the burn makes a strong hit
    const card = await roll(MISS);
    await click(card, BURN);

    expect(flags(card._id).burn).toMatchObject({ consumed: true });
    expect(content(card._id)).toContain(
      '<div class="sf-move-outcome sf-move-outcome--burned"><s>Miss</s></div><div class="sf-move-burn-result">'
      + '<div class="sf-move-outcome sf-move-outcome--upgraded">🔥 Burned → Strong Hit</div>');
    expect(content(card._id)).not.toMatch(LIVE_LABEL);
    expect(standing(card._id)).toContain(STRONG_GAIN);
  }, 30_000);
});

describe("struckOutcomeLine — only the label the roll rendered", () => {
  const CARD = '<div class="sf-move-result sf-miss"><div class="sf-move-name">Gather Information</div>'
    + '<div class="sf-move-outcome">Miss</div><div class="sf-move-effect">Pay the Price.</div></div>';

  it("strikes the label and puts what follows it right behind", () => {
    expect(struckOutcomeLine(CARD)).toContain('<div class="sf-move-outcome sf-move-outcome--struck"><s>Miss</s></div><div class="sf-move-effect">');
    expect(struckOutcomeLine(CARD, { after: "<i>next</i>", modifier: "burned" }))
      .toContain('<div class="sf-move-outcome sf-move-outcome--burned"><s>Miss</s></div><i>next</i><div class="sf-move-effect">');
  });

  it("leaves an upgraded block's own label, a card with no label, and a label already struck", () => {
    const upgraded = '<div class="sf-move-outcome sf-move-outcome--upgraded">🔥 Burned → Strong Hit</div>';
    expect(struckOutcomeLine(upgraded, { after: "<i>next</i>" })).toBe(upgraded);
    const noRoll = '<div class="sf-move-result"><div class="sf-move-name">Make a Discovery</div></div>';
    expect(struckOutcomeLine(noRoll, { after: "<i>next</i>" })).toBe(noRoll);
    const once = struckOutcomeLine(CARD);
    expect(struckOutcomeLine(once)).toBe(once);
    expect(struckOutcomeLine(null)).toBe("");
  });
});
