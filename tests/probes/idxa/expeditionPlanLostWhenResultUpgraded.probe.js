/**
 * PROBE — IDXA-02 · EXPEDITION-PLAN-LOST-ON-UPGRADE
 *
 * Scenario: Kira undertakes an expedition to "the Gap" — the roll that BEGINS
 * the expedition (index.js applyOutcomeEffects creates its track). It is a weak
 * hit her momentum could burn. Issue #353 Phase 3: "an expedition begun asks its
 * narration to decide its plan" — applyOutcomeEffects puts the request on the
 * rolled resolution (`resolution.skeletonRequests`, expeditionPlanRequest), the
 * narration's DECIDE NOW lists it, and secrets.applyPlanSideData files the plan
 * (waypoints, the danger along the way, what waits at the end) in the GM-only
 * Secrets journal, about the track.
 *
 * Correct: the expedition has its plan whichever way the roller settles the
 * result — Keep, or Burn Momentum / Improve Result.
 *
 * Today: only the ROLLED resolution carries the request. A burned / improved
 * resolution is built fresh (burnMomentum.js buildBurnedResolution) and
 * applyOutcomeEffects adds no request for an upgrade of a result that already
 * marked the expedition (`next.expeditionProgress && !orig.expeditionProgress`).
 *   - "Ask before paying and narrating" on (the default, issue #354 P2-10): the
 *     burned result's narration is the move's only one (heldResult.js
 *     narrateHeldUpgrade copies the player's line from the held resolution and
 *     nothing else) — the plan is never requested, never filed.
 *   - The setting off: the first narration files the plan, then the burn
 *     supersedes that narration and takes back "what the narration planned"
 *     (resultUpgrade.js undoSupersededPlans → undoNarrationEntries deletes a
 *     plan a removed narration made), and the re-narration requests none.
 * Either way the expedition — still open, its progress marked — has no plan.
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
import { makeJournal, plansOf } from "../../helpers/skeletonTable.js";
import { CampaignStateSchema } from "../../../src/schemas.js";

const REPLY  = 'The drive spools and the stars slide.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const WEAK   = [0.25, 0.65, 0.5];   // challenge 3, 7; action die 4 — wits 2 is a weak hit; momentum 9 burns to a strong hit
const BURN   = '[data-action="sf-burn-momentum"]';
const KEEP   = '[data-action="sf-keep-result"]';

let table, restoreJournal;
const flags      = (id) => table.world.message(id).flags[MODULE_ID];
const narrations = () => table.cards(f => f.narratorCard && f.resolutionId);
const narrationCalls = () => table.claude.calls.filter(c => /MOVE OUTCOME/.test(`${c.userText ?? ""}`));
const expeditionPlans = () => plansOf(table).filter(p => p.kind === "expedition");
const expeditionTracks = async () => {
  const gm = table.client("gm-1");
  const tracks = await gm.import("../../src/ui/progressTracks.js");
  return (await gm.run(() => tracks.listProgressTracks())).filter(t => t.type === "expedition");
};

async function resetTable(settings = {}) {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, ...settings,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "exp-s1", sessionNumber: 1,
      currentSceneId: "exp-scene", sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  // Momentum 9: a weak hit against 3 and 7 can be burned to a strong hit.
  table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, system: { momentum: { value: 9 } } });
  // Journals that keep their pages: the progress tracks and the Secrets journal.
  const saved = globalThis.JournalEntry;
  globalThis.JournalEntry = { async create(data) { const j = makeJournal(data); globalThis.game.journal._set(j.id, j); return j; } };
  restoreJournal = () => { globalThis.JournalEntry = saved; };
  scriptClaude(table, { fallback: () => REPLY });
}

/** Kira's first Undertake an Expedition toward the Gap: a weak hit, burnable. Returns its move card. */
async function beginExpedition() {
  control.interpretation = { moveId: "undertake_an_expedition", moveName: "Undertake an Expedition", statUsed: "wits",
    adds: 0, rationale: "test", mischiefApplied: false, moveTarget: "the Gap", expeditionRank: "dangerous" };
  control.dice = WEAK;
  await table.client("pl-1").chat("We leave the lanes and strike out for the Gap.", { speaker: { actor: "pc-kira" } });
  await table.settle(); await table.drain();
  return table.cards(f => f.moveResolution).at(-1);
}

async function click(card, selector) {
  await table.client("pl-1").click(card._id, selector);
  await table.settle(); await table.drain();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
afterEach(() => restoreJournal?.());

describe("IDXA-02 — held (the default): an expedition begun by a result that is then burned still gets its plan", () => {
  beforeEach(() => resetTable());

  it("control: the roll begins the expedition and is held; Keep narrates it with the plan request, and the plan is filed", async () => {
    const card = await beginExpedition();
    expect(flags(card._id).awaitingUpgrade).toMatchObject({ open: true, resolution: { moveId: "undertake_an_expedition", outcome: "weak_hit" } });
    expect(await expeditionTracks()).toHaveLength(1);
    expect(narrations()).toEqual([]);

    await click(card, KEEP);

    expect(narrations()).toHaveLength(1);
    expect(narrationCalls().at(-1).system).toMatch(/DECIDE NOW[\s\S]*the expedition to the Gap/);
    expect(expeditionPlans()).toHaveLength(1);
    expect(expeditionPlans()[0].subject).toMatchObject({ type: "track", name: "the Gap" });
  }, 30_000);

  it("Burn Momentum: the burned result's narration — the move's only one — asks for the expedition's plan, and it is filed", async () => {
    const card = await beginExpedition();
    const [track] = await expeditionTracks();
    expect(track, "the roll began the expedition (setup)").toBeTruthy();

    await click(card, BURN);

    // The burn landed; its narration is the move's one narration; the expedition is still open (setup).
    expect(flags(card._id).burn.consumed).toBe(true);
    expect(narrations()).toHaveLength(1);
    expect(narrations()[0].flags[MODULE_ID].outcome).toBe("strong_hit");
    expect((await expeditionTracks()).map(t => t.completed)).toEqual([false]);

    // The finding: no narration ever asked for the plan, so the expedition has none.
    expect(expeditionPlans().map(p => p.subject?.id)).toEqual([track.id]);
  }, 30_000);
});

describe("IDXA-02 — \"Ask before paying and narrating\" off: the plan the first narration filed survives the burn", () => {
  beforeEach(() => resetTable({ holdResultForUpgrade: false }));

  it("control: narrated at once, the expedition's plan is filed about its track", async () => {
    const card = await beginExpedition();
    expect(flags(card._id).awaitingUpgrade).toBeUndefined();
    expect(narrations()).toHaveLength(1);
    const [track] = await expeditionTracks();
    expect(expeditionPlans().map(p => p.subject?.id)).toEqual([track.id]);
  }, 30_000);

  it("Burn Momentum: the expedition stays open and keeps a plan", async () => {
    const card = await beginExpedition();
    const [track] = await expeditionTracks();
    expect(expeditionPlans(), "the first narration filed the plan (setup)").toHaveLength(1);

    await click(card, BURN);

    expect(flags(card._id).burn.consumed).toBe(true);
    expect((await expeditionTracks()).map(t => t.completed)).toEqual([false]);
    // The finding: the burn took the plan back with the superseded narration, and nothing asked for it again.
    expect(expeditionPlans().map(p => p.subject?.id)).toEqual([track.id]);
  }, 30_000);
});
