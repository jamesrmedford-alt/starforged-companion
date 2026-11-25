/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/upgradeKeepsExpeditionPlan.test.js
 *
 * Issue #362 AC04 EXPEDITION-PLAN-LOST-ON-UPGRADE. An expedition begun by a
 * weak hit that is then burned or improved to a strong hit never got its
 * hidden plan (decisions.md → "Expedition ↔ progress track: an expedition an
 * Undertake an Expedition begins asks its narration to plan it"): the request
 * rode only the resolution that created the track (index.js
 * applyOutcomeEffects `result.created`), and the upgraded resolution is a new
 * object (burnMomentum.js buildBurnedResolution, improveResult.js
 * buildImprovedResolution).
 *   - held (the default): the weak hit is never narrated, and the burned
 *     result's narration — the move's only one — was not asked;
 *   - holding off: the weak hit's narration filed the plan, the burn took it
 *     back with the narration it struck, and the re-narration did not ask again;
 *   - a Batch Mode round: the upgraded entry's narration input had none.
 *
 * Fixed: the move card's upgrade state carries the roll's plan requests
 * (`move.planRequests`, without their hidden rolls — AC15), and the upgraded
 * resolution takes them; a plan already filed about the subject is not asked
 * for twice.
 *
 * From the probes tests/probes/idxb/expeditionPlanRequestLostOnUpgrade.probe.js,
 * idxa/expeditionPlanLostWhenResultUpgraded.probe.js and
 * nara/upgradeDropsExpeditionPlan.probe.js, with their controls.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";

const control = vi.hoisted(() => ({ interpretation: null, dice: [], abilities: [] }));
vi.mock("../../src/pacing/router.js", async (original) => ({
  ...(await original()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../src/moves/interpreter.js", async (original) => ({
  ...(await original()),
  interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: "chat" })),
}));
vi.mock("../../src/moves/abilityScanner.js", async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => control.abilities),
}));
vi.mock("../../src/ui/settingsPanel.js", async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock("../../src/entities/entityExtractor.js", async (original) => ({
  ...(await original()),
  runCombinedDetectionPass: vi.fn(async () => ({ worldJournal: [], entities: [], renames: [] })),
  appendGenerativeTierUpdates: vi.fn(async () => {}),
}));
vi.mock("../../src/moves/resolver.js", async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, "random");
    for (const d of control.dice) rng.mockReturnValueOnce(d);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude, claudeFault } from "../helpers/faults.js";
import { makeJournal, plansOf } from "../helpers/skeletonTable.js";
import { CampaignStateSchema } from "../../src/schemas.js";

const NARRATION_MODEL = "claude-sonnet-5-5";
const REPLY = 'The stars wheel past.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const REACH = "the Shattered Reach";
const WEAK  = [0.25, 0.65, 0.5];   // challenge 3, 7; action 4 + wits 2 = 6: a weak hit (momentum 9 burns it to a strong hit)
const BURN    = '[data-action="sf-burn-momentum"]';
const IMPROVE = '[data-action="sf-improve-result"]';
const KEEP    = '[data-action="sf-keep-result"]';
const FUGITIVE = [{ assetId: null, assetName: "Fugitive", resultImprovement: { improveTo: "strong_hit" }, hasClock: false }];
// The DECIDE NOW line an expedition's plan request prints (narratorPrompt.js formatSkeletonSection).
const PLAN_LINE = /### DECIDE NOW[\s\S]*the expedition to the Shattered Reach\. Its truth is what waits at the end/;
const PLAN_ROLLS = /What waits at the end — Action \+ Theme: /;
const EXPEDITION = { adds: 0, rationale: "test", mischiefApplied: false,
  moveId: "undertake_an_expedition", moveName: "Undertake an Expedition", statUsed: "wits",
  moveTarget: REACH, expeditionRank: "dangerous" };

let table, tracksStore, savedJournalEntry, claude, seq = 0;

function makeTracksJournal() {
  return {
    id: "tracks-journal", name: "Starforged Progress Tracks",
    getFlag: (mod, key) => tracksStore[`${mod}.${key}`],
    setFlag: async (mod, key, value) => { tracksStore[`${mod}.${key}`] = structuredClone(value); },
  };
}
const expeditions = () => (tracksStore[`${MODULE_ID}.tracks`] ?? []).filter(t => t.type === "expedition");

