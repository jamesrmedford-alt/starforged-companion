/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/closingVignetteCharactersArePresentPcs.test.js
 *
 * known-issues CLOSING-VIGNETTE-FIRST-PC (issue #345 AA31's sibling): End a
 * Session's closing vignette passed no PCs to narrateSessionVignette, so its
 * one CHARACTER block was the campaign's first PC — whoever was at the table.
 * It now hands the narration the PCs at the table (collectGalleyParticipants,
 * as the galley does): each gets its block, and with none present there is
 * none.
 *
 * Scenario: Kira (the first PC) is Quinn's (pl-2); Ren is Pat's (pl-1).
 * Driven through the GM's typed `!end-session`.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { simulateTable, USERS } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";

const NARRATION_MODEL = "claude-sonnet-5-5";
const VIGNETTE = "Far off, a dockhand sweeps the same corner twice.\n```json\n{\"newTruths\":[],\"stateChanges\":[]}\n```";

let table;

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false, autoRecapEnabled: false,
    combatTrackerEnabled: false,
    campaignState: {
      ...CampaignStateSchema, currentSessionId: "es-s1", sessionNumber: 3, sessionActive: true,
      sessionStartedId: "es-s1", sessionActiveStartedAt: new Date().toISOString(),
      lastSessionTimestamp: new Date().toISOString(), sessionEndedId: null,
      currentSceneId: "es-sc1", sceneTruths: [], clocks: [],
    },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-gina");
  table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-2": 3 }, items: { contents: [] } });
  table.addActor({ id: "pc-ren",  name: "Ren",  ownership: { "pl-1": 3 }, items: { contents: [] } });
  scriptClaude(table, { fallback: (call) => (call.model === NARRATION_MODEL ? VIGNETTE : "{}") });
  silenceConsoleErrors();
});

async function endSession() {
  const gm = table.client("gm-1");
  gm.answerDialogs(d => d.submit({ 'input[name="questFocus"]': "", 'input[name="connectionFocus"]': "" }));
  await gm.chat("!end-session");
  await table.settle(); await table.drain();
}

const closingCall = () => table.claude.calls.find(c => c.model === NARRATION_MODEL && /CLOSING VIGNETTE/.test(c.userText ?? ""));
const blockNames = (system) => String(system ?? "").split("\n\n---\n\n")
  .filter(s => s.startsWith("## CHARACTER")).map(b => /Name: (\w+)/.exec(b)?.[1] ?? "?");

describe("CLOSING-VIGNETTE-FIRST-PC — the closing vignette's CHARACTER blocks are the PCs at the table", () => {
  it("Quinn (Kira's player) is away: Ren's block, not the first PC's", async () => {
    await table.leave("pl-2");
    await endSession();
    const call = closingCall();
    expect(call, "the closing vignette was narrated").toBeTruthy();
    expect(blockNames(call.system)).toEqual(["Ren"]);
  }, 30_000);

  it("no PC's player at the table: no block", async () => {
    await table.leave("pl-1");
    await table.leave("pl-2");
    await endSession();
    expect(blockNames(closingCall().system)).toEqual([]);
  }, 30_000);

  it("control: both at the table — both blocks", async () => {
    await endSession();
    expect(blockNames(closingCall().system)).toEqual(["Kira", "Ren"]);
  }, 30_000);
});
