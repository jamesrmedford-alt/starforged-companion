/**
 * PROBE — IDXB-06 · HELD-CARD-FLAGS-CARRY-HIDDEN-PLAN-ROLLS (LEAK)
 *
 * Scenario: Kira's Undertake an Expedition begins a new expedition on a result
 * her momentum can upgrade, so free-flow holds it for Burn / Improve / Keep
 * (issue #354 P2-10). index.js applyOutcomeEffects has already hung the
 * expedition's plan request on the resolution (`resolution.skeletonRequests`,
 * resolver.js expeditionPlanRequest — issue #353 Phase 3): the HIDDEN oracle
 * rolls the plan is decided from — two waypoint Space Sightings and "What
 * waits at the end — Action + Theme". movePipeline.js rollMove then copies the
 * whole resolution onto the move card (`flags.awaitingUpgrade.resolution`).
 *
 * Correct (decisions.md → "Hidden oracle rolls (decided): GM-only until the
 * plan's truth is revealed … No hidden roll is on a player-visible card or a
 * card's flags otherwise"; world setting "Show hidden oracle rolls" is off by
 * default): nothing a player's client can read — no chat card's content or
 * flags — carries the plan's oracle rolls.
 *
 * Today: the held move card is a public chat message, and its flags carry
 * every one of the rolls, word for word, from the roll until the card is
 * deleted (Keep / Burn only close `awaitingUpgrade.open`; the copy stays). The
 * same strings are what the GM-only Secrets journal files as the plan's
 * `oracleSeeds`. (A Batch Mode round keeps the same request, and a price's
 * hidden new-enemy rolls, on the world-scoped round setting:
 * movePipeline.narrationInputFrom — not probed here.)
 *
 * On a booted table, as tests/unit/heldResultBeforePrice.test.js.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";

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
const WEAK  = [0.25, 0.65, 0.5];   // challenge 3, 7; action 4 + wits 2 = 6: a weak hit (momentum 9 can burn it)
const KEEP  = '[data-action="sf-keep-result"]';

let table, tracksStore, savedJournalEntry;

function makeTracksJournal() {
  return {
    id: "tracks-journal", name: "Starforged Progress Tracks",
    getFlag: (mod, key) => tracksStore[`${mod}.${key}`],
    setFlag: async (mod, key, value) => { tracksStore[`${mod}.${key}`] = structuredClone(value); },
  };
}

async function seat({ momentum }) {
  tracksStore = { [`${MODULE_ID}.tracks`]: [] };
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: {
      ...CampaignStateSchema, sessionActive: true, currentSessionId: "sess-1", sessionNumber: 2,
      currentSceneId: "sc-1", sceneTruths: [], sectors: [], activeSectorId: null, settlementIds: [], locationIds: [],
    },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-gina");
  table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 },
    system: { momentum: { value: momentum, max: 10, min: -6, resetValue: 2 } } });
  table.journal._set(makeTracksJournal());
  savedJournalEntry ??= globalThis.JournalEntry;
  globalThis.JournalEntry = { async create(data) { const j = makeJournal(data); globalThis.game.journal._set(j.id, j); return j; } };
  scriptClaude(table, { fallback: () => REPLY });
}

async function undertakeWeak() {
  control.interpretation = { adds: 0, rationale: "test", mischiefApplied: false,
    moveId: "undertake_an_expedition", moveName: "Undertake an Expedition", statUsed: "wits",
    moveTarget: "the Shattered Reach", expeditionRank: "dangerous" };
  control.dice = WEAK;
  await table.client("pl-1").chat("We push out past the last beacon, toward the Shattered Reach.", { speaker: { actor: "pc-kira" } });
  await table.settle();
  await table.drain();
  return table.cards(f => f.moveResolution).at(-1);
}

/** Everything the PLAYER's client holds of the chat log: each message's content and flags, as text. */
const playerSeesInChat = () => table.client("pl-1").run(() =>
  game.messages.contents.map(m => `${m.content ?? ""} ${JSON.stringify(m.flags ?? {})}`).join("\n"));
/** The expedition plan as the GM-only Secrets journal holds it. */
const expeditionPlan = () => plansOf(table).find(p => p.kind === "expedition") ?? null;

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
afterEach(() => { if (savedJournalEntry) globalThis.JournalEntry = savedJournalEntry; });

describe("IDXB-06 — an expedition plan's hidden oracle rolls and the chat log a player can read", () => {
  it("control: a result that is not held — the plan is filed with its rolls, and no chat card carries one of them", async () => {
    await seat({ momentum: 2 });
    const card = await undertakeWeak();
    expect(card.flags[MODULE_ID].awaitingUpgrade).toBeUndefined();

    const plan = expeditionPlan();
    expect(plan?.oracleSeeds?.length).toBeGreaterThanOrEqual(2);       // the hidden rolls, in the GM-only journal
    expect(plan.oracleSeeds.some(s => /Space Sighting/.test(s))).toBe(true);
    const seen = playerSeesInChat();
    for (const roll of plan.oracleSeeds) expect(seen).not.toContain(roll);
  }, 30_000);

  it("a held result: no chat card a player can read carries the plan's hidden oracle rolls", async () => {
    await seat({ momentum: 9 });
    const card = await undertakeWeak();
    expect(card.flags[MODULE_ID].awaitingUpgrade).toMatchObject({ open: true });
    // "Show hidden oracle rolls" is off (its default).
    expect(table.client("gm-1").run(() => game.settings.get(MODULE_ID, "narrativeSkeletonsShowRolls"))).not.toBe(true);

    // What the player's own client can read while the card waits …
    const seenWhileHeld = playerSeesInChat();
    // … and, once kept, the plan the GM-only journal files from the same rolls.
    await table.client("pl-1").click(card._id, KEEP);
    await table.settle(); await table.drain();
    const plan = expeditionPlan();
    expect(plan?.oracleSeeds?.length).toBeGreaterThanOrEqual(2);
    expect(plan.truthRevealed).not.toBe(true);

    // Fails today: every roll is on the move card's flags (awaitingUpgrade.resolution.skeletonRequests[0].oracleSeeds).
    const leaked = plan.oracleSeeds.filter(roll => seenWhileHeld.includes(roll));
    expect(leaked).toEqual([]);
  }, 30_000);

  it("a held result, once settled: the card's flags no longer carry the rolls either", async () => {
    await seat({ momentum: 9 });
    const card = await undertakeWeak();
    await table.client("pl-1").click(card._id, KEEP);
    await table.settle(); await table.drain();
    const plan = expeditionPlan();
    expect(plan?.oracleSeeds?.length).toBeGreaterThanOrEqual(2);
    // Fails today: closing the wait leaves the resolution's copy on the card for good.
    const seenAfter = playerSeesInChat();
    expect(plan.oracleSeeds.filter(roll => seenAfter.includes(roll))).toEqual([]);
  }, 30_000);
});
