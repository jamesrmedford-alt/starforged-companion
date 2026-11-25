/**
 * STARFORGED COMPANION
 * tests/unit/sojournMissAnsweredIsAStrongHit.test.js
 *
 * Issue #364 SOJOURN-VOW-OPTION-REMINDER-ONLY.
 *
 * Sojourn's miss, as the module's own reading has it (resolver.js
 * CONSEQUENCE_MAP `sojourn`; the rule is paraphrased here, not quoted): the
 * community needs help or makes a demand — do it, or Swear an Iron Vow to see
 * it done, and the move resolves as a strong hit; otherwise no relief, and
 * the price. Picking "Community needs help" on the miss's choice card posted
 * only a reminder ("Trigger: swear_an_iron_vow"): nothing resolved the
 * Sojourn as the strong hit the rule gives.
 *
 * The pick now posts the community's need card (src/moves/sojournNeed.js):
 * ⚔ Swear an Iron Vow writes the vow on the roller's sheet — the existing
 * swear flow's own entry: its "🆕 New vow recorded" card rolls the swear —
 * and ✔ It is done is the player's word. Once the vow is sworn, or the help
 * is marked done, the Sojourn's card reads as a strong hit and the strong hit
 * is narrated as a second beat; the miss's own narration stands.
 *
 * End to end on a booted GM / two-player table (tests/helpers/multiClient.js):
 * the player's line goes through the GM's real pipeline, the interpretation
 * and the dice scripted at their boundaries; every press goes through the
 * real cards on a client and relays to the canonical GM. The vow's Item is
 * made by a stand-in `Item.create` that fires the createItem hook, as the
 * system does. Whether a Batch Mode round is being resolved is read at its
 * boundary (resultUpgrade.js roundResolvingNow).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], stakes: null, roundResolving: false, itemFails: false }));
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
vi.mock("../../src/moves/resultUpgrade.js", async (original) => ({
  ...(await original()), roundResolvingNow: vi.fn(() => control.roundResolving),
}));

import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude, failWrites } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";
import { mapConsequences, buildLoremasterContext } from "../../src/moves/resolver.js";
import { resolveSufferSelection } from "../../src/moves/sufferDialog.js";
import { summarizeSufferCalls } from "../../src/moves/sufferCard.js";
import { obligationsFor } from "../../src/moves/contracts/obligations.js";
// The STAKES / PRICE / COST / FIGHT blocks are lines of the narration's one
// obligations block now (overhaul 4, slice 2 — contracts/obligations.js, their
// words kept): each stand-in below is that line, tagged, as the block carries it.
const lineFor = (kind, resolution) => { const o = obligationsFor({ mode: "move", resolution }).find(x => x.kind === kind); return o ? `- [${o.kind}] ${o.text}` : ""; };
const formatPriceChoiceBlock = (priceChoice) => lineFor("price", { outcome: "miss", priceChoice });

// challenge 7 and 8; action die 1 (+heart 2) — a miss, no match; then the price's d100 = 71.
const MISS = [0.65, 0.75, 0, 0.705];
// challenge 1 and 2; action die 6 (+heart 2) — a strong hit, no match.
const STRONG = [0, 0.1, 0.9];
const STAKES = { hit: "The settlement takes you in.", miss: "The settlement's gates stay shut against you.",
  missSuffer: { move: "endure_stress", amount: 1 }, priceStated: true };
const NARRATION_MODEL = "claude-sonnet-5-5";
const REPLY = 'The gates loom.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const SAFE_REFUGE = mapConsequences("sojourn", "strong_hit", false).otherEffect;

const NEED  = '[data-action="sf-suffer-pick"][data-option-index="0"]';
const SWEAR = '[data-action="sf-sojourn-need-swear"]';
const DONE  = '[data-action="sf-sojourn-need-done"]';
const SWEAR_IT = '[data-action="sf-player-vow-swear"]';

let table, pc, savedItem;
const flagsOf    = (card) => table.world.message(card._id).flags[MODULE_ID];
const contentOf  = (card) => table.world.message(card._id).content;
const moveCard   = () => table.cards(f => f.moveResolution && !f.forcedMoveId).find(m => /Sojourn/.test(m.content));
const choice     = () => table.cards(f => f.sufferCard && f.moveId === "sojourn").at(-1) ?? null;
const needCard   = () => table.cards(f => f.sojournNeedCard).at(-1) ?? null;
const reminders  = () => table.cards(f => f.sufferDeferred && f.route === "swear_an_iron_vow");
const vowCards   = () => table.cards(f => f.playerVowCard);
const paused     = () => table.cards(f => f.narrationPaused);
const moveCalls  = (move) => table.claude.calls.filter(c => c.model === NARRATION_MODEL
  && /Narrate the consequence/.test(c.userText ?? "") && new RegExp(`MOVE: ${move}`, "i").test(c.userText ?? ""));
const narrations = () => moveCalls("Sojourn");
const narrationCards = () => table.cards(f => f.narratorCard && !f.vowSceneCard);

async function settled() { await table.settle(); await table.drain(); }
async function sojourn() {
  control.dice = MISS;
  await table.client("pl-1").chat("I ask the settlement for shelter.", { speaker: { actor: pc.id } });
  await settled();
}
async function click(card, selector, as = "pl-1") {
  await table.client(as).click(card._id, selector);
  await settled();
}
/** The miss rolled and "Community needs help" picked: the need card is on the table. */
async function needTakenOn() {
  await sojourn();
  await click(choice(), NEED);
  return needCard();
}
/** ⚔ Swear an Iron Vow on the need card, with the card's fields as the player filled them. */
async function swearOnNeed(card, { name = "", rank = null } = {}) {
  const root = table.client("pl-1").render(card._id);
  root.querySelector(".sf-sojourn-need-vow-name").value = name;
  if (rank) root.querySelector(".sf-sojourn-need-vow-rank").value = rank;
  table.client("pl-1").click(card._id, SWEAR);
  await settled(); await settled();
}
/** ⚔ Swear it (roll) on the vow's own card: the forced swear is held a moment before it runs. */
async function swearIt(cardId) {
  control.dice = STRONG;
  vi.useFakeTimers({ toFake: ["setTimeout"] });
  try {
    table.client("pl-1").click(cardId, SWEAR_IT);
    for (let i = 0; i < 4; i += 1) { await table.settle(); await vi.advanceTimersByTimeAsync(2_100); }
    await table.settle();
  } finally {
    vi.useRealTimers();
    await table.drain();
  }
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 60_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  Object.assign(control, { stakes: null, roundResolving: false, itemFails: false });
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "sjn-s1", sessionNumber: 1,
      lastSessionTimestamp: new Date().toISOString(), currentSceneId: "sjn-scene", sceneTruths: [], clocks: [], legacyTracks: {} },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  // Momentum 2 beats neither die: no Burn is offered, so the miss is narrated at once.
  pc = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 },
    system: { heart: 2, momentum: { value: 2 }, supply: { value: 3 }, spirit: { value: 5 } } });
  scriptClaude(table, { fallback: () => REPLY });
  // The system's Item.create, as far as a vow needs it: the Item lands on its
  // parent's sheet and every client's createItem hook hears of it.
  savedItem = globalThis.Item;
  let made = 0;
  globalThis.Item = { async create(data, { parent } = {}) {
    if (control.itemFails) throw new Error("the world refused the Item");
    made += 1;
    const item = {
      id: `vow-${made}`, type: data.type, name: data.name, parent, flags: JSON.parse(JSON.stringify(data.flags ?? {})),
      system: { ...data.system, completed: false },
      async update(changes) { if (typeof changes?.name === "string") item.name = changes.name; return item; },
      async setFlag(scope, key, value) { (item.flags[scope] ??= {})[key] = value; return item; },
    };
    parent.items.contents.push(item);
    for (const c of table.connectedClients) c.run(() => Hooks.callAll("createItem", item, {}, "gm-1"));
    return item;
  } };
  globalThis.silenceConsoleErrors?.();
});
afterEach(async () => {
  globalThis.Item = savedItem;
  table.client("gm-1").answerDialogs(d => d.close());
  await table.drain().catch(() => {});
});

