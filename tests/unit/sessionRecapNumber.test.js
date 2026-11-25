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
 * Since issue #382 slice 5 the card is a view of the session record
 * (record/sessionCardView.js): N names the session whose `session.begun` the
 * record numbers N (the current session by its own number), and the moves are
 * the record's — a burned move once at its final outcome, a move whose telling
 * the X-Card removed or whose narration failed still counted, nothing of any
 * telling quoted. It needs no chat: a cleared chat log leaves it whole.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";

vi.mock("../../src/api-proxy.js", () => ({ apiPost: vi.fn() }));

import { simulateTable, USERS } from "../helpers/multiClient.js";
import { CampaignStateSchema } from "../../src/schemas.js";
import { postSessionRecap } from "../../src/narration/narrator.js";
import { installJournalMock, makeJournal } from "../helpers/fullStateFixture.js";
import { JOURNAL_NAMES } from "../../src/world/worldJournal.js";
import { recordedEvent, seedSessionRecord } from "../helpers/sessionRecordSeed.js";

const MODULE_ID = "starforged-companion";

/** A rolled move as rollMove records it (`move.resolved`). */
const rolled = (sessionId, res, moveId, outcome = "strong_hit") =>
  recordedEvent(sessionId, "move.resolved", { ref: { res }, d: { moveId, outcome, rollKind: "action" } });

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

  /** A session's page of the Session Log, its record holding its moves — numbered by its `session.begun` (unless `number` is null). */
  async function page(sessionId, number, moves) {
    let log = table.journal.find(j => j.name === JOURNAL_NAMES.sessionLog);
    if (!log) {
      log = makeJournal(JOURNAL_NAMES.sessionLog);
      table.journal._set(log.id, log);
    }
    const events = [
      ...(number != null ? [recordedEvent(sessionId, "session.begun", { d: { number } })] : []),
      ...moves.map((moveId, i) => rolled(sessionId, `res-${sessionId}-${i}`, moveId)),
    ];
    const createdAt = Date.now() - 3_600_000 + (number ?? 0);
    await log.createEmbeddedDocuments("JournalEntryPage", [{ name: `Session ${number ?? ""}`.trim(), flags: { [MODULE_ID]: {
      sessionLogPage: { sessionId, sessionNumber: number, pageName: `Session ${number ?? ""}`.trim(), createdAt: new Date(createdAt).toISOString() },
      sessionRecord: { v: 1, sessionId, createdAt, seq: Math.max(0, ...events.map(e => e.seq)), views: {},
        events: Object.fromEntries(events.map(e => [e.id, e])) },
    } } }]);
  }

  async function recap(command) {
    await table.client("gm-1").chat(command);
    await table.settle();
    return table.cards(f => f.recapCard && f.recapType === "session").at(-1);
  }

  it('"!recap session 3" during session 4 recaps session 3 — its moves, under its number', async () => {
    await seed({ currentSessionId: "sess-4", sessionNumber: 4 });
    await page("sess-3", 3, ["face_danger"]);
    await page("sess-4", 4, ["gather_information"]);

    const r = await recap("!recap session 3");
    expect(r.flags[MODULE_ID]).toMatchObject({ sessionNumber: 3, sessionId: "sess-3" });
    expect(r.content).toContain("Session 3");
    expect(r.content).toContain("Face Danger");
    expect(r.content).not.toContain("Gather Information");
  }, 30_000);

  it("a session is found by the number its record gives it — no card in chat needed: a cleared chat log leaves it", async () => {
    await seed({ currentSessionId: "sess-2", sessionNumber: 2 });
    await page("sess-1", 1, ["face_danger"]);
    await page("sess-2", 2, ["secure_an_advantage"]);
    expect(table.cards(f => f.narratorCard)).toHaveLength(0);       // the chat holds no narration at all

    const r = await recap("!recap session 1");
    expect(r.flags[MODULE_ID]).toMatchObject({ sessionNumber: 1, sessionId: "sess-1" });
    expect(r.content).toContain("Face Danger → Strong Hit");
    expect(r.content).not.toContain("Secure an Advantage");
  }, 30_000);

  it("the current session's number, and a bare `!recap session`, recap the current session", async () => {
    await seed({ currentSessionId: "sess-4", sessionNumber: 4 });
    await page("sess-3", 3, ["face_danger"]);
    await page("sess-4", 4, ["gather_information"]);

    for (const command of ["!recap session 4", "!recap session"]) {
      const r = await recap(command);
      expect(r.content, command).toContain("Session 4");
      expect(r.content, command).toContain("Gather Information");
      expect(r.content, command).not.toContain("Face Danger");
    }
  }, 30_000);

  it("a session with no record left says so, by its number — never another session's moves", async () => {
    await seed({ currentSessionId: "sess-4", sessionNumber: 4 });
    await page("sess-4", 4, ["gather_information"]);

    const r = await recap("!recap session 9");
    expect(r.flags[MODULE_ID]).toMatchObject({ recapEmpty: true, sessionNumber: 9 });
    expect(r.content).toContain("No moves are recorded for session 9.");
    expect(r.content).not.toContain("Gather Information");
  }, 30_000);
});

