/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/hiddenPlanRollsOffSharedStores.test.js
 *
 * Issue #362 AC15 HIDDEN-PLAN-ROLLS-ON-HELD-CARD-AND-ROUND. The hidden oracle
 * rolls behind a plan — an expedition's two waypoint sightings and "What
 * waits at the end", a new enemy's Character Role, Goal and Disposition —
 * rode the whole narration input into two stores every client holds: a held
 * result's public move card (`flags.awaitingUpgrade.resolution`) and, in
 * Batch Mode, the round's world setting (`batchMode.round`). decisions.md →
 * "The narrative skeleton": "No hidden roll is on a player-visible card or a
 * card's flags".
 *
 * Fixed: those stores keep the request and the price line — that a plan is
 * owed — and the narration rolls the hidden tables on the GM that narrates it
 * (resolver.js withoutHiddenRolls / withHiddenRolls). The narrator still gets
 * the rolls, and the plan is filed with them.
 *
 * From the probes tests/probes/mova/hiddenPlanRollsOnHeldCard.probe.js,
 * mova/hiddenPlanRollsInRoundSetting.probe.js and
 * batch/roundSettingHoldsHiddenRolls.probe.js, with their controls.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], interpretation: null, ptp: [47] }));
vi.mock("../../src/pacing/router.js", async (original) => ({
  ...(await original()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
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
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});
// The Pay the Price d100, scripted inside the REAL roller (every other table rolls as it does).
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
import { makeJournal, plansOf } from "../helpers/skeletonTable.js";
import { CampaignStateSchema } from "../../src/schemas.js";
import { withoutHiddenRolls, withHiddenRolls } from "../../src/moves/resolver.js";

const NARRATION_MODEL = "claude-sonnet-5-5";
const REPLY = 'The drift opens ahead.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
// The plan's hidden rolls, as resolver.js words them (expeditionPlanRequest, newEnemySeedLines).
const EXPEDITION_ROLL = /What waits at the end — Action \+ Theme: |A waypoint — Space Sighting \(/;
const ENEMY_ROLL      = /The new enemy — Character (Role|Goal|Disposition): /;
const HIDDEN_ROLL     = new RegExp(`${EXPEDITION_ROLL.source}|${ENEMY_ROLL.source}`);

const WEAK   = [0.25, 0.65, 0.5];   // challenge 3, 7; action die 4 + wits 2 = 6: a weak hit — momentum 9 burns it
const STRONG = [0.05, 0.15, 0.9];   // challenge 1, 2: a strong hit — nothing to hold
const MISS   = [0.85, 0.95, 0.0];   // challenge 9, 10; action die 1: a miss no momentum here can burn
const KEEP   = '[data-action="sf-keep-result"]';

const EXPEDITION = { moveId: "undertake_an_expedition", moveName: "Undertake an Expedition", statUsed: "wits", adds: 0,
  moveTarget: "the Vault of Tears", expeditionRank: "dangerous", rationale: "test", mischiefApplied: false };
const FACE_DANGER = { moveId: "face_danger", moveName: "Face Danger", statUsed: "edge", adds: 0, rationale: "test", mischiefApplied: false };

let table, restoreJournal, seq = 0;
const flags = (id) => table.world.message(id).flags[MODULE_ID];
const round = () => table.world.getSetting("batchMode.round");
const moveCalls = () => table.claude.calls.filter(c => /MOVE OUTCOME/.test(`${c.userText}`) && !/THIS ROUND/.test(`${c.userText}`));
const promptOf  = (call) => `${call?.system ?? ""}\n${call?.userText ?? ""}`;

/** The "Starforged Progress Tracks" journal: a document-level flag store, as progressTracks.js writes it. */
function makeTracksJournal() {
  const store = {};
  return {
    id: "tracks-journal", name: "Starforged Progress Tracks",
    getFlag: (mod, key) => store[`${mod}.${key}`],
    setFlag: async (mod, key, value) => { store[`${mod}.${key}`] = JSON.parse(JSON.stringify(value)); },
  };
}

async function resetTable(settings = {}) {
  control.ptp = [47];   // Pay the Price 45–50: "A new enemy is revealed"
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false, ...settings,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "ac15-s1", sessionNumber: 1,
      currentSceneId: "ac15-scene", sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  // Momentum 9: a weak hit against 3 and 7 can be burned to a strong hit, so free-flow holds it.
  table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, items: { contents: [] }, system: { momentum: { value: 9 } } });
  table.addActor({ id: "pc-ren", name: "Ren", ownership: { "pl-2": 3 }, items: { contents: [] } });
  table.journal._set(makeTracksJournal());
  const saved = globalThis.JournalEntry;
  globalThis.JournalEntry = { async create(data) { const j = makeJournal(data); globalThis.game.journal._set(j.id, j); return j; } };
  restoreJournal = () => { globalThis.JournalEntry = saved; };
  scriptClaude(table, { fallback: () => REPLY });
  silenceConsoleErrors();
}

/** Kira's line, read as `interpretation` and rolled with `dice`: her move card. */
async function chatMove(interpretation, dice, line = "We set out across the drift for the Vault of Tears.") {
  control.interpretation = interpretation;
  control.dice = dice;
  await table.client("pl-1").chat(line, { speaker: { actor: "pc-kira" } });
  await table.settle(); await table.drain();
  return table.cards(f => f.moveResolution).at(-1);
}

/** Every flag of a chat message as a PLAYER's client holds it, as text. */
const playerSeesFlags = (id, user = "pl-2") => JSON.stringify(table.client(user).run(() => game.messages.get(id)?.flags ?? null));

async function relay(userId, kind, payload) {
  const c = table.client(userId);
  const gmRelay = await c.import("../../src/multiplayer/gmRelay.js");
  const res = await c.run(() => gmRelay.requestGmAction(kind, payload));
  await table.settle();
  return res;
}

/** One Batch Mode round: Kira's line read as `interpretation`, rolled with `dice`; the round as stored while its narration is in flight. */
async function roundWhileNarrating(line, interpretation, dice) {
  control.interpretation = interpretation;
  control.dice = dice;
  const writes = [];
  table.interceptWrites((w) => { if (w.kind === "setting" && /batchMode\.round$/.test(w.key)) writes.push(JSON.stringify(w.value)); });
  const held = scriptClaude(table, { fallback: () => REPLY }).hold(c => c.model === NARRATION_MODEL);
  await table.client("gm-1").setSetting("batchMode.enabled", true);
  await table.settle();
  const submissionId = `sub-ac15-${++seq}`;
  await relay("pl-1", "batch.submit", { roundId: round().id, text: line, submissionId });
  await relay("pl-1", "batch.confirm", { roundId: round().id, submissionId, choices: {} });
  await relay("pl-2", "batch.pass", { roundId: round().id });
  await held.arrived;
  const stored = structuredClone(round());
  const onRensClient = JSON.stringify(await table.client("pl-2").getSetting("batchMode.round"));
  const prompt = promptOf(table.claude.calls.at(-1));
  held.release(REPLY);
  await table.drain();
  return { stored, onRensClient, prompt, writes };
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 60_000);
afterAll(() => table?.teardown());
beforeEach(async () => { await resetTable(); });
afterEach(() => restoreJournal?.());

describe("issue #362 AC15 — a held result's public card carries no hidden plan roll", () => {
  it("control: a strong hit is narrated at once — its narration is given the plan's rolls, and no card's flags carry them", async () => {
    const card = await chatMove(EXPEDITION, STRONG);
    expect(flags(card._id).awaitingUpgrade).toBeUndefined();
    expect(promptOf(moveCalls().at(-1)), "the narration is asked to plan the expedition").toMatch(EXPEDITION_ROLL);
    for (const message of table.cards(() => true)) {
      expect(JSON.stringify(message.flags ?? {}), `card ${message._id}`).not.toMatch(HIDDEN_ROLL);
    }
  }, 60_000);

  it("a held weak hit: no player's client is handed the plan's rolls in the move card's flags", async () => {
    const card = await chatMove(EXPEDITION, WEAK);
    expect(flags(card._id).awaitingUpgrade?.open, "the burnable weak hit is held (setup)").toBe(true);
    expect(table.world.message(card._id).whisper ?? [], "the move card is public (setup)").toEqual([]);
    // The card says a plan is owed — about the expedition's track — and holds none of its rolls.
    expect(flags(card._id).awaitingUpgrade.resolution.skeletonRequests).toEqual([
      expect.objectContaining({ kind: "expedition", subject: expect.objectContaining({ type: "track" }), oracleSeeds: [] }),
    ]);
    expect(JSON.stringify(flags(card._id))).not.toMatch(HIDDEN_ROLL);
    expect(playerSeesFlags(card._id, "pl-1")).not.toMatch(HIDDEN_ROLL);
    expect(playerSeesFlags(card._id, "pl-2")).not.toMatch(HIDDEN_ROLL);
  }, 60_000);

  it("kept: the narration — on the GM — is given the rolls, the plan is filed with them, and the settled card still holds none", async () => {
    const card = await chatMove(EXPEDITION, WEAK);
    await table.client("pl-1").click(card._id, KEEP);
    await table.settle(); await table.drain();
    expect(flags(card._id).awaitingUpgrade).toMatchObject({ open: false, resolvedBy: "keep" });

    expect(promptOf(moveCalls().at(-1))).toMatch(EXPEDITION_ROLL);
    const plans = plansOf(table).filter(p => p.kind === "expedition");
    expect(plans).toHaveLength(1);
    expect((plans[0].oracleSeeds ?? []).join(" | ")).toMatch(EXPEDITION_ROLL);
    expect(playerSeesFlags(card._id)).not.toMatch(HIDDEN_ROLL);
  }, 60_000);
});

describe("issue #362 AC15 — a Batch Mode round (a world setting) carries no hidden plan roll", () => {
  it("control: a Face Danger strong hit — the round keeps the entry's outcome for its narration, and no hidden roll", async () => {
    const { stored } = await roundWhileNarrating("I slip through the vent before the drones turn.", FACE_DANGER, STRONG);
    expect(stored.phase).toBe("narrating");
    expect(stored.entries["pl-1"].rolled.narrationInput).toMatchObject({ moveId: "face_danger", outcome: "strong_hit" });
    expect(JSON.stringify(stored)).not.toMatch(HIDDEN_ROLL);
  }, 60_000);

  it("an expedition begun in the round: its plan's rolls reach the narrator, not the world setting", async () => {
    const { stored, onRensClient, prompt, writes } = await roundWhileNarrating("We set out across the drift for the Vault of Tears.", EXPEDITION, STRONG);
    expect(stored.entries["pl-1"].rolled.narrationInput, "the entry was rolled (setup)").toMatchObject({ moveId: "undertake_an_expedition", outcome: "strong_hit" });
    expect(stored.entries["pl-1"].rolled.narrationInput.skeletonRequests).toEqual([
      expect.objectContaining({ kind: "expedition", oracleSeeds: [] }),
    ]);
    expect(prompt, "the round's narration is asked to plan the expedition").toMatch(EXPEDITION_ROLL);
    expect(JSON.stringify(stored)).not.toMatch(HIDDEN_ROLL);
    expect(onRensClient).not.toMatch(HIDDEN_ROLL);
    expect(writes.filter(json => HIDDEN_ROLL.test(json))).toEqual([]);
    const plans = plansOf(table).filter(p => p.kind === "expedition");
    expect(plans).toHaveLength(1);
    expect((plans[0].oracleSeeds ?? []).join(" | ")).toMatch(EXPEDITION_ROLL);
  }, 60_000);

  it("a price that reveals a new enemy: its role, goal and disposition reach the narrator, not the world setting — the price line does", async () => {
    const { stored, onRensClient, prompt, writes } = await roundWhileNarrating("I slip through the vent before the drones turn.", FACE_DANGER, MISS);
    expect(stored.entries["pl-1"].rolled.narrationInput, "the entry missed (setup)").toMatchObject({ moveId: "face_danger", outcome: "miss" });
    expect(table.cards(f => f.payThePriceCard).at(-1)?.content, "the price revealed a new enemy (setup)").toContain("A new enemy is revealed");
    expect(prompt, "the round's narration is given the enemy's rolls").toMatch(ENEMY_ROLL);
    // The price itself is the table's: its card shows it, and the round keeps it.
    expect(JSON.stringify(stored)).toContain("Pay the Price: A new enemy is revealed");
    expect(JSON.stringify(stored)).not.toMatch(HIDDEN_ROLL);
    expect(onRensClient).not.toMatch(HIDDEN_ROLL);
    expect(writes.filter(json => HIDDEN_ROLL.test(json))).toEqual([]);
  }, 60_000);

  it("control: a price that reveals nothing hidden puts no hidden roll on the round — and the round still narrates it", async () => {
    control.ptp = [78];   // "You are harmed"
    const { stored, prompt } = await roundWhileNarrating("I slip through the vent before the drones turn.", FACE_DANGER, MISS);
    expect(JSON.stringify(stored)).toContain("Pay the Price: You are harmed");
    expect(JSON.stringify(stored)).not.toMatch(HIDDEN_ROLL);
    expect(prompt).toContain("Pay the Price: You are harmed");
    expect(prompt).not.toMatch(ENEMY_ROLL);
  }, 60_000);
});

describe("issue #362 AC15 — withoutHiddenRolls / withHiddenRolls (pure)", () => {
  const request = { ref: "plan-r1-expedition", kind: "expedition", trigger: "expedition", label: "the expedition to the Gap",
    subject: { type: "track", id: "trk-1", name: "the Gap" },
    oracleSeeds: ["A waypoint — Space Sighting (Terminus): Debris", "What waits at the end — Action + Theme: Guard / Secret"] };
  const seeds = { results: ["What you learn — Story Clue: a sigil", "Pay the Price: A new enemy is revealed",
    "The new enemy — Character Role: Scout", "The new enemy — Character Goal: Find a home"], names: [], context: "face_danger" };

  it("drops an expedition request's seeds and a new enemy's rolls — keeping the request, the price and the outcome's own seeds", () => {
    const input = { moveId: "face_danger", oracleSeeds: seeds, skeletonRequests: [request] };
    const out = withoutHiddenRolls(input);
    expect(out.skeletonRequests).toEqual([{ ...request, oracleSeeds: [] }]);
    expect(out.oracleSeeds.results).toEqual(["What you learn — Story Clue: a sigil", "Pay the Price: A new enemy is revealed"]);
    expect(input.skeletonRequests[0].oracleSeeds).toHaveLength(2);   // a new object: the input is not changed
    expect(input.oracleSeeds.results).toHaveLength(4);
  });

  it("rolls what a dropped input owes — after the price line — and leaves an input that owes nothing as it is", () => {
    const owed = withHiddenRolls(withoutHiddenRolls({ oracleSeeds: seeds, skeletonRequests: [request] }), null);
    expect(owed.skeletonRequests[0].oracleSeeds.join(" | ")).toMatch(EXPEDITION_ROLL);
    expect(owed.oracleSeeds.results[0]).toBe("What you learn — Story Clue: a sigil");
    expect(owed.oracleSeeds.results[1]).toBe("Pay the Price: A new enemy is revealed");
    expect(owed.oracleSeeds.results.slice(2).every(l => ENEMY_ROLL.test(l))).toBe(true);
    expect(owed.oracleSeeds.results.length).toBeGreaterThan(2);

    const full = { oracleSeeds: seeds, skeletonRequests: [request] };
    expect(withHiddenRolls(full, null)).toBe(full);
    const plain = { oracleSeeds: { results: ["Pay the Price: You are harmed"], names: [], context: "face_danger" } };
    expect(withHiddenRolls(plain, null)).toBe(plain);
    expect(withHiddenRolls(null)).toBeNull();
  });
});
