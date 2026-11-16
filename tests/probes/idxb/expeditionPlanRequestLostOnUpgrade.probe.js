/**
 * PROBE — IDXB-02 · EXPEDITION-PLAN-LOST-ON-WEAK-TO-STRONG-UPGRADE
 *
 * Scenario: Kira undertakes an expedition to a new destination and rolls a
 * WEAK hit her momentum can burn to a strong hit. The pipeline begins the
 * expedition at the roll (index.js applyOutcomeEffects creates the track) and
 * hangs the plan its narration is to decide on that resolution
 * (`resolution.skeletonRequests`, resolver.js expeditionPlanRequest — issue
 * #353 Phase 3, decisions.md → "Expedition ↔ progress track: an expedition an
 * Undertake an Expedition begins asks its narration to plan it"). She burns
 * momentum.
 *
 * Correct: the narration of the move — the burned strong hit — is asked to
 * decide the expedition's plan under DECIDE NOW, as the weak hit's would have
 * been, so the expedition has its waypoints, danger and ending.
 *
 * Today: the burned resolution is a new object (burnMomentum.js
 * buildBurnedResolution) and applyOutcomeEffects only adds the request where
 * it CREATES the track (`next.expeditionProgress && !orig.expeditionProgress`)
 * — a weak hit already did. The request rides nothing to the upgraded
 * narration:
 *   - held for the choice (issue #354 P2-10, default on): the weak hit is
 *     never narrated, so the plan is never asked for at all;
 *   - holding off: the weak hit's narration asked for it, the burn supersedes
 *     that narration and takes its plan writes back
 *     (resultUpgrade.retractSupersededNarrations), and its replacement does
 *     not ask again.
 * The expedition runs with no hidden plan.
 *
 * On a booted table, as tests/unit/travelUnchartedDestination.test.js and
 * tests/unit/heldResultBeforePrice.test.js.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";

const control = vi.hoisted(() => ({ interpretation: null, dice: [] }));
vi.mock("../../../src/pacing/router.js", async (original) => ({
  ...(await original()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../../src/moves/interpreter.js", async (original) => ({
  ...(await original()),
  interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: "chat" })),
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
    for (const d of control.dice) rng.mockReturnValueOnce(d);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from "../../helpers/multiClient.js";
import { scriptClaude } from "../../helpers/faults.js";
import { makeJournal, plansOf } from "../../helpers/skeletonTable.js";
import { CampaignStateSchema } from "../../../src/schemas.js";

const REPLY = 'The stars wheel past.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const REACH = "the Shattered Reach";
const WEAK  = [0.25, 0.65, 0.5];   // challenge 3, 7; action 4 + wits 2 = 6: a weak hit (momentum 9 burns it to a strong hit)
const BURN  = '[data-action="sf-burn-momentum"]';
const KEEP  = '[data-action="sf-keep-result"]';

let table, tracksStore, savedJournalEntry;

function makeTracksJournal() {
  return {
    id: "tracks-journal", name: "Starforged Progress Tracks",
    getFlag: (mod, key) => tracksStore[`${mod}.${key}`],
    setFlag: async (mod, key, value) => { tracksStore[`${mod}.${key}`] = structuredClone(value); },
  };
}
const tracks = () => tracksStore[`${MODULE_ID}.tracks`] ?? [];

async function seat({ momentum = 9, settings = {} } = {}) {
  tracksStore = { [`${MODULE_ID}.tracks`]: [] };
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, ...settings,
    campaignState: {
      ...CampaignStateSchema, sessionActive: true, currentSessionId: "sess-1", sessionNumber: 2,
      currentSceneId: "sc-1", sceneTruths: [],
      // No active sector: the expedition is for no site, so only its track and its plan are in play here.
      sectors: [], activeSectorId: null, settlementIds: [], locationIds: [],
    },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-gina");
  table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 },
    system: { momentum: { value: momentum, max: 10, min: -6, resetValue: 2 } } });
  table.journal._set(makeTracksJournal());
  // Journals that keep their pages, so the Secrets journal holds the plans (tests/helpers/skeletonTable.js).
  savedJournalEntry ??= globalThis.JournalEntry;
  globalThis.JournalEntry = { async create(data) { const j = makeJournal(data); globalThis.game.journal._set(j.id, j); return j; } };
  scriptClaude(table, { fallback: () => REPLY });
}

/** The expedition plans in the Secrets journal that still stand. */
const expeditionPlans = () => plansOf(table).filter(p => p.kind === "expedition" && p.status === "active");