async function seat({ momentum = 9, settings = {} } = {}) {
  control.abilities = [];
  tracksStore = { [`${MODULE_ID}.tracks`]: [] };
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false, ...settings,
    campaignState: {
      ...CampaignStateSchema, sessionActive: true, currentSessionId: "ac04-s1", sessionNumber: 2,
      currentSceneId: "sc-1", sceneTruths: [],
      // No active sector: the expedition is for no site, so only its track and its plan are in play here.
      sectors: [], activeSectorId: null, settlementIds: [], locationIds: [],
    },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-gina");
  table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, items: { contents: [] },
    system: { momentum: { value: momentum, max: 10, min: -6, resetValue: 2 } } });
  table.addActor({ id: "pc-ren", name: "Ren", ownership: { "pl-2": 3 }, items: { contents: [] } });
  table.journal._set(makeTracksJournal());
  // Journals that keep their pages, so the Secrets journal holds the plans (tests/helpers/skeletonTable.js).
  savedJournalEntry ??= globalThis.JournalEntry;
  globalThis.JournalEntry = { async create(data) { const j = makeJournal(data); globalThis.game.journal._set(j.id, j); return j; } };
  claude = scriptClaude(table, { fallback: () => REPLY });
  silenceConsoleErrors();
}

/** The expedition plans in the Secrets journal that still stand. */
const expeditionPlans = () => plansOf(table).filter(p => p.kind === "expedition" && p.status === "active");

async function undertakeWeak() {
  control.interpretation = { ...EXPEDITION };
  control.dice = WEAK;
  await table.client("pl-1").chat("We push out past the last beacon, toward the Shattered Reach.", { speaker: { actor: "pc-kira" } });
  await table.settle();
  await table.drain();
  return table.cards(f => f.moveResolution).at(-1);
}

async function click(card, selector) {
  await table.client("pl-1").click(card._id, selector);
  await table.settle();
  await table.drain();
}

async function relay(userId, kind, payload) {
  const c = table.client(userId);
  const gmRelay = await c.import("../../src/multiplayer/gmRelay.js");
  const res = await c.run(() => gmRelay.requestGmAction(kind, payload));
  await table.settle();
  return res;
}

// Not the post-narration audit, whose prompt quotes the narration's obligation lines (overhaul 4).
const narratorCalls = () => table.claude.calls.filter(c => /MOVE OUTCOME|Narrate the consequence|THIS ROUND/.test(`${c.system}\n${c.userText}`) && !/^You are auditing/.test(String(c.system ?? '')));
const lastCallText  = () => { const c = narratorCalls().at(-1); return c ? `${c.system}\n${c.userText}` : ""; };
const narrations    = () => table.cards(f => f.narratorCard && f.resolutionId);

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(() => { control.dice = []; });
afterEach(() => { if (savedJournalEntry) globalThis.JournalEntry = savedJournalEntry; });

