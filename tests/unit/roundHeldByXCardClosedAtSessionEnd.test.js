/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/roundHeldByXCardClosedAtSessionEnd.test.js
 *
 * known-issues ROUND-CLOSED-UNNARRATED-WORDING (ROUND-WAITS-FOR-ABSENT-
 * KEYED-GM's residual):
 *   - the round closed unnarrated at session end (it waited for a GM with a
 *     Claude key) posted the fallback card saying "check your API key and
 *     proxy"; only the GMs' notice gave the reason. Its card says why now.
 *   - a round End a Session left while the X-Card was in play stayed
 *     narrating, closed unseen by the next load's recovery. The session
 *     ending closes it: the paused notice lists its results, and the GMs are
 *     told it closed without its narration.
 */

import { describe, it, expect, afterEach, vi } from "vitest";

vi.mock("../../src/entities/entityExtractor.js", async (importOriginal) => ({
  ...(await importOriginal()),
  runCombinedDetectionPass: vi.fn(async () => ({ worldJournal: [], entities: [], renames: [] })),
  appendGenerativeTierUpdates: vi.fn(async () => {}),
}));

import { simulateTable, USERS } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { CampaignStateSchema } from "../../src/schemas.js";
import {
  createRound, submitEntry, recordReading, confirmEntry, passEntry, beginResolution, fixActing,
  markRolled, markRecorded, beginUpgrades, claimNarration,
} from "../../src/batch/round.js";

const REPLY = "The round turns.\n```json\n{\"newTruths\":[],\"stateChanges\":[]}\n```";
const NARRATION_MODEL = "claude-sonnet-5-5";
const hoursAgo = (h) => new Date(Date.now() - h * 3_600_000).toISOString();
const NOW = hoursAgo(0.01);

let table = null;
afterEach(async () => { await table?.teardown(); table = null; });

const round = () => table.world.getSetting("batchMode.round");
const world = () => table.world.campaignState();
const roundCards = (pred = () => true) => table.cards(f => f.roundId === "round-4" && pred(f));
const roundNarrations = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL && /THIS ROUND/.test(c.userText ?? ""));
const unnarratedNotices = () => table.cards(f => f.batchRoundUnnarratedNotice);

async function endSession(userId) {
  const c = table.client(userId);
  c.answerDialogs(d => d.submit({ 'input[name="questFocus"]': "", 'input[name="connectionFocus"]': "" }));
  await c.chat("!end-session");
  await table.settle();
  await table.drain();
}

/** Kira's strong hit rolled and recorded; the narration claimed by a page that died. */
function narratingRound() {
  const reading = {
    kind: "move", moveId: "face_danger", moveName: "Face Danger", statUsed: "edge", rationale: "t", mischiefAside: "",
    abilities: [], statOptions: [], targetChoices: null, blocked: null, forced: null,
    interpretation: { moveId: "face_danger", moveName: "Face Danger", statUsed: "edge", adds: 0, rationale: "t", mischiefApplied: false, extractedRiders: [] },
  };
  const narrationInput = {
    kind: "move", resolutionId: "res-kira", moveId: "face_danger", moveName: "Face Danger", statUsed: "edge",
    outcome: "strong_hit", outcomeLabel: "Strong Hit", isMatch: false, loremasterContext: "Kira slips through.", oracleSeeds: null,
    relevance: { resolvedClass: "embellishment", entityIds: [], entityTypes: [] },
  };
  let r = createRound({
    id: "round-4", number: 4, sessionId: "live-s1", now: NOW,
    participants: [
      { userId: "pl-1", userName: "Pat", isGM: false, actorId: "pc-kira", actorName: "Kira" },
      { userId: "pl-2", userName: "Quinn", isGM: false, actorId: "pc-ren", actorName: "Ren" },
    ],
  });
  r = submitEntry(r, { userId: "pl-1", text: "I slip through the vent.", submissionId: "k1", now: NOW });
  r = recordReading(r, { userId: "pl-1", submissionId: "k1", reading });
  r = confirmEntry(r, { userId: "pl-1", submissionId: "k1", choices: {}, now: NOW });
  r = passEntry(r, { userId: "pl-2" });
  r = beginResolution(r, { resolverId: "gm-1", now: NOW });
  r = fixActing(r);
  r = markRolled(r, { userId: "pl-1", rolled: { resolutionId: "res-kira", cardId: null, moveId: "face_danger", outcome: "strong_hit", narrationInput } });
  r = markRecorded(r, { userId: "pl-1", recordedAt: NOW });
  r = beginUpgrades(r, { offers: {} });
  return claimNarration(r, { narrationClaim: "claim-of-a-dead-page", now: NOW });
}

