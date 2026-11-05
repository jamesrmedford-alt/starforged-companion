/**
 * STARFORGED COMPANION
 * tests/unit/sceneChallengeMoveName.test.js
 *
 * SCENE-CHALLENGE-MOVE-NAME (found while building issue #338 D2). The confirm
 * dialog names a move by its title (i18n localizeMove — "Face Danger (Scene
 * Challenge)"), but the move card, the Pay the Price card, the narrator's move
 * tag, the paced card's Roll button and the session recap title-cased the id
 * ("Face Danger Scene Challenge"), through three private toDisplayName copies
 * and four inline ones. A move now has one display name everywhere — its title
 * (i18n moveDisplayName) — so the articles read as the dialog's do too
 * ("Secure an Advantage", not "Secure An Advantage").
 *
 * On a booted GM / player table with a scene challenge open: the interpreter
 * (its reply scripted), the forced-move path, the pipeline, a burn, the paced
 * classifier + narrator, and the session recap — each the real producer.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], ptp: [12] }));
vi.mock("../../src/moves/abilityScanner.js", async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock("../../src/ui/settingsPanel.js", async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
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
// Pay the Price 12, "You face a tough choice": no suffer route.
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
import { localizeMove } from "../../src/system/i18n.js";

const isClassifier  = (call) => /pacing pre-classifier/.test(call.system ?? "");
const isInterpreter = (call) => /You are the move interpreter/.test(call.system ?? "");
const isNarration   = (call) => /SIDECAR|NARRATOR ROLE/.test(call.system ?? "");
const MOVE_DECISION = JSON.stringify({ decision: "MOVE", suggestedMove: null, category: "social", confidence: 0.9, reasoning: "test" });
const reading = (moveId) => JSON.stringify({ moveId, statUsed: "iron", moveTarget: "The Negotiation", rationale: "test", confidence: "high" });

const MISS     = [0.85, 0.95, 0.0];   // challenge 9, 10; die 1 → a miss
const BURNABLE = [0.65, 0.75, 0.0];   // challenge 7, 8; die 1: a miss; momentum 9 burned → a strong hit

const FD  = "Face Danger (Scene Challenge)";
const SAA = "Secure an Advantage (Scene Challenge)";

let table, pc, script;
const gm        = () => table.client("gm-1");
const player    = () => table.client("pl-1");
const moveCard  = () => table.cards(f => f.moveResolution).at(-1);
const moveName  = (card) => card?.content.match(/<div class="sf-move-name">([^<]*)</)?.[1] ?? null;
const ptpCard   = () => table.cards(f => f.payThePriceCard).at(-1);
const lastMove  = () => table.cards(f => f.narratorCard && f.resolutionId).at(-1)?.flags[MODULE_ID];

/** The progress store's journal, its flags in memory. */
function progressJournal() {
  const flags = {};
  return {
    id: "mn-progress", name: "Starforged Progress Tracks",
    getFlag: (scope, key) => flags[`${scope}.${key}`],
    setFlag: async (scope, key, value) => { flags[`${scope}.${key}`] = structuredClone(value); },
  };
}

async function say(text, moveId, dice) {
  script.when(isClassifier, MOVE_DECISION).when(isInterpreter, reading(moveId));
  control.dice = dice;
  await player().chat(text, { speaker: { actor: pc.id } });
  await table.settle(); await table.drain();
  return moveCard();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  control.ptp = [12];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "mn-s1", sessionNumber: 1,
      lastSessionTimestamp: new Date().toISOString(), currentSceneId: "mn-scene", sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  pc = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, system: { momentum: { value: 9 } } });
  table.journal._set(progressJournal());
  const store = await gm().import("../../src/ui/progressTracks.js");
  await gm().run(() => store.addProgressTrack({ label: "The Negotiation", type: "scene_challenge", rank: "dangerous" }));
  await table.settle();
  script = scriptClaude(table, { fallback: (call) => (isNarration(call)
    ? 'The envoy weighs your words.\n```json\n{"newTruths":[],"stateChanges":[]}\n```'
    : "{}") });
});

