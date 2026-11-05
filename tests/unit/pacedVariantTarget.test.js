/**
 * STARFORGED COMPANION
 * tests/unit/pacedVariantTarget.test.js
 *
 * PACED-VARIANT-NO-TARGET (found while fixing PACING-ROLL-NO-SCENE-CHALLENGE).
 * A paced card's Roll can be a scene-challenge move (Face Danger within a
 * scene challenge — issue #338 D2), but it named no challenge: the paced card
 * carried only the move, so with two challenges open the Roll's scoring could
 * not tell which and its ⬡ card asked "which scene challenge?". The
 * classifier, told the open challenges, now names the one the input is part
 * of; the router resolves it — or the sole open one — to the challenge's id,
 * the paced card keeps it, and its Roll forwards it as the move's target, as
 * the Finish an Expedition button forwards its track.
 *
 * On a booted GM / player table: the REAL router, classifier, narrator, paced
 * card and Roll relay (Claude's replies scripted), and the pipeline the Roll
 * runs.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [] }));
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

import { buildClassifierContext } from "../../src/pacing/classifier.js";
import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

const isClassifier = (call) => /pacing pre-classifier/.test(call.system ?? "");
const isNarration  = (call) => /SIDECAR|NARRATOR ROLE/.test(call.system ?? "");
const nwma = (suggestedMove, sceneChallenge = null) => JSON.stringify({ decision: "NARRATIVE_WITH_MOVE_AVAILABLE",
  suggestedMove, sceneChallenge, category: "exploration", confidence: 0.6, reasoning: "a risk the player may want to press" });
const hinted = (move) => `The hovercars scream past the pylons. *Cutting through the market now would be a ${move}.*`
  + '\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const STRONG = [0.0, 0.15, 0.9];   // challenge 1, 2; die 6 → a strong hit
const LINE   = "I gun the engine and cut through the night market.";

describe("the classifier is asked which open challenge a scene-challenge move is part of", () => {
  it("its output names the challenge", () => {
    const { systemPrompt } = buildClassifierContext({
      playerText: LINE, campaignState: { connectionIds: [] }, character: null, recentMoveDensity: { count: 0, window: 5 },
      pacingConfig: { dials: { combat: 9, investigation: 6, exploration: 6, social: 5, downtime: 1 }, sceneOverride: null },
    });
    expect(systemPrompt).toMatch(/"sceneChallenge":/);
  });
});

describe("a paced Roll's scene-challenge move scores the challenge the classifier named", () => {
  let table, pc, journal, negotiation, chase, script;
  const gm       = () => table.client("gm-1");
  const player   = () => table.client("pl-1");
  const paced    = () => table.cards(f => f.pacedNarrative).at(-1);
  const ticks    = (t) => (journal.getFlag(MODULE_ID, "tracks") ?? []).find(x => x.id === t.id)?.ticks;
  const sceneCard = () => table.cards(f => f.sceneChallengeCard).at(-1)?.content ?? "";

  function progressJournal() {
    const flags = {};
    return {
      id: "pt-progress", name: "Starforged Progress Tracks",
      getFlag: (scope, key) => flags[`${scope}.${key}`],
      setFlag: async (scope, key, value) => { flags[`${scope}.${key}`] = structuredClone(value); },
    };
  }

  async function narrate(suggestedMove, sceneChallenge, move = "Face Danger") {
    script.when(isClassifier, nwma(suggestedMove, sceneChallenge)).when(isNarration, hinted(move));
    await player().chat(LINE, { speaker: { actor: pc.id } });
    await table.settle(); await table.drain();
    return paced();
  }

  async function pressRoll(card) {
    control.dice = STRONG;
    await player().click(card._id, '[data-action="sf-paced-roll"]');
    await table.settle(); await table.drain();
  }

  beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
  afterAll(() => table?.teardown());
  beforeEach(async () => {
    await table.reset({ world: { settings: {
      chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false,
      campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "pt-s1", sessionNumber: 1,
        lastSessionTimestamp: new Date().toISOString(), currentSceneId: "pt-scene", sceneTruths: [], clocks: [] },
    } } });
    await table.setClaudeKey("gm-1", "sk-ant-test");
    pc = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 } });
    journal = progressJournal();
    table.journal._set(journal);
    const store = await gm().import("../../src/ui/progressTracks.js");
    negotiation = await gm().run(() => store.addProgressTrack({ label: "The Negotiation", type: "scene_challenge", rank: "dangerous" }));
    chase       = await gm().run(() => store.addProgressTrack({ label: "The Chase", type: "scene_challenge", rank: "dangerous" }));
    await table.settle();
    script = scriptClaude(table, { fallback: (call) => (isNarration(call)
      ? 'The night market blurs past.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' : "{}") });
  });

  it("two open: the card keeps the named challenge, and its Roll marks that one alone", async () => {
    const card = await narrate("face_danger_scene_challenge", "the chase");
    expect(card.flags[MODULE_ID]).toMatchObject({ suggestedMove: "face_danger_scene_challenge", suggestedMoveTargetId: chase.id });
    await pressRoll(card);
    expect([ticks(chase), ticks(negotiation)]).toEqual([8, 0]);
    expect(sceneCard()).not.toMatch(/which scene challenge/);
  }, 30_000);

  it("one open: the card keeps the sole challenge's id", async () => {
    const store = await gm().import("../../src/ui/progressTracks.js");
    await gm().run(() => store.completeProgressTrack(negotiation.id));
    await table.settle();
    const card = await narrate("face_danger_scene_challenge", null);
    expect(card.flags[MODULE_ID].suggestedMoveTargetId).toBe(chase.id);
  }, 30_000);

  it("control: a challenge named that is not open is no target — two open, the Roll asks which", async () => {
    const card = await narrate("face_danger_scene_challenge", "The Heist");
    expect(card.flags[MODULE_ID].suggestedMoveTargetId ?? null).toBeNull();
    await pressRoll(card);
    expect([ticks(chase), ticks(negotiation)]).toEqual([0, 0]);
    expect(sceneCard()).toMatch(/which scene challenge/);
  }, 30_000);

  it("control: a hint that makes the button another move carries no challenge", async () => {
    const card = await narrate("face_danger_scene_challenge", "The Chase", "Compel");
    expect(card.flags[MODULE_ID].suggestedMove).toBe("compel");
    expect(card.flags[MODULE_ID].suggestedMoveTargetId ?? null).toBeNull();
  }, 30_000);
});
