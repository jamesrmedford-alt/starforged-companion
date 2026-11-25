/**
 * STARFORGED COMPANION
 * tests/unit/waypointMissMatchPriceChoice.test.js
 *
 * Issue #364 EXPLORE-WAYPOINT-MATCH-MISS-ADVISORY (decided, maintainer
 * 2026-11-19: the choice card).
 *
 * Explore a Waypoint: "On a miss, you encounter an immediate hardship or
 * threat, and must Pay the Price. On a miss with a match, you may instead
 * Confront Chaos." With the match the price is the player's choice, so the
 * pipeline routes none. The narration was still seeded "Pay the Price: ‹the
 * stated miss, or a table roll›" and told "deliver the miss as stated — it is
 * what this miss costs", while nothing charged that price short of a typed
 * `!ptp` — which rolled the table again, for another one.
 *
 * Now the miss posts a choice card, as Sojourn's miss does: "Pay the Price:
 * ‹the seeded price›" or "Confront Chaos instead".
 *   - The price is the one the narration is seeded with — the miss stated
 *     before the roll, else the one table roll — and its pick pays exactly
 *     that: its card, its suffer move on the roller.
 *   - "Confront Chaos instead" is the move card's 🌀 button: one claim, the
 *     forced follow-up as the roller. Whichever is taken retires the other.
 *   - The narration is told where the choice stands when it is written: a
 *     free-flow miss is narrated before the card is picked (the price is
 *     offered, never "what this miss costs"); a held result's after it (paid,
 *     or declined for Confront Chaos — then no price at all).
 *
 * End to end on a booted GM / player table (tests/helpers/multiClient.js):
 * the player's line goes through the GM's real pipeline, the interpretation
 * and the dice scripted at their boundaries; picks and presses go through
 * the real cards on the player's client and relay to the canonical GM.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], stakes: null }));
vi.mock("../../src/pacing/router.js", async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../src/moves/interpreter.js", async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({
    moveId: "explore_a_waypoint", moveName: "Explore a Waypoint", statUsed: "wits", adds: 0,
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
import { progressTracksJournal } from '../helpers/fullStateFixture.js';
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema, MOVES } from "../../src/schemas.js";
import {
  mapConsequences, missPaysPrice, settlePriceChoice, priceChoiceOf, withChoicePrice,
} from "../../src/moves/resolver.js";
import { obligationsFor } from "../../src/moves/contracts/obligations.js";
// The STAKES / PRICE / COST / FIGHT blocks are lines of the narration's one
// obligations block now (overhaul 4, slice 2 — contracts/obligations.js, their
// words kept): each stand-in below is that line, tagged, as the block carries it.
const lineFor = (kind, resolution) => { const o = obligationsFor({ mode: "move", resolution }).find(x => x.kind === kind); return o ? `- [${o.kind}] ${o.text}` : ""; };
const formatStakesBlock = (stakes, outcome, extra = {}) => lineFor("stakes", { stakes, outcome, ...extra });
const formatPriceChoiceBlock = (priceChoice) => lineFor("price", { outcome: "miss", priceChoice });
import { buildNarratorUserMessage, buildRoundUserMessage } from "../../src/narration/narratorPrompt.js";
import { narrationInputFrom } from "../../src/moves/movePipeline.js";

// Where the choice stands when the move is narrated (resultUpgrade.js priceChoiceStatus).
const PRICE_CHOICE = { PENDING: "pending", PAID: "paid", DECLINED: "declined" };

// challenge 7 and 7 — a match; action die 1 (+wits) — a miss; then the price's d100 = 71.
const MISS_MATCH = [0.65, 0.65, 0, 0.705];
const WASTE = "You waste resources";
const STATED = "The hold's deck gives way and you drop into the dark below.";
const STAKES = { hit: "You find what the wreck was carrying.", miss: STATED,
  missSuffer: { move: "endure_harm", amount: 1 }, priceStated: true };
const NARRATION_MODEL = "claude-sonnet-5-5";
const REPLY = 'The hold yawns open.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

const BUTTON = '[data-action="sf-waypoint-oracle"]';
const PICK   = '[data-action="sf-suffer-pick"]';
const PAY    = `${PICK}[data-option-index="0"]`;
const CHAOS  = `${PICK}[data-option-index="1"]`;

let table, pc, claude;
const flagsOf   = (card) => table.world.message(card._id).flags[MODULE_ID];
const ptpCards  = () => table.cards(f => f.payThePriceCard);
const forced    = () => table.world.messages().filter(m => m.flags?.[MODULE_ID]?.forcedMoveId === "confront_chaos");
const moveCard  = () => table.cards(f => f.waypointOracleCard).at(-1);
const choice    = () => table.cards(f => f.sufferCard && f.moveId === "explore_a_waypoint").at(-1) ?? null;
/** The Explore a Waypoint narrations made so far (not the Confront Chaos follow-up's). */
const narrations = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL
  && /Narrate the consequence/.test(c.userText ?? "") && /MOVE: Explore a Waypoint/i.test(c.userText ?? ""));
