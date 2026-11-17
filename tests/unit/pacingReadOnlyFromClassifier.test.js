/**
 * STARFORGED COMPANION
 * tests/unit/pacingReadOnlyFromClassifier.test.js
 *
 * Issue #362 AC64 PACING-READ-FABRICATED. Issue #354 P2-02 hands the pacing
 * classifier's reading of a line to the move interpreter as a PACING READ
 * hint ("the stage before you read this line as compel in a social scene —
 * …"). Three MOVE decisions are made with no classifier reading at all: the
 * classifier's call failed or its reply could not be read (its fallback),
 * pacing is switched off, and `!roll` forced the line. Each carries a
 * placeholder scene kind ("exploration") and a status string where the
 * reasoning goes, and both free-flow (index.js) and a Batch Mode reading
 * (movePipeline.js readAction) handed them on: the interpreter was told a
 * demand made of an NPC was "in a exploration scene — "pacing disabled"".
 *
 * With no classifier reading there is no PACING READ (router.js
 * classifierReadingOf). The control — a line the classifier did read — keeps
 * its move, scene kind and reasoning.
 *
 * Production path: a player's typed line through the chat hook on a booted
 * GM + player table — the real pacing router, classifier, interpreter and
 * move pipeline, Claude answered at the fetch boundary; the confirm dialog is
 * declined (the roll is not what this is about). The Batch Mode reading runs
 * readAction on the GM's client.
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

vi.mock("../../src/moves/abilityScanner.js", async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock("../../src/ui/settingsPanel.js", async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => false),
}));

import { simulateTable, USERS } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";
import { classifierReadingOf } from "../../src/pacing/router.js";

const MODULE_ID = "starforged-companion";
const LINE = "Open the vault, quartermaster, or I walk out of here with your ledger.";
const isClassifier  = (call) => /pacing pre-classifier/.test(call?.system ?? "");
const isInterpreter = (call) => /move interpreter/.test(call?.system ?? "");

let table, classifierReply;

async function boot({ settings = {}, pacing = null } = {}) {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false, autoRecapEnabled: false,
    ...settings,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "ac64-s1", sessionNumber: 1,
      lastSessionTimestamp: new Date().toISOString(), currentSceneId: "ac64-sc", sceneTruths: [],
      sceneState: { bySubject: {}, sceneId: "ac64-sc" }, sceneFrame: null,
      ...(pacing ? { pacing } : {}) },
  } } });
  table.addActor({ id: "pc-isaac-ac64", name: "Isaac Sutton", ownership: { "pl-1": 3 }, items: { contents: [] } });
  await table.setClaudeKey("gm-1", "sk-ant-gina");
  scriptClaude(table, {
    fallback: (call) => {
      if (isClassifier(call))  return classifierReply;
      if (isInterpreter(call)) return JSON.stringify({ moveId: "compel", statUsed: "iron", rationale: "Demands the vault.", confidence: "high" });
      if (/NARRATOR ROLE|SIDECAR/.test(call?.system ?? "")) return 'The quartermaster blinks.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
      return "{}";
    },
  });
}

/** The interpreter's one call so far — its user message. */
function interpreterText() {
  const reads = table.claude.calls.filter(isInterpreter);
  expect(reads, "the line reached the move interpreter (setup)").toHaveLength(1);
  return String(reads[0].userText ?? "");
}

/** The player says the line in free-flow; the interpreter's user message for it. */
async function freeFlowInterpreterText() {
  await table.client("pl-1").chat(LINE, { speaker: { actor: "pc-isaac-ac64", alias: "Isaac Sutton" } });
  await table.settle(); await table.drain();
  return interpreterText();
}

/** A Batch Mode round reads the line (readAction, on the GM's client); the interpreter's user message. */
async function roundReadingInterpreterText() {
  await table.client("gm-1").run(async () => {
    const { readAction } = await import("../../src/moves/movePipeline.js");
    return readAction({
      text: LINE, speakerActorId: "pc-isaac-ac64",
      campaignState: game.settings.get(MODULE_ID, "campaignState"), apiKey: "sk-ant-gina", dial: "balanced",
    });
  });
  await table.settle();
  return interpreterText();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 60_000);
afterAll(() => table?.teardown());
beforeEach(() => {
  silenceConsoleErrors();
  classifierReply = JSON.stringify({ decision: "MOVE", suggestedMove: "compel", category: "social", confidence: 0.8, reasoning: "Presses the quartermaster." });
});

