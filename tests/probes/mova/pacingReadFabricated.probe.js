/**
 * MOVA-05 · PACING-READ-FABRICATED
 *
 * Scenario: issue #354 P2-02 hands the pacing classifier's reading of a line
 * to the move interpreter as a PACING READ hint ("the stage before you read
 * this line as compel in a social scene — …"). Three MOVE decisions are made
 * with no classifier reading at all:
 *   - the classifier call failed or its reply could not be parsed
 *     (classifier.js fallbackDecision: category "exploration", reasoning
 *     "fallback: …");
 *   - pacing is switched off (router.js: category "exploration", reasoning
 *     "pacing disabled");
 *   - `!roll` forced the line (router.js: category "exploration", reasoning
 *     "!roll override").
 *
 * Correct: with no classifier reading, the interpreter is given none — no
 * PACING READ line.
 *
 * Today: index.js (and movePipeline.readAction for a Batch Mode round) build
 * the interpreter's `classifier` from any MOVE decision that carries a
 * category, and those three all carry the placeholder "exploration". The
 * interpreter is told "PACING READ …: the stage before you read this line in
 * a exploration scene — "pacing disabled"" (or "fallback: unparseable JSON",
 * "!roll override") — a scene kind nobody read, for a line that is a demand
 * made of an NPC. P2-02's own complaint was dialogue read as Undertake an
 * Expedition.
 *
 * Production path: a player's typed line through the chat hook on a booted
 * GM + player table — the real pacing router, classifier, interpreter and
 * move pipeline, Claude answered at the fetch boundary. The confirm dialog is
 * answered by the test (declined: the roll is not what this is about).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

vi.mock("../../../src/moves/abilityScanner.js", async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock("../../../src/ui/settingsPanel.js", async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => false),
}));

import { simulateTable, USERS } from "../../helpers/multiClient.js";
import { scriptClaude } from "../../helpers/faults.js";
import { CampaignStateSchema } from "../../../src/schemas.js";

const LINE = "Open the vault, quartermaster, or I walk out of here with your ledger.";
const isClassifier  = (call) => /pacing pre-classifier/.test(call?.system ?? "");
const isInterpreter = (call) => /move interpreter/.test(call?.system ?? "");

let table, classifierReply;

async function boot({ settings = {}, pacing = null } = {}) {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false, autoRecapEnabled: false,
    ...settings,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: "mova5-s1", sessionNumber: 1,
      lastSessionTimestamp: new Date().toISOString(), currentSceneId: "mova5-sc", sceneTruths: [],
      sceneState: { bySubject: {}, sceneId: "mova5-sc" }, sceneFrame: null,
      ...(pacing ? { pacing } : {}) },
  } } });
  table.addActor({ id: "pc-isaac-mova5", name: "Isaac Sutton", ownership: { "pl-1": 3 }, items: { contents: [] } });
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

/** The player says the line; the interpreter's call for it (its user message). */
async function interpreterMessageFor() {
  await table.client("pl-1").chat(LINE, { speaker: { actor: "pc-isaac-mova5", alias: "Isaac Sutton" } });
  await table.settle(); await table.drain();
  const reads = table.claude.calls.filter(isInterpreter);
  expect(reads, "the line reached the move interpreter (setup)").toHaveLength(1);
  return String(reads[0].userText ?? "");
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 60_000);
afterAll(() => table?.teardown());
beforeEach(() => {
  silenceConsoleErrors();
  classifierReply = JSON.stringify({ decision: "MOVE", suggestedMove: "compel", category: "social", confidence: 0.8, reasoning: "Presses the quartermaster." });
});

describe("MOVA-05 — the interpreter's PACING READ is the classifier's reading, or nothing", () => {
  it("control: the classifier read the line — its move, scene kind and reasoning are handed on", async () => {
    await boot();
    const text = await interpreterMessageFor();
    expect(table.claude.calls.filter(isClassifier)).toHaveLength(1);
    expect(text).toMatch(/PACING READ[^\n]*read this line as compel in a social scene — "Presses the quartermaster\."/);
  }, 60_000);

  it("the classifier's reply could not be read: no PACING READ is invented for the interpreter", async () => {
    await boot();
    classifierReply = "I think this is probably a move, but";   // not JSON: classifier.js falls back to MOVE
    const text = await interpreterMessageFor();
    expect(table.claude.calls.filter(isClassifier), "the classifier was asked (setup)").toHaveLength(1);
    expect(text).not.toMatch(/PACING READ/);
  }, 60_000);

  it("pacing switched off: the classifier never ran, so the interpreter is given no PACING READ", async () => {
    await boot({ settings: { "pacing.enabled": false } });
    const text = await interpreterMessageFor();
    expect(table.claude.calls.filter(isClassifier), "no classifier call (setup)").toHaveLength(0);
    expect(text).not.toMatch(/PACING READ/);
  }, 60_000);

  it("a line forced by !roll: the classifier never ran, so the interpreter is given no PACING READ", async () => {
    await boot({ pacing: { sceneOverride: null, forceNextAsMove: true } });
    const text = await interpreterMessageFor();
    expect(table.claude.calls.filter(isClassifier), "no classifier call (setup)").toHaveLength(0);
    expect(text, "the roll was asked for (setup)").toMatch(/A ROLL WAS ASKED FOR/);
    expect(text).not.toMatch(/PACING READ/);
  }, 60_000);
});
