/**
 * Issue #354 P2-25 — the ability scan reads a reply that holds more than one
 * JSON object.
 *
 * Alpha 23 playtest part 2, Error Log: "abilityScanner: Haiku JSON parse
 * failed: Unexpected non-whitespace character after JSON at position 214
 * (line 3 column 1)". parseHaikuResponse sliced from the first "{" to the last
 * "}", so a second object after the first — or trailing text with a brace in
 * it — made the slice invalid JSON: the scan returned [] and that turn's
 * abilities were skipped with only a console warning that did not show the
 * reply.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { parseHaikuResponse } from "../../src/moves/abilityScanner.js";

afterEach(() => vi.restoreAllMocks());

const ONE = '{ "matches": [ { "key": "a1#0", "summary": "Adds +1 when you repair.", "statReplacement": null } ] }';

describe("issue #354 P2-25 — parseHaikuResponse", () => {
  it("control: one object, fenced or followed by a sentence, as before", () => {
    expect(parseHaikuResponse(ONE)).toEqual([{ key: "a1#0", summary: "Adds +1 when you repair.", statReplacement: null }]);
    expect(parseHaikuResponse("```json\n" + ONE + "\n```")).toHaveLength(1);
    expect(parseHaikuResponse(ONE + "\n\nNo other ability applies.")).toHaveLength(1);
  });

  it("two objects after one another: both are read (the playtest's failure)", () => {
    const reply = ONE + '\n\n{ "matches": [ { "key": "b2#1", "summary": "Roll +heart.", "statReplacement": "heart" } ] }';
    expect(() => JSON.parse(reply.slice(reply.indexOf("{"), reply.lastIndexOf("}") + 1))).toThrow();
    expect(parseHaikuResponse(reply)).toEqual([
      { key: "a1#0", summary: "Adds +1 when you repair.", statReplacement: null },
      { key: "b2#1", summary: "Roll +heart.", statReplacement: "heart" },
    ]);
  });

  it("one object per match, with no wrapper: each is a match", () => {
    const reply = '{ "key": "a1#0", "summary": "One." }\n{ "key": "b2#1", "summary": "Two.", "statReplacement": "wits" }';
    expect(parseHaikuResponse(reply).map(m => m.key)).toEqual(["a1#0", "b2#1"]);
  });

  it("trailing text with a brace in it does not break the parse", () => {
    expect(parseHaikuResponse(ONE + "\n(Other abilities {none} apply.)").map(m => m.key)).toEqual(["a1#0"]);
  });

  it("a brace inside a string is not a brace", () => {
    const reply = '{ "matches": [ { "key": "a1#0", "summary": "Use the {override} panel." } ] }';
    expect(parseHaikuResponse(reply)).toEqual([{ key: "a1#0", summary: "Use the {override} panel.", statReplacement: null }]);
  });

  it("the same ability named twice is one match", () => {
    expect(parseHaikuResponse(ONE + "\n" + ONE)).toHaveLength(1);
  });

  it("a reply with no JSON object is logged with its text, and gives no matches", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(parseHaikuResponse("I could not decide which abilities apply.")).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0].join(" ")).toMatch(/Haiku JSON parse failed/);
    expect(warn.mock.calls[0].join(" ")).toContain("I could not decide which abilities apply.");
  });

  it("a reply cut off mid-object keeps the objects that closed", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(parseHaikuResponse(ONE + '\n{ "matches": [ { "key": "b2#1", "summ').map(m => m.key)).toEqual(["a1#0"]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("an empty reply gives no matches", () => {
    expect(parseHaikuResponse("")).toEqual([]);
    expect(parseHaikuResponse(null)).toEqual([]);
    expect(parseHaikuResponse('{ "matches": [] }')).toEqual([]);
  });
});
