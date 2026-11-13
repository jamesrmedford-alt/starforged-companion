/**
 * STARFORGED COMPANION
 * tests/unit/moveRoutingNoMove.test.js
 *
 * Issue #354 section A (alpha 23 playtest part 2) — dialogue is not forced
 * into moves. The reading stages, one by one:
 *
 * P2-01  the interpreter can answer that no move is being made. Every reply
 *        carried a move, so "Tell us the whole story" came back as Ask the
 *        Oracle with "this is a narrative exchange" in its rationale, and the
 *        roll dialog opened all the same.
 * P2-02  the classifier's move reaches the interpreter (the router dropped
 *        it), and a Balanced Mischief misread stays inside what the line is
 *        doing — "we've come this far…" spoken to an NPC was read as
 *        Undertake an Expedition.
 * P2-04  the classifier leans toward a roll only for a pressing or testing
 *        line to one of the speaker's own connections (the classifier-context
 *        half is in pacing.test.js).
 * P2-06  the interpreter is told who is speaking, and a social move against a
 *        fellow player character is narrated on a MOVE decision too.
 *
 * The pipeline half — the line narrated, the confirm dialog's third button,
 * the "Not rolled" notice's — is in moveRoutingNoMovePipeline.test.js.
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/api-proxy.js", () => ({ apiPost: vi.fn() }));
vi.mock("../../src/pacing/telemetry.js", () => ({ logPacingDecision: vi.fn(async () => {}) }));
vi.mock("../../src/ui/progressTracks.js", async (importOriginal) => ({
  ...(await importOriginal()),
  listProgressTracks: vi.fn(async () => []),
  getActiveCombatPosition: vi.fn(async () => null),
}));
vi.mock("../../src/moves/abilityScanner.js", async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));

import { apiPost } from "../../src/api-proxy.js";
import { interpretMove, buildContextSummary, keepMischiefInKind } from "../../src/moves/interpreter.js";
import { buildMischiefFraming } from "../../src/moves/mischief.js";
import { buildClassifierContext } from "../../src/pacing/classifier.js";
import { decidePacing, getRecentMoveDensity, recordRecentDecision, resetRecentDensity, reviseLastDecision } from "../../src/pacing/router.js";
import { lineIsToAFellowPlayerCharacter } from "../../src/narration/narrator.js";
import { readMove, readAction, configureMovePipeline } from "../../src/moves/movePipeline.js";
import { getActiveCombatPosition } from "../../src/ui/progressTracks.js";

const MODULE_ID = "starforged-companion";
const OPTS = { campaignState: {}, mischiefLevel: "lawful", apiKey: "test-key" };

/** Answer each Claude call by what it is: the classifier, or the interpreter. */
function scriptCalls({ classifier = null, interpreter = null } = {}) {
  apiPost.mockImplementation(async (_url, _headers, body) => {
    const system = JSON.stringify(body.system ?? "");
    const reply = /pacing pre-classifier/.test(system) ? classifier : interpreter;
    return { content: [{ type: "text", text: JSON.stringify(reply ?? {}) }] };
  });
}
const callsTo = (pattern) => apiPost.mock.calls.filter(c => pattern.test(JSON.stringify(c[2].system ?? "")));
const interpreterCall = () => callsTo(/move interpreter/)[0]?.[2] ?? null;
const classifierCall  = () => callsTo(/pacing pre-classifier/)[0]?.[2] ?? null;

beforeEach(() => {
  vi.clearAllMocks();
  game.settings._store.clear();
  game.actors._reset();
  global.game.user = { id: "gm-1", isGM: true };
  game.actors._set("pc-isaac", makeTestActor({ id: "pc-isaac", name: "Isaac Sutton" }));
  game.actors._set("pc-karthik", makeTestActor({ id: "pc-karthik", name: "Karthik Shepherd" }));
  getActiveCombatPosition.mockResolvedValue(null);
  resetRecentDensity();
});

