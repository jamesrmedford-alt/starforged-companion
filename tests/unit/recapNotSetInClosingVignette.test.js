/* global silenceConsoleErrors, makeTestActor -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/recapNotSetInClosingVignette.test.js
 *
 * known-issues RECAP-TAKES-CLOSING-VIGNETTE-AS-THE-SCENE (issue #374 A1; the
 * memory charter's second live run, 2026-11-22).
 *
 * End a Session runs, in order: the session summary, the closing vignette,
 * the campaign recap. The closing vignette is a cutaway — an NPC somewhere
 * the players are not — and it opens a scene of its own for its fact block
 * (issue #321 U34). That scene stayed open until the next session was minted,
 * and a recap's instructions carried the active scene: the recap was told,
 * under "binding", that the campaign stood where the cutaway did ("set in a
 * galley aboard a pirate ship"), cached that, and handed it to the next
 * session's first narration.
 *
 * Now the closing vignette's scene ends once its card is posted — its facts
 * filed where a scene's end files them — and a recap carries no active-scene
 * block at all: it retells the Chronicle, whatever scene is open.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { simulateTable, USERS, MODULE_ID } from "../helpers/multiClient.js";
import { scriptClaude } from "../helpers/faults.js";
import { makeJournal } from "../helpers/skeletonTable.js";
import { CampaignStateSchema } from "../../src/schemas.js";
import { buildNarratorSystemPrompt } from "../../src/narration/narratorPrompt.js";

const NARRATION_MODEL = "claude-sonnet-5-5";

const CUTAWAY = {
  newTruths:    [{ subject: "the raider captain", fact: "Eats a tangerine while the manifest goes unread" }],
  stateChanges: [{ subject: "the raider captain", attribute: "location", value: "her own galley" }],
  sceneFrame:   {
    location:  "A pirate ship idling at the edge of a dead beacon's range",
    present:   ["the raider captain"],
    situation: "The architect of the lane raids eats a tangerine alone",
  },
};
const VIGNETTE = "Far from Bleakhold, a raider peels a tangerine and ignores a manifest.\n```json\n"
  + JSON.stringify(CUTAWAY) + "\n```";
const RECAP = "Previously: Kira reached Bleakhold Station carrying her sister's compass.";

let table;
let savedJournalEntry;
const world = () => table.world.campaignState();

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

/** Every journal page of the world: its entry, its name, its text and its record. */
const filed = () => table.journal.contents.flatMap(j => [...(j.pages?.contents ?? j.pages ?? [])]
  .map(p => `${j.name} / ${p.name} / ${p.text?.content ?? ""} / ${JSON.stringify(p.flags ?? {})}`));