const seededPrices = (call) => [...(call.system ?? "").matchAll(/^Pay the Price: (.+)$/gm)].map(m => m[1]);

async function explore() {
  control.dice = MISS_MATCH;
  await table.client("pl-1").chat("I search the derelict's hold.", { speaker: { actor: pc.id } });
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
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "wpm-s1", sessionNumber: 1,
      lastSessionTimestamp: new Date().toISOString(), currentSceneId: "wpm-scene", sceneTruths: [], clocks: [], legacyTracks: {} },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  // a waypoint is explored on an expedition (the move gate's EXPEDITION_OR_SITE) — overhaul 4.
  table.journal._set(progressTracksJournal([{ id: 'ex-1', label: 'To the Drift', type: 'expedition', rank: 'dangerous', ticks: 8, completed: false }]));
  // Momentum 2 beats neither 7: no Burn is offered, so the result is not held.
  pc = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 },
    system: { wits: 2, momentum: { value: 2 }, supply: { value: 3 }, health: { value: 5 } } });
  claude = scriptClaude(table, { fallback: () => REPLY });
});
afterEach(async () => {
  table.client("gm-1").answerDialogs(d => d.close());
  await table.drain().catch(() => {});
});

describe("Explore a Waypoint — a miss with a match offers its price as a choice (issue #364)", () => {
  it("the miss posts a choice card: the seeded price, or Confront Chaos instead — and charges nothing yet", async () => {
    await explore();

    expect(flagsOf(moveCard())).toMatchObject({ waypointOracleCard: "confront_chaos", actorId: pc.id });
    const card = choice();
    expect(card, "the miss posted its choice card").toBeTruthy();
    const labels = [...table.client("pl-1").render(card._id).querySelectorAll(PICK)].map(b => b.textContent.trim());
    expect(labels).toEqual([`Pay the Price: ${WASTE}`, "Confront Chaos instead"]);
    expect(flagsOf(card).sufferPrompt.options[0].price).toMatchObject({ roll: 71, result: WASTE });

    expect(ptpCards()).toEqual([]);
    expect(pc.system.supply.value).toBe(3);
    expect(forced()).toHaveLength(0);
  }, 60_000);

  it("the narration, written before the pick, is told the price is offered — never that it is what the miss costs", async () => {
    control.stakes = STAKES;
    await explore();

    const [narration] = narrations();
    expect(narrations()).toHaveLength(1);
    // The price the narration is seeded with is the one the card offers: the stated miss, rolled for nothing.
    expect(seededPrices(narration)).toEqual([STATED]);
    expect(flagsOf(choice()).sufferPrompt.options[0]).toMatchObject({
      label: `Pay the Price: ${STATED}`, price: { roll: null, result: STATED, stated: true } });
    expect(narration.userText).toContain(`- On a miss: ${STATED} (Endure Harm −1)`);
    expect(narration.userText).toContain("[price] THE PRICE IS THE PLAYER'S CHOICE.");
    expect(narration.userText).toContain("has not chosen yet");
    expect(narration.userText).toContain(`The price it offers: ${STATED}`);
    expect(narration.userText).toContain("Do not show its cost as already paid");
    expect(narration.userText).not.toContain("it is what this miss costs");
  }, 60_000);

  it("picking the price pays exactly that price — its card, its suffer move on the roller — and closes Confront Chaos", async () => {
    await explore();
    await click(choice(), PAY);

    expect(ptpCards()).toHaveLength(1);
    expect(ptpCards()[0].content).toMatch(/d100 = <strong>71<\/strong> · You waste resources/);
    expect(pc.system.supply.value).toBe(2);
    expect(table.world.message(choice()._id).content).toMatch(/Applied: the price paid \(see its card\)/);

    // "Instead", not as well: the move card's 🌀 is closed, and says why.
    expect(flagsOf(moveCard()).waypointRewardClaimed).toBe("ordinary");
    const button = table.client("pl-1").render(moveCard()._id).querySelector(BUTTON);
    expect(button.disabled).toBe(true);
    expect(button.title).toMatch(/^The price was paid/);
    await click(moveCard(), BUTTON);
    expect(forced()).toHaveLength(0);
    expect(ptpCards()).toHaveLength(1);
  }, 60_000);

  it("a stated miss picked as the price is paid as stated — its one suffer move, no table roll", async () => {
    control.stakes = STAKES;
    await explore();
    await click(choice(), PAY);

    expect(ptpCards()).toHaveLength(1);
    expect(ptpCards()[0].content).toContain(`As stated before the roll: <strong>${STATED}</strong>`);
    expect(pc.system.health.value).toBe(4);
    expect(pc.system.supply.value).toBe(3);
  }, 60_000);

  it("\"Confront Chaos instead\" on the card is the move card's 🌀: one claim, the follow-up as the roller, the price retired unpaid", async () => {
    await explore();
    const card = choice();
    await click(card, CHAOS);

    expect(flagsOf(moveCard()).waypointRewardClaimed).toBe("alternative");
    expect(forced()).toHaveLength(1);
    expect(forced()[0].speaker?.actor).toBe(pc.id);
    const retired = table.world.message(card._id);
    expect(retired.flags[MODULE_ID]).toMatchObject({ resolved: true, superseded: true, retiredBy: "chaos" });
    expect(retired.content).toMatch(/Confront Chaos — so this choice no longer applies/);
    expect(ptpCards()).toEqual([]);
    expect(pc.system.supply.value).toBe(3);

    // The price can no longer be paid: its button is gone, and a pick relayed from a stale render is refused.
    expect(table.client("pl-1").render(card._id).querySelectorAll(PICK)).toHaveLength(0);
    const relay = await table.client("pl-1").import("../../src/multiplayer/gmRelay.js");
    await table.client("pl-1").run(() => relay.requestGmAction("suffer.pick", { messageId: card._id, pickKind: "enum", optionIndex: "0" }));
    await table.settle(); await table.drain();
    expect(ptpCards()).toEqual([]);
    // …and the 🌀 on the move card is spent too.
    await click(moveCard(), BUTTON);
    expect(forced()).toHaveLength(1);
  }, 60_000);

  it("the move card's 🌀 pressed first retires the price's card", async () => {
    await explore();
    const card = choice();
    await click(moveCard(), BUTTON);

    expect(forced()).toHaveLength(1);
    expect(table.world.message(card._id).flags[MODULE_ID]).toMatchObject({ resolved: true, superseded: true, retiredBy: "chaos" });
    expect(ptpCards()).toEqual([]);
  }, 60_000);

  it("🌀 pressed while the miss is still being narrated: the price's card, posted after it, is retired — not payable on top", async () => {
    const held = claude.hold(call => call.model === NARRATION_MODEL && /MOVE: Explore a Waypoint/i.test(call.userText ?? ""));
    control.dice = MISS_MATCH;
    table.client("pl-1").chat("I search the derelict's hold.", { speaker: { actor: pc.id } });
    await held.arrived;
    await table.settle();
    // The move card is on the table, its 🌀 live; the miss is not recorded yet, so its choice card is not posted.
    expect(choice()).toBeNull();
    table.client("pl-1").click(moveCard()._id, BUTTON);
    await table.settle();
    expect(flagsOf(moveCard()).waypointRewardClaimed).toBe("alternative");

    held.release(REPLY);
    await table.settle(); await table.drain();

    const card = choice();
    expect(card, "the miss's choice card was posted").toBeTruthy();
    expect(flagsOf(card)).toMatchObject({ resolved: true, superseded: true, retiredBy: "chaos" });
    expect(table.client("pl-1").render(card._id).querySelectorAll(PICK)).toHaveLength(0);
    expect(ptpCards()).toEqual([]);
    expect(forced()).toHaveLength(1);
  }, 60_000);
});