// ─────────────────────────────────────────────────────────────────────────────
// P2-01 — the interpreter can answer "no move"
// ─────────────────────────────────────────────────────────────────────────────

describe("issue #354 P2-01 — the interpreter can answer that no move is being made", () => {
  it("its prompt offers the answer, and no longer tells it to prefer a roll", async () => {
    scriptCalls({ interpreter: { moveId: "compel", statUsed: "heart", confidence: "high" } });
    await interpretMove("Tell us the whole story", OPTS);
    const system = JSON.stringify(interpreterCall().system);
    expect(system).toMatch(/NO MOVE: a move is made when the character attempts something whose outcome is uncertain/);
    expect(system).toMatch(/moveId.{0,8}: null/);
    expect(system).toMatch(/ask_the_oracle is never a way to say .{0,6}nothing is rolled/);
    expect(system).not.toMatch(/prefer the move that creates the most interesting mechanical outcome/);
    // A line that carries a threat is still a move ("I cannot walk you to the right one" → Face Danger).
    expect(system).toMatch(/implied menace counts/);
  });

  it('"moveId": null comes back as a no-move reading, with its reason', async () => {
    scriptCalls({ interpreter: { moveId: null, statUsed: null, rationale: "A narrative exchange — nothing is attempted.", confidence: "high" } });
    const read = await interpretMove("Tell us the whole story", OPTS);
    expect(read).toMatchObject({ noMove: true, moveId: null, rationale: "A narrative exchange — nothing is attempted.", playerNarration: "Tell us the whole story" });
  });

  it('"none" and noMove: true are the same answer', async () => {
    scriptCalls({ interpreter: { moveId: "none", rationale: "Just a name." } });
    expect((await interpretMove("my name is Isaac", OPTS)).noMove).toBe(true);
    scriptCalls({ interpreter: { moveId: "compel", noMove: true, rationale: "Just a name." } });
    expect((await interpretMove("my name is Isaac", OPTS)).noMove).toBe(true);
  });

  it("a reply that names no move at all is a failed reading, not a no-move answer", async () => {
    scriptCalls({ interpreter: {} });
    const read = await interpretMove("Kira leans on the dockmaster to waive the fee.", OPTS);
    expect(read.noMove).toBeUndefined();
    expect(read).toMatchObject({ moveId: "face_danger", confidence: "low", fallback: true });
  });

  it("when a roll was asked for the model is told so, and a no-move answer falls back to the classifier's move", async () => {
    scriptCalls({ interpreter: { moveId: null, rationale: "Nothing attempted." } });
    const read = await interpretMove("Tell us the whole story", { ...OPTS, allowNoMove: false, classifier: { moveId: "compel", category: "social" } });
    expect(interpreterCall().messages[0].content).toMatch(/A ROLL WAS ASKED FOR/);
    expect(read.noMove).toBeUndefined();
    expect(read.moveId).toBe("compel");
    expect(["heart", "iron", "shadow"]).toContain(read.statUsed);
  });

  it("a move already chosen is never read as none", async () => {
    scriptCalls({ interpreter: { moveId: null, statUsed: "wits", rationale: "?" } });
    const read = await interpretMove("I comb the archive.", { ...OPTS, expectedMoveSlug: "gather_information" });
    expect(read).toMatchObject({ moveId: "gather_information", statUsed: "wits" });
    expect(read.noMove).toBeUndefined();
  });

  it("control: a move is still a move", async () => {
    scriptCalls({ interpreter: { moveId: "face_danger", statUsed: "heart", rationale: "Implied menace.", confidence: "high" } });
    const read = await interpretMove("I cannot walk you to the right one", OPTS);
    expect(read).toMatchObject({ moveId: "face_danger", statUsed: "heart" });
    expect(read.noMove).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P2-06 / P2-02 — what the interpreter is told
// ─────────────────────────────────────────────────────────────────────────────

describe("issue #354 P2-06 — the interpreter is told who is speaking", () => {
  it("the context names the speaker, in the narrator's words", () => {
    const summary = buildContextSummary({}, { roller: game.actors.get("pc-isaac") });
    expect(summary).toMatch(/^The character speaking and acting this turn is Isaac Sutton\./);
    expect(buildContextSummary({}, { roller: null })).not.toMatch(/speaking and acting/);
  });

  it("an NPC card is never named as the speaker", () => {
    const npc = makeTestActor({ id: "npc-archer", name: "Vuldar Archer", flags: { [MODULE_ID]: { entityType: "connection" } } });
    expect(buildContextSummary({}, { roller: npc })).not.toMatch(/speaking and acting/);
  });

  it("the call carries it, ahead of the recent scene that may be about someone else", async () => {
    scriptCalls({ interpreter: { moveId: "compel", statUsed: "heart" } });
    await interpretMove("Valdur Archer, we've come this far.", {
      ...OPTS, roller: game.actors.get("pc-isaac"),
      recentScene: "Karthik Shepherd, that voice has your name in its mouth now.",
    });
    const text = interpreterCall().messages[0].content;
    expect(text).toContain("The character speaking and acting this turn is Isaac Sutton.");
    expect(text.indexOf("Isaac Sutton")).toBeLessThan(text.indexOf("RECENT SCENE"));
    expect(JSON.stringify(interpreterCall().system)).toMatch(/WHO IS SPEAKING/);
  });
});

describe("issue #354 P2-02 — the classifier's reading reaches the interpreter", () => {
  it("the user message carries the move, the scene's kind and the reasoning, as a hint", async () => {
    scriptCalls({ interpreter: { moveId: "compel", statUsed: "iron" } });
    await interpretMove("Valdur Archer, we've come this far.", {
      ...OPTS, classifier: { moveId: "compel", category: "social", reasoning: 'Isaac presses Archer to "explain".' },
    });
    const text = interpreterCall().messages[0].content;
    expect(text).toMatch(/PACING READ \(a hint, not a ruling/);
    expect(text).toMatch(/read this line as compel in a social scene/);
    expect(text).toContain("Isaac presses Archer to 'explain'.");
    expect(JSON.stringify(interpreterCall().system)).toMatch(/PACING READ: when the user message carries one/);
  });

  it("control: no classifier reading, no line — and none for a move already chosen", async () => {
    scriptCalls({ interpreter: { moveId: "compel", statUsed: "iron" } });
    await interpretMove("Valdur Archer, we've come this far.", OPTS);
    expect(interpreterCall().messages[0].content).not.toMatch(/PACING READ/);
    apiPost.mockClear();
    await interpretMove("Valdur Archer, we've come this far.", { ...OPTS, expectedMoveSlug: "compel", classifier: { moveId: "face_danger", category: "social" } });
    expect(interpreterCall().messages[0].content).not.toMatch(/PACING READ/);
  });

  it("decidePacing keeps the move the classifier named on a MOVE decision (it was dropped)", async () => {
    scriptCalls({ classifier: { decision: "MOVE", suggestedMove: "compel", category: "social", confidence: 0.75, reasoning: "Presses Archer." } });
    const pacing = await decidePacing({ playerText: "Valdur Archer, explain yourself or we turn back.", campaignState: {}, character: { name: "Isaac Sutton", actorId: "pc-isaac" }, apiKey: "k" });
    expect(pacing).toMatchObject({ runMove: true, decision: "MOVE", nominatedMove: "compel", category: "social" });
    expect(pacing.suggestedMove, "not an offer: nothing is suggested on a MOVE").toBeNull();
  });
});

describe("issue #354 P2-02 — a Balanced Mischief reading stays inside what the line is doing", () => {
  const misread = { moveId: "undertake_an_expedition", moveName: "Undertake an Expedition", statUsed: "edge", mischiefApplied: true,
    rationale: "Best read as Archer pushing the crew to press on.", stakes: { hit: "x", miss: "y" }, moveTarget: "the corridor", expeditionRank: "dangerous" };
  const social  = { moveId: "compel", category: "social" };

  it("a line of dialogue misread as travel is put back to the move the classifier named, and says so", () => {
    const kept = keepMischiefInKind({ ...misread }, social, "balanced");
    expect(kept).toMatchObject({ moveId: "compel", moveName: "Compel", mischiefApplied: false, keptInKind: "undertake_an_expedition",
      moveTarget: null, expeditionRank: null, stakes: null });
    expect(["heart", "iron", "shadow"]).toContain(kept.statUsed);
    expect(kept.rationale).toMatch(/a line of dialogue is not turned into Undertake an Expedition/);
  });

  it("fate and suffer moves are out of kind for dialogue too", () => {
    for (const moveId of ["ask_the_oracle", "endure_stress", "set_a_course"]) {
      expect(keepMischiefInKind({ ...misread, moveId }, social, "balanced").moveId, moveId).toBe("compel");
    }
  });

  it("a neighbouring move or another stat is the misread Balanced is for: left alone", () => {
    const neighbour = { ...misread, moveId: "test_your_relationship", statUsed: "heart" };
    expect(keepMischiefInKind(neighbour, social, "balanced")).toBe(neighbour);
    const stat = { ...misread, moveId: "compel", statUsed: "shadow" };
    expect(keepMischiefInKind(stat, social, "balanced")).toBe(stat);
  });

  it("a reading that is not a misread is left alone — travel through uncharted space stays an expedition (issue #348 PT06)", () => {
    const refinement = { ...misread, mischiefApplied: false };
    expect(keepMischiefInKind(refinement, { moveId: "face_danger", category: "exploration" }, "balanced")).toBe(refinement);
    expect(keepMischiefInKind(refinement, social, "balanced")).toBe(refinement);
    // …and a misread of a line that is not dialogue is not held either.
    const action = { ...misread };
    expect(keepMischiefInKind(action, { moveId: "face_danger", category: "exploration" }, "balanced")).toBe(action);
  });

  it("Chaotic keeps its freedom, and Lawful has no misread to hold", () => {
    expect(keepMischiefInKind({ ...misread }, social, "chaotic").moveId).toBe("undertake_an_expedition");
    expect(keepMischiefInKind({ ...misread }, social, "lawful").moveId).toBe("undertake_an_expedition");
  });

  it("interpretMove applies it: Balanced, a social line, the model's expedition", async () => {
    scriptCalls({ interpreter: { ...misread, confidence: "medium" } });
    const read = await interpretMove("Valdur Archer, we've come this far.", { ...OPTS, mischiefLevel: "balanced", classifier: { moveId: "compel", category: "social" } });
    expect(read).toMatchObject({ moveId: "compel", mischiefApplied: false, keptInKind: "undertake_an_expedition" });
  });

  it("the Balanced framing says so; the Chaotic one is unchanged", () => {
    expect(buildMischiefFraming("balanced", "x")).toMatch(/Never turn a line of dialogue into a travel, fate or suffer move/);
    expect(buildMischiefFraming("balanced", "x")).toMatch(/never invent a move for a line that makes none/);
    expect(buildMischiefFraming("chaotic", "x")).not.toMatch(/Never turn a line of dialogue/);
    expect(buildMischiefFraming("lawful", "x")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P2-04 — the classifier's rules
// ─────────────────────────────────────────────────────────────────────────────

describe("issue #354 P2-04 — the classifier's rules for talk, connections and everyday actions", () => {
  const prompt = () => buildClassifierContext({
    playerText: "Answer the hail", campaignState: {}, character: { name: "Isaac Sutton", actorId: "pc-isaac" },
    recentMoveDensity: { count: 0, window: 5 }, pacingConfig: { dials: { social: 5 } },
  }).systemPrompt;

  it("plain conversation is narration, whoever it is with", () => {
    expect(prompt()).toMatch(/TALKING IS NOT A MOVE/);
    expect(prompt()).toMatch(/asking a question, answering one, agreeing or refusing, choosing between\s+options someone offered, saying a name/);
  });

  it("the lean toward a roll is for a pressing or testing line to one of the speaker's own connections", () => {
    expect(prompt()).toMatch(/THE SPEAKER'S CONNECTIONS — when such a pressing or testing line is spoken to/);
    expect(prompt()).toMatch(/Any other NPC carries no lean, and a connection\s+carries none for plain conversation/);
    expect(prompt()).not.toMatch(/If the addressee is a Connection/);
    expect(prompt()).not.toMatch(/Random NPCs do not carry this bias/);
  });

  it("an everyday action with nothing at risk is narration — answering a hail among them", () => {
    expect(prompt()).toMatch(/AN EVERYDAY ACTION WITH NOTHING AT RISK IS NOT A MOVE — answering a hail/);
  });

  it("implied menace is still a move, and travel to an uncharted destination is still offered (issue #348 PT05)", () => {
    expect(prompt()).toMatch(/implied menace\s+counts/);
    expect(prompt()).toMatch(/TRAVEL TO AN UNCHARTED DESTINATION/);
    expect(prompt()).toMatch(/a journey toward an uncharted destination is at least\s+offered as undertake_an_expedition/);
  });

  it("the speaker's Actor id reaches the classifier's context through decidePacing", async () => {
    game.actors._set("pc-isaac", makeTestActor({ id: "pc-isaac", name: "Isaac Sutton", items: { contents: [
      { id: "b1", type: "progress", name: "Vuldar Archer", system: { subtype: "bond", rank: "dangerous", current: 0, completed: false }, flags: {} },
    ] } }));
    scriptCalls({ classifier: { decision: "NARRATIVE", suggestedMove: null, category: "social", confidence: 0.8, reasoning: "A question." } });
    await decidePacing({ playerText: "Tell us the whole story", campaignState: {}, character: { name: "Isaac Sutton", actorId: "pc-isaac" }, apiKey: "k" });
    expect(classifierCall().messages[0].content).toContain("Isaac Sutton's connections: Vuldar Archer");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P2-06 — a social move against a fellow PC, on a MOVE decision
// ─────────────────────────────────────────────────────────────────────────────

describe("issue #354 P2-06 — a line to a fellow player character is roleplay, on a MOVE decision too", () => {
  const pcs = [{ name: "Isaac Sutton" }, { name: "Karthik Shepherd" }];

  it("a Compel that names another PC and no NPC is spoken to that PC", () => {
    expect(lineIsToAFellowPlayerCharacter("compel", "Karthik, please answer the hail", "Isaac Sutton", { pcActors: pcs, npcNames: ["Vuldar Archer"] })).toBe(true);
    expect(lineIsToAFellowPlayerCharacter("test_your_relationship", "Karthik Shepherd, do you trust me?", "Isaac Sutton", { pcActors: pcs, npcNames: [] })).toBe(true);
  });

  it("a line that names an NPC too is still that NPC's Compel", () => {
    expect(lineIsToAFellowPlayerCharacter("compel", "Archer, hand Karthik the codes or I take them", "Isaac Sutton", { pcActors: pcs, npcNames: ["Vuldar Archer"] })).toBe(false);
    expect(lineIsToAFellowPlayerCharacter("compel", "Vuldar Archer, tell Karthik what you told me", "Isaac Sutton", { pcActors: pcs, npcNames: ["Vuldar Archer"] })).toBe(false);
  });

  it("not a social move, or no other PC named: not this rule's", () => {
    expect(lineIsToAFellowPlayerCharacter("face_danger", "Karthik, hold on!", "Isaac Sutton", { pcActors: pcs, npcNames: [] })).toBe(false);
    expect(lineIsToAFellowPlayerCharacter("compel", "Open the hatch or I burn it open", "Isaac Sutton", { pcActors: pcs, npcNames: [] })).toBe(false);
    expect(lineIsToAFellowPlayerCharacter(null, "Karthik, please", "Isaac Sutton", { pcActors: pcs, npcNames: [] })).toBe(false);
    // The speaker's own name is nobody else's.
    expect(lineIsToAFellowPlayerCharacter("compel", "Isaac Sutton asks nicely", "Isaac Sutton", { pcActors: pcs, npcNames: [] })).toBe(false);
  });

  it('decidePacing: "Karthik, please answer the hail" read as MOVE → compel is narrated, with no move offered', async () => {
    scriptCalls({ classifier: { decision: "MOVE", suggestedMove: "compel", category: "social", confidence: 0.6, reasoning: "Asks Karthik to act." } });
    const pacing = await decidePacing({ playerText: "Karthik, please answer the hail", campaignState: { connectionIds: [] }, character: { name: "Isaac Sutton", actorId: "pc-isaac" }, apiKey: "k" });
    expect(pacing).toMatchObject({ runMove: false, decision: "NARRATIVE", suggestedMove: null });
    expect(pacing.reasoning).toMatch(/spoken to a fellow player character/);
    expect(getRecentMoveDensity(5).count, "it does not count as a move").toBe(0);
  });

  it("control: the same decision for a line that names no PC is rolled", async () => {
    scriptCalls({ classifier: { decision: "MOVE", suggestedMove: "compel", category: "social", confidence: 0.6, reasoning: "Presses the escort." } });
    const pacing = await decidePacing({ playerText: "Stand down or we open fire", campaignState: { connectionIds: [] }, character: { name: "Isaac Sutton", actorId: "pc-isaac" }, apiKey: "k" });
    expect(pacing).toMatchObject({ runMove: true, decision: "MOVE", nominatedMove: "compel" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The pipeline's reading — readMove / readAction
// ─────────────────────────────────────────────────────────────────────────────

describe("issue #354 P2-01 — readMove: a line that makes no move comes back to be narrated", () => {
  const host = Object.fromEntries([
    "postWhichFightCard", "postWhichVowCard", "postWhichLegacyCard", "postTrackGoneCard",
    "applyOutcomeEffects", "addLegacyTicks", "postDevelopRelationshipCard", "applyReachMilestone",
    "postForgeABondCard", "postExpeditionFinishCard", "noteUnsavedOnCopy", "postSceneFinishCard",
    "postRecommitOfferCard", "postVowRecommitOfferCard", "postBondRecommitOfferCard",
    "resolveVowItemCopies", "completeVowItemByName", "postFulfillVowCard", "payFulfilledVowNative",
    "postForsakeVowCard", "postDecisiveActionCostCard", "postMovePayThePriceCard", "postMoveResult",
    "reportUnsavedMoveRecord", "applyMoveConsequenceRiders", "resolveCurrentLocationName",
  ].map(name => [name, vi.fn(async () => null)]));
  const read = (extra = {}) => readMove({
    narration: "Tell us the whole story", speakerActorId: "pc-isaac", campaignState: {}, apiKey: "k", dial: "balanced", ...extra,
  });

  beforeEach(() => {
    configureMovePipeline(host);
    game.settings._store.set(`${MODULE_ID}.campaignState`, {});
  });

  it("no move: nothing else is read, and the classifier's move is the one to offer", async () => {
    scriptCalls({ interpreter: { moveId: null, rationale: "A narrative exchange." } });
    const result = await read({ classifier: { moveId: "compel", category: "social", reasoning: "Presses Archer." } });
    expect(result.noMove).toEqual({ rationale: "A narrative exchange.", lowConfidence: false, offeredMove: "compel" });
    expect(result.rollerActor?.id).toBe("pc-isaac");
    expect(callsTo(/move interpreter/)).toHaveLength(1);
    // The interpreter was handed the classifier's reading and the speaker.
    const text = interpreterCall().messages[0].content;
    expect(text).toMatch(/PACING READ/);
    expect(text).toContain("The character speaking and acting this turn is Isaac Sutton.");
  });

  it("a low-confidence reading is narrated too, its own move offered when the classifier named none", async () => {
    scriptCalls({ interpreter: { moveId: "ask_the_oracle", statUsed: null, rationale: "Low confidence; treat as a narrative exchange.", confidence: "low" } });
    const result = await read();
    expect(result.noMove).toMatchObject({ lowConfidence: true, offeredMove: "ask_the_oracle" });
  });

  it("a failed reading (the fallback) is not an unsure one: it goes on to the confirm dialog", async () => {
    scriptCalls({ interpreter: {} });
    const result = await read();
    expect(result.noMove).toBeUndefined();
    expect(result.interpretation).toMatchObject({ moveId: "face_danger", fallback: true });
  });

  it("…but not in an open fight, where outcomes are earned with dice", async () => {
    getActiveCombatPosition.mockResolvedValue("bad_spot");
    scriptCalls({ interpreter: { moveId: "clash", statUsed: "iron", rationale: "Fights back.", confidence: "low" } });
    const result = await read({ narration: "I swing at the boarder" });
    expect(result.noMove).toBeUndefined();
    expect(result.interpretation.moveId).toBe("clash");
  });

  it("when a roll was asked for, the line is read as a move", async () => {
    scriptCalls({ interpreter: { moveId: null, rationale: "Nothing attempted." } });
    const result = await read({ allowNoMove: false, classifier: { moveId: "compel", category: "social" } });
    expect(result.noMove).toBeUndefined();
    expect(result.interpretation.moveId).toBe("compel");
  });

  it("a card button's forced move is never read as none", async () => {
    scriptCalls({ interpreter: { moveId: null, statUsed: "heart" } });
    const result = await read({ forced: { moveId: "compel" } });
    expect(result.noMove).toBeUndefined();
    expect(result.interpretation.moveId).toBe("compel");
  });

  it("a Batch Mode reading of such a line is a narrative reading, with the move offered", async () => {
    scriptCalls({
      classifier:  { decision: "MOVE", suggestedMove: "compel", category: "social", confidence: 0.8, reasoning: "Presses Archer." },
      interpreter: { moveId: null, rationale: "A narrative exchange." },
    });
    const reading = await readAction({ text: "Tell us the whole story", speakerActorId: "pc-isaac", campaignState: {}, apiKey: "k", dial: "balanced" });
    expect(reading).toEqual({ kind: "narrative", suggestedMove: "compel", suggestedTargetId: null });
  });

  it('…and "Roll a move instead" still reads it as a move', async () => {
    scriptCalls({ interpreter: { moveId: "compel", statUsed: "heart", rationale: "Pressed." } });
    const reading = await readAction({ text: "Tell us the whole story", speakerActorId: "pc-isaac", campaignState: {}, apiKey: "k", dial: "balanced", readAs: { move: true } });
    expect(reading.kind).not.toBe("narrative");
    expect(interpreterCall().messages[0].content).toMatch(/A ROLL WAS ASKED FOR/);
  });
});

describe("issue #354 P2-01 — a line narrated after all does not count as a recent move", () => {
  it("reviseLastDecision rewrites the newest entry of the density window", () => {
    recordRecentDecision({ decision: "MOVE", sceneTag: "s" });
    recordRecentDecision({ decision: "MOVE", sceneTag: "s" });
    expect(getRecentMoveDensity(5).count).toBe(2);
    reviseLastDecision("NARRATIVE");
    expect(getRecentMoveDensity(5).count).toBe(1);
    resetRecentDensity();
    expect(() => reviseLastDecision("NARRATIVE")).not.toThrow();
  });
});