async function bootTable({ users, clientSettings = {}, keyed = [], xCardActive = false }) {
  table = await simulateTable({
    users, boot: false, clientSettings,
    world: { settings: {
      chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false, autoRecapEnabled: false,
      combatTrackerEnabled: false,
      keyedGmUserIds: keyed,
      "batchMode.enabled": true,
      "batchMode.round":   narratingRound(),
      campaignState: {
        ...CampaignStateSchema, sessionActive: true, sessionActiveStartedAt: hoursAgo(2), currentSessionId: "live-s1",
        sessionStartedId: "live-s1", sessionNumber: 3, lastSessionTimestamp: hoursAgo(0.05),
        currentSceneId: "sc-1", sceneTruths: [], xCardActive, xCardPlays: xCardActive ? 1 : 0,
      },
    } },
  });
  table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, items: { contents: [] } });
  table.addActor({ id: "pc-ren",  name: "Ren",  ownership: { "pl-2": 3 }, items: { contents: [] } });
  silenceConsoleErrors();
  scriptClaude(table, { fallback: () => REPLY });
  for (const u of users.filter(x => x.active !== false)) await table.client(u.id).boot();
  await table.settle();
  await table.drain();
}

describe("ROUND-CLOSED-UNNARRATED-WORDING", () => {
  it("the round closed waiting for a keyed GM: its card says why, not 'check your API key and proxy'", async () => {
    await bootTable({
      users: [{ ...USERS.GM, active: false }, USERS.GM2, USERS.P1, USERS.P2],
      clientSettings: { "gm-1": { claudeApiKey: "sk-ant-gina" } },
      keyed: ["gm-1"],
    });
    expect(round()).toMatchObject({ id: "round-4", phase: "narrating" });   // waiting (setup)
    await endSession("gm-2");

    const cards = roundCards(f => f.narrationFallback);
    expect(cards).toHaveLength(1);
    expect(cards[0].content).toMatch(/Narration unavailable — the session ended while the round waited for a GM with a Claude key to narrate it\./);
    expect(cards[0].content).not.toMatch(/API key and proxy/);
  }, 60_000);

  it("a round held by the X-Card when the session ends is closed then, its results listed and the GMs told", async () => {
    await bootTable({
      users: [USERS.GM, USERS.P1, USERS.P2],
      clientSettings: { "gm-1": { claudeApiKey: "sk-ant-gina" } },
      keyed: ["gm-1"],
      xCardActive: true,
    });
    // control: while the session lasts, the X-Card holds it
    expect(round()).toMatchObject({ id: "round-4", phase: "narrating" });
    expect(roundCards()).toHaveLength(0);

    await endSession("gm-1");
    expect(world().sessionActive).toBe(false);

    expect(round()).toMatchObject({ id: "round-4", phase: "closed" });
    expect(roundNarrations(), "nothing is narrated under the X-Card").toHaveLength(0);
    const paused = roundCards(f => f.narrationPaused);
    expect(paused).toHaveLength(1);
    expect(paused[0].content).toMatch(/Kira — Face Danger: Strong Hit/);
    const told = unnarratedNotices();
    expect(told).toHaveLength(1);
    expect(told[0].content).toMatch(/session ended while round 4 was held by the X-Card, so it closed without its narration/);
  }, 60_000);
});
