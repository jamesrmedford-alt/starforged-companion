/**
 * STARFORGED COMPANION
 * tests/unit/pclessPlayerNotRolled.test.js
 *
 * A player with no character of their own is not rolled as another player's
 * PC (issue #326 D8).
 *
 * resolveSpeakerActorId returns null for a player who owns no PC at a table
 * of two or more (issue #321 U23's rule: the first PC is only a GM's, or the
 * one PC's in solo play). The move pipeline then fell back anyway —
 * `rollerActor = speakerActor ?? getPlayerActors()[0]` — so the move was
 * rolled with Kira's stats, its +1 momentum landed on Kira and the card named
 * her the roller. Decided: follow U23 — a GM's narration, or any narration in
 * a one-PC world, still falls back to the first PC; a PC-less player in a
 * multi-PC world is whispered that they need a character, and nothing is
 * rolled.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

vi.mock("../../src/pacing/router.js", async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: "MOVE", suggestedMove: null })),
}));
vi.mock("../../src/moves/interpreter.js", async (original) => ({
  ...(await original()),
  interpretMove: vi.fn(async (text) => ({ moveId: "face_danger", moveName: "Face Danger", statUsed: "edge", adds: 0,
    rationale: "test", mischiefApplied: false, playerNarration: text, inputMethod: "chat" })),
}));
vi.mock("../../src/moves/abilityScanner.js", async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock("../../src/ui/settingsPanel.js", async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock("../../src/moves/resolver.js", async (original) => {
  const real = await original();
  // Challenge 2 and 3; action 6 + edge: a strong hit (+1 momentum).
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, "random").mockReturnValueOnce(0.15).mockReturnValueOnce(0.25).mockReturnValueOnce(0.99);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";
import { interpretMove } from "../../src/moves/interpreter.js";
import { routePacedInput } from "../../src/pacing/router.js";

let table, kira;
const LINE = "I slip through the crowd before the patrol spots me.";
const momentum = (actor) => actor.system.momentum.value;
const moveCards = () => table.cards(f => f.moveResolution);
const notices = () => table.cards(f => f.noCharacterNotice);

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());

async function seat({ secondPc = true } = {}) {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "s-1", sessionNumber: 1, currentSceneId: "sc-1", sceneTruths: [] },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-test");
  // Kira is Pat's (pl-1); Ren belongs to a player not at the table. Quinn (pl-2) owns no PC.
  kira = table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, system: { momentum: { value: 2, max: 10, min: -6, resetValue: 2 } } });
  if (secondPc) table.addActor({ id: "pc-ren", name: "Ren", ownership: { "pl-absent": 3 } });
  scriptClaude(table, { fallback: () => 'The crowd parts.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  vi.mocked(interpretMove).mockClear();
}

async function say(user) {
  await table.client(user).chat(LINE);
  await table.settle(); await table.drain();
}

describe("a PC-less player is not rolled as another player's character (issue #326 D8)", () => {
  beforeEach(() => seat());

  it("Quinn (no PC) types a move: nothing is rolled, Kira is not changed, and Quinn is told", async () => {
    await say("pl-2");
    expect(moveCards()).toHaveLength(0);
    expect(momentum(kira)).toBe(2);
    expect(interpretMove).not.toHaveBeenCalled();                 // no Claude call spent on it
    const [notice] = notices();
    expect(notice.whisper).toContain("pl-2");
    expect(notice.content).toMatch(/don&rsquo;t have a character of your own/);
  }, 30_000);

  it("control: Pat (Kira's player) types the same move and Kira is credited", async () => {
    await say("pl-1");
    expect(moveCards()[0].flags[MODULE_ID].actorId).toBe("pc-kira");
    expect(momentum(kira)).toBe(3);
    expect(notices()).toHaveLength(0);
  }, 30_000);

  it("control: a GM's narration still falls back to the first PC", async () => {
    await say("gm-1");
    expect(moveCards()[0].flags[MODULE_ID].actorId).toBe("pc-kira");
    expect(notices()).toHaveLength(0);
  }, 30_000);

  it("control: narration that is not a move is not refused", async () => {
    vi.mocked(routePacedInput).mockResolvedValueOnce({ runMove: false, decision: "NARRATIVE", suggestedMove: null });
    await say("pl-2");
    expect(notices()).toHaveLength(0);
  }, 30_000);
});

describe("in a one-PC world the sole PC is the roller (issue #326 D8)", () => {
  beforeEach(() => seat({ secondPc: false }));

  it("a PC-less player's move rolls the one PC, as solo play does", async () => {
    await say("pl-2");
    expect(moveCards()[0].flags[MODULE_ID].actorId).toBe("pc-kira");
    expect(notices()).toHaveLength(0);
  }, 30_000);
});
