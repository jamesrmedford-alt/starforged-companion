/**
 * STARFORGED COMPANION
 * tests/unit/costNotNarratedBeforeChosen.test.js
 *
 * known-issues COST-NARRATED-BEFORE-IT-IS-CHOSEN — the long haul's third live
 * run (explorations/long-haul-live-20261124-0321, a59).
 *
 * A Heal weak hit: "As a strong hit, but recovery costs extra time or
 * resources: Lose Momentum (-2) OR Sacrifice Resources (-2)." Its narration
 * was told "This is a weak hit: deliver the hit as stated, with the cost or
 * complication the move outcome names", and wrote "It costs you, though: the
 * cracked tube gives out half-used, and the tape runs short" — the supplies
 * spent. The card that posted under it then asked the player to choose:
 * momentum, or resources.
 *
 * Nothing told the narration that the cost was a choice, or that the choice
 * had not been made: a free-flow result is narrated before its choice card is
 * posted. It is now told (resultUpgrade.js withUnansweredCards reads the
 * table's cards; stakes.js formatOpenChoiceBlock says how to leave it), and
 * once the player has chosen it is told nothing — the cost is then a fact.
 *
 * End to end on a booted GM / player table (tests/helpers/multiClient.js):
 * the player's line goes through the GM's real pipeline, the interpretation
 * and the dice scripted at their boundaries.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], move: null }));
vi.mock("../../src/pacing/router.js", async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../src/moves/interpreter.js", async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({
    playerNarration: text, inputMethod: "chat", rationale: "test", mischiefApplied: false, adds: 0,
    ...control.move,
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
import { mapConsequences } from "../../src/moves/resolver.js";
import { obligationsFor, unansweredCardsFor } from "../../src/moves/contracts/obligations.js";
// The STAKES / PRICE / COST / FIGHT blocks are lines of the narration's one
// obligations block now (overhaul 4, slice 2 — contracts/obligations.js, their
// words kept): each stand-in below is that line, tagged, as the block carries it.
const lineFor = (kind, resolution) => { const o = obligationsFor({ mode: "move", resolution }).find(x => x.kind === kind); return o ? `- [${o.kind}] ${o.text}` : ""; };
const formatStakesBlock = (stakes, outcome, extra = {}) => lineFor("stakes", { stakes, outcome, ...extra });
const formatOpenChoiceBlock = (openChoice) => lineFor("cost", { openChoice });
const withUnansweredCards = (input) => ({ ...input, ...unansweredCardsFor(input) });
import { buildNarratorUserMessage, buildRoundUserMessage } from "../../src/narration/narratorPrompt.js";

// Run 3, a59 — the player's line, the stakes the dialog showed and the outcome block sent.
const LINE   = "I sit down in the galley and treat my wounds with the ship's medkit, cleaning and binding what the fight cost me.";
const STAKES = { hit: "The cleaning and binding hold, and the wounds begin to close.",
  miss: "The sealant fails and the cut festers, leaving the wound worse than before.", priceStated: true };
const OUTCOME = "[MOVE: Heal +iron] [ROLL: Action: 4 + 1 = 5 vs Challenge: 1, 5] [OUTCOME: Weak Hit] "
  + "[CONSEQUENCE: As a strong hit, but recovery costs extra time or resources: Lose Momentum (-2) OR Sacrifice Resources (-2).]";
const OLD_DELIVER = "deliver the hit as stated, with the cost or complication the move outcome names";
const HEADING = "[cost] THE COST IS THE PLAYER'S CHOICE.";

// The dice of a59: challenge 1 and 5, action die 4 (+iron 1) = 5 — a weak hit.
const WEAK_HIT = [0, 0.45, 0.5];
const NARRATION_MODEL = "claude-sonnet-5-5";
const REPLY = 'The sealant takes.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

const healWeakHit = (over = {}) => ({
  _id: "res-a59", moveId: "heal", moveName: "Heal", statUsed: "iron", outcome: "weak_hit", outcomeLabel: "Weak Hit", isMatch: false,
  loremasterContext: OUTCOME, stakes: STAKES, consequences: mapConsequences("heal", "weak_hit", false), ...over,
});
const choiceCard = (resolution, over = {}) => ({ flags: { [MODULE_ID]: {
  sufferCard: true, sufferPrompt: resolution.consequences.sufferPrompt, resolutionId: resolution._id, moveId: resolution.moveId,
  pickedIndices: [], resolved: false, ...over,
} } });

describe("a result's cost that is the player's choice — as its narration is told it (unit)", () => {
  let saved;
  beforeEach(() => { saved = globalThis.game.messages; globalThis.game.messages = { contents: [] }; });
  afterEach(() => { globalThis.game.messages = saved; });

  it("a59: narrated before its card is posted, the Heal weak hit's cost is open — the card's four options", () => {
    const told = withUnansweredCards(healWeakHit());
    expect(told.openChoice).toEqual({ kind: "enumerated", amount: null, count: null, options: [
      "Clear wounded + take/give +2 health, then Lose Momentum (-2)",
      "Clear wounded + take/give +2 health, then Sacrifice Resources (-2)",
      "Take/give +3 health, then Lose Momentum (-2)",
      "Take/give +3 health, then Sacrifice Resources (-2)",
    ] });
  });

  it("the narration is told to deliver the hit and stop short of the cost", () => {
    const user = buildNarratorUserMessage(withUnansweredCards(healWeakHit()), LINE, 3, "Mira Kestrel");
    expect(user).toContain(OUTCOME);
    expect(user).not.toContain(OLD_DELIVER);
    expect(user).toContain("This is a weak hit: deliver the hit as stated. Its cost is the player's choice, and is not chosen yet");
    expect(user).toContain(HEADING);
    expect(user).toContain("- Take/give +3 health, then Sacrifice Resources (-2)");
    expect(user).toMatch(/What every option has in common has happened: narrate it\./);
    expect(user).toMatch(/no cost has been paid: narrate none of them as taken — nothing spent, used up, run short, lost or damaged/);
    expect(user).toMatch(/Bring the beat to where the cost falls due, and stop there\./);
    // The one block comes after the player's line, before the instruction (overhaul 4).
    expect(user.indexOf(HEADING)).toBeGreaterThan(user.indexOf("## PLAYER NARRATION"));
  });

  it("the card on the table and unanswered (a held result, a round): still open", () => {
    const resolution = healWeakHit();
    globalThis.game.messages.contents.push(choiceCard(resolution));
    expect(withUnansweredCards(resolution).openChoice?.options).toHaveLength(4);
    // A round entry's narration input carries no consequences: the card's own prompt is read.
    const entry = { kind: "move", resolutionId: resolution._id, moveId: "heal", outcome: "weak_hit" };
    expect(withUnansweredCards(entry).openChoice?.options).toHaveLength(4);
  });

  it("once the player has chosen, the cost is a fact: the narration is told as before", () => {
    const resolution = healWeakHit();
    globalThis.game.messages.contents.push(choiceCard(resolution, { pickedIndices: [3], chosenIndex: 3, resolved: true }));
    const told = withUnansweredCards(resolution);
    // Nothing open — and the pick is told (TELL [chosen], overhaul 4 slice 2).
    expect(unansweredCardsFor(resolution)).toEqual({ chosen: { labels: ["Take/give +3 health, then Sacrifice Resources (-2)"] } });
    const user = buildNarratorUserMessage(told, LINE, 3, "Mira Kestrel");
    expect(user).toContain(OLD_DELIVER);
    expect(user).not.toContain(HEADING);
    expect(user).toContain("- [chosen] Mira Kestrel chose Take/give +3 health, then Sacrifice Resources (-2). Tell what it cost them.");
  });

  it("\"Make a suffer move\": which one is the player's — the trouble is shown, not what it takes", () => {
    const told = withUnansweredCards({ _id: "res-fd", moveId: "face_danger", outcome: "weak_hit",
      consequences: mapConsequences("face_danger", "weak_hit", false) });
    expect(told.openChoice).toMatchObject({ kind: "any", amount: 1, count: 1 });
    const block = formatOpenChoiceBlock(told.openChoice);
    expect(block).toContain(HEADING);
    expect(block).toMatch(/This result costs a suffer move \(-1\), and which is the player's to choose/);
    expect(block).toMatch(/Show the trouble that brings the cost[\s\S]*stop before saying what it takes/);
  });

  it("control: a choice that costs nothing is no cost to leave open", () => {
    // A Heal strong hit's "choice" is the recovery the sheet allows; Secure an
    // Advantage's weak hit chooses between two gains.
    for (const [moveId, outcome] of [["heal", "strong_hit"], ["secure_an_advantage", "weak_hit"]]) {
      const resolution = { _id: `res-${moveId}`, moveId, outcome, consequences: mapConsequences(moveId, outcome, false) };
      expect(resolution.consequences.sufferPrompt, moveId).toBeTruthy();
      expect(unansweredCardsFor(resolution), moveId).toEqual({});
    }
  });

  it("control: a result with no choice, and a miss's price that is a choice of its own", () => {
    const strike = { _id: "res-strike", moveId: "strike", outcome: "strong_hit", consequences: mapConsequences("strike", "strong_hit", false) };
    expect(unansweredCardsFor(strike)).toEqual({});
    const sojourn = { _id: "res-sj", moveId: "sojourn", outcome: "miss", consequences: mapConsequences("sojourn", "miss", false),
      priceChoice: { status: "pending", instead: "swear_an_iron_vow" } };
    expect(unansweredCardsFor(sojourn)).toEqual({});   // its own line tells it ([price])
    expect(formatOpenChoiceBlock(null)).toBe("");
    expect(formatStakesBlock(STAKES, "weak_hit")).toContain(OLD_DELIVER);
  });

  it("a Batch Mode round's entry carries the block under its own outcome", () => {
    const user = buildRoundUserMessage({ entries: [{ actorName: "Mira Kestrel", text: LINE,
      input: { kind: "move", moveName: "Heal", statUsed: "iron", outcome: "weak_hit", outcomeLabel: "Weak Hit",
        loremasterContext: OUTCOME, stakes: STAKES, openChoice: withUnansweredCards(healWeakHit()).openChoice } }], sentenceTarget: 3 });
    expect(user).toContain("[cost] THE COST IS THE PLAYER'S CHOICE.");
    expect(user).not.toContain(OLD_DELIVER);
  });
});

describe("COST-NARRATED-BEFORE-IT-IS-CHOSEN — a Heal weak hit, through the pipeline", () => {
  let table, pc;
  const flagsOf   = (card) => table.world.message(card._id).flags[MODULE_ID];
  const choice    = () => table.cards(f => f.sufferCard && f.moveId === "heal").at(-1) ?? null;
  const moveCard  = () => table.cards(f => f.moveResolution).at(-1);
  const narrations = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL
    && /Narrate the consequence/.test(c.userText ?? "") && /MOVE: Heal/i.test(c.userText ?? ""));

  async function heal() {
    control.dice = WEAK_HIT;
    control.move = { moveId: "heal", moveName: "Heal", statUsed: "iron", stakes: { ...STAKES } };
    await table.client("pl-1").chat(LINE, { speaker: { actor: pc.id } });
    await table.settle(); await table.drain();
  }

  beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 60_000);
  afterAll(() => table?.teardown());
  beforeEach(async () => {
    await table.reset({ world: { settings: {
      chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false,
      campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "heal-s1", sessionNumber: 1,
        lastSessionTimestamp: new Date().toISOString(), currentSceneId: "heal-scene", sceneTruths: [], clocks: [], legacyTracks: {} },
    } } });
    await table.setClaudeKey("gm-1", "sk-ant-test");
    // Momentum 2 beats neither die: no Burn is offered, so the result is not held.
    pc = table.addActor({ id: "pc-mira", name: "Mira Kestrel", ownership: { "pl-1": 3 },
      system: { iron: 1, wits: 1, momentum: { value: 2 }, supply: { value: 5 }, health: { value: 3 } } });
    scriptClaude(table, { fallback: () => REPLY });
  });
  afterEach(async () => {
    table.client("gm-1").answerDialogs(d => d.close());
    await table.drain().catch(() => {});
  });

  it("narrated before its card: the narration is told the cost is not chosen, and nothing is paid until the pick", async () => {
    await heal();

    expect(moveCard(), "the roll's card posted").toBeTruthy();
    expect(narrations()).toHaveLength(1);
    const [narration] = narrations();
    expect(narration.userText).toContain("[OUTCOME: Weak Hit]");
    expect(narration.userText).toContain("Lose Momentum (-2) OR Sacrifice Resources (-2)");
    expect(narration.userText).toContain(HEADING);
    expect(narration.userText).toContain("narrate none of them as taken — nothing spent, used up, run short, lost or damaged");
    expect(narration.userText).not.toContain(OLD_DELIVER);
    // The card asks afterwards, unanswered; the sheet is untouched.
    const card = choice();
    expect(card, "the weak hit posted its choice card").toBeTruthy();
    expect(flagsOf(card).resolved).toBe(false);
    expect(pc.system.supply.value).toBe(5);
    expect(pc.system.momentum.value).toBe(2);
  }, 60_000);

  it("a held result, its cost picked before it is narrated: the narration is told the cost as the outcome names it", async () => {
    // Momentum 9 beats both dice: Burn Momentum is offered, so the result is
    // held — its choice card posts at once, its narration waits.
    pc.system.momentum.value = 9;
    await heal();
    expect(narrations()).toHaveLength(0);
    const card = choice();
    expect(card, "the held result's choice card is on the table").toBeTruthy();

    // "Take/give +3 health, then Sacrifice Resources (-2)" — the option a59's player took.
    const index = flagsOf(card).sufferPrompt.options.findIndex(o => o.label === "Take/give +3 health, then Sacrifice Resources (-2)");
    await table.client("pl-1").click(card._id, `[data-action="sf-suffer-pick"][data-option-index="${index}"]`);
    await table.settle(); await table.drain();

    expect(pc.system.supply.value).toBe(3);
    expect(narrations()).toHaveLength(1);
    expect(narrations()[0].userText).not.toContain(HEADING);
    expect(narrations()[0].userText).toContain(OLD_DELIVER);
  }, 60_000);
});