describe("Sojourn's miss — picking the community's need offers the vow or the help done (issue #364)", () => {
  it("the pick posts the community's need card, not a reminder; the Sojourn is a miss until it is answered", async () => {
    const need = await needTakenOn();

    expect(need, "the need card was posted").toBeTruthy();
    expect(reminders(), "no bare reminder to swear").toEqual([]);
    expect(flagsOf(need)).toMatchObject({ sojournNeedCard: true, actorId: "pc-kira", resolved: false,
      resolutionId: flagsOf(moveCard()).resolutionId });
    expect(contentOf(need)).toContain("Do it, or Swear an Iron Vow to see it done, and this Sojourn is resolved as a strong hit.");
    expect(contentOf(need)).toContain("⚔ Swear an Iron Vow</button>");
    expect(contentOf(need)).toContain("✔ It is done</button>");
    expect(contentOf(choice())).toContain("Applied: the community's need taken on (answer it on its card)");
    expect(flagsOf(choice())).toMatchObject({ resolved: true, chosenIndex: 0 });

    // Never answered: the Sojourn stays the miss it was, its price declined.
    expect(contentOf(moveCard())).not.toContain("sf-sojourn-resolved");
    expect(contentOf(moveCard())).not.toContain("sf-move-outcome--struck");
    expect(narrations()).toHaveLength(1);
    expect(pc.system.supply.value).toBe(3);
  }, 60_000);

  it("a need card the world refuses hands the pick back: the choice card is live again, and a second pick posts it", async () => {
    await sojourn();
    const refused = failWrites(table, w => w.kind === "message.create" && w.data?.flags?.[MODULE_ID]?.sojournNeedCard === true);

    await click(choice(), NEED);

    expect(refused.refused).toBe(1);
    expect(needCard()).toBeNull();
    expect(reminders()).toEqual([]);
    expect(flagsOf(choice())).toMatchObject({ resolved: false });
    expect(flagsOf(choice()).chosenIndex ?? null).toBeNull();
    expect(contentOf(choice())).toContain("The card to answer it on could not be posted");

    await click(choice(), NEED);
    expect(needCard()).toBeTruthy();
    expect(flagsOf(choice())).toMatchObject({ resolved: true, chosenIndex: 0 });
  }, 60_000);

  it("✔ It is done: the card is resolved, the Sojourn's card reads as a strong hit, and the strong hit is narrated after the miss", async () => {
    control.stakes = STAKES;
    const need = await needTakenOn();
    const [missCard] = narrationCards();

    await click(need, DONE);

    expect(flagsOf(need)).toMatchObject({ resolved: true });
    expect(contentOf(need)).toContain("Resolved as a strong hit</strong> — the community's need was met.");
    expect(contentOf(need)).toContain(SAFE_REFUGE);
    expect(contentOf(need)).not.toContain("data-action");
    // The move card: the miss struck, the strong hit and its text below — as an improved result reads.
    const card = contentOf(moveCard());
    expect(card).toMatch(/<div class="sf-move-outcome sf-move-outcome--struck"><s>Miss<\/s><\/div>/);
    expect(card).toContain("sf-move-effect--struck");
    expect(card).toContain("✦ Resolved as a strong hit — the community's need was met.");
    expect(card).toContain(`<div class="sf-move-effect">${SAFE_REFUGE}</div>`);
    // A second beat: the strong hit is narrated, and the miss's narration stands.
    expect(narrations()).toHaveLength(2);
    const told = narrations()[1].userText;
    expect(told).toContain("[OUTCOME: Strong Hit]");
    expect(told).toContain("[ROLL: A miss, resolved as a strong hit — the character did what the community asked]");
    expect(told).toContain(`[CONSEQUENCE: ${SAFE_REFUGE}]`);
    expect(told).toContain("This is a strong hit: deliver the hit as stated.");
    expect(told).toContain(`- On a hit: ${STAKES.hit}`);
    expect(told).toContain("The miss is already told");
    expect(told).not.toMatch(/THE PRICE (IS THE PLAYER'S CHOICE|WAS NOT PAID)/);
    expect(flagsOf(missCard).burnSuperseded ?? false).toBe(false);
    expect(contentOf(missCard)).not.toContain("sf-narration-superseded");
    expect(narrationCards()).toHaveLength(2);
    // The marker is no player's line, and no upgrade of the miss.
    expect(flagsOf(narrationCards()[1]).playerText ?? "").toBe("");
    expect(flagsOf(narrationCards()[1]).upgradeOf ?? null).toBeNull();
    // No price was paid, and nothing is automated: the recover moves are the table's.
    expect(table.cards(f => f.payThePriceCard)).toEqual([]);
    expect(pc.system).toMatchObject({ supply: { value: 3 }, spirit: { value: 5 }, momentum: { value: 2 } });
  }, 60_000);

  it("a GM may press It is done for the player; a second press, and two presses at once, resolve it once", async () => {
    const need = await needTakenOn();

    table.client("gm-1").click(need._id, DONE);
    table.client("pl-1").click(need._id, DONE);
    await settled();

    expect(flagsOf(need)).toMatchObject({ resolved: true });
    expect(narrations()).toHaveLength(2);
    const { applySojournNeedFromRelay } = await table.client("gm-1").import("../../src/moves/sojournNeed.js");
    const again = await table.client("gm-1").run(() => applySojournNeedFromRelay({ messageId: need._id, way: "done" }, { requesterIsGM: true }));
    await settled();
    expect(again).toEqual({ applied: false, reason: "already-resolved" });
    expect(narrations()).toHaveLength(2);
    expect(contentOf(moveCard()).match(/sf-sojourn-resolved/g)).toHaveLength(1);
  }, 60_000);

  it("a press by someone who is neither the roller's player nor a GM changes nothing, and they are told", async () => {
    const need = await needTakenOn();

    await click(need, DONE, "pl-2");
    await click(need, SWEAR, "pl-2");

    expect(flagsOf(need)).toMatchObject({ resolved: false });
    expect(pc.items.contents).toEqual([]);
    expect(narrations()).toHaveLength(1);
    const told = table.cards(f => f.pressRefusedNotice);
    expect(told).toHaveLength(2);
    expect(told[0].content).toContain("Not your button");
    expect(told[0].whisper).toEqual(expect.arrayContaining(["pl-2", "gm-1"]));
    expect(told[0].content).toContain("Kira");
    // The roller's own press still lands.
    await click(need, DONE);
    expect(flagsOf(need)).toMatchObject({ resolved: true });
  }, 60_000);

  it("under the X-Card the Sojourn is resolved on its cards and its narration is paused, as an upgrade's is", async () => {
    const need = await needTakenOn();
    await table.client("pl-1").chat("!x");
    await settled();

    await click(need, DONE);

    expect(flagsOf(need)).toMatchObject({ resolved: true });
    expect(contentOf(moveCard())).toContain("✦ Resolved as a strong hit");
    expect(narrations(), "no narration is written while the X-Card stands").toHaveLength(1);
    expect(paused().length).toBeGreaterThanOrEqual(1);
  }, 60_000);

  it("while a Batch Mode round is being resolved It is done waits: refused, said, and pressed again once the round is told", async () => {
    const need = await needTakenOn();
    control.roundResolving = true;

    await click(need, DONE);

    expect(flagsOf(need)).toMatchObject({ resolved: false });
    expect(narrations()).toHaveLength(1);
    expect(contentOf(moveCard())).not.toContain("sf-sojourn-resolved");
    const [notice] = table.cards(f => f.pressRefusedNotice);
    expect(notice.content).toContain("A round is being resolved — press ✔ It is done once the round is narrated.");
    expect(notice.whisper).toEqual(expect.arrayContaining(["pl-1", "gm-1"]));

    control.roundResolving = false;
    await click(need, DONE, "gm-1");
    expect(flagsOf(need)).toMatchObject({ resolved: true });
    expect(narrations()).toHaveLength(2);
  }, 60_000);

  it("while the kept miss's own narration is being written It is done waits for it", async () => {
    const need = await needTakenOn();
    const gm = table.client("gm-1");
    const { claimResultUpgrade, releaseResultUpgrade } = await gm.import("../../src/moves/burnMomentum.js");
    claimResultUpgrade(moveCard()._id);
    try {
      await click(need, DONE, "gm-1");
      expect(flagsOf(need)).toMatchObject({ resolved: false });
      expect(table.cards(f => f.pressRefusedNotice)[0].content).toContain("still being written");
    } finally {
      releaseResultUpgrade(moveCard()._id);
    }
    await click(need, DONE, "gm-1");
    expect(flagsOf(need)).toMatchObject({ resolved: true });
  }, 60_000);
});

describe("Sojourn's miss — a vow sworn to see the community's need done resolves it (issue #364)", () => {
  it("⚔ Swear an Iron Vow writes the vow on the roller's sheet; its own card's swear roll, once narrated, resolves the Sojourn", async () => {
    const need = await needTakenOn();

    await swearOnNeed(need, { name: "  Clear the  reactor of raiders ", rank: "formidable" });

    // The vow is on the sheet, as typed, and the existing flow has taken it up.
    expect(pc.items.contents).toHaveLength(1);
    const [vow] = pc.items.contents;
    expect(vow).toMatchObject({ name: "Clear the reactor of raiders", type: "progress", system: { subtype: "vow", rank: "formidable" } });
    // The vow says which card it answers; the card keeps no copy of the link.
    expect(vow.flags[MODULE_ID]).toMatchObject({ sojournNeedCard: need._id });
    expect(flagsOf(need)).toMatchObject({ resolved: false });
    expect(flagsOf(need)).not.toHaveProperty("vowId");
    expect(contentOf(need)).toContain('"Clear the reactor of raiders" is on Kira\'s sheet');
    expect(contentOf(need)).toContain("⚔ Swear it (roll)");
    expect(contentOf(need)).not.toContain("sf-sojourn-need-swear");
    expect(contentOf(need)).toContain("sf-sojourn-need-done");
    const [vowCard] = vowCards();
    expect(vowCard, "the canonical GM posted the vow's own card").toBeTruthy();
    expect(flagsOf(vowCard)).toMatchObject({ vowId: vow.id, actorId: "pc-kira" });
    // Written, not sworn: the Sojourn is still a miss.
    expect(narrations()).toHaveLength(1);
    expect(contentOf(moveCard())).not.toContain("sf-sojourn-resolved");
    // A second ⚔ press writes no second vow.
    const { applySojournNeedFromRelay } = await table.client("gm-1").import("../../src/moves/sojournNeed.js");
    expect(await table.client("gm-1").run(() => applySojournNeedFromRelay({ messageId: need._id, way: "vow", vowName: "Another" }, { requesterIsGM: true })))
      .toEqual({ applied: false, reason: "vow-already-written" });
    expect(pc.items.contents).toHaveLength(1);

    await swearIt(vowCard._id);

    const [swear] = table.cards(f => f.forcedMoveId === "swear_an_iron_vow");
    expect(swear.flags[MODULE_ID]).toMatchObject({ forcedMoveTarget: "Clear the reactor of raiders", forcedMoveTargetId: vow.id });
    expect(flagsOf(need)).toMatchObject({ resolved: true });
    expect(contentOf(need)).toContain("an iron vow was sworn to see the community's need done");
    const card = contentOf(moveCard());
    expect(card).toMatch(/<div class="sf-move-outcome sf-move-outcome--struck"><s>Miss<\/s><\/div>/);
    expect(card).toContain("✦ Resolved as a strong hit — an iron vow was sworn to see the community's need done.");
    expect(narrations()).toHaveLength(2);
    expect(narrations()[1].userText).toContain("[ROLL: A miss, resolved as a strong hit — an iron vow was sworn to see the community's need done]");
    expect(narrations()[1].userText).toContain("The miss and the oath are already told");
    // After the swear's own narration, never before it.
    const calls = table.claude.calls;
    const [swearTold] = moveCalls("Swear an Iron Vow");
    expect(swearTold, "the swear was narrated").toBeTruthy();
    expect(calls.indexOf(narrations()[1])).toBeGreaterThan(calls.indexOf(swearTold));
    // The swear's own strong hit paid its momentum to the roller; the Sojourn paid nothing.
    expect(pc.system.momentum.value).toBe(4);
  }, 90_000);

  it("left blank, the vow is one still to be named, and its card says so", async () => {
    const need = await needTakenOn();

    await swearOnNeed(need);

    expect(pc.items.contents).toHaveLength(1);
    expect(contentOf(need)).toContain("A new vow is on Kira's sheet — name it there, then press");
    expect(contentOf(vowCards()[0])).toContain("name it and set its rank on its sheet");
  }, 60_000);

  it("a vow the sheet refuses releases the button, and the presser is told", async () => {
    const need = await needTakenOn();
    control.itemFails = true;

    await swearOnNeed(need, { name: "Clear the reactor" });

    expect(pc.items.contents).toEqual([]);
    expect(flagsOf(need)).toMatchObject({ resolved: false });
    expect(contentOf(need)).toContain("⚔ Swear an Iron Vow</button>");
    expect(table.cards(f => f.pressRefusedNotice)[0].content).toContain("could not be written on Kira");

    control.itemFails = false;
    await swearOnNeed(need, { name: "Clear the reactor" });
    expect(pc.items.contents).toHaveLength(1);
    expect(pc.items.contents[0].flags[MODULE_ID]).toMatchObject({ sojournNeedCard: need._id });
    expect(contentOf(need)).toContain('"Clear the reactor" is on Kira\'s sheet');
  }, 60_000);

  it("the vow written but never sworn: It is done still resolves it, and the vow's later swear resolves nothing twice", async () => {
    const need = await needTakenOn();
    await swearOnNeed(need, { name: "Clear the reactor" });

    await click(need, DONE);
    expect(flagsOf(need)).toMatchObject({ resolved: true });
    expect(narrations()).toHaveLength(2);

    await swearIt(vowCards()[0]._id);
    expect(moveCalls("Swear an Iron Vow")).toHaveLength(1);
    expect(narrations()).toHaveLength(2);
    expect(contentOf(need)).toContain("the community's need was met");
    expect(contentOf(moveCard()).match(/sf-sojourn-resolved/g)).toHaveLength(1);
  }, 90_000);
});

describe("Sojourn — a held miss whose need is picked is told the refuge comes later, then told it (issue #364)", () => {
  // Momentum 9 beats both dice: Burn Momentum is offered, so free-flow holds
  // the miss; picking the need keeps it, and its narration is told the price was declined.
  it("the miss's narration leaves the refuge to the answer; It is done then narrates it", async () => {
    pc.system.momentum.value = 9;
    control.stakes = STAKES;
    await sojourn();
    expect(narrations()).toHaveLength(0);

    await click(choice(), NEED);
    expect(narrations()).toHaveLength(1);
    const miss = narrations()[0].userText;
    expect(miss).toContain("[price] THE PRICE WAS NOT PAID.");
    expect(miss).toContain("once the vow is sworn or the help is done this move is resolved as a strong hit");
    expect(miss).toContain("the refuge it wins is told then, in a narration of its own, not here");
    expect(miss).not.toContain("resolved at the table");

    await click(needCard(), DONE);
    expect(narrations()).toHaveLength(2);
    expect(narrations()[1].userText).toContain("[OUTCOME: Strong Hit]");
    expect(flagsOf(needCard())).toMatchObject({ resolved: true });
  }, 60_000);
});

describe("Sojourn's answered need — the pieces (issue #364)", () => {
  it("the miss's first option says it resolves the move, and its call carries that", () => {
    const prompt = mapConsequences("sojourn", "miss", false).sufferPrompt;
    expect(prompt.options[0]).toMatchObject({ route: "swear_an_iron_vow", resolvesAs: "strong_hit" });
    expect(prompt.options[0].label).toBe("Community needs help — do it, or Swear an Iron Vow");
    const calls = resolveSufferSelection(prompt, { optionIndices: [0] });
    expect(calls).toEqual([{ kind: "route", route: "swear_an_iron_vow", resolvesAs: "strong_hit" }]);
    expect(summarizeSufferCalls(calls)).toBe("the community's need taken on (answer it on its card)");
    // Another move's routed vow is still a reminder.
    expect(summarizeSufferCalls([{ kind: "route", route: "swear_an_iron_vow", rank: "formidable" }])).toBe('see "Trigger: swear_an_iron_vow"');
  });

  it("a pick applied from no choice card has no Sojourn to resolve: the reminder is posted, as before", async () => {
    const { runSufferResolution } = await table.client("gm-1").import("../../src/moves/sufferDialog.js");
    const actor = table.client("gm-1").run(() => game.actors.get("pc-kira"));
    const results = await table.client("gm-1").run(() =>
      runSufferResolution([{ kind: "route", route: "swear_an_iron_vow", resolvesAs: "strong_hit" }], actor, {}));
    await settled();
    expect(results).toEqual([{ kind: "route", route: "swear_an_iron_vow", rank: undefined }]);
    expect(reminders()).toHaveLength(1);
    expect(needCard()).toBeNull();
  }, 60_000);

  it("the need card's three states", async () => {
    const { buildSojournNeedHtml } = await import("../../src/moves/sojournNeed.js");
    const open = buildSojournNeedHtml({ actorName: "Kira <i>" });
    expect(open).toContain('data-action="sf-sojourn-need-swear"');
    expect(open).toContain('data-action="sf-sojourn-need-done"');
    expect(open).toContain('<option value="dangerous" selected>dangerous</option>');
    expect(open).toContain("Kira &lt;i&gt;'s sheet");
    const written = buildSojournNeedHtml({ actorName: "Kira", vowId: "v1", vowName: 'Free "Ash"' });
    expect(written).toContain("&quot;Ash&quot;");
    expect(written).not.toContain("sf-sojourn-need-swear");
    expect(written).toContain("sf-sojourn-need-done");
    const resolved = buildSojournNeedHtml({ actorName: "Kira", resolvedBy: "vow" });
    expect(resolved).toContain("Resolved as a strong hit");
    expect(resolved).not.toContain("<button");
  });

  it("the move card is rewritten once, and a card with no outcome label still says it is a strong hit", async () => {
    const { buildResolvedCardContent } = await import("../../src/moves/sojournNeed.js");
    const rolled = '<div class="sf-move-card"><div class="sf-move-outcome">Miss ✦ Match</div><div class="sf-move-match">dire</div>'
      + '<div class="sf-move-effect">Choose…</div></div>';
    const once = buildResolvedCardContent(rolled, "vow");
    expect(once).toContain('<div class="sf-move-outcome sf-move-outcome--struck"><s>Miss ✦ Match</s></div>');
    expect(once).toContain("sf-move-match--struck");
    expect(once).toContain("sf-move-effect--struck");
    expect(buildResolvedCardContent(once, "done")).toBe(once);
    expect(buildResolvedCardContent("<div>bare</div>", "done")).toContain("✦ Resolved as a strong hit — the community's need was met.");
  });

  it("the narrator's MOVE OUTCOME names the miss, how it was answered, and the strong hit", () => {
    const line = buildLoremasterContext({ moveName: "Sojourn", statUsed: null, rollKind: "action", challengeDice: [], needAnswered: "vow",
      outcomeLabel: "Strong Hit", isMatch: false, consequences: { otherEffect: "Safe refuge." } });
    expect(line).toBe("[MOVE: Sojourn] [ROLL: A miss, resolved as a strong hit — an iron vow was sworn to see the community's need done] "
      + "[OUTCOME: Strong Hit] [CONSEQUENCE: Safe refuge.]");
  });

  it("a miss narrated after the need was picked is told the refuge is not given yet, and when it will be", () => {
    const declined = formatPriceChoiceBlock({ price: "You waste resources", stated: false, instead: "swear_an_iron_vow", status: "declined" });
    expect(declined).toContain("no price is paid.");
    expect(declined).toContain("the refuge not yet given");
    expect(declined).toContain("resolved as a strong hit — the refuge it wins is told then");
  });
});
