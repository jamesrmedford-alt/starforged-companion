/**
 * MOVA-08 (second surface) · HIDDEN-PLAN-ROLLS-IN-ROUND-SETTING (LEAK)
 *
 * Scenario: Batch Mode. A player's entry is rolled when the round resolves:
 *   (a) an Undertake an Expedition hit that begins an expedition — its plan
 *       request carries two Space Sightings and "What waits at the end —
 *       Action + Theme: …" (resolver.expeditionPlanRequest, issue #353 Phase 3);
 *   (b) a Face Danger miss whose Pay the Price is "A new enemy is revealed" —
 *       its seed carries the enemy's Character Role, Goal and Disposition
 *       (resolver.priceSeedLines / newEnemySeedLines, issue #353 Phase 0:
 *       "rolled there, on the narrating client, and never put on the raw card
 *       the table reads").
 * Both are a plan's hidden oracle rolls: "GM-only until the plan's truth is
 * revealed … No hidden roll is on a player-visible card or a card's flags"
 * (decisions.md → "The narrative skeleton").
 *
 * Correct: the round — a WORLD setting, sent to every client — does not carry
 * them.
 *
 * Today: the rolled entry keeps what its narration needs
 * (movePipeline.narrationInputFrom: `oracleSeeds`, `skeletonRequests`) on the
 * round itself (`batchMode.round` → entries[user].rolled.narrationInput), so
 * every player's client holds the enemy's role, goal and disposition, and the
 * expedition's end, from the roll until the next round opens.
 *
 * Production path: a Batch Mode round on a booted GM + two-player table —
 * the real round driver, move pipeline, resolver, outcome effects and Pay the
 * Price poster. Scripted: the pacing decision, the interpretation, the scan,
 * the dice and the d100; the round's narration is held so the round can be
 * read as the players' clients have it while it resolves.
 */

/* global silenceConsoleErrors, structuredClone */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ interpret: null, dice: [], ptp: [47] }));
vi.mock("../../../src/pacing/router.js", async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
    decidePacing: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
  };
});
vi.mock("../../../src/moves/interpreter.js", async (importOriginal) => {
  const original = await importOriginal();
  return { ...original, interpretMove: vi.fn(async (text) => ({ ...control.interpret, playerNarration: text, inputMethod: "chat" })) };
});
vi.mock("../../../src/ui/settingsPanel.js", async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));
vi.mock("../../../src/moves/abilityScanner.js", async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock("../../../src/entities/entityExtractor.js", async (importOriginal) => ({
  ...(await importOriginal()),
  runCombinedDetectionPass: vi.fn(async () => ({ worldJournal: [], entities: [], renames: [] })),
  appendGenerativeTierUpdates: vi.fn(async () => {}),
}));
vi.mock("../../../src/moves/resolver.js", async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, "random");
      for (const d of control.dice) dice.mockReturnValueOnce(d);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});
vi.mock("../../../src/oracles/roller.js", async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, rollOracle: (...args) => {
    if (args[0] !== "pay_the_price") return real.rollOracle(...args);
    const rng = vi.spyOn(Math, "random");
    for (const value of control.ptp) rng.mockReturnValueOnce((value - 0.5) / 100);
    try { return real.rollOracle(...args); } finally { rng.mockRestore(); }
  } };
});

import { simulateTable, USERS } from "../../helpers/multiClient.js";
import { scriptClaude } from "../../helpers/faults.js";
import { CampaignStateSchema } from "../../../src/schemas.js";

