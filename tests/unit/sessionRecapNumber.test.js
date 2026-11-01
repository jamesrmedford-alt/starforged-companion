/**
 * STARFORGED COMPANION
 * tests/unit/sessionRecapNumber.test.js
 *
 * `!recap session N` and what the session recap counts (issue #322 V05; the
 * audit's recapSessionNumber probes in three areas, and sessionRecapCounts).
 *
 * The help documents `!recap session 3` — "Post a recap of a specific past
 * session by number" — and handleRecapCommand matched the number, then
 * dropped it: every N recapped the current session under its own number.
 * The recap also read every narrator card itself, so a burned move showed
 * its superseded outcome ("Strike → Miss") beside the upgraded one, and every
 * card — paced prose, an @scene answer, a vignette — counted as a move.
 *
 * Now N names a session through the cards' `sessionNumber` (else the current
 * session's, else last session's summary), and the recap reads the session's
 * cards as the narrator does (sessionNarratorCards), keeping fallback and
 * X-carded cards (their moves happened, their lines are not quoted) and
 * counting only the cards that carry a move.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";

vi.mock("../../src/api-proxy.js", () => ({ apiPost: vi.fn() }));

import { simulateTable, USERS } from "../helpers/multiClient.js";
import { CampaignStateSchema } from "../../src/schemas.js";
import { postSessionRecap, postNarrationCard } from "../../src/narration/narrator.js";
import { supersedeOriginalNarration } from "../../src/moves/burnMomentum.js";

const MODULE_ID = "starforged-companion";

// ─── `!recap session N`, typed on a booted table ─────────────────────────────

describe("!recap session N recaps session N", () => {
  let table;

  beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
  afterAll(() => table?.teardown());

  async function seed(campaignState) {
    await table.reset({ world: { settings: { recapGmOnly: false, campaignState: {
      ...CampaignStateSchema, sessionActive: true, ...campaignState,
    } } } });
    await table.setClaudeKey("gm-1", "sk-ant-gina");
  }

  /** A move narration card as postNarrationCard stamps it, for the given session. */
  async function card(sessionId, sessionNumber, moveId, text) {
    await table.client("gm-1").run(() => ChatMessage.create({
      content: `<div class="sf-narration-card"><div class="sf-narration-prose">${text}</div></div>`,
      flags: { [MODULE_ID]: {
        narratorCard: true, narrationCard: true, narrationText: text,
        sessionId, ...(sessionNumber != null ? { sessionNumber } : {}), moveId, outcome: "strong_hit", isMatch: false,
      } },
    }));
  }

  async function recap(command) {
    await table.client("gm-1").chat(command);
    await table.settle();
    return table.cards(f => f.recapCard && f.recapType === "session").at(-1);
  }

  it('"!recap session 3" during session 4 recaps session 3 — its moves, under its number', async () => {
    await seed({ currentSessionId: "sess-4", sessionNumber: 4 });
    await card("sess-3", 3, "face_danger", "The airlock seals behind you.");
    await card("sess-4", 4, "gather_information", "The logs name the courier.");
    await table.settle();

    const r = await recap("!recap session 3");
    expect(r.flags[MODULE_ID]).toMatchObject({ sessionNumber: 3, sessionId: "sess-3" });
    expect(r.content).toContain("Session 3");
    expect(r.content).toContain("Face Danger");
    expect(r.content).not.toContain("Gather Information");
  }, 30_000);

  it("a session whose cards carry no number is found through last session's summary", async () => {
    await seed({ currentSessionId: "sess-2", sessionNumber: 2,
      previousSessionSummary: { sessionId: "sess-1", sessionNumber: 1, text: "The old war ended." } });
    await card("sess-1", null, "face_danger", "The old war ended at Firstlight.");
    await card("sess-2", null, "face_danger", "The reactor hums tonight.");
    await table.settle();

    const r = await recap("!recap session 1");
    expect(r.content).toContain("The old war ended");
    expect(r.content).not.toContain("The reactor hums");
  }, 30_000);

  it("the current session's number, and a bare `!recap session`, recap the current session", async () => {
    await seed({ currentSessionId: "sess-4", sessionNumber: 4 });
    await card("sess-3", 3, "face_danger", "The airlock seals behind you.");
    await card("sess-4", 4, "gather_information", "The logs name the courier.");
    await table.settle();

    for (const command of ["!recap session 4", "!recap session"]) {
      const r = await recap(command);
      expect(r.content, command).toContain("Session 4");
      expect(r.content, command).toContain("Gather Information");
      expect(r.content, command).not.toContain("Face Danger");
    }
  }, 30_000);

  it("a session with no record left says so, by its number — never another session's moves", async () => {
    await seed({ currentSessionId: "sess-4", sessionNumber: 4 });
    await card("sess-4", 4, "gather_information", "The logs name the courier.");
    await table.settle();

    const r = await recap("!recap session 9");
    expect(r.flags[MODULE_ID]).toMatchObject({ recapEmpty: true, sessionNumber: 9 });
    expect(r.content).toContain("No narrated moves found for session 9.");
    expect(r.content).not.toContain("Gather Information");
  }, 30_000);
});