const isClosing = (call) => call.model === NARRATION_MODEL && /CLOSING VIGNETTE/.test(call.userText ?? "");
const isRecap   = (call) => /between-sessions recap/.test(call.system ?? "");

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false, autoRecapEnabled: false,
    combatTrackerEnabled: false, "factContinuity.consistencyCheck": false,
    campaignState: {
      ...CampaignStateSchema, currentSessionId: "rv-s1", sessionNumber: 1, sessionActive: true,
      sessionStartedId: "rv-s1", sessionActiveStartedAt: new Date().toISOString(),
      lastSessionTimestamp: new Date().toISOString(), sessionEndedId: null,
      currentSceneId: null, sceneTruths: [], sceneState: { bySubject: {}, sceneId: null }, sceneFrame: null, clocks: [],
      characterIds: ["pc-kira"],
      // A place for End a Session's closing cutaway to show (issue #381 D6: with
      // nobody on record and nowhere to show, there is no closing).
      activeSectorId: 'sec-q', sectors: [{ id: 'sec-q', name: 'Quiet Reach', settlements: [{ id: 'st-q', name: 'Lantern Rest' }] }],
      // A recap from before this session's Chronicle entry: out of date, so
      // End a Session writes a new one once its closing vignette is posted.
      campaignRecapCache: { text: "Previously: nothing yet.", generatedAt: "2026-11-01T00:00:00.000Z", chronicleLength: 0, chronicleHash: "00000000" },
    },
  } } });
  await table.setClaudeKey("gm-1", "sk-ant-gina");
  table.addActor({ id: "pc-kira", name: "Kira", ownership: { "pl-1": 3 }, items: { contents: [] } });
  // Journals that keep their pages (the setup stub keeps none): the Chronicle
  // the recap is written from, and the Lore a scene's end files its truths in.
  savedJournalEntry = globalThis.JournalEntry;
  globalThis.JournalEntry = { async create(data) { const j = makeJournal(data); table.journal._set(j.id, j); return j; } };
  // The recap is written from the Chronicle: one entry, so it is written at all.
  const gm = table.client("gm-1");
  const { addChronicleEntry } = await gm.import("../../src/character/chronicle.js");
  await gm.run(() => addChronicleEntry("pc-kira", { type: "moment", text: "Kira docked at Bleakhold Station with her sister's compass." }));
  // The session was played: it has a narration already, so the closing
  // vignette is not its first (a session's first narration writes the recap
  // itself, before the vignette says anything).
  await gm.run(() => globalThis.ChatMessage.create({
    content: "<p>The docking clamps take hold.</p>",
    flags: { [MODULE_ID]: { narratorCard: true, narrationText: "The docking clamps take hold.", sessionId: "rv-s1", narrationId: "nar-played" } },
  }));
  await table.settle(); await table.drain();
  // The recap answers in cited sentences (issue #382 D11): its one cites the
  // Chronicle entry above — a player's note to the recap, [note-1].
  const cited = JSON.stringify({ paragraphs: [[{ text: RECAP, because: ["note-1"] }]] });
  scriptClaude(table, { fallback: (call) => (isRecap(call) ? cited : isClosing(call) ? VIGNETTE : "{}") });
  silenceConsoleErrors();
});

afterEach(() => { globalThis.JournalEntry = savedJournalEntry; });

async function endSession() {
  const gm = table.client("gm-1");
  gm.answerDialogs(d => d.submit({ 'input[name="questFocus"]': "", 'input[name="connectionFocus"]': "" }));
  await gm.chat("!end-session");
  await table.settle(); await table.drain();
}

describe("RECAP-TAKES-CLOSING-VIGNETTE-AS-THE-SCENE — the closing vignette's cutaway is not the campaign's scene", () => {
  it("the recap written at End a Session is sent nothing of the cutaway's scene", async () => {
    await endSession();
    const closing = table.claude.calls.find(isClosing);
    const recap   = table.claude.calls.find(isRecap);
    expect(closing, "the closing vignette was narrated").toBeTruthy();
    expect(recap, "the recap was written").toBeTruthy();
    expect(table.claude.calls.indexOf(recap), "the recap is written after the vignette").toBeGreaterThan(table.claude.calls.indexOf(closing));
    expect(recap.system).not.toMatch(/pirate ship/i);
    expect(recap.system).not.toMatch(/tangerine/i);
    expect(recap.system).not.toMatch(/SCENE FRAME/);
    expect(recap.system).not.toMatch(/ACTIVE SCENE — BINDING/);
    expect(world().campaignRecapCache?.text).toBe(RECAP);
  }, 30_000);

  it("the cutaway's scene ends with its card: no scene is left open between sessions", async () => {
    await endSession();
    const cs = world();
    expect(cs.sessionEndedId).toBe("rv-s1");
    expect(cs.currentSceneId ?? null).toBeNull();
    expect(cs.sceneFrame ?? null).toBeNull();
    expect(cs.sceneTruths ?? []).toEqual([]);
    expect(Object.keys(cs.sceneState?.bySubject ?? {})).toEqual([]);
  }, 30_000);

  it("what the cutaway established is kept: filed as a scene's end files it", async () => {
    await endSession();
    const lore = filed().filter(f => f.startsWith("World Journal — Lore /"));
    expect(lore.join("\n")).toMatch(/the raider captain: Eats a tangerine/);
  }, 30_000);

  it("a vignette that fails after opening its scene leaves none open either", async () => {
    scriptClaude(table, { fallback: (call) => (isRecap(call) ? RECAP : isClosing(call) ? "" : "{}") });
    await endSession();
    expect(world().currentSceneId ?? null).toBeNull();
  }, 30_000);
});

