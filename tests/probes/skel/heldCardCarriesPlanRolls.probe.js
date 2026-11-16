/**
 * SKEL — HELD-CARD-CARRIES-PLAN-ROLLS  (LEAK)
 *
 * Scenario: a player rolls Undertake an Expedition and gets a weak hit that
 * momentum could burn to a strong hit. The move begins the expedition's
 * track, which asks its narration to plan the expedition from hidden oracle
 * rolls — two Space Sightings for its waypoints and an Action + Theme for
 * "what waits at the end" (resolver.js expeditionPlanRequest; the plan's
 * `oracleSeeds`). In free-flow play the result is held for Burn / Keep
 * (issue #354 P2-10, default on) and the move card is posted to the table.
 *
 * Correct (decisions.md → "The narrative skeleton": "Hidden oracle rolls
 * (decided): GM-only until the plan's truth is revealed … No hidden roll is
 * on a player-visible card or a card's flags"): nothing the table can read
 * carries the plan's rolls.
 *
 * Today: the held card keeps what its wait needs as `flags.awaitingUpgrade`,
 * and that includes the whole resolution (movePipeline.js rollMove:
 * `resolution: jsonCopy(resolution)`) — with `skeletonRequests`, the plan
 * request and its rolls. The card is public (no whisper), so every player's
 * client holds "What waits at the end — Action + Theme: …" before the
 * expedition has taken its first step. (A Batch Mode round keeps the same
 * narration input — `skeletonRequests` and the price's "The new enemy —
 * Character Role / Goal / Disposition" seed lines — in the world setting
 * `batchMode.round`, which every client reads: driver.js rolledInfoFrom →
 * movePipeline.js narrationInputFrom.)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], interpretation: null }));
vi.mock("../../../src/pacing/router.js", async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../../src/moves/interpreter.js", async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: "chat" })),
}));
vi.mock("../../../src/moves/abilityScanner.js", async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock("../../../src/ui/settingsPanel.js", async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
// Challenge dice first (two d10), then the action die (d6), inside the REAL resolveMove.
vi.mock("../../../src/moves/resolver.js", async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, "random");
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from "../../helpers/multiClient.js";
import { scriptClaude } from "../../helpers/faults.js";
import { makeJournal } from "../../helpers/skeletonTable.js";
import { CampaignStateSchema } from "../../../src/schemas.js";

const WEAK   = [0.25, 0.65, 0.5];   // challenge 3, 7; action die 4 — wits 2 is a weak hit; momentum 9 burns to a strong hit
const STRONG = [0.05, 0.15, 0.9];   // challenge 1, 2 — a strong hit: nothing to upgrade, nothing held

/** The plan request's hidden rolls, as resolver.js expeditionPlanRequest words them. */
const HIDDEN_ROLL = /What waits at the end — Action \+ Theme|A waypoint — Space Sighting/;

let table, pc, savedJournalEntry;
const flags = (id) => table.world.message(id).flags[MODULE_ID];

async function roll(dice) {
  control.interpretation = { moveId: "undertake_an_expedition", moveName: "Undertake an Expedition", statUsed: "wits", adds: 0,
    rationale: "test", mischiefApplied: false, moveTarget: "the Gap", expeditionRank: "dangerous" };
  control.dice = dice;
  await table.client("pl-1").chat("We push out into the Gap, sensors wide.", { speaker: { actor: pc.id } });
  await table.settle(); await table.drain();
  return table.cards(f => f.moveResolution).at(-1);
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "s-1", sessionNumber: 1,
      currentSceneId: "sc-1", sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  pc = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, system: { momentum: { value: 9 } } });
  savedJournalEntry = globalThis.JournalEntry;
  globalThis.JournalEntry = { async create(data) { const j = makeJournal(data); globalThis.game.journal._set(j.id, j); return j; } };
  scriptClaude(table, { fallback: () => 'The Gap opens ahead.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
});
afterEach(() => { globalThis.JournalEntry = savedJournalEntry; });

describe("SKEL HELD-CARD-CARRIES-PLAN-ROLLS — a held move card carries no hidden plan roll", () => {
  it("control: a strong hit is not held, and its card carries none of the expedition plan's rolls", async () => {
    const card = await roll(STRONG);
    expect(flags(card._id).moveResolution).toBe(true);
    expect(flags(card._id).awaitingUpgrade).toBeUndefined();
    expect(JSON.stringify(table.world.message(card._id))).not.toMatch(HIDDEN_ROLL);
    // The narration was asked to plan the expedition from those rolls — they went to the narrator alone.
    const asked = table.claude.calls.some(c => HIDDEN_ROLL.test(`${c.system}\n${c.userText}`));
    expect(asked, "the narrator was given the rolls").toBe(true);
  }, 60_000);

  it("a held weak hit's card — posted to the whole table — carries none of them either", async () => {
    const card = await roll(WEAK);
    const message = table.world.message(card._id);
    // The result is held on a public card (the precondition).
    expect(flags(card._id).awaitingUpgrade?.open).toBe(true);
    expect(message.whisper ?? []).toEqual([]);
    // Correct: no hidden roll in anything a player's client is sent with the card.
    expect(JSON.stringify(message.flags), "the held card's flags").not.toMatch(HIDDEN_ROLL);
  }, 60_000);
});