describe("Explore a Waypoint — a held miss with a match is narrated after its choice (issue #364)", () => {
  // Momentum 9 beats both 7s: Burn Momentum is offered, so free-flow holds
  // the result — its choice card posts at once, its narration waits.
  beforeEach(() => { pc.system.momentum.value = 9; control.stakes = STAKES; });

  it("the price picked first: the narration delivers the stated miss as what the miss costs", async () => {
    await explore();
    expect(flagsOf(moveCard()).awaitingUpgrade?.open).toBe(true);
    expect(narrations()).toHaveLength(0);

    await click(choice(), PAY);

    expect(narrations()).toHaveLength(1);
    const [narration] = narrations();
    expect(seededPrices(narration)).toEqual([STATED]);
    expect(narration.userText).toContain("deliver the miss as stated — it is what this miss costs");
    expect(narration.userText).not.toContain("THE PRICE IS THE PLAYER'S CHOICE");
    expect(narration.userText).not.toContain("THE PRICE WAS NOT PAID");
    expect(pc.system.health.value).toBe(4);
  }, 60_000);

  it("Confront Chaos taken first: the miss is narrated with no price — none seeded, none delivered", async () => {
    await explore();
    expect(narrations()).toHaveLength(0);

    await click(choice(), CHAOS);

    expect(forced()).toHaveLength(1);
    expect(narrations()).toHaveLength(1);
    const [narration] = narrations();
    expect(seededPrices(narration)).toEqual([]);
    expect(narration.userText).toContain("[price] THE PRICE WAS NOT PAID.");
    expect(narration.userText).toContain("the miss stated before the roll does not come to pass");
    expect(narration.userText).not.toContain("it is what this miss costs");
    expect(ptpCards()).toEqual([]);
    expect(pc.system.health.value).toBe(5);
  }, 60_000);

  it("Keep pressed first: the narration is told the price is still the player's choice", async () => {
    await explore();
    await click(moveCard(), '[data-action="sf-keep-result"]');

    expect(narrations()).toHaveLength(1);
    expect(narrations()[0].userText).toContain("[price] THE PRICE IS THE PLAYER'S CHOICE.");
    expect(narrations()[0].userText).not.toContain("it is what this miss costs");
    // The price is still to pay, on its card.
    await click(choice(), PAY);
    expect(ptpCards()).toHaveLength(1);
    expect(pc.system.health.value).toBe(4);
  }, 60_000);
});

