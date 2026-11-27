/**
 * STARFORGED COMPANION
 * tests/unit/narrationChecks.test.js
 *
 * Overhaul 4, "moves as contracts" — slice 4 (design §8.5, D9): the narration
 * is checked against its obligations before it posts. From the long haul's
 * fourth live run's own prose: a62's refused Heal at full health narrated
 * "the antiseptic stings as she starts on the cuts" under NOT SO [premise];
 * a27's offered fight narrated "Your first salvo takes her forward plating"
 * under NOT YET [fight]. The certain checks catch an outcome's name, a sheet
 * number, a two-word move's name and the word "match"; a tripped line goes to
 * one judge call (Haiku through api-proxy.js, label obligationJudge); a
 * failure is re-asked once, the second reply held to the certain checks, and
 * never a third call. The judge fails open.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const judgeReplies = [];
vi.mock("../../src/api-proxy.js", async (importOriginal) => ({
  ...(await importOriginal()),
  apiPost: vi.fn(async (_url, _headers, body, opts) => {
    if (opts?.label !== "obligationJudge") throw new Error(`unexpected call ${opts?.label}`);
    const next = judgeReplies.shift();
    if (next instanceof Error) throw next;
    return { content: [{ type: "text", text: next ?? '{"violations":[]}' }] };
  }),
}));

import { apiPost } from "../../src/api-proxy.js";
import { certainViolations, floorViolations, trippedLines, judgeNarration, narrateKeepingObligations } from "../../src/moves/contracts/checks.js";
import { obligationsFor } from "../../src/moves/contracts/obligations.js";

const HEAL_REFUSAL = { moveId: "heal", code: "recoverable-health", hard: false, why: "nothing to heal: Mira Kestrel's health is 5 of 5 and no wound is marked",
  premise: { claim: "a wound to treat", never: "a cut, a gash, blood or a dressing on them" }, offer: null };
const pacedRefused = () => obligationsFor({ mode: "paced", refusal: HEAL_REFUSAL });
const sidecar = '\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

beforeEach(() => { judgeReplies.length = 0; apiPost.mockClear(); });

describe("the certain checks", () => {
  const apparatus = [{ kind: "apparatus", list: "NOT SO", text: "" }];
  it("an outcome's name, a sheet number, a two-word move's name — never the closing offer line", () => {
    expect(certainViolations("It is a strong hit: the lock gives.", apparatus).map(v => v.tag)).toEqual(["apparatus"]);
    expect(certainViolations("She takes 2 health of damage.", apparatus)).toHaveLength(1);
    expect(certainViolations("You Gather Information from the logs.", apparatus)).toHaveLength(1);
    expect(certainViolations("The lock gives.\n\n*If you want to read the logs, this could be a Gather Information.*", apparatus)).toEqual([]);
    // A one-word move's name is an ordinary word.
    expect(certainViolations("You strike the hatch and it gives.", apparatus)).toEqual([]);
  });
  it("the narration speaking of its own build — the beat-shape hint read back as prose (NARRATION-WRITES-ITS-SHAPE-DIRECTIVE)", () => {
    // The batch-round playthrough's recorded round 2 (2026-11-25), as it opened.
    const leaked = "The first sentence should be about someone other than Ren: Vance, or Mira. Vance keeps his arms folded.";
    expect(certainViolations(leaked, apparatus)).toEqual([{ tag: "apparatus", quote: expect.stringContaining("first sentence") }]);
    expect(certainViolations("Open on someone other than the acting character. The hatch groans.", apparatus)).toHaveLength(1);
    // Control: the same beat told, with nothing said of how it is told.
    expect(certainViolations("Vance keeps his arms folded and watches Ren read the log.", apparatus)).toEqual([]);
    expect(certainViolations("The first light of the station's day crawls across the hull.", apparatus)).toEqual([]);
  });
  // Issue #397, Code fix 4 (TABLE-WORDS-IN-THE-FICTION): r1 a15, r5 a58 and
  // r5 a78 said a stat with its number, a track read out and time counted in
  // boxes in the story's own voice, and nothing caught them.
  it("a stat with its number, time counted in boxes, a track read out — and no ordinary prose with the same words", () => {
    for (const told of ["because Wits 3 is a lot of thinking to do on bland food",
      "Four boxes ago this was only a rumor on a dock.",
      "Still counting your boxes? Two of ten.",
      "The track holds 4 of 10 now.",
      "Iron 2, and the bar still bends."]) {
      expect(certainViolations(told, apparatus).map(v => v.tag), told).toEqual(["apparatus"]);
    }
    for (const prose of ["her heart was in it", "cold iron under your palm", "Two of ten ships made it through the lane.",
      "You count four boxes of rations.", "The boxes in the hold shift as the ship banks.", "Her wits were three steps ahead of his.",
      "Two of the ten crates are empty, and the rest are spoken for."]) {
      expect(certainViolations(prose, apparatus), prose).toEqual([]);
    }
  });
  it("[match]: the word, only for a roll that matched", () => {
    expect(certainViolations("The match flares on the scope.", [{ kind: "match" }])).toHaveLength(1);
    expect(certainViolations("The match flares on the scope.", apparatus)).toEqual([]);
  });
});

describe("the floor checks", () => {
  it("[vow]: a word of the vow's name, or what is still not known — else re-asked", () => {
    const vow = [{ kind: "vow", list: "TELL", text: "" }];
    expect(floorViolations("The raiders' hand is named now.", vow, { vowName: "Find who is raiding the Cinder lanes" }).reask).toEqual([]);
    expect(floorViolations("It is over at last.", vow, { vowName: "Find who is raiding the Cinder lanes" }).reask).toHaveLength(1);
    expect(floorViolations("Who sent them is not yet known.", vow, { vowName: "Find who is raiding the Cinder lanes" }).reask).toEqual([]);
  });
});

describe("the tripwires", () => {
  it("a62: a refused Heal's narration that starts on the cuts trips [premise]", () => {
    const tripped = trippedLines("The antiseptic stings as she starts on the cuts.", pacedRefused(), { refusalCode: "recoverable-health" });
    expect(tripped.map(o => o.kind)).toEqual(["premise"]);
  });
  it("a27: an offered fight's first salvo trips [fight]; a stand-off does not", () => {
    const fray = obligationsFor({ mode: "move", resolution: { moveId: "enter_the_fray", outcome: "strong_hit", fightOffer: { status: "offered", position: "in_control" } } });
    expect(trippedLines("Your first salvo takes her forward plating.", fray).map(o => o.kind)).toEqual(["fight"]);
    expect(trippedLines("Both ships hold, guns trained, neither moving.", fray)).toEqual([]);
  });
});

describe("the judge (fail-open)", () => {
  it("one call, label obligationJudge; its violations of the tripped lines", async () => {
    judgeReplies.push('{"violations":[{"tag":"premise","quote":"starts on the cuts"}]}');
    const v = await judgeNarration("She starts on the cuts.", pacedRefused().filter(o => o.kind === "premise"), { apiKey: "sk-test" });
    expect(v).toMatchObject({ judged: true, violations: [{ tag: "premise", quote: "starts on the cuts" }] });
    expect(apiPost).toHaveBeenCalledTimes(1);
    expect(apiPost.mock.calls[0][3]).toEqual({ label: "obligationJudge" });
  });
  it("an error or an unparsed answer passes the narration; no key, no call", async () => {
    judgeReplies.push(new Error("overloaded"));
    expect(await judgeNarration("x", pacedRefused(), { apiKey: "sk-test" })).toMatchObject({ judged: false, violations: [] });
    judgeReplies.push("I think it is fine.");
    expect(await judgeNarration("x", pacedRefused(), { apiKey: "sk-test" })).toMatchObject({ judged: false, violations: [] });
    apiPost.mockClear();
    expect(await judgeNarration("x", pacedRefused(), { apiKey: null })).toMatchObject({ judged: false });
    expect(apiPost).not.toHaveBeenCalled();
  });
});

describe("narrateKeepingObligations", () => {
  const DRAFT = "The antiseptic stings as she starts on the cuts." + sidecar;
  const CLEAN = "She checks her arms and finds nothing that needs it." + sidecar;

  it("a violating draft, judged, is re-asked once with the draft and the line it broke; the clean reply is the one returned", async () => {
    judgeReplies.push('{"violations":[{"tag":"premise","quote":"starts on the cuts"}]}');
    const call = vi.fn(async (addendum) => (addendum ? CLEAN : DRAFT));
    const kept = await narrateKeepingObligations(call, pacedRefused(), { apiKey: "sk-test", ctx: { refusalCode: "recoverable-health" } });
    expect(call).toHaveBeenCalledTimes(2);
    expect(call.mock.calls[1][0]).toMatch(/^## YOUR DRAFT — NOT POSTED\n"The antiseptic stings as she starts on the cuts\."/);
    expect(call.mock.calls[1][0]).toMatch(/This breaks:\n- \[premise\] A wound to treat is not so/);
    expect(kept).toMatchObject({ raw: CLEAN, reasked: true, stillBroken: [] });
  });

  it("a clean draft is posted as written — no judge call when nothing trips", async () => {
    const call = vi.fn(async () => CLEAN);
    const kept = await narrateKeepingObligations(call, pacedRefused(), { apiKey: "sk-test", ctx: { refusalCode: "recoverable-health" } });
    expect(call).toHaveBeenCalledTimes(1);
    expect(apiPost).not.toHaveBeenCalled();
    expect(kept).toMatchObject({ raw: CLEAN, reasked: false });
  });

  it("a judge error: posted as written", async () => {
    judgeReplies.push(new Error("timeout"));
    const call = vi.fn(async () => DRAFT);
    const kept = await narrateKeepingObligations(call, pacedRefused(), { apiKey: "sk-test", ctx: { refusalCode: "recoverable-health" } });
    expect(call).toHaveBeenCalledTimes(1);
    expect(kept.raw).toBe(DRAFT);
  });

  it("a certain failure twice: the second reply is posted, its breach reported — never a third call", async () => {
    const BAD = "It is a strong hit, and the lock gives." + sidecar;
    const call = vi.fn(async () => BAD);
    const kept = await narrateKeepingObligations(call, obligationsFor({ mode: "move", resolution: { moveId: "face_danger", outcome: "strong_hit" } }), { apiKey: "sk-test" });
    expect(call).toHaveBeenCalledTimes(2);
    expect(kept).toMatchObject({ raw: BAD, reasked: true });
    expect(kept.stillBroken.map(v => v.tag)).toEqual(["apparatus"]);
  });

  it("a re-ask that throws keeps the first draft — the beat is still told", async () => {
    const BAD = "It is a strong hit, and the lock gives." + sidecar;
    const call = vi.fn(async (addendum) => { if (addendum) throw new Error("overloaded"); return BAD; });
    const kept = await narrateKeepingObligations(call, obligationsFor({ mode: "move", resolution: { moveId: "face_danger", outcome: "strong_hit" } }), { apiKey: "sk-test" });
    expect(call).toHaveBeenCalledTimes(2);
    expect(kept).toMatchObject({ raw: BAD, reasked: true });
  });

  it("no judge when it is switched off — the certain checks still run", async () => {
    const call = vi.fn(async () => DRAFT);
    const kept = await narrateKeepingObligations(call, pacedRefused(), { apiKey: "sk-test", judge: false, ctx: { refusalCode: "recoverable-health" } });
    expect(apiPost).not.toHaveBeenCalled();
    expect(kept).toMatchObject({ raw: DRAFT, reasked: false });
  });
});