// ─── what the recap counts ───────────────────────────────────────────────────

describe("!recap session reports what happened this session", () => {
  const state = { currentSessionId: "sess-3", sessionNumber: 3 };
  let journals;

  beforeEach(() => {
    ChatMessage._reset();
    journals = installJournalMock();
    global.game.messages = { contents: [] };
  });
  afterEach(() => journals.restore());

  async function recapOf(events) {
    await seedSessionRecord("sess-3", [recordedEvent("sess-3", "session.begun", { d: { number: 3 } }), ...events], { number: 3 });
    await postSessionRecap(state);
    return ChatMessage._created.at(-1).content;
  }

  it('a burned move counts once, at its upgraded outcome; paced prose is not a "move resolved"', async () => {
    const recap = await recapOf([
      // Strike misses; its narration is recorded as its card posts…
      rolled("sess-3", "res-strike", "strike", "miss"),
      recordedEvent("sess-3", "narration", { ref: { nar: "nar-miss", res: "res-strike" }, d: { mode: "move" },
        text: "Your shot goes wide and the raider closes in." }),
      // …the player burns momentum: the outcome raised, the first telling superseded, the re-narration told.
      recordedEvent("sess-3", "move.upgraded", { ref: { res: "res-strike" }, d: { how: "burn", from: "miss", to: "strong_hit" } }),
      recordedEvent("sess-3", "narration.removed", { ref: { res: "res-strike" }, d: { narrationIds: ["nar-miss"], by: "superseded" } }),
      recordedEvent("sess-3", "narration", { ref: { nar: "nar-burn", res: "res-strike" }, d: { mode: "move", upgradeOf: "res-strike" },
        text: "You drop the raider with a clean shot." }),
      // A paced (no-roll) narration in the same session.
      recordedEvent("sess-3", "line", { who: { actor: "pc-kira" }, d: { via: "typed" }, text: "I sniff the air." }),
      recordedEvent("sess-3", "narration", { who: { actor: "pc-kira" }, ref: { nar: "nar-paced" }, d: { mode: "paced" },
        text: "The corridor smells of ozone." }),
    ]);

    expect(recap).not.toContain("Strike → Miss");
    expect(recap).toContain("Strike → Strong Hit");
    expect(recap).not.toMatch(/shot goes wide|clean shot|ozone/);   // no telling is quoted
    expect(recap).toContain("1 move resolved.");                     // the paced line is no move
  });

  it("a move whose narration failed and one the X-Card removed count, and nothing of their tellings is quoted", async () => {
    const recap = await recapOf([
      rolled("sess-3", "res-fd", "face_danger", "weak_hit"),        // "narration unavailable": no narration is recorded
      rolled("sess-3", "res-compel", "compel", "strong_hit"),
      recordedEvent("sess-3", "narration", { ref: { nar: "nar-carded", res: "res-compel" }, d: { mode: "move" },
        text: "The carded beat the table took out." }),
      recordedEvent("sess-3", "narration.removed", { d: { narrationIds: ["nar-carded"], by: "xcard" } }),
      recordedEvent("sess-3", "question", { ref: { nar: "nar-q" }, text: "Is the hold dark?" }),
      recordedEvent("sess-3", "narration", { ref: { nar: "nar-q" }, d: { mode: "scene_answer" }, text: "The hold is dark." }),
    ]);

    expect(recap).toContain("Face Danger → Weak Hit");
    expect(recap).toContain("Compel → Strong Hit");
    expect(recap).not.toMatch(/narration unavailable|carded beat|hold/);
    expect(recap).toContain("2 moves resolved.");
  });
});