describe("the price a miss offers as a choice — the pieces (issue #364)", () => {
  const priced = () => withChoicePrice(mapConsequences("explore_a_waypoint", "miss", true).sufferPrompt,
    { roll: 71, result: WASTE, sufferRoutes: [{ move: "sacrifice_resources", amount: 1 }] }, "Explore a Waypoint");

  it("the waypoint's miss with a match routes no price: it offers one, beside Confront Chaos", () => {
    const c = mapConsequences("explore_a_waypoint", "miss", true);
    expect(c.routePayThePrice).toBe(false);
    expect(c.sufferPrompt.options).toEqual([
      { label: "Pay the Price", route: "pay_the_price", priceInLabel: true },
      { label: "Confront Chaos instead", waypointOracle: "confront_chaos" },
    ]);
    // Without the match the price is routed, as before; a hit offers neither.
    expect(mapConsequences("explore_a_waypoint", "miss", false)).toMatchObject({ routePayThePrice: true, sufferPrompt: null });
  });

  it("every miss that says Pay the Price routes it or offers it as a choice — none is narrated a price nothing charges", () => {
    const offers = (c) => c?.sufferPrompt?.kind === "enumerated" && (c.sufferPrompt.options ?? []).some(o => o?.route === "pay_the_price");
    const paying = Object.keys(MOVES).filter(id => missPaysPrice(id));
    expect(paying).toContain("explore_a_waypoint");
    expect(paying).toContain("sojourn");
    for (const id of paying) {
      for (const isMatch of [false, true]) {
        const c = mapConsequences(id, "miss", isMatch);
        expect(c.routePayThePrice === true || offers(c), `${id} miss${isMatch ? " with a match" : ""}`).toBe(true);
      }
    }
  });

  it("the priced option names its price; the resolution's price choice names what may replace it — Sojourn's, the vow", () => {
    const prompt = priced();
    expect(prompt.options[0].label).toBe(`Pay the Price: ${WASTE}`);
    expect(priceChoiceOf(prompt, { roll: 71, result: WASTE })).toEqual({ price: WASTE, stated: false, instead: "confront_chaos" });
    // Sojourn's price is a choice too (SOJOURN-MISS-PRICE-NARRATED-BEFORE-CHOICE:
    // it carried none, and was narrated as paid before it was chosen) — its
    // label is its own, and what replaces it is the vow its other option routes.
    const sojourn = withChoicePrice(mapConsequences("sojourn", "miss", false).sufferPrompt, { roll: 71, result: WASTE, sufferRoutes: [] }, "Sojourn");
    expect(sojourn.options.find(o => o.route === "pay_the_price").label).toBe("No relief — Pay the Price");
    expect(priceChoiceOf(sojourn, { roll: 71, result: WASTE })).toEqual({ price: WASTE, stated: false, instead: "swear_an_iron_vow" });
  });

  const input = () => ({
    _id: "res-1", moveId: "explore_a_waypoint", moveName: "Explore a Waypoint", outcome: "miss", isMatch: true,
    stakes: { ...STAKES }, priceChoice: { price: STATED, stated: true, instead: "confront_chaos" },
    loremasterContext: "[MOVE: Explore a Waypoint +wits] [OUTCOME: Miss]",
    oracleSeeds: { results: ["Inside the vault — Interior Peril: A trap", `Pay the Price: ${STATED}`], names: [], context: "explore_a_waypoint" },
  });

  it("settlePriceChoice: paid leaves the input; pending keeps the seed; declined takes the price's seed lines", () => {
    const paid = settlePriceChoice(input(), PRICE_CHOICE.PAID);
    expect(paid.oracleSeeds.results).toEqual(input().oracleSeeds.results);
    expect(paid.priceChoice.status).toBe("paid");

    const pending = settlePriceChoice(input(), PRICE_CHOICE.PENDING);
    expect(pending.oracleSeeds.results).toEqual(input().oracleSeeds.results);
    expect(pending.priceChoice.status).toBe("pending");

    const enemy = { ...input(), oracleSeeds: { results: [
      "Inside the vault — Interior Peril: A trap",
      "Pay the Price: A new enemy is revealed",
      "The new enemy — Character Role: Raider",
      "Pay the Price: You are delayed or put at a disadvantage",
      "This price is paid in momentum (Lose Momentum -1): show the time, ground or advantage actually lost — a concrete setback, not a mood.",
    ], names: [], context: "explore_a_waypoint" } };
    const declined = settlePriceChoice(enemy, PRICE_CHOICE.DECLINED);
    expect(declined.oracleSeeds.results).toEqual(["Inside the vault — Interior Peril: A trap"]);
    expect(declined.priceChoice.status).toBe("declined");
    // Seeds that were only the price: none are left.
    const bare = { ...input(), oracleSeeds: { results: [`Pay the Price: ${STATED}`], names: [], context: "explore_a_waypoint" } };
    expect(settlePriceChoice(bare, PRICE_CHOICE.DECLINED).oracleSeeds).toBeNull();

    // No such choice — or not a miss (an upgraded result) — is left as it is.
    const plain = { outcome: "miss", oracleSeeds: { results: ["Pay the Price: X"] } };
    expect(settlePriceChoice(plain, PRICE_CHOICE.DECLINED)).toBe(plain);
    const hit = { ...input(), outcome: "strong_hit" };
    expect(settlePriceChoice(hit, PRICE_CHOICE.DECLINED)).toBe(hit);
  });

  it("the narrator's blocks: a paid price is delivered as stated; an open or declined one never is", () => {
    const paidMsg = buildNarratorUserMessage(settlePriceChoice(input(), PRICE_CHOICE.PAID), "I search the hold.", 3);
    expect(paidMsg).toContain("deliver the miss as stated — it is what this miss costs");
    expect(paidMsg).not.toMatch(/THE PRICE (IS THE PLAYER'S CHOICE|WAS NOT PAID)/);

    for (const status of [PRICE_CHOICE.PENDING, PRICE_CHOICE.DECLINED]) {
      const msg = buildNarratorUserMessage(settlePriceChoice(input(), status), "I search the hold.", 3);
      expect(msg, status).not.toContain("it is what this miss costs");
      expect(msg, status).toContain("the stated miss is the price it offers, not a price paid");
    }
    expect(formatPriceChoiceBlock({ price: STATED, stated: true, instead: "confront_chaos", status: "pending" }))
      .toMatch(/^- \[price\] THE PRICE IS THE PLAYER'S CHOICE\. This miss came with a match: the player may Pay the Price or Confront Chaos instead, and has not chosen yet/);
    expect(formatPriceChoiceBlock({ price: WASTE, stated: false, instead: "confront_chaos", status: "declined" }))
      .toMatch(/^- \[price\] THE PRICE WAS NOT PAID\. This miss came with a match, and the player chose to Confront Chaos instead of paying a price: no price is paid\. /);
    expect(formatPriceChoiceBlock({ price: WASTE, instead: "confront_chaos", status: "paid" })).toBe("");
    expect(formatPriceChoiceBlock(null)).toBe("");
    // A miss with no such choice is told as before.
    expect(formatStakesBlock(STAKES, "miss")).toContain("deliver the miss as stated — it is what this miss costs");
  });

  it("a Batch Mode round's entry carries the choice, and its block is told the same", () => {
    const kept = narrationInputFrom(input(), null);
    expect(kept.priceChoice).toEqual({ price: STATED, stated: true, instead: "confront_chaos" });
    expect(kept.resolutionId).toBe("res-1");
    // A result with no such choice keeps none.
    expect("priceChoice" in narrationInputFrom({ ...input(), priceChoice: undefined }, null)).toBe(false);

    const round = (status) => buildRoundUserMessage({ sentenceTarget: 3, entries: [
      { actorName: "Kira", text: "I search the hold.", input: settlePriceChoice(kept, status) },
    ] });
    expect(round("pending")).toContain("[price] THE PRICE IS THE PLAYER'S CHOICE.");
    expect(round("pending")).not.toContain("it is what this miss costs");
    expect(round("declined")).toContain("[price] THE PRICE WAS NOT PAID.");
    expect(round("declined")).not.toMatch(/Pay the Price: /);
    expect(round("paid")).toContain("deliver the miss as stated — it is what this miss costs");
    expect(round("paid")).toContain(`Pay the Price: ${STATED}`);
  });
});
