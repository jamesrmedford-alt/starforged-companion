/**
 * STARFORGED COMPANION
 * tests/unit/sojournMissPriceToldAsChosen.test.js
 *
 * Issue #364 SOJOURN-MISS-PRICE-NARRATED-BEFORE-CHOICE.
 *
 * Sojourn's miss, as the module's own reading has it (resolver.js
 * CONSEQUENCE_MAP `sojourn`; docs/rules-reference/playkit-rules-and-coverage.md:
 * "miss: community demand or Pay the Price"): the community needs help — do
 * it, or Swear an Iron Vow, and the move resolves as a strong hit — or there
 * is no relief and the situation worsens (Pay the Price). The rule is
 * paraphrased here, not quoted. The price is one of two choices,
 * made on a card ("Community needs help (Swear an Iron Vow)" or "No relief —
 * Pay the Price"), and the option carries the price the narration is seeded
 * with (rollChoicePrice).
 *
 * The narration was seeded "Pay the Price: ‹the price›" and — with a miss
 * stated before the roll — told "deliver the miss as stated — it is what this
 * miss costs", whether the player had picked the price, had not picked yet
 * (a free-flow miss is narrated before its card is picked), or had picked the
 * vow, which pays no price at all. Explore a Waypoint's miss with a match had
 * the same shape and was fixed by carrying the choice on the resolution
 * (`priceChoice`, commit cf7bdf92); Sojourn's now carries it too:
 *   - not chosen yet: the price is offered — never "what this miss costs";
 *   - "No relief" picked: delivered as before;
 *   - the vow picked: no price is seeded, and the narrator is told none is paid.
 *
 * End to end on a booted GM / player table (tests/helpers/multiClient.js):
 * the player's line goes through the GM's real pipeline, the interpretation
 * and the dice scripted at their boundaries; picks go through the real choice
 * card on the player's client and relay to the canonical GM.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], stakes: null }));
vi.mock("../../src/pacing/router.js", async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../src/moves/interpreter.js", async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({
    moveId: "sojourn", moveName: "Sojourn", statUsed: "heart", adds: 0,
    playerNarration: text, inputMethod: "chat", rationale: "test", mischiefApplied: false,
    ...(control.stakes ? { stakes: { ...control.stakes } } : {}),
  })),
}));
vi.mock("../../src/moves/abilityScanner.js", async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock("../../src/ui/settingsPanel.js", async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock("../../src/moves/resolver.js", async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, "random");
    for (const n of control.dice) rng.mockReturnValueOnce(n);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";
import { mapConsequences, settlePriceChoice, priceChoiceOf, withChoicePrice } from "../../src/moves/resolver.js";
import { formatStakesBlock, formatPriceChoiceBlock } from "../../src/moves/stakes.js";
import { buildNarratorUserMessage, buildRoundUserMessage } from "../../src/narration/narratorPrompt.js";
import { narrationInputFrom } from "../../src/moves/movePipeline.js";

// challenge 7 and 8; action die 1 (+heart 2) — a miss, no match; then the price's d100 = 71.
const MISS = [0.65, 0.75, 0, 0.705];
const WASTE = "You waste resources";
const STATED = "The settlement's gates stay shut against you.";
const STAKES = { hit: "The settlement takes you in.", miss: STATED,
  missSuffer: { move: "endure_stress", amount: 1 }, priceStated: true };
const NARRATION_MODEL = "claude-sonnet-5-5";
const REPLY = 'The gates loom.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

const PICK  = '[data-action="sf-suffer-pick"]';
const VOW   = `${PICK}[data-option-index="0"]`;
const PRICE = `${PICK}[data-option-index="1"]`;

let table, pc;
const flagsOf   = (card) => table.world.message(card._id).flags[MODULE_ID];
const ptpCards  = () => table.cards(f => f.payThePriceCard);
const vowCards  = () => table.cards(f => f.sufferDeferred && f.route === "swear_an_iron_vow");
const moveCard  = () => table.cards(f => f.moveResolution).at(-1);
const choice    = () => table.cards(f => f.sufferCard && f.moveId === "sojourn").at(-1) ?? null;
const narrations = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL
  && /Narrate the consequence/.test(c.userText ?? "") && /MOVE: Sojourn/i.test(c.userText ?? ""));
const seededPrices = (call) => [...(call.system ?? "").matchAll(/^Pay the Price: (.+)$/gm)].map(m => m[1]);

async function sojourn() {
  control.dice = MISS;
  await table.client("pl-1").chat("I ask the settlement for shelter.", { speaker: { actor: pc.id } });
  await table.settle(); await table.drain();
}
async function click(card, selector) {
  await table.client("pl-1").click(card._id, selector);
  await table.settle(); await table.drain();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 60_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  control.stakes = null;
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "sjn-s1", sessionNumber: 1,
      lastSessionTimestamp: new Date().toISOString(), currentSceneId: "sjn-scene", sceneTruths: [], clocks: [], legacyTracks: {} },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  // Momentum 2 beats neither die: no Burn is offered, so the result is not held.
  pc = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 },
    system: { heart: 2, momentum: { value: 2 }, supply: { value: 3 }, spirit: { value: 5 } } });
  scriptClaude(table, { fallback: () => REPLY });
});
afterEach(async () => {
  table.client("gm-1").answerDialogs(d => d.close());
  await table.drain().catch(() => {});
});

describe("Sojourn — a miss narrated before its choice is told the price is offered, not paid (issue #364)", () => {
  it("a stated miss: the narration, written before the pick, is never told it is what the miss costs", async () => {
    control.stakes = STAKES;
    await sojourn();

    const card = choice();
    expect(card, "the miss posted its choice card").toBeTruthy();
    expect(flagsOf(card).resolved).toBe(false);
    expect(narrations()).toHaveLength(1);
    const [narration] = narrations();
    // The price the narration is seeded with is the one the card's option carries.
    expect(seededPrices(narration)).toEqual([STATED]);
    expect(flagsOf(card).sufferPrompt.options[1].price).toMatchObject({ roll: null, result: STATED, stated: true });
    expect(narration.userText).toContain(`- On a miss: ${STATED} (Endure Stress −1)`);
    expect(narration.userText).not.toContain("it is what this miss costs");
    expect(narration.userText).toContain("the stated miss is the price it offers, not a price paid");
    expect(narration.userText).toContain("## THE PRICE IS THE PLAYER'S CHOICE");
    expect(narration.userText).toContain("has not chosen yet");
    expect(narration.userText).toContain("Swear an Iron Vow");
    expect(narration.userText).toContain(`The price it offers: ${STATED}`);
    expect(narration.userText).toContain("Do not show its cost as already paid");
    // Sojourn's miss needs no match: the waypoint's wording is not borrowed.
    expect(narration.userText).not.toMatch(/with a match|Confront Chaos/);
    // Nothing is charged until the pick.
    expect(ptpCards()).toEqual([]);
    expect(pc.system.spirit.value).toBe(5);
  }, 60_000);

  it("no miss stated: the table's price is seeded as the price on offer, not one already paid", async () => {
    await sojourn();

    const [narration] = narrations();
    expect(seededPrices(narration)).toEqual([WASTE]);
    expect(narration.userText).toContain("## THE PRICE IS THE PLAYER'S CHOICE");
    expect(narration.userText).toContain(`The price it offers: ${WASTE}`);
    expect(narration.userText).toContain("Do not show its cost as already paid");
    expect(pc.system.supply.value).toBe(3);

    // The pick still pays exactly that price, with no second narration.
    await click(choice(), PRICE);
    expect(ptpCards()).toHaveLength(1);
    expect(ptpCards()[0].content).toMatch(/d100 = <strong>71<\/strong> · You waste resources/);
    expect(pc.system.supply.value).toBe(2);
    expect(narrations()).toHaveLength(1);
  }, 60_000);
});

describe("Sojourn — a held miss is narrated after its choice (issue #364)", () => {
  // Momentum 9 beats both dice: Burn Momentum is offered, so free-flow holds
  // the result — its choice card posts at once, its narration waits.
  beforeEach(() => { pc.system.momentum.value = 9; control.stakes = STAKES; });

  it("\"No relief\" picked first: the narration delivers the stated miss as what the miss costs", async () => {
    await sojourn();
    expect(flagsOf(moveCard()).awaitingUpgrade?.open).toBe(true);
    expect(narrations()).toHaveLength(0);

    await click(choice(), PRICE);

    expect(narrations()).toHaveLength(1);
    const [narration] = narrations();
    expect(seededPrices(narration)).toEqual([STATED]);
    expect(narration.userText).toContain("deliver the miss as stated — it is what this miss costs");
    expect(narration.userText).not.toContain("THE PRICE IS THE PLAYER'S CHOICE");
    expect(narration.userText).not.toContain("THE PRICE WAS NOT PAID");
    expect(ptpCards()).toHaveLength(1);
    expect(pc.system.spirit.value).toBe(4);
  }, 60_000);

  it("the vow picked first: the miss is narrated with no price — none seeded, none delivered", async () => {
    await sojourn();
    expect(narrations()).toHaveLength(0);

    await click(choice(), VOW);

    expect(vowCards(), "the pick asks for the vow to be sworn").toHaveLength(1);
    expect(narrations()).toHaveLength(1);
    const [narration] = narrations();
    expect(seededPrices(narration)).toEqual([]);
    expect(narration.userText).not.toContain("it is what this miss costs");
    expect(narration.userText).toContain("## THE PRICE WAS NOT PAID");
    expect(narration.userText).toContain("no price is paid");
    expect(narration.userText).toContain("the miss stated before the roll does not come to pass");
    expect(narration.userText).toContain("Swear an Iron Vow");
    expect(narration.userText).not.toMatch(/with a match|Confront Chaos/);
    expect(ptpCards()).toEqual([]);
    expect(pc.system.spirit.value).toBe(5);
  }, 60_000);

  it("Keep pressed first: the narration is told the price is still the player's choice", async () => {
    await sojourn();
    await click(moveCard(), '[data-action="sf-keep-result"]');

    expect(narrations()).toHaveLength(1);
    expect(narrations()[0].userText).toContain("## THE PRICE IS THE PLAYER'S CHOICE");
    expect(narrations()[0].userText).not.toContain("it is what this miss costs");
    // The price is still to pay, on its card.
    await click(choice(), PRICE);
    expect(ptpCards()).toHaveLength(1);
    expect(pc.system.spirit.value).toBe(4);
  }, 60_000);

  it("a card closed with no pick recorded — its character gone — is not told as the price paid", async () => {
    await sojourn();
    // Resolved as a card is for a character who is no longer in the world
    // (sufferCard.js retireGoneActorCard): closed, nothing on it applied.
    const card = choice();
    await table.client("gm-1").run(() => game.messages.get(card._id).update({ [`flags.${MODULE_ID}.resolved`]: true }));
    await table.settle();
    expect(flagsOf(card)).toMatchObject({ resolved: true });
    expect(flagsOf(card).chosenIndex ?? null).toBeNull();

    await click(moveCard(), '[data-action="sf-keep-result"]');

    expect(narrations()).toHaveLength(1);
    expect(narrations()[0].userText).not.toContain("it is what this miss costs");
    expect(narrations()[0].userText).not.toContain("THE PRICE WAS NOT PAID");
    expect(narrations()[0].userText).toContain("## THE PRICE IS THE PLAYER'S CHOICE");
    expect(ptpCards()).toEqual([]);
  }, 60_000);

  it("a pick that re-opens its card is a choice not made: the option it was resolved by is forgotten", async () => {
    await sojourn();
    const card = choice();
    await click(card, VOW);
    expect(flagsOf(card)).toMatchObject({ resolved: true, chosenIndex: 0 });

    const { reopenSufferCard } = await table.client("gm-1").import("../../src/moves/sufferCard.js");
    expect(await table.client("gm-1").run(() => reopenSufferCard(card._id))).toBe(true);
    await table.settle();
    expect(flagsOf(card).resolved).toBe(false);
    expect(flagsOf(card).chosenIndex ?? null).toBeNull();
  }, 60_000);
});

describe("Sojourn's price choice — the pieces (issue #364)", () => {
  const priced = (price = { roll: 71, result: WASTE, sufferRoutes: [{ move: "sacrifice_resources", amount: 1 }] }) =>
    withChoicePrice(mapConsequences("sojourn", "miss", false).sufferPrompt, price, "Sojourn");

  it("the resolution's price choice names what may replace the price: the vow its other option routes", () => {
    expect(priceChoiceOf(priced(), { roll: 71, result: WASTE }))
      .toEqual({ price: WASTE, stated: false, instead: "swear_an_iron_vow" });
    expect(priceChoiceOf(priced({ roll: null, result: STATED, stated: true, sufferRoutes: [] }), { roll: null, result: STATED, stated: true }))
      .toEqual({ price: STATED, stated: true, instead: "swear_an_iron_vow" });
    // A prompt that offers no priced Pay the Price, or nothing beside it, is no price choice.
    expect(priceChoiceOf(mapConsequences("sojourn", "miss", false).sufferPrompt, { roll: 71, result: WASTE })).toBeNull();
    const alone = { kind: "enumerated", options: [priced().options[1]] };
    expect(priceChoiceOf(alone, { roll: 71, result: WASTE })).toBeNull();
    expect(priceChoiceOf(null, { roll: 71, result: WASTE })).toBeNull();
  });

  const input = () => ({
    _id: "res-sjn", moveId: "sojourn", moveName: "Sojourn", outcome: "miss", isMatch: false,
    stakes: { ...STAKES }, priceChoice: { price: STATED, stated: true, instead: "swear_an_iron_vow" },
    loremasterContext: "[MOVE: Sojourn +heart] [OUTCOME: Miss]",
    oracleSeeds: { results: [`Pay the Price: ${STATED}`], names: [], context: "sojourn" },
  });

  it("the narrator's blocks: a paid price is delivered as stated; an open or declined one never is", () => {
    const paid = buildNarratorUserMessage(settlePriceChoice(input(), "paid"), "I ask for shelter.", 3);
    expect(paid).toContain("deliver the miss as stated — it is what this miss costs");
    expect(paid).not.toMatch(/THE PRICE (IS THE PLAYER'S CHOICE|WAS NOT PAID)/);

    for (const status of ["pending", "declined"]) {
      const msg = buildNarratorUserMessage(settlePriceChoice(input(), status), "I ask for shelter.", 3);
      expect(msg, status).not.toContain("it is what this miss costs");
      expect(msg, status).toContain("the stated miss is the price it offers, not a price paid");
      expect(msg, status).not.toMatch(/with a match|Confront Chaos/);
    }
    expect(settlePriceChoice(input(), "declined").oracleSeeds).toBeNull();

    const pending = formatPriceChoiceBlock({ price: WASTE, stated: false, instead: "swear_an_iron_vow", status: "pending" });
    expect(pending).toMatch(/^## THE PRICE IS THE PLAYER'S CHOICE\n\n/);
    expect(pending).toContain("Swear an Iron Vow");
    expect(pending).toContain(`The price it offers: ${WASTE}`);
    const declined = formatPriceChoiceBlock({ price: WASTE, stated: false, instead: "swear_an_iron_vow", status: "declined" });
    expect(declined).toMatch(/^## THE PRICE WAS NOT PAID\n\n/);
    expect(declined).toContain("no price is paid.");
    expect(declined).not.toContain("stated before the roll");
    expect(formatPriceChoiceBlock({ price: WASTE, instead: "swear_an_iron_vow", status: "paid" })).toBe("");
    expect(formatStakesBlock(STAKES, "miss", { priceChoice: { instead: "swear_an_iron_vow", status: "pending" } }))
      .not.toContain("with a match");
  });

  it("a Batch Mode round's entry carries the choice, and its block is told the same", () => {
    const kept = narrationInputFrom(input(), null);
    expect(kept.priceChoice).toEqual({ price: STATED, stated: true, instead: "swear_an_iron_vow" });
    const round = (status) => buildRoundUserMessage({ sentenceTarget: 3, entries: [
      { actorName: "Kira", text: "I ask for shelter.", input: settlePriceChoice(kept, status) },
    ] });
    expect(round("pending")).toContain("#### THE PRICE IS THE PLAYER'S CHOICE");
    expect(round("pending")).not.toContain("it is what this miss costs");
    expect(round("declined")).toContain("#### THE PRICE WAS NOT PAID");
    expect(round("declined")).not.toMatch(/Pay the Price: /);
    expect(round("paid")).toContain("deliver the miss as stated — it is what this miss costs");
  });
});
