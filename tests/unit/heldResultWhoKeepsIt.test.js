/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/heldResultWhoKeepsIt.test.js
 *
 * Issue #362 D5 HELD-RESULT-WHO-KEEPS-IT — decided A (maintainer
 * 2026-11-17): "a held result is kept only by the roller's own player's
 * line/action (sheet roll and !ptp/!oracle keep it first); held results
 * settled at End a Session and when Batch Mode is switched on." With issue
 * #362 AC32 HELD-RESULT-OUTLIVES-ROUND-ENTRY, which D5 settles.
 *
 * Before:
 *   - a GM's typed line resolved to the first PC (speaker.js — a GM owns
 *     every PC) and kept that PC's held result — paid its price, narrated it
 *     — while its player was still choosing Burn or Keep (PIPE D1, IDXA);
 *   - a move rolled for the roller by another hand kept it only after that
 *     move was recorded, un-awaited — narrated out of order;
 *   - the roller's sheet roll, `!ptp` or `!oracle` was narrated while the
 *     result still waited (IDXB D4);
 *   - a result held across End a Session was paid and narrated by its
 *     roller's first line of the next session (PIPE D2);
 *   - in Batch Mode a line is table talk: a result held when the mode was
 *     switched on stayed unpaid, un-narrated and burnable while the round told
 *     the next beat (AC32), and a round's entry kept one only after the fact.
 *
 * On a booted table (tests/helpers/multiClient.js), as
 * tests/unit/heldResultBeforePrice.test.js.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], interpretation: null, ptp: [78], pace: null }));