const NARRATION_MODEL = "claude-sonnet-5-5";
const ROUND_REPLY = 'The drift opens ahead.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const STRONG = [0.25, 0.35, 0.9];   // challenge 3, 4; action die 6: a strong hit
const MISS   = [0.85, 0.95, 0.0];   // challenge 9, 10; action die 1: a miss no momentum here can burn
const EXPEDITION_ROLL = /What waits at the end — Action \+ Theme: |A waypoint — Space Sighting \(/;
const ENEMY_ROLL      = /The new enemy — Character (Role|Goal|Disposition): /;

let table, seq = 0;
const round = () => table.world.getSetting("batchMode.round");

async function relay(userId, kind, payload) {
  const c = table.client(userId);
  const gmRelay = await c.import("../../src/multiplayer/gmRelay.js");
  const res = await c.run(() => gmRelay.requestGmAction(kind, payload));
  await table.settle();
  return res;
}
async function submit(userId, text) {
  await relay(userId, "batch.submit", { roundId: round().id, text, submissionId: `sub-${userId}-${++seq}` });
}
async function confirm(userId) {
  const r = round();
  return relay(userId, "batch.confirm", { roundId: r.id, submissionId: r.entries[userId].submissionId, choices: {} });
}
const pass = (userId) => relay(userId, "batch.pass", { roundId: round().id });

/** One round: pl-1's line is read as `interpretation`, rolled with `dice`; the round as stored while its narration is in flight. */
async function roundWhileNarrating(line, interpretation, dice) {
  control.interpret = interpretation;
  control.dice = dice;
  const held = scriptClaude(table, { fallback: () => ROUND_REPLY }).hold(c => c.model === NARRATION_MODEL);
  await table.client("gm-1").setSetting("batchMode.enabled", true);
  await table.settle();
  await submit("pl-1", line);
  await confirm("pl-1");
  await pass("pl-2");
  await held.arrived;
  const stored = structuredClone(round());
  const prompt = `${table.claude.calls.at(-1)?.system ?? ""}\n${table.claude.calls.at(-1)?.userText ?? ""}`;
  held.release(ROUND_REPLY);
  await table.drain();
  return { stored, prompt };
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 60_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  silenceConsoleErrors();
  control.ptp = [47];   // Pay the Price 47: "A new enemy is revealed"
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "mova8b-s1", sessionNumber: 1,
      currentSceneId: "mova8b-sc", sceneTruths: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-gina");
  table.addActor({ id: "pc-kira-8b", name: "Kira", ownership: { "pl-1": 3 }, items: { contents: [] } });
  table.addActor({ id: "pc-ren-8b",  name: "Ren",  ownership: { "pl-2": 3 }, items: { contents: [] } });
  table.journal._set({ id: "tracks-journal", name: "Starforged Progress Tracks", _flags: {},
    getFlag(mod, key) { return this._flags[`${mod}.${key}`]; },
    async setFlag(mod, key, value) { this._flags[`${mod}.${key}`] = structuredClone(value); } });
});

describe("MOVA-08 — a Batch Mode round (a world setting) does not carry a plan's hidden oracle rolls", () => {
  it("control: a Face Danger strong hit — the round holds the entry's outcome for its narration, and no hidden roll", async () => {
    const { stored } = await roundWhileNarrating("I slip through the vent before the drones turn.",
      { moveId: "face_danger", moveName: "Face Danger", statUsed: "edge", adds: 0, rationale: "r", mischiefApplied: false }, STRONG);
    expect(stored.phase).toBe("narrating");
    expect(stored.entries["pl-1"].rolled.narrationInput).toMatchObject({ moveId: "face_danger", outcome: "strong_hit" });
    expect(JSON.stringify(stored)).not.toMatch(EXPEDITION_ROLL);
    expect(JSON.stringify(stored)).not.toMatch(ENEMY_ROLL);
  }, 60_000);

  it("an expedition begun in the round: its plan's rolls reach the narrator, not the world setting", async () => {
    const { stored, prompt } = await roundWhileNarrating("We set out across the drift for the Vault of Tears.",
      { moveId: "undertake_an_expedition", moveName: "Undertake an Expedition", statUsed: "wits", adds: 0,
        moveTarget: "the Vault of Tears", expeditionRank: "dangerous", rationale: "r", mischiefApplied: false }, STRONG);
    expect(stored.entries["pl-1"].rolled.narrationInput, "the entry was rolled (setup)").toMatchObject({ moveId: "undertake_an_expedition", outcome: "strong_hit" });
    expect(prompt, "the round's narration is asked to plan the expedition (setup)").toMatch(EXPEDITION_ROLL);
    expect(JSON.stringify(stored)).not.toMatch(EXPEDITION_ROLL);
  }, 60_000);

  it("a price that reveals a new enemy: its role, goal and disposition reach the narrator, not the world setting", async () => {
    const { stored, prompt } = await roundWhileNarrating("I slip through the vent before the drones turn.",
      { moveId: "face_danger", moveName: "Face Danger", statUsed: "edge", adds: 0, rationale: "r", mischiefApplied: false }, MISS);
    expect(stored.entries["pl-1"].rolled.narrationInput, "the entry missed (setup)").toMatchObject({ moveId: "face_danger", outcome: "miss" });
    expect(table.cards(f => f.payThePriceCard).at(-1)?.content, "the price revealed a new enemy (setup)").toContain("A new enemy is revealed");
    expect(prompt, "the round's narration is given the enemy's rolls (setup)").toMatch(ENEMY_ROLL);
    expect(JSON.stringify(stored)).not.toMatch(ENEMY_ROLL);
  }, 60_000);
});
