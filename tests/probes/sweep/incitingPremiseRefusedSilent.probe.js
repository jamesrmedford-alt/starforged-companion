/**
 * PROBE — SWEEP-04 INCITING-PREMISE-REFUSED-SILENT (sweep auditor, family 14:
 * no silent failures — the X13 "a refused Begin says the session was not
 * started" and X10 "the card says not saved" standard)
 *
 * What the user does: the GM runs ✦ Envision Inciting Incident (`!incite`,
 * the Session panel, or Campaign Start). The narrator's opening is posted
 * with its ⚔ Swear button. Then the world refuses the write that files the
 * premise (`campaignState.incitingIncident`).
 *
 * What happens: `runIncitingIncident` (src/session/incitingIncident.js:463–
 * 474) finds the store without the premise and writes one console line —
 * "the world did not save the premise — it is not campaign canon". The
 * inciting card stands as if the campaign had its premise; no card, whisper
 * or notification tells the GM. Since X38 the GM's own prompts no longer
 * carry it either (before, the cache masked the loss on that client): every
 * later narration is built without the CAMPAIGN PREMISE block the prompt
 * contract says is "never dropped", and nobody at the table knows to run it
 * again. `persistSceneLedgerFields` returns false on a refusal
 * (sceneLifecycle.js:674–676) and the caller ignores that too.
 *
 * What should happen: the GM is told on the inciting card's channel — a
 * "not saved" card or a notification naming the premise, with the remedy
 * (run it again) — as a refused Begin a Session (X13) and a refused `!scene`
 * (X10) are reported.
 *
 * Control: with the write accepted the premise is in the world and no
 * "not saved" word is spoken.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/sweep/incitingPremiseRefusedSilent.probe.js
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { simulateTable, USERS, MODULE_ID } from "../../helpers/multiClient.js";
import { scriptClaude } from "../../helpers/faults.js";
import { CampaignStateSchema } from "../../../src/schemas.js";

const KEY = `${MODULE_ID}.campaignState`;
const NARRATION_MODEL = "claude-sonnet-4-5-20250929";
const NARRATION = [
  "The beacon at Paradox Station screams a distress code no one has used in a century.",
  "",
  "Suggested vow: Find who silenced the beacon (dangerous)",
  "Situation: Paradox Station has gone dark and its beacon is screaming.",
  "```json", JSON.stringify({ newTruths: [], stateChanges: [] }), "```",
].join("\n");
const TOLD = /premise|not saved|not canon|run it again|try again/i;

let table;
const world = () => table.world.campaignState();
const told  = () => table.cards(f => !f.incitingIncidentCard).some(c => TOLD.test(c.content))
  || table.client("gm-1").notifications.some(n => TOLD.test(n.message));

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: { campaignState: {
    ...CampaignStateSchema, sessionActive: true, currentSessionId: "sess-1", sessionNumber: 1,
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: null }, sceneFrame: null, currentSceneId: null,
  } } } });
  await table.setClaudeKey("gm-1", "sk-ant-gina");
  table.addActor({ id: "pc-1", name: "Kira", type: "character", ownership: { "pl-1": 3 } });
  scriptClaude(table, { fallback: (call) => (call.model === NARRATION_MODEL ? NARRATION : "{}") });
});

describe("PROBE SWEEP-04 INCITING-PREMISE-REFUSED-SILENT", () => {
  it("a refused premise write is told to the GM, not only logged", async () => {
    silenceConsoleErrors();
    // Refuse the one write that files the premise; every other write lands.
    table.interceptWrites(w => (w.kind === "setting" && w.key === KEY && w.client === "gm-1" && w.value?.incitingIncident)
      ? new Error("Setting [campaignState] could not be saved: the server refused the write")
      : undefined);

    await table.client("gm-1").chat("!incite");
    await table.settle();

    // Sanity: the opening was narrated and posted; the premise never reached the world.
    expect(table.cards(f => f.incitingIncidentCard)).toHaveLength(1);
    expect(world().incitingIncident ?? null).toBeNull();
    // Expected: a card or notification saying the premise was not saved. Actual: a console.warn only.
    expect(told()).toBe(true);
  }, 30_000);

  it("control: with the write accepted the premise is canon and nothing says 'not saved'", async () => {
    await table.client("gm-1").chat("!incite");
    await table.settle();
    expect(world().incitingIncident?.prose).toMatch(/Paradox Station/);
    expect(told()).toBe(false);
  }, 30_000);
});
