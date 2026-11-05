/**
 * STARFORGED COMPANION
 * tests/unit/pacingRollSceneChallenge.test.js
 *
 * PACING-ROLL-NO-SCENE-CHALLENGE (found while building issue #338 D2). While a
 * scene challenge is open, Face Danger and Secure an Advantage made within it
 * are its own moves (D2) — but only the move interpreter knew it. The pacing
 * classifier was told a fight was on (`combatActive`) and nothing of an open
 * challenge, and its move catalog held neither variant, so a paced "Roll Face
 * Danger" during the challenge forced the ordinary move: no progress on the
 * challenge, no segment on its clock. And had it named the variant, the
 * paced card's hint ("…would be a Face Danger") replaced it with the ordinary
 * move on the Roll button. Now the classifier is given the open challenge as
 * it is given the fight, its catalog lists the two variants, a variant named
 * with no challenge open is the ordinary move, and the hint naming the move a
 * variant varies keeps the variant.
 *
 * On a booted GM / player table: the REAL router, classifier, narrator, paced
 * card and Roll button (Claude's replies scripted), and the pipeline the Roll
 * runs — its consequences scored against the challenge.
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
import { reconcileSuggestedMove } from "../../src/narration/narrator.js";
import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

const isClassifier = (call) => /pacing pre-classifier/.test(call.system ?? "");
const isNarration  = (call) => /SIDECAR|NARRATOR ROLE/.test(call.system ?? "");
const nwma = (suggestedMove) => JSON.stringify({ decision: "NARRATIVE_WITH_MOVE_AVAILABLE", suggestedMove,
  category: "social", confidence: 0.6, reasoning: "a risk the player may want to press" });
const HINTED = 'The envoy\'s smile thins; her aides go still. *Pressing your terms now would be a Face Danger.*'
  + '\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
// No hint: the button is the classifier's nomination as it stands.
const UNHINTED = 'The envoy\'s smile thins; her aides go still.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const STRONG = [0.0, 0.15, 0.9];   // challenge 1, 2; die 6 → a strong hit
const PRESS  = "I lean across the table and press our terms.";

// ─────────────────────────────────────────────────────────────────────────────
// The classifier's context
// ─────────────────────────────────────────────────────────────────────────────

const ctx = (extra = {}) => buildClassifierContext({
  playerText: PRESS, campaignState: { currentSessionId: "s1", connectionIds: [] }, character: { name: "Kira" },
  recentMoveDensity: { count: 0, window: 5 },
  pacingConfig: { dials: { combat: 9, investigation: 6, exploration: 6, social: 5, downtime: 1 }, sceneOverride: null },
  ...extra,
});

describe("the classifier knows an open scene challenge, as it knows a fight", () => {
  it("its catalog lists the two scene-challenge moves, for an open challenge only", () => {
    const { systemPrompt } = ctx();
    expect(systemPrompt).toMatch(/- face_danger_scene_challenge: /);
    expect(systemPrompt).toMatch(/- secure_an_advantage_scene_challenge: /);
    expect(systemPrompt).toMatch(/SCENE CHALLENGE IS OPEN/);
  });

  it("an open challenge is named in the CURRENT SCENE", () => {
    const { userMessage } = ctx({ sceneChallenges: ["The Negotiation"] });
    expect(userMessage).toMatch(/SCENE CHALLENGE: OPEN — "The Negotiation"/);
  });

  it("control: with none open, the CURRENT SCENE says nothing of one", () => {
    expect(ctx().userMessage).not.toMatch(/SCENE CHALLENGE:/);
  });

  it("the hint naming the move a variant varies keeps the variant", () => {
    expect(reconcileSuggestedMove(HINTED, "face_danger_scene_challenge")).toBe("face_danger_scene_challenge");
    expect(reconcileSuggestedMove("*Reading her aides first could be a Secure an Advantage.*", "face_danger_scene_challenge"))
      .toBe("secure_an_advantage_scene_challenge");
    // control: another move the hint names still wins; an ordinary nomination stays ordinary.
    expect(reconcileSuggestedMove("*Leaning on her here would be a Compel.*", "face_danger_scene_challenge")).toBe("compel");
    expect(reconcileSuggestedMove(HINTED, "face_danger")).toBe("face_danger");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// On a table: the paced card's Roll during a scene challenge
// ─────────────────────────────────────────────────────────────────────────────

describe("a paced Roll during a scene challenge rolls its scene-challenge move", () => {
  let table, pc, journal, challenge, script;
  const gm       = () => table.client("gm-1");
  const player   = () => table.client("pl-1");
  const paced    = () => table.cards(f => f.pacedNarrative).at(-1);
  const lastMove = () => table.cards(f => f.narratorCard && f.resolutionId).at(-1)?.flags[MODULE_ID];
  const ticks    = () => (journal.getFlag(MODULE_ID, "tracks") ?? []).find(t => t.id === challenge.id)?.ticks;
  const classifierCall = () => table.claude.calls.filter(isClassifier).at(-1);

  /** The progress store's journal, its flags in memory. */
  function progressJournal() {
    const flags = {};
    return {
      id: "pr-progress", name: "Starforged Progress Tracks",
      getFlag: (scope, key) => flags[`${scope}.${key}`],
      setFlag: async (scope, key, value) => { flags[`${scope}.${key}`] = structuredClone(value); },
    };
  }

  async function narrate(suggestedMove, reply = HINTED) {
    script.when(isClassifier, nwma(suggestedMove)).when(isNarration, reply);
    await player().chat(PRESS, { speaker: { actor: pc.id } });
    await table.settle(); await table.drain();
    return paced();
  }

  async function pressRoll(card) {
    control.dice = STRONG;
    await player().click(card._id, '[data-action="sf-paced-roll"]');
    await table.settle(); await table.drain();
  }

  async function finishChallenge() {
    const store = await gm().import("../../src/ui/progressTracks.js");
    await gm().run(() => store.completeProgressTrack(challenge.id));
    await table.settle();
  }

  beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
  afterAll(() => table?.teardown());
  beforeEach(async () => {
    await table.reset({ world: { settings: {
      chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false,
      campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "pr-s1", sessionNumber: 1,
        lastSessionTimestamp: new Date().toISOString(), currentSceneId: "pr-scene", sceneTruths: [], clocks: [] },
    } } });
    await table.setClaudeKey("gm-1", "sk-ant-test");
    pc = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, system: { momentum: { value: 2 } } });
    journal = progressJournal();
    table.journal._set(journal);
    const store = await gm().import("../../src/ui/progressTracks.js");
    challenge = await gm().run(() => store.addProgressTrack({ label: "The Negotiation", type: "scene_challenge", rank: "dangerous" }));
    await table.settle();
    script = scriptClaude(table, { fallback: (call) => (isNarration(call)
      ? 'The envoy weighs your words.\n```json\n{"newTruths":[],"stateChanges":[]}\n```'
      : "{}") });
  });

  it("the classifier is told the challenge, and the paced card keeps the variant though its hint says Face Danger", async () => {
    const card = await narrate("face_danger_scene_challenge");
    expect(classifierCall().userText).toMatch(/SCENE CHALLENGE: OPEN — "The Negotiation"/);
    expect(classifierCall().system).toMatch(/face_danger_scene_challenge/);
    expect(card.flags[MODULE_ID].suggestedMove).toBe("face_danger_scene_challenge");
    expect(card.content).toContain("Roll Face Danger (Scene Challenge)</button>");
  }, 30_000);

  it("its Roll is the scene-challenge move, scored against the challenge", async () => {
    const card = await narrate("face_danger_scene_challenge");
    await pressRoll(card);
    expect(lastMove()).toMatchObject({ moveId: "face_danger_scene_challenge", outcome: "strong_hit" });
    expect(ticks()).toBe(8);                                   // dangerous: one mark
    expect(table.cards(f => f.sceneChallengeCard)).toHaveLength(1);
  }, 30_000);

  it("with no challenge open the classifier is told none, and a variant it names anyway is the ordinary move", async () => {
    await finishChallenge();
    const card = await narrate("face_danger_scene_challenge", UNHINTED);
    expect(classifierCall().userText).not.toMatch(/SCENE CHALLENGE:/);
    expect(card.flags[MODULE_ID].suggestedMove).toBe("face_danger");
    expect(card.content).toContain("Roll Face Danger</button>");
  }, 30_000);

  it("control: the challenge finished between the card and the press — the Roll is the ordinary move", async () => {
    const card = await narrate("face_danger_scene_challenge");
    await finishChallenge();
    await pressRoll(card);
    expect(lastMove()).toMatchObject({ moveId: "face_danger", outcome: "strong_hit" });
    expect(table.cards(f => f.sceneChallengeCard)).toHaveLength(0);
  }, 30_000);

  it("control: an ordinary nomination during the challenge stays the ordinary move (never re-keyed)", async () => {
    const card = await narrate("face_danger");
    expect(card.flags[MODULE_ID].suggestedMove).toBe("face_danger");
    await pressRoll(card);
    expect(lastMove()).toMatchObject({ moveId: "face_danger" });
    expect(ticks()).toBe(0);
  }, 30_000);
});