// ─── what the recap counts (the real producers) ──────────────────────────────

describe("!recap session reports what happened this session", () => {
  const state = { currentSessionId: "sess-3", sessionNumber: 3 };

  beforeEach(() => {
    ChatMessage._reset();
    global.game.messages = { contents: [] };
  });

  async function recapOf(cards) {
    global.game.messages = { contents: cards };
    ChatMessage._reset();
    await postSessionRecap(state);
    return ChatMessage._created.at(-1).content;
  }

  it('a burned move counts once, at its upgraded outcome; paced prose is not a "move resolved"', async () => {
    // Strike misses; the narration posts.
    await postNarrationCard("Your shot goes wide and the raider closes in.",
      { moveId: "strike", outcome: "miss", isMatch: false, _id: "res-strike" }, state);
    global.game.messages = { contents: ChatMessage._created };
    // The player burns momentum: the original narration is superseded (real producer)…
    await supersedeOriginalNarration({ resolutionId: "res-strike" });
    expect(ChatMessage._created[0].flags[MODULE_ID].burnSuperseded).toBe(true);
    // …and the re-narration of the strong hit posts.
    await postNarrationCard("You drop the raider with a clean shot.",
      { moveId: "strike", outcome: "strong_hit", isMatch: false, _id: "res-strike-burn", inputMethod: "burn" }, state);
    // A paced (no-roll) narration in the same session.
    ChatMessage._created.push(makeTestMessage({ flags: { [MODULE_ID]: {
      narratorCard: true, pacedNarrative: true, narrationText: "The corridor smells of ozone.", sessionId: "sess-3",
    } } }));

    const recap = await recapOf(ChatMessage._created.slice());

    expect(recap).not.toContain("Strike → Miss");
    expect(recap).not.toContain("Your shot goes wide");
    expect(recap).toContain("Strike → Strong Hit: You drop the raider with a clean shot");
    expect(recap).toContain("The corridor smells of ozone");     // the story, listed …
    expect(recap).toContain("1 move resolved.");                   // … not counted
  });

  it("a fallback card and an X-carded narration count their moves, and none of their lines is quoted", async () => {
    const flags = (over) => ({ [MODULE_ID]: { narratorCard: true, sessionId: "sess-3", ...over } });
    const cards = [
      makeTestMessage({ flags: flags({ moveId: "face_danger", outcome: "weak_hit",
        narrationFallback: true, narrationText: "Face Danger: Weak Hit — narration unavailable." }) }),
      makeTestMessage({ flags: flags({ moveId: "compel", outcome: "strong_hit",
        xCarded: true, narrationText: "The carded beat the table took out." }) }),
      makeTestMessage({ flags: flags({ sceneResponse: true, narrationText: "The hold is dark." }) }),   // an @scene answer
    ];

    const recap = await recapOf(cards);

    expect(recap).toContain("Face Danger → Weak Hit");
    expect(recap).toContain("Compel → Strong Hit");
    expect(recap).not.toContain("narration unavailable");
    expect(recap).not.toContain("carded beat");
    expect(recap).toContain("2 moves resolved.");
  });
});
