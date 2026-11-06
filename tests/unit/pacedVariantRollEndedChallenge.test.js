/**
 * STARFORGED COMPANION
 * tests/unit/pacedVariantRollEndedChallenge.test.js
 *
 * PACED-VARIANT-ROLL-ENDED-CHALLENGE (found while fixing ROUND-VARIANT-TWO-
 * CHALLENGES). A paced card's Roll of a scene-challenge move (Face Danger
 * within a scene challenge — issue #338 D2) carries the challenge it is part
 * of, by id (PACED-VARIANT-NO-TARGET). Pressed after that challenge ended — a
 * GM finished it, or another player's Finish the Scene — while another stays
 * open, the pipeline's rule (moveOutsideSceneChallenge) looked only for an
 * open challenge, so the Roll was made as the variant, and its scoring found
 * the challenge it named over: a strong hit marked nothing, took no momentum,
 * and its ⬡ card said the scene challenge is over. A variant whose own
 * challenge — the one it names by id — has ended is the ordinary move, as one
 * with no challenge open is (issue #342 Z39), as readMove reads it and as
 * rollMove rolls it.
 *
 * Harness: pacedVariantTarget.test.js's — the REAL router, classifier,
 * narrator, paced card and Roll relay (Claude's replies scripted), and the
 * pipeline the Roll runs.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ dice: [], confirmed: [] }));
vi.mock("../../src/moves/abilityScanner.js", async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
// The move the confirm dialog shows, as readMove read it (rollMove changes the object later).
vi.mock("../../src/ui/settingsPanel.js", async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async (interpretation) => { control.confirmed.push(interpretation?.moveId ?? null); return true; }),
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

describe("a paced Roll of a scene-challenge move whose challenge ended before the press", () => {
  let table, pc, journal, negotiation, chase, script, store;
  const gm       = () => table.client("gm-1");
  const player   = () => table.client("pl-1");
  const paced    = () => table.cards(f => f.pacedNarrative).at(-1);
  const ticks    = (t) => (journal.getFlag(MODULE_ID, "tracks") ?? []).find(x => x.id === t.id)?.ticks;
  const moveCard = () => table.cards(f => f.moveResolution && f.actorId === pc.id).at(-1)?.content ?? "";
  const sceneCards = () => table.cards(f => f.sceneChallengeCard).map(c => c.content ?? "");

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

  async function finish(track) {
    await gm().run(() => store.completeProgressTrack(track.id));
    await table.settle();
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
    pc = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, system: { momentum: { value: 2 } } });
    journal = progressJournal();
    table.journal._set(journal);
    store = await gm().import("../../src/ui/progressTracks.js");
    negotiation = await gm().run(() => store.addProgressTrack({ label: "The Negotiation", type: "scene_challenge", rank: "dangerous" }));
    chase       = await gm().run(() => store.addProgressTrack({ label: "The Chase", type: "scene_challenge", rank: "dangerous" }));
    await table.settle();
    script = scriptClaude(table, { fallback: (call) => (isNarration(call)
      ? 'The night market blurs past.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' : "{}") });
  });

  it("The Chase ended, The Negotiation still open: the Roll is the ordinary Face Danger — +1 momentum, no challenge scored", async () => {
    const card = await narrate("face_danger_scene_challenge", "the chase");
    expect(card.flags[MODULE_ID]).toMatchObject({ suggestedMove: "face_danger_scene_challenge", suggestedMoveTargetId: chase.id });
    await finish(chase);                                   // ended before the press

    const before = pc.system.momentum.value;
    control.confirmed = [];
    await pressRoll(card);

    expect(control.confirmed).toEqual(["face_danger"]);      // was: confirmed as the variant (readMove)
    expect(moveCard()).toMatch(/Face Danger/);
    expect(moveCard()).not.toMatch(/Scene Challenge/);     // was: rolled as the variant …
    expect(sceneCards().filter(c => /over/.test(c))).toEqual([]);   // … its ⬡ card: "its scene challenge is over"
    expect(pc.system.momentum.value - before).toBe(1);     // was: 0 — the variant's strong hit takes none
    expect(ticks(negotiation)).toBe(0);                    // the other challenge is not scored
  }, 30_000);

  it("rollMove's own check: a variant naming its ended challenge by id is rolled as the ordinary move", async () => {
    // As a Batch Mode entry is rolled, after it was read (issue #342 Z39) — rollMove alone, on the GM.
    await finish(chase);
    const pipeline = await gm().import("../../src/moves/movePipeline.js");
    control.dice = STRONG;
    const rolled = await gm().run(() => pipeline.rollMove({
      interpretation: {
        moveId: "face_danger_scene_challenge", moveName: "Face Danger (Scene Challenge)", statUsed: "edge", adds: 0,
        moveTarget: "The Chase", moveTargetId: chase.id, rationale: "test", mischiefApplied: false, playerNarration: LINE,
      },
      campaignState: foundry.utils.deepClone(game.settings.get(MODULE_ID, "campaignState")),
      speakerActorId: pc.id, narration: LINE,
    }));
    await table.settle(); await table.drain();
    expect(rolled.resolution?.moveId).toBe("face_danger");      // was: face_danger_scene_challenge
    expect(sceneCards().filter(c => /over/.test(c))).toEqual([]);
  }, 30_000);

  it("control: with The Chase still open, the Roll stays the variant and marks it", async () => {
    const card = await narrate("face_danger_scene_challenge", "the chase");
    control.confirmed = [];
    await pressRoll(card);
    expect(control.confirmed).toEqual(["face_danger_scene_challenge"]);
    expect(moveCard()).toMatch(/Scene Challenge/);
    expect([ticks(chase), ticks(negotiation)]).toEqual([8, 0]);
  }, 30_000);

  it("control: The Negotiation ended instead — the Roll named The Chase, so it stays the variant on The Chase", async () => {
    const card = await narrate("face_danger_scene_challenge", "the chase");
    await finish(negotiation);
    await pressRoll(card);
    expect(moveCard()).toMatch(/Scene Challenge/);
    expect(ticks(chase)).toBe(8);
  }, 30_000);
});
