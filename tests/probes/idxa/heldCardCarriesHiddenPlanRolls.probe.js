/**
 * PROBE — IDXA-03 · HELD-CARD-FLAGS-CARRY-HIDDEN-PLAN-ROLLS
 *
 * Scenario (free-flow, "Ask before paying and narrating" on — the default):
 * Kira's first Undertake an Expedition toward "the Gap" is a weak hit her
 * momentum could burn, so the result is held (issue #354 P2-10). The roll began
 * the expedition, so the rolled resolution carries the request for its hidden
 * plan (issue #353 Phase 3, resolver.js expeditionPlanRequest): two Space
 * Sightings (its waypoints) and an Action + Theme ("What waits at the end").
 *
 * Correct: a plan's oracle rolls are GM-only until its truth is revealed
 * (decisions.md → the narrative skeleton: "decided: hidden until revealed";
 * the plan itself is filed in the GM-only Secrets journal; the world setting
 * that shows hidden rolls at once is off by default). Nothing a player's
 * client receives holds them.
 *
 * Today: the held move card — a public chat message — keeps the whole rolled
 * resolution in its flags (movePipeline.js rollMove: `awaitingUpgrade.resolution
 * = jsonCopy(resolution)`), `skeletonRequests` and their `oracleSeeds` included,
 * and closing the wait only flips `open`: every client holds the expedition's
 * waypoint and ending rolls from the moment of the roll, for the life of the card.
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
import { makeJournal, plansOf } from "../../helpers/skeletonTable.js";
import { CampaignStateSchema } from "../../../src/schemas.js";

const REPLY = 'The drive spools and the stars slide.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const WEAK  = [0.25, 0.65, 0.5];   // challenge 3, 7; action die 4 — wits 2 is a weak hit; momentum 9 could burn it
const KEEP  = '[data-action="sf-keep-result"]';
// What expeditionPlanRequest's seeds read as.
const HIDDEN_ROLLS = /Space Sighting|What waits at the end/;

let table, restoreJournal;

async function resetTable(settings = {}) {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, ...settings,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "exp-s1", sessionNumber: 1,
      currentSceneId: "exp-scene", sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, system: { momentum: { value: 9 } } });
  const saved = globalThis.JournalEntry;
  globalThis.JournalEntry = { async create(data) { const j = makeJournal(data); globalThis.game.journal._set(j.id, j); return j; } };
  restoreJournal = () => { globalThis.JournalEntry = saved; };
  scriptClaude(table, { fallback: () => REPLY });
}

async function beginExpedition() {
  control.interpretation = { moveId: "undertake_an_expedition", moveName: "Undertake an Expedition", statUsed: "wits",
    adds: 0, rationale: "test", mischiefApplied: false, moveTarget: "the Gap", expeditionRank: "dangerous" };
  control.dice = WEAK;
  await table.client("pl-1").chat("We leave the lanes and strike out for the Gap.", { speaker: { actor: "pc-kira" } });
  await table.settle(); await table.drain();
  return table.cards(f => f.moveResolution).at(-1);
}

/** Every flag of a chat message as the PLAYER's client holds it, as text. */
const playerSeesFlags = (id) => JSON.stringify(table.client("pl-1").run(() => game.messages.get(id)?.flags ?? null));

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
afterEach(() => restoreJournal?.());

describe("IDXA-03 — a held move card gives no client the expedition plan's hidden oracle rolls", () => {
  it("control: with the hold off, the plan is filed with its rolls in the Secrets journal, and the move card's flags hold none of them", async () => {
    await resetTable({ holdResultForUpgrade: false });
    const card = await beginExpedition();
    const [plan] = plansOf(table).filter(p => p.kind === "expedition");
    expect(plan, "the expedition's plan was filed (setup)").toBeTruthy();
    expect((plan.oracleSeeds ?? []).join(" | ")).toMatch(HIDDEN_ROLLS);
    expect(playerSeesFlags(card._id)).not.toMatch(HIDDEN_ROLLS);
  }, 30_000);

  it("held: the player's client is not handed the plan's rolls in the move card's flags", async () => {
    await resetTable();
    const card = await beginExpedition();
    // The card is the player's to read and press (setup): it is held, and the player's client has it.
    const seen = table.client("pl-1").run(() => game.messages.get(card._id)?.flags?.[MODULE_ID] ?? null);
    expect(seen?.awaitingUpgrade?.open).toBe(true);

    expect(playerSeesFlags(card._id)).not.toMatch(HIDDEN_ROLLS);
  }, 30_000);

  it("kept: the settled card still holds none of them", async () => {
    await resetTable();
    const card = await beginExpedition();
    await table.client("pl-1").click(card._id, KEEP);
    await table.settle(); await table.drain();
    expect(table.world.message(card._id).flags[MODULE_ID].awaitingUpgrade).toMatchObject({ open: false, resolvedBy: "keep" });

    expect(playerSeesFlags(card._id)).not.toMatch(HIDDEN_ROLLS);
  }, 30_000);
});