describe("a recap carries no active-scene block (issue #374 A1, option 3)", () => {
  const withScene = () => ({
    ...CampaignStateSchema, currentSessionId: "rv-s1", currentSceneId: "sc-open",
    sceneFrame: { location: "The Kobayashi IV's galley", present: ["Kira"], situation: "Toffee burning in a skillet" },
    sceneTruths: [{ id: "t1", subject: { kind: "text", text: "the skillet" }, fact: "Is cast iron", sceneId: "sc-open", sessionId: "rv-s1" }],
    sceneState: { bySubject: {}, sceneId: "sc-open" },
  });
  const prompt = (mode) => buildNarratorSystemPrompt(withScene(), {}, null, "", { mode });

  it("a recap asked for mid-session is not told the open scene is binding", () => {
    const recap = prompt("campaign_recap");
    expect(recap).not.toMatch(/ACTIVE SCENE — BINDING/);
    expect(recap).not.toMatch(/SCENE FRAME/);
    expect(recap).not.toMatch(/They are\s+binding/);
  });

  // Since known-issues RECAP-STATES-WHAT-DID-NOT-HAPPEN (the long haul's third
  // live run) a recap is told how things stand — the open scene's facts and
  // state among them — as the later word on them, under a heading of its own:
  // not as the scene the campaign is set in, which is what A1 took out. The
  // closing cutaway's scene has ended by the time End a Session's recap is
  // written (the first describe, above), so nothing of it is in that section.
  // Issue #382 slice 2: how things stand is the recap's user message, read
  // live (record/recapView.js standingLines) — the scene's facts come from the
  // record, as beats; the system prompt carries no scene of its own at all.
  it("what it is told of the open scene is how things stand, not where the campaign is set", async () => {
    const recap = prompt("campaign_recap");
    expect(recap).not.toMatch(/WHERE THINGS STAND NOW/);
    expect(recap).not.toMatch(/Toffee burning in a skillet/);
    const { standingLines } = await import("../../src/record/recapView.js");
    const state = { ...withScene(), sceneState: { sceneId: "sc-open", bySubject: { "the skillet": [{ attribute: "smell", value: "burnt sugar", subjectText: "the skillet" }] } } };
    expect(await standingLines(state)).toContain("the skillet — smell: burnt sugar.");
  });

  it("control: a narration of that scene still is", () => {
    const paced = prompt("paced_narrative");
    expect(paced).toMatch(/ACTIVE SCENE — BINDING/);
    expect(paced).toMatch(/Toffee burning/);
  });

  it("the ship's position is no scene's: a recap still has it", () => {
    game.actors._set("cv-k4", makeTestActor({
      id: "cv-k4", type: "starship", name: "Kobayashi IV",
      flags: { [MODULE_ID]: { ship: { _id: "s-k4", name: "Kobayashi IV", isCommandVehicle: true, position: { freeText: "docked at Bleakhold Station" } } } },
    }));
    try {
      const recap = buildNarratorSystemPrompt({ ...withScene(), shipIds: ["cv-k4"] }, {}, null, "", { mode: "campaign_recap" });
      expect(recap).toMatch(/SHIP POSITION: .*docked at Bleakhold Station/);
      expect(recap).not.toMatch(/ACTIVE SCENE — BINDING/);
    } finally {
      game.actors._reset();
    }
  });
});