describe("issue #362 AC04 — an expedition begun by a result that is then upgraded still gets its plan", () => {
  it("control: a weak hit that offers no burn — its narration is asked to plan the expedition it began", async () => {
    await seat({ momentum: 2 });
    const card = await undertakeWeak();
    expect(card.flags[MODULE_ID].awaitingUpgrade).toBeUndefined();
    expect(expeditions()).toHaveLength(1);
    expect(lastCallText()).toMatch(PLAN_LINE);
    expect(expeditionPlans()).toEqual([expect.objectContaining({ subject: expect.objectContaining({ type: "track", id: expeditions()[0].id }) })]);
  }, 30_000);

  it("control: a held weak hit that is KEPT — its narration is asked to plan the expedition", async () => {
    await seat();
    const card = await undertakeWeak();
    await click(card, KEEP);
    expect(narrations()).toHaveLength(1);
    expect(lastCallText()).toMatch(PLAN_LINE);
    expect(expeditionPlans()).toHaveLength(1);
  }, 30_000);

  it("held, BURNED to a strong hit: the move's one narration is asked to plan the expedition, and its plan is filed with its rolls", async () => {
    await seat();
    const card = await undertakeWeak();
    // The card's upgrade state names the plan owed — without its hidden rolls (AC15).
    expect(card.flags[MODULE_ID].burn.move.planRequests).toEqual([
      expect.objectContaining({ kind: "expedition", subject: expect.objectContaining({ id: expeditions()[0].id }), oracleSeeds: [] }),
    ]);
    expect(narrations()).toEqual([]);

    await click(card, BURN);

    expect(table.world.message(card._id).flags[MODULE_ID].burn.consumed).toBe(true);
    expect(expeditions()).toHaveLength(1);   // still one expedition, still open
    expect(narrations()).toHaveLength(1);
    expect(narrations()[0].flags[MODULE_ID].outcome).toBe("strong_hit");
    expect(lastCallText()).toMatch(PLAN_LINE);
    expect(lastCallText()).toMatch(PLAN_ROLLS);
    expect(expeditionPlans()).toEqual([expect.objectContaining({ subject: expect.objectContaining({ type: "track", id: expeditions()[0].id }) })]);
    expect(expeditionPlans()[0].oracleSeeds.join(" | ")).toMatch(PLAN_ROLLS);
  }, 30_000);

  it("held, IMPROVED to a strong hit: the same", async () => {
    await seat({ momentum: 2 });
    control.abilities = FUGITIVE;    // no burn to offer: the asset's improvement alone holds it
    const card = await undertakeWeak();
    expect(card.flags[MODULE_ID].awaitingUpgrade?.open).toBe(true);

    await click(card, IMPROVE);

    expect(table.world.message(card._id).flags[MODULE_ID].improve.consumed).toBe(true);
    expect(narrations()).toHaveLength(1);
    expect(lastCallText()).toMatch(PLAN_LINE);
    expect(expeditionPlans()).toHaveLength(1);
  }, 30_000);

  it("holding off: the burn's re-narration plans the expedition whose first plan it took back — one plan stands", async () => {
    await seat({ settings: { holdResultForUpgrade: false } });
    const card = await undertakeWeak();
    expect(narrations()).toHaveLength(1);
    expect(expeditionPlans()).toHaveLength(1);   // filed by the weak hit's narration

    await click(card, BURN);

    expect(table.world.message(card._id).flags[MODULE_ID].burn.consumed).toBe(true);
    expect(narrations().find(m => m.flags[MODULE_ID].burnSuperseded === true)).toBeTruthy();
    expect(lastCallText()).toMatch(/OUTCOME: Strong Hit/);
    expect(lastCallText()).toMatch(PLAN_LINE);
    expect(expeditionPlans()).toHaveLength(1);
  }, 30_000);

  it("holding off, the weak hit's narration failed (its plan filed with its rolls alone): the burn plans it no second time", async () => {
    await seat({ settings: { holdResultForUpgrade: false } });
    claude.when(c => c.model === NARRATION_MODEL, claudeFault.serverError());
    const card = await undertakeWeak();
    expect(expeditionPlans(), "filed unanswered, unstamped (setup — issue #362 AC07)").toHaveLength(1);

    await click(card, BURN);

    expect(table.world.message(card._id).flags[MODULE_ID].burn.consumed).toBe(true);
    expect(narratorCalls().at(-1)?.userText).toMatch(/OUTCOME: Strong Hit/);
    expect(expeditionPlans()).toHaveLength(1);
  }, 30_000);

  it("a Batch Mode round: the entry's weak hit burned before the round is narrated — the round's narration plans the expedition", async () => {
    await seat();
    await table.client("gm-1").setSetting("batchMode.enabled", true);
    await table.settle();
    control.interpretation = { ...EXPEDITION };
    control.dice = WEAK;
    const round = () => table.world.getSetting("batchMode.round");
    const submissionId = `sub-ac04-${++seq}`;
    await relay("pl-1", "batch.submit", { roundId: round().id, text: "We push out toward the Shattered Reach.", submissionId });
    await relay("pl-1", "batch.confirm", { roundId: round().id, submissionId, choices: {} });
    await relay("pl-2", "batch.pass", { roundId: round().id });
    await table.drain();
    expect(round(), "the round waits on Kira's Burn / Keep (setup)").toMatchObject({ phase: "upgrading" });
    const cardId = round().entries["pl-1"].rolled.cardId;

    await relay("pl-1", "move.burnMomentum", { messageId: cardId });
    await table.drain();

    expect(table.world.message(cardId).flags[MODULE_ID].burn.consumed).toBe(true);
    const roundCard = table.cards(f => f.narratorCard && f.roundId).at(-1);
    expect(roundCard?.flags[MODULE_ID].roundEntries[0].outcome).toBe("strong_hit");
    expect(lastCallText()).toMatch(/THIS ROUND/);
    expect(lastCallText()).toMatch(PLAN_LINE);
    expect(expeditionPlans()).toHaveLength(1);
  }, 30_000);
});
