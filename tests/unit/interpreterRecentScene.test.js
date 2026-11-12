/**
 * The move interpreter reads the line against the recent scene (alpha 23
 * playtest: "When I said we're on our way, the interpreter had no context to
 * understand that that was setting a course to the coordinates provided by
 * the npc").
 *
 * interpretMove read the player's line alone — with a one-paragraph campaign
 * summary — so "we're on our way" or "set a course" carried no destination,
 * and moveTarget came back null. The pipeline now passes the last few
 * narration cards (narrator.js getRecentSceneForReading) as RECENT SCENE, and
 * the prompt names a target the line only refers to from it.
 *
 * Also: the interpreter's model is its own constant (Haiku 5.5), never the
 * copy a world stored in campaignState.api at creation.
 */

import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";

const control = vi.hoisted(() => ({ calls: [] }));
vi.mock("../../src/api-proxy.js", () => ({ apiPost: vi.fn() }));

import { interpretMove } from "../../src/moves/interpreter.js";
import { apiPost } from "../../src/api-proxy.js";
import { getRecentSceneForReading, READING_SCENE_MAX_CHARS } from "../../src/narration/narrator.js";

const MODULE_ID = "starforged-companion";
const SCENE = 'Isaac Sutton: "Tell Vuldar we\'re in."\n\nA data packet chirps through: coordinates for the gap at the edge of charted space. "Course laid in," Karthik says.';
const OPTS  = { campaignState: {}, mischiefLevel: "lawful", apiKey: "test-key" };

function replyJson(obj) {
  apiPost.mockResolvedValue({ content: [{ type: "text", text: JSON.stringify({ confidence: "high", rationale: "Travel.", ...obj }) }] });
}
const body = () => apiPost.mock.calls[0][2];

describe("interpretMove() — the recent scene", () => {
  beforeEach(() => { vi.clearAllMocks(); control.calls.length = 0; });

  it("sends the recent scene just before the player's line, marked as context", async () => {
    replyJson({ moveId: "set_a_course", statUsed: "supply", moveTarget: "the gap (Vuldar Archer's coordinates)" });
    await interpretMove("We're on our way.", { ...OPTS, recentScene: SCENE });
    const text = body().messages[0].content;
    expect(text).toContain("RECENT SCENE");
    expect(text).toContain("coordinates for the gap");
    expect(text.indexOf("RECENT SCENE")).toBeLessThan(text.indexOf('Player narration: "We\'re on our way."'));
  });

  it("tells the model to name a target the line only refers to as the recent scene names it", async () => {
    replyJson({ moveId: "set_a_course", statUsed: "supply" });
    await interpretMove("We're on our way.", { ...OPTS, recentScene: SCENE });
    const system = JSON.stringify(body().system);
    expect(system).toMatch(/refers to it without naming it .*as the RECENT SCENE names it/);
  });

  it("the destination it names from the scene comes back as moveTarget", async () => {
    replyJson({ moveId: "set_a_course", statUsed: "supply", moveTarget: "the gap (Vuldar Archer's coordinates)" });
    const result = await interpretMove("We're on our way.", { ...OPTS, recentScene: SCENE });
    expect(result).toMatchObject({ moveId: "set_a_course", moveTarget: "the gap (Vuldar Archer's coordinates)" });
  });

  it("control: no recent scene, no block", async () => {
    replyJson({ moveId: "face_danger", statUsed: "edge" });
    await interpretMove("I dive for cover.", OPTS);
    expect(body().messages[0].content).not.toContain("RECENT SCENE");
  });

  it("runs on Haiku 5.5 with its own cap — not a world's stored api.model / api.maxTokens", async () => {
    replyJson({ moveId: "face_danger", statUsed: "edge" });
    await interpretMove("I dive for cover.", {
      ...OPTS, campaignState: { api: { model: "claude-haiku-5-5", maxTokens: 1000, promptCachingEnabled: true } },
    });
    expect(body()).toMatchObject({ model: "claude-haiku-5-5", max_tokens: 1300 });
  });
});

describe("getRecentSceneForReading()", () => {
  let realMessages;
  const card = (sessionId, text, playerText = null) => ({
    flags: { [MODULE_ID]: { narratorCard: true, sessionId, narrationText: text, ...(playerText ? { playerText } : {}) } },
  });
  beforeAll(() => { realMessages = game.messages; });
  afterAll(() => { game.messages = realMessages; });

  it("is the session's last cards — the player's line, then the prose", () => {
    game.messages = { contents: [
      card("s0", "An older session's scene."),
      card("s1", "The relay goes dark."),
      card("s1", "A data packet chirps through: coordinates for the gap.", "Tell Vuldar we're in."),
    ] };
    const scene = getRecentSceneForReading("s1");
    expect(scene).toContain("coordinates for the gap");
    expect(scene).toContain("Tell Vuldar we're in.");
    expect(scene).not.toContain("older session");
  });

  it("keeps the newest when the cards run long", () => {
    const long = "x".repeat(READING_SCENE_MAX_CHARS);
    game.messages = { contents: [card("s1", long), card("s1", "The newest beat: Archer stops counting.")] };
    const scene = getRecentSceneForReading("s1");
    expect(scene.length).toBeLessThanOrEqual(READING_SCENE_MAX_CHARS + 1);
    expect(scene).toContain("The newest beat: Archer stops counting.");
  });

  it("is empty with no session or no cards", () => {
    game.messages = { contents: [] };
    expect(getRecentSceneForReading("s1")).toBe("");
    expect(getRecentSceneForReading(null)).toBe("");
  });
});