describe("issue #362 AC64 — free-flow: the interpreter's PACING READ is the classifier's reading, or nothing", () => {
  it("control: the classifier read the line — its move, scene kind and reasoning are handed on", async () => {
    await boot();
    const text = await freeFlowInterpreterText();
    expect(table.claude.calls.filter(isClassifier)).toHaveLength(1);
    expect(text).toMatch(/PACING READ[^\n]*read this line as compel in a social scene — "Presses the quartermaster\."/);
  }, 60_000);

  it("the classifier's reply could not be read: no PACING READ is invented for the interpreter", async () => {
    await boot();
    classifierReply = "I think this is probably a move, but";   // not JSON: classifier.js falls back to MOVE
    const text = await freeFlowInterpreterText();
    expect(table.claude.calls.filter(isClassifier), "the classifier was asked (setup)").toHaveLength(1);
    expect(text).not.toMatch(/PACING READ/);
    expect(text).not.toMatch(/fallback: unparseable JSON/);
  }, 60_000);

  it("pacing switched off: the classifier never ran, so the interpreter is given no PACING READ", async () => {
    await boot({ settings: { "pacing.enabled": false } });
    const text = await freeFlowInterpreterText();
    expect(table.claude.calls.filter(isClassifier), "no classifier call (setup)").toHaveLength(0);
    expect(text).not.toMatch(/PACING READ/);
    expect(text).not.toMatch(/pacing disabled/);
  }, 60_000);

  it("a line forced by !roll: the classifier never ran, so the interpreter is given no PACING READ", async () => {
    await boot({ pacing: { sceneOverride: null, forceNextAsMove: true } });
    const text = await freeFlowInterpreterText();
    expect(table.claude.calls.filter(isClassifier), "no classifier call (setup)").toHaveLength(0);
    expect(text, "the roll was asked for (setup)").toMatch(/A ROLL WAS ASKED FOR/);
    expect(text).not.toMatch(/PACING READ/);
  }, 60_000);
});

describe("issue #362 AC64 — a Batch Mode reading: the same rule", () => {
  it("control: the classifier read the line — the round's reading hands it on", async () => {
    await boot();
    const text = await roundReadingInterpreterText();
    expect(text).toMatch(/PACING READ[^\n]*read this line as compel in a social scene — "Presses the quartermaster\."/);
  }, 60_000);

  it("the classifier's reply could not be read: the round's reading invents no PACING READ", async () => {
    await boot();
    classifierReply = "I think this is probably a move, but";
    const text = await roundReadingInterpreterText();
    expect(table.claude.calls.filter(isClassifier), "the classifier was asked (setup)").toHaveLength(1);
    expect(text).not.toMatch(/PACING READ/);
  }, 60_000);

  it("pacing switched off: the round's reading has no PACING READ", async () => {
    await boot({ settings: { "pacing.enabled": false } });
    const text = await roundReadingInterpreterText();
    expect(table.claude.calls.filter(isClassifier), "no classifier call (setup)").toHaveLength(0);
    expect(text).not.toMatch(/PACING READ/);
  }, 60_000);
});

describe("issue #362 AC64 — classifierReadingOf", () => {
  const read = { runMove: true, decision: "MOVE", suggestedMove: null, nominatedMove: "compel", category: "social", confidence: 0.8, reasoning: "Presses Archer.", classifierRead: true };

  it("a MOVE the classifier made: its move, scene kind and reasoning", () => {
    expect(classifierReadingOf(read)).toEqual({ moveId: "compel", category: "social", reasoning: "Presses Archer." });
    expect(classifierReadingOf({ ...read, nominatedMove: null })).toEqual({ moveId: null, category: "social", reasoning: "Presses Archer." });
  });

  it("none for a decision no classifier made: pacing off, !roll, its fallback, the router failing", () => {
    expect(classifierReadingOf({ runMove: true, decision: "MOVE", suggestedMove: null, category: "exploration", confidence: 1, reasoning: "pacing disabled", pacingDisabled: true })).toBeNull();
    expect(classifierReadingOf({ runMove: true, decision: "MOVE", suggestedMove: null, category: "exploration", confidence: 1, reasoning: "!roll override", forced: true })).toBeNull();
    expect(classifierReadingOf({ ...read, nominatedMove: null, category: "exploration", reasoning: "fallback: api error", classifierRead: false })).toBeNull();
    expect(classifierReadingOf({ runMove: true, decision: "MOVE", suggestedMove: null, category: "exploration", confidence: 0, reasoning: "pacing router failed" })).toBeNull();
    expect(classifierReadingOf({ runMove: true, decision: "MOVE", suggestedMove: null })).toBeNull();
  });

  it("none for a narrative decision, or nothing", () => {
    expect(classifierReadingOf({ ...read, runMove: false, decision: "NARRATIVE" })).toBeNull();
    expect(classifierReadingOf(null)).toBeNull();
    expect(classifierReadingOf(undefined)).toBeNull();
  });
});