describe("a scene-challenge move has one display name — the confirm dialog's (SCENE-CHALLENGE-MOVE-NAME)", () => {
  it("control: the confirm dialog's title for each variant", () => {
    expect(localizeMove("face_danger_scene_challenge")).toBe(FD);
    expect(localizeMove("secure_an_advantage_scene_challenge")).toBe(SAA);
  });

  it("the move card and the Pay the Price card name the typed variant as the dialog does", async () => {
    const card = await say("I press our terms across the table.", "face_danger_scene_challenge", MISS);
    expect(lastMove()).toMatchObject({ moveId: "face_danger_scene_challenge", outcome: "miss" });
    expect(moveName(card)).toBe(FD);
    expect(ptpCard().content).toContain(`<em>${FD}</em>`);
    expect(ptpCard().flags[MODULE_ID].oracleMemory.question).toBe(FD);
    const narration = table.claude.calls.filter(isNarration).at(-1)?.userText ?? "";
    expect(narration).toContain(`[MOVE: ${FD}`);
    for (const c of table.world.messages()) expect(c.content ?? "").not.toMatch(/Face Danger Scene Challenge/);

    const saa = await say("I read the envoy's aides for leverage.", "secure_an_advantage_scene_challenge", MISS);
    expect(moveName(saa)).toBe(SAA);
  }, 30_000);

  it("a forced variant (a card's Roll) is named as the dialog does", async () => {
    control.dice = MISS;
    await player().chat("I press our terms across the table.", { speaker: { actor: pc.id },
      flags: { [MODULE_ID]: { bypassPacing: true, forcedMoveId: "face_danger_scene_challenge" } } });
    await table.settle(); await table.drain();
    expect(moveName(moveCard())).toBe(FD);
  }, 30_000);

  it("a burned variant's re-narration names it as the dialog does", async () => {
    const card = await say("I press our terms across the table.", "face_danger_scene_challenge", BURNABLE);
    const before = table.claude.calls.filter(isNarration).length;
    await player().click(card._id, '[data-action="sf-burn-momentum"]');
    await table.settle(); await table.drain();
    const renarration = table.claude.calls.filter(isNarration).slice(before);
    expect(renarration.length).toBeGreaterThan(0);
    expect(renarration.at(-1).userText).toContain(`[MOVE: ${FD}`);
    expect(renarration.at(-1).userText).not.toMatch(/Face Danger Scene Challenge/);
  }, 30_000);

  it("a variant with no challenge open is the ordinary move, named as the dialog names it", async () => {
    const store = await gm().import("../../src/ui/progressTracks.js");
    const [challenge] = await gm().run(() => store.listProgressTracks());
    await gm().run(() => store.completeProgressTrack(challenge.id));
    await table.settle();
    const card = await say("I study the envoy before I speak.", "secure_an_advantage_scene_challenge", MISS);
    expect(lastMove().moveId).toBe("secure_an_advantage");
    expect(moveName(card)).toBe(localizeMove("secure_an_advantage"));   // "Secure an Advantage"
  }, 30_000);

  it("the paced card's Roll button names the move as the dialog does", async () => {
    script.when(isClassifier, JSON.stringify({ decision: "NARRATIVE_WITH_MOVE_AVAILABLE",
      suggestedMove: "secure_an_advantage", category: "social", confidence: 0.6, reasoning: "test" }));
    await player().chat("I watch the envoy's hands while she talks.", { speaker: { actor: pc.id } });
    await table.settle(); await table.drain();
    const paced = table.cards(f => f.pacedNarrative).at(-1);
    expect(paced.content).toContain(`Roll ${localizeMove("secure_an_advantage")}</button>`);
  }, 30_000);

  it("the session recap names the move as the dialog does", async () => {
    await say("I press our terms across the table.", "face_danger_scene_challenge", MISS);
    const narrator = await gm().import("../../src/narration/narrator.js");
    await gm().run(() => narrator.postSessionRecap(table.world.campaignState()));
    await table.settle();
    const recap = table.cards(f => f.recapCard && f.recapType === "session").at(-1);
    expect(recap.content).toContain(`• ${FD} → Miss`);
  }, 30_000);
});