async function undertakeWeak() {
  control.interpretation = { adds: 0, rationale: "test", mischiefApplied: false,
    moveId: "undertake_an_expedition", moveName: "Undertake an Expedition", statUsed: "wits",
    moveTarget: REACH, expeditionRank: "dangerous" };
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

const narratorCalls = () => table.claude.calls.filter(c => /MOVE OUTCOME|Narrate the consequence/.test(`${c.system}\n${c.userText}`));
const lastCallText  = () => { const c = narratorCalls().at(-1); return c ? `${c.system}\n${c.userText}` : ""; };
const narrations    = () => table.cards(f => f.narratorCard && f.resolutionId);
// The DECIDE NOW line an expedition's plan request prints (narratorPrompt.js formatSkeletonSection).
const PLAN_LINE = /### DECIDE NOW[\s\S]*the expedition to the Shattered Reach\. Its truth is what waits at the end/;

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(() => { control.dice = []; });
afterEach(() => { if (savedJournalEntry) globalThis.JournalEntry = savedJournalEntry; });

describe("IDXB-02 — an expedition begun on a weak hit that is upgraded still gets its plan", () => {
  it("control: a weak hit that offers no burn — its narration is asked to plan the expedition it began", async () => {
    await seat({ momentum: 2 });
    const card = await undertakeWeak();
    expect(card.flags[MODULE_ID].awaitingUpgrade).toBeUndefined();
    expect(tracks().filter(t => t.type === "expedition")).toHaveLength(1);
    expect(narrations()).toHaveLength(1);
    expect(lastCallText()).toMatch(PLAN_LINE);
    // … and the plan is filed in the Secrets journal, about the expedition's track.
    expect(expeditionPlans()).toEqual([expect.objectContaining({ subject: expect.objectContaining({ type: "track", id: tracks()[0].id }) })]);
  }, 30_000);

  it("control: a held weak hit that is KEPT — its narration is asked to plan the expedition (the held resolution carries the request)", async () => {
    await seat({ momentum: 9 });
    const card = await undertakeWeak();
    expect(card.flags[MODULE_ID].awaitingUpgrade).toMatchObject({ open: true,
      resolution: { outcome: "weak_hit", skeletonRequests: [expect.objectContaining({ kind: "expedition" })] } });
    expect(tracks().filter(t => t.type === "expedition")).toHaveLength(1);   // begun at the roll
    expect(narrations()).toEqual([]);

    await click(card, KEEP);
    expect(narrations()).toHaveLength(1);
    expect(lastCallText()).toMatch(PLAN_LINE);
    expect(expeditionPlans()).toHaveLength(1);
  }, 30_000);

  it("a held weak hit BURNED to a strong hit: the move's one narration is asked to plan the expedition", async () => {
    await seat({ momentum: 9 });
    const card = await undertakeWeak();
    expect(card.flags[MODULE_ID].burn).toMatchObject({ canBurn: true, originalOutcome: "weak_hit", previewOutcome: "strong_hit" });
    expect(tracks().filter(t => t.type === "expedition")).toHaveLength(1);
    expect(narrations()).toEqual([]);

    await click(card, BURN);

    expect(table.world.message(card._id).flags[MODULE_ID].burn.consumed).toBe(true);
    expect(tracks().filter(t => t.type === "expedition")).toHaveLength(1);   // still one expedition, still open
    expect(narrations()).toHaveLength(1);
    expect(narrations()[0].flags[MODULE_ID].outcome).toBe("strong_hit");
    // Fails today: no narration of this move was ever asked to plan the expedition.
    const asked = narratorCalls().some(c => PLAN_LINE.test(`${c.system}\n${c.userText}`));
    expect(asked).toBe(true);
  }, 30_000);

  it("a held weak hit BURNED to a strong hit: the open expedition has a plan in the Secrets journal", async () => {
    await seat({ momentum: 9 });
    const card = await undertakeWeak();
    await click(card, BURN);
    expect(table.world.message(card._id).flags[MODULE_ID].burn.consumed).toBe(true);
    expect(tracks().filter(t => t.type === "expedition" && !t.completed)).toHaveLength(1);
    // Fails today: 0 — the expedition runs with no hidden plan.
    expect(expeditionPlans()).toHaveLength(1);
  }, 30_000);

  it("with holding off: the burn's re-narration is asked to plan the expedition whose first plan it took back", async () => {
    await seat({ momentum: 9, settings: { holdResultForUpgrade: false } });
    const card = await undertakeWeak();
    expect(narrations()).toHaveLength(1);
    expect(lastCallText()).toMatch(PLAN_LINE);   // the weak hit's narration was asked

    await click(card, BURN);

    expect(table.world.message(card._id).flags[MODULE_ID].burn.consumed).toBe(true);
    const struck = narrations().find(m => m.flags[MODULE_ID].burnSuperseded === true);
    expect(struck).toBeTruthy();                 // that narration is superseded — its plan writes go with it
    // Fails today: its replacement — the narration that stands — is not asked.
    expect(lastCallText()).toMatch(/OUTCOME: Strong Hit/);
    expect(lastCallText()).toMatch(PLAN_LINE);
  }, 30_000);

  it("with holding off: after the burn the open expedition still has a plan in the Secrets journal", async () => {
    await seat({ momentum: 9, settings: { holdResultForUpgrade: false } });
    const card = await undertakeWeak();
    expect(expeditionPlans()).toHaveLength(1);   // filed by the weak hit's narration
    await click(card, BURN);
    expect(table.world.message(card._id).flags[MODULE_ID].burn.consumed).toBe(true);
    // Fails today: 0 — the superseded narration's plan was taken back and nothing asked for it again.
    expect(expeditionPlans()).toHaveLength(1);
  }, 30_000);
});
