/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/pacedFailureToldByCause.test.js
 *
 * Driven through a player's typed line on a three-client table (keyed GM, two
 * players), Claude answered by scripted replies (tests/helpers/faults.js):
 *
 *   ERROR-TEXT-BLAMES-KEY — the paced line's "not narrated" notice and the
 *     move pipeline's "Move interpretation failed" notification named the API
 *     key for every failure; they name the cause (Anthropic overloaded).
 *   PACED-DISCARD-UNDER-XCARD-SILENT — a paced narration discarded because the
 *     X-Card was played while it was written posted nothing; it posts the
 *     "Narration paused" notice a move's and @scene's discards post.
 *   PACED-ROUTER-THROW — a throw in the pacing router before the narration
 *     started only logged: the pacing check's own throw now tells the GM the
 *     line is read as a move; a throw starting the narration of a line read
 *     as narrative posts the "not narrated" notice, and the line is not rolled.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

const control = vi.hoisted(() => ({ sceneReadThrows: false, narrateThrows: false }));
vi.mock("../../src/narration/narrator.js", async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    getRecentSceneForReading: vi.fn((...args) => {
      if (control.sceneReadThrows) throw new Error("scene read failed (test fault)");
      return original.getRecentSceneForReading(...args);
    }),
    narratePacedInput: vi.fn((...args) => {
      if (control.narrateThrows) return Promise.reject(new Error("dispatch failed (test fault)"));
      return original.narratePacedInput(...args);
    }),
  };
});

import { simulateTable, USERS } from "../helpers/multiClient.js";
import { scriptClaude, claudeFault } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

const NARRATION_MODEL = "claude-sonnet-5-5";
const LINE = "I lean on the bar and listen to the dockhands argue.";
const NARRATIVE = JSON.stringify({ decision: "NARRATIVE", suggestedMove: null, category: "social", confidence: 0.9, reasoning: "listening, no risk" });
const MOVE = JSON.stringify({ decision: "MOVE", suggestedMove: null, category: "action", confidence: 0.9, reasoning: "a risky act" });
const PROSE = "The dockhands bicker over a crate of stolen coolant.\n```json\n{\"newTruths\":[],\"stateChanges\":[]}\n```";

const isClassifier  = (call) => /pacing pre-classifier/.test(call.system ?? "");
const isInterpreter = (call) => /move interpreter/.test(call.system ?? "");
const isNarration   = (call) => call.model === NARRATION_MODEL && !isClassifier(call) && !isInterpreter(call);

let table;

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.sceneReadThrows = false;
  control.narrateThrows = false;
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: {
      ...CampaignStateSchema,
      sessionActive: true, currentSessionId: "sess-1", sessionNumber: 2, currentSceneId: "sc-1", sceneTruths: [],
    },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-gina");
  table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 } });
  table.addActor({ id: "pc-ren",  name: "Ren",  ownership: { "pl-2": 3 } });
  silenceConsoleErrors();
});

/** Cards posted after the line, and every client's notifications. */
function toldAfter(line) {
  const messages = table.world.messages();
  const at = messages.findIndex(m => m.content === line);
  const cards = messages.slice(at + 1).map(m => String(m.content ?? ""));
  const notes = ["gm-1", "pl-1", "pl-2"].flatMap(id => table.client(id).notifications.map(n => String(n.message)));
  return { cards, notes };
}

describe("ERROR-TEXT-BLAMES-KEY — told by cause", () => {
  it("a paced line's narration overloaded: the notice says overloaded, not 'check your API key'", async () => {
    scriptClaude(table, { fallback: (call) => (isClassifier(call) ? NARRATIVE : "{}") })
      .when(isNarration, claudeFault.overloaded());
    await table.client("pl-1").chat(LINE, { speaker: { actor: "pc-kira" } });
    await table.settle(); await table.drain();

    const { cards } = toldAfter(LINE);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatch(/That line was not narrated/);
    expect(cards[0]).toMatch(/Narration unavailable — Claude is overloaded right now/);
    expect(cards[0]).not.toMatch(/API key/);
  });

  it("the move interpreter overloaded: 'Move interpretation failed — Claude is overloaded', not 'Check your API key'", async () => {
    scriptClaude(table, { fallback: (call) => (isClassifier(call) ? MOVE : "{}") })
      .when(isInterpreter, claudeFault.overloaded(), { times: 5 });
    await table.client("pl-1").chat("I vault the barricade under fire.", { speaker: { actor: "pc-kira" } });
    await table.settle(); await table.drain();

    expect(table.claude.calls.filter(isInterpreter).length, "the interpreter was asked (setup)").toBeGreaterThan(0);
    const { notes } = toldAfter("I vault the barricade under fire.");
    const failed = notes.filter(n => /Move interpretation failed/.test(n));
    expect(failed.length, JSON.stringify(notes)).toBeGreaterThan(0);
    expect(failed[0]).toMatch(/Claude is overloaded right now/);
    expect(failed.some(n => /API key/.test(n))).toBe(false);
  });
});

describe("PACED-DISCARD-UNDER-XCARD-SILENT — a paced reply the X-Card discards", () => {
  it("posts the paused notice; nothing the reply held is narrated", async () => {
    const held = scriptClaude(table, { fallback: (call) => (isClassifier(call) ? NARRATIVE : "{}") }).hold(isNarration);
    await table.client("pl-1").chat(LINE, { speaker: { actor: "pc-kira" } });
    await held.arrived;

    await table.client("pl-2").chat("!x");
    await table.settle();
    expect(table.world.campaignState().xCardActive, "the X-Card is in play (setup)").toBe(true);
    held.release(PROSE);
    await table.settle(); await table.drain();

    expect(table.cards(f => f.narratorCard === true), "nothing narrated").toHaveLength(0);
    expect(table.world.messages().some(m => /dockhands bicker/.test(String(m.content ?? ""))), "the reply is not shown").toBe(false);
    const paused = table.cards(f => f.narrationPaused === true);
    expect(paused, "one paused notice for the discarded line").toHaveLength(1);
    expect(paused[0].content).toMatch(/That line was not narrated/);
    expect(paused[0].content).toMatch(/Narration paused — the X-Card is active/);
  });
});

describe("PACED-ROUTER-THROW — a throw in the router before the narration starts", () => {
  it("the pacing check throws: the GM is told the line is read as a move", async () => {
    control.sceneReadThrows = true;
    scriptClaude(table, { fallback: (call) => (isClassifier(call) ? NARRATIVE : "{}") });
    await table.client("pl-1").chat(LINE, { speaker: { actor: "pc-kira" } });
    await table.settle(); await table.drain();

    const { notes } = toldAfter(LINE);
    expect(notes.some(n => /the pacing check failed — something went wrong.*read as a move instead/.test(n)), JSON.stringify(notes)).toBe(true);
  });

  it("starting the narration of a line read as narrative throws: the table is told, and the line is not rolled", async () => {
    control.narrateThrows = true;
    scriptClaude(table, { fallback: (call) => (isClassifier(call) ? NARRATIVE : "{}") });
    await table.client("pl-1").chat(LINE, { speaker: { actor: "pc-kira" } });
    await table.settle(); await table.drain();

    expect(table.claude.calls.filter(isInterpreter), "not handed to the move pipeline").toHaveLength(0);
    const { cards } = toldAfter(LINE);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatch(/That line was not narrated/);
    expect(table.cards(f => f.narratorCard === true)).toHaveLength(0);
    expect(table.world.campaignState().pendingMove ?? false).toBe(false);
  });
});