vi.mock("../../src/pacing/router.js", async (original) => ({
  ...(await original()),
  routePacedInput: vi.fn(async ({ playerText }) => control.pace(playerText)),
  decidePacing: vi.fn(async ({ playerText }) => control.pace(playerText)),
}));
vi.mock("../../src/moves/interpreter.js", async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: "chat" })),
}));
vi.mock("../../src/moves/abilityScanner.js", async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock("../../src/ui/settingsPanel.js", async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock("../../src/entities/entityExtractor.js", async (original) => ({
  ...(await original()),
  runCombinedDetectionPass: vi.fn(async () => ({ worldJournal: [], entities: [], renames: [] })),
  appendGenerativeTierUpdates: vi.fn(async () => {}),
}));
// Challenge dice first (two d10), then the action die (d6), inside the REAL resolveMove.
vi.mock("../../src/moves/resolver.js", async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, "random");
    for (const value of (Array.isArray(control.dice[0]) ? control.dice.shift() : control.dice)) rng.mockReturnValueOnce(value);
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

let table, kira, seq = 0;
const flags      = (id) => table.world.message(id).flags[MODULE_ID];
const narrations = () => table.cards(f => f.narratorCard && !f.narrationFallback);
const priceCards = () => table.cards(f => f.payThePriceCard);
const order      = () => narrations().map(c => c.flags[MODULE_ID].roundId ? "round" : (c.flags[MODULE_ID].outcome ?? c.flags[MODULE_ID].moveId ?? "oracle"));
const round      = () => table.world.getSetting("batchMode.round");

const MISS   = [0.55, 0.65, 0.1];   // challenge 6, 7; action die 1 — a miss momentum 9 burns to a strong hit: held
const STRONG = [0.05, 0.15, 0.9];   // challenge 1, 2 — a strong hit: nothing to hold
const FACE_DANGER = { moveId: "face_danger", moveName: "Face Danger", statUsed: "edge", adds: 0, rationale: "risky", mischiefApplied: false };
const MOVE      = { runMove: true, decision: "MOVE", suggestedMove: null };
const NARRATIVE = { runMove: false, decision: "NARRATIVE", suggestedMove: null, suggestedTargetId: null };

/** A chat line on `user`'s client — the move it is read as, rolled with `dice`. */
async function say(user, text, { dice = MISS, speaker = undefined } = {}) {
  control.interpretation = { ...FACE_DANGER };
  control.dice = dice;
  await table.client(user).chat(text, speaker === undefined ? {} : { speaker });
  await table.settle(); await table.drain();
}

/** Kira's player rolls a burnable miss: held. */
async function kirasHeldMiss() {
  await say("pl-1", "I slip through the vent before the drones turn.", { speaker: { actor: kira.id } });
  const card = table.cards(f => f.moveResolution).at(-1);
  expect(flags(card._id).awaitingUpgrade, "setup: the miss is held").toMatchObject({ open: true });
  expect(priceCards(), "setup: nothing paid yet").toEqual([]);
  expect(narrations(), "setup: nothing narrated yet").toEqual([]);
  return card;
}

async function relay(userId, kind, payload) {
  const c = table.client(userId);
  const gmRelay = await c.import("../../src/multiplayer/gmRelay.js");
  const res = await c.run(() => gmRelay.requestGmAction(kind, payload));
  await table.settle();
  return res;
}

async function reset({ kiraOwner = "pl-1" } = {}) {
  control.pace = (text) => (/^(Take your time|I keep watch|Easy)/.test(text) ? NARRATIVE : MOVE);
  control.ptp = [78];   // Pay the Price 78: "You are harmed" — Endure Harm (-1)
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "d5-s1", sessionNumber: 1,
      currentSceneId: "d5-scene", sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-gina");
  kira = table.addActor({ id: "pc-kira", name: "Kira", ownership: kiraOwner ? { [kiraOwner]: 3 } : {}, items: { contents: [
    { id: "vow-1", type: "progress", name: "Find Chen", system: { subtype: "vow", rank: "dangerous", current: 4 }, flags: {} },
  ] }, system: { momentum: { value: 9 } } });
  table.addActor({ id: "pc-ren", name: "Ren", ownership: { "pl-2": 3 }, items: { contents: [] }, system: { momentum: { value: 9 } } });
  scriptClaude(table, { fallback: () => 'The moment turns.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  silenceConsoleErrors();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 60_000);
afterAll(() => table?.teardown());
beforeEach(async () => { await reset(); });

describe("issue #362 D5 — only the roller's own line keeps their held result", () => {
  it("a GM's typed line, read as the first PC's, leaves that player's held result waiting", async () => {
    const card = await kirasHeldMiss();
    await say("gm-1", "Take your time deciding, Kira.");
    expect(flags(card._id).awaitingUpgrade).toMatchObject({ open: true });
    expect(priceCards()).toEqual([]);
    expect(kira.system.health.value).toBe(5);
    expect(narrations()).toEqual([]);
  }, 60_000);

  it("control: her own player's next line keeps it first — two narrations, in order", async () => {
    const card = await kirasHeldMiss();
    await say("pl-1", "I push on through the hatch.", { dice: STRONG, speaker: { actor: kira.id } });
    expect(flags(card._id).awaitingUpgrade).toMatchObject({ open: false, resolvedBy: "later" });
    expect(kira.system.health.value).toBe(4);
    expect(order()).toEqual(["miss", "strong_hit"]);
  }, 60_000);

  it("control: a GM's line spoken as the roller (her token selected) keeps it", async () => {
    const card = await kirasHeldMiss();
    await say("gm-1", "Easy — Kira breathes and steadies.", { speaker: { actor: kira.id } });
    expect(flags(card._id).awaitingUpgrade).toMatchObject({ open: false, resolvedBy: "later" });
    expect(priceCards()).toHaveLength(1);
  }, 60_000);

  it("control: a GM's line for a PC no player owns (a GM-run PC, solo play) keeps it", async () => {
    await reset({ kiraOwner: null });
    await say("gm-1", "Kira slips through the vent before the drones turn.");
    const card = table.cards(f => f.moveResolution).at(-1);
    expect(flags(card._id).awaitingUpgrade, "setup: the GM-run PC's miss is held").toMatchObject({ open: true });
    await say("gm-1", "Easy — she breathes and steadies.");
    expect(flags(card._id).awaitingUpgrade).toMatchObject({ open: false, resolvedBy: "later" });
  }, 60_000);

  it("a GM's line rolled as a move for the roller keeps her held result first — in order, before that move's narration", async () => {
    const card = await kirasHeldMiss();
    await say("gm-1", "Kira kicks the hatch open.", { dice: STRONG });
    expect(table.cards(f => f.moveResolution).at(-1).flags[MODULE_ID].actorId, "setup: the GM's line rolled as Kira").toBe(kira.id);
    expect(flags(card._id).awaitingUpgrade).toMatchObject({ open: false, resolvedBy: "later" });
    expect(order()).toEqual(["miss", "strong_hit"]);
  }, 60_000);
});

describe("issue #362 D5 — the roller's sheet roll and !ptp keep it first", () => {
  it("her `!ptp`: the held miss is paid and narrated before the price she rolled is", async () => {
    const card = await kirasHeldMiss();
    await table.client("pl-1").chat("!ptp", { speaker: { actor: kira.id } });
    await table.settle(); await table.drain();
    expect(flags(card._id).awaitingUpgrade).toMatchObject({ open: false, resolvedBy: "later" });
    const kinds = narrations().map(c => (c.flags[MODULE_ID].resolutionId ? "held" : "ptp"));
    expect(kinds).toEqual(["held", "ptp"]);
  }, 60_000);

  it("her sheet roll: the held miss is narrated before the roll on her sheet is", async () => {
    const card = await kirasHeldMiss();
    const roll = { preRollOptions: { progress: { source: "Find Chen", value: 1 }, actorId: kira.id }, rawChallengeDiceValues: [5, 8] };
    const json = JSON.stringify(roll).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    await table.client("pl-1").run(() => globalThis.ChatMessage.create({
      content: `<article class='ironsworn-roll' data-ironswornroll='${json}'><h3>Progress Roll: Find Chen</h3></article>`,
      speaker: { actor: kira.id, alias: "Kira" }, rolls: [{ formula: "{d10,d10}", total: 0 }],
    }));
    await table.settle(); await table.drain();
    expect(flags(card._id).awaitingUpgrade).toMatchObject({ open: false, resolvedBy: "later" });
    expect(narrations().map(c => c.flags[MODULE_ID].moveId)).toEqual(["face_danger", "fulfill_your_vow"]);
  }, 60_000);
});

describe("issue #362 D5 — every held result is kept as a session ends and as Batch Mode begins", () => {
  it("End a Session keeps it — paid and narrated into the session it was rolled in — before the session ends", async () => {
    const card = await kirasHeldMiss();
    await relay("gm-1", "session.end", { questFocus: "", connectionFocus: "" });
    await table.drain();
    expect(flags(card._id).awaitingUpgrade).toMatchObject({ open: false, resolvedBy: "session-end" });
    expect(kira.system.health.value).toBe(4);
    const [told] = narrations();
    expect(told?.flags[MODULE_ID]).toMatchObject({ outcome: "miss", sessionId: "d5-s1" });
    expect(table.world.campaignState().sessionActive).toBe(false);
    // Its card says what kept it (issue #362 AC82's line).
    expect(table.client("pl-2").render(card._id).querySelector(".sf-keep-result-settled")?.textContent).toBe("Kept as the session ended.");
  }, 60_000);

  it("Batch Mode switched on keeps it before the first round — the round's no-roll entry is narrated after it (AC32)", async () => {
    const card = await kirasHeldMiss();
    await table.client("gm-1").setSetting("batchMode.enabled", true);
    await table.settle(); await table.drain();
    expect(flags(card._id).awaitingUpgrade).toMatchObject({ open: false, resolvedBy: "batch-mode" });
    expect(priceCards()).toHaveLength(1);
    expect(kira.system.health.value).toBe(4);
    expect(table.client("pl-2").render(card._id).querySelector(".sf-keep-result-settled")?.textContent).toBe("Kept as Batch Mode was switched on.");

    await relay("pl-2", "batch.pass", { roundId: round().id });
    const submissionId = `sub-d5-${++seq}`;
    await relay("pl-1", "batch.submit", { roundId: round().id, text: "I keep watch at the door.", submissionId });
    await relay("pl-1", "batch.confirm", { roundId: round().id, submissionId, choices: {} });
    await table.drain();
    expect(order()).toEqual(["miss", "round"]);
  }, 60_000);

  it("a round keeps an acting player's held result before it rolls — one held while they sat a round out (AC32)", async () => {
    // Ren's player is away: Ren is in no round, so a card move of his runs as free-flow, and is held.
    await table.leave("pl-2");
    await table.client("gm-1").setSetting("batchMode.enabled", true);
    await table.settle();
    control.interpretation = { ...FACE_DANGER };
    control.dice = MISS;
    await table.client("gm-1").run(() => globalThis.ChatMessage.create({
      content: "Ren slips through the vent before the drones turn.", speaker: { actor: "pc-ren" },
      flags: { [MODULE_ID]: { bypassPacing: true, forcedMoveId: "face_danger" } },
    }));
    await table.settle(); await table.drain();
    const card = table.cards(f => f.moveResolution && f.actorId === "pc-ren").at(-1);
    expect(card && flags(card._id).awaitingUpgrade, "setup: Ren's free-flow miss is held").toMatchObject({ open: true });

    // He comes back and acts in the next round, with no roll.
    await relay("pl-1", "batch.pass", { roundId: round().id });
    await table.drain();
    await table.join("pl-2");
    await table.settle(); await table.drain();
    expect(round()?.entries?.["pl-2"], "setup: Ren is in the next round").toBeTruthy();
    await relay("pl-1", "batch.pass", { roundId: round().id });
    const submissionId = `sub-d5-${++seq}`;
    await relay("pl-2", "batch.submit", { roundId: round().id, text: "I keep watch at the door.", submissionId });
    await relay("pl-2", "batch.confirm", { roundId: round().id, submissionId, choices: {} });
    await table.drain();

    expect(flags(card._id).awaitingUpgrade).toMatchObject({ open: false, resolvedBy: "later" });
    expect(order()).toEqual(["miss", "round"]);
  }, 60_000);
});
