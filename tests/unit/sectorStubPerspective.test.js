// tests/unit/sectorStubPerspective.test.js
// The Sector Creator's narrator stubs follow the narration perspective
// (issue #326 W73). generateNarratorStubs compared the perspective with
// "first", a value the setting never holds (auto / second_person /
// third_person), so every stub was written in second person — a
// third-person campaign's Sector Record and settlement descriptions
// addressed "you". The setting is now resolved as the narrator resolves it
// (resolveNarrationPerspective).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const calls = vi.hoisted(() => []);
vi.mock("../../src/api-proxy.js", () => ({
  apiPost: vi.fn(async (_url, _headers, body) => {
    calls.push(body.messages[0].content);
    return { content: [{ type: "text", text: "The station turns slowly over the ice." }], stop_reason: "end_turn" };
  }),
}));

import { generateNarratorStubs } from "../../src/sectors/sectorGenerator.js";
import { beginSession } from "../../src/session/lifecycle.js";
import { buildNarratorSystemBlocks } from "../../src/narration/narratorPrompt.js";

const MODULE_ID = "starforged-companion";

const sector = {
  id: "s1", name: "Devil's Maw", region: "outlands", regionLabel: "Outlands",
  trouble: "Ships regularly go missing", faction: null,
  settlements: [{ id: "st1", name: "Bleakhold", locationType: "orbital", population: "Hundreds", authority: "Fair", projects: ["Mining"], firstLook: [], planet: null }],
};

describe("sector narrator stubs follow the narration perspective (issue #326 W73)", () => {
  beforeEach(() => {
    calls.length = 0;
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, "sk-ant-test");
  });

  it("a third-person campaign's stubs are not written in second person", async () => {
    // What sectorPanel.js getNarratorSettings passes for the "Third person" setting.
    await generateNarratorStubs(sector, { perspective: "third_person", tone: "wry" });
    expect(calls).toHaveLength(2);   // the sector stub and Bleakhold's
    // Both prompts said "Narrate in second person (address the protagonist as 'you')".
    for (const prompt of calls) expect(prompt).not.toMatch(/second person/i);
    for (const prompt of calls) expect(prompt).toMatch(/third person/i);
  });

  it("control: a second-person campaign's stubs are written in second person", async () => {
    await generateNarratorStubs(sector, { perspective: "second_person", tone: "wry" });
    for (const prompt of calls) expect(prompt).toMatch(/second person/i);
  });
  it('"auto" is resolved as the narrator resolves it — two players at the table: third person', async () => {
    // A Collection-like users list (Foundry's game.users has filter).
    const saved = game.users;
    game.users = [
      { id: "gm", isGM: true, active: true }, { id: "p1", isGM: false, active: true }, { id: "p2", isGM: false, active: true },
    ];
    try {
      await generateNarratorStubs(sector, { perspective: "auto", tone: "wry" });
    } finally { game.users = saved; }
    for (const prompt of calls) expect(prompt).toMatch(/third person/i);
  });
});

// Issue #362 AC70 SECTOR-STUB-PERSPECTIVE-PER-CALL (an incomplete fix of issue
// #348 PT03): Auto is decided once per session, at Begin a Session
// (campaignState.sessionPerspective), and kept until the next mint. The stubs
// counted the connected users at the call instead, so a sector created after
// a second window or player connected mid-session was described in the third
// person — stored on the Sector Record and each settlement's description, and
// read by the world snapshot — in a session the narrator narrates as "you".
describe("sector narrator stubs take the session's Auto perspective (issue #362 AC70)", () => {
  const SOLO   = [{ id: "gm", isGM: true, active: true }, { id: "p1", isGM: false, active: true }];
  const JOINED = [...SOLO, { id: "p2", isGM: false, active: true }];
  let savedUsers;
  const perspectivesOf = (prompts) => prompts.map(p => (/Narrate in third person/i.test(p) ? "third_person"
    : /Narrate in second person/i.test(p) ? "second_person" : "none"));

  /** Begin a Session with these users at the table; the session's Auto perspective is recorded. */
  function begin(users, { sessionId = "sess-1" } = {}) {
    game.users = users;
    const cs = beginSession({ currentSessionId: sessionId, sessionNumber: 2, sessionActive: false });
    game.settings._store.set(`${MODULE_ID}.campaignState`, cs);
    return cs;
  }

  beforeEach(() => {
    calls.length = 0;
    savedUsers = game.users;
    game.settings._store.clear();
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, "sk-ant-test");
  });
  afterEach(() => { game.users = savedUsers; });

  it("control: the session began solo — Auto was recorded as second person, and the narrator keeps it after a second player connects", () => {
    const cs = begin(SOLO);
    expect(cs.sessionPerspective).toEqual({ sessionId: "sess-1", perspective: "second_person" });
    game.users = JOINED;
    const { mode } = buildNarratorSystemBlocks(cs, { narrationPerspective: "auto" }, null, "", { mode: "paced_narrative" });
    expect(mode).toContain('Address the player character directly as "you"');
  });

  it("a second player connects mid-session, then a sector is created: its stubs are second person, as the session's narration", async () => {
    begin(SOLO);
    game.users = JOINED;   // a second window or player connects after Begin a Session
    // What sectorPanel.js getNarratorSettings passes for the "Auto" setting.
    await generateNarratorStubs(sector, { perspective: "auto", tone: "wry" });
    expect(calls).toHaveLength(2);   // the sector's stub and Bleakhold's
    expect(perspectivesOf(calls)).toEqual(["second_person", "second_person"]);
  });

  it("a session begun by two players stays third person when one of them leaves", async () => {
    begin(JOINED);
    game.users = SOLO;
    await generateNarratorStubs(sector, { perspective: "auto", tone: "wry" });
    expect(perspectivesOf(calls)).toEqual(["third_person", "third_person"]);
  });

  it("control: a perspective recorded for another session is not this one's — Auto counts the table", async () => {
    const cs = begin(SOLO);
    game.settings._store.set(`${MODULE_ID}.campaignState`, { ...cs, currentSessionId: "sess-2" });
    game.users = JOINED;
    await generateNarratorStubs(sector, { perspective: "auto", tone: "wry" });
    expect(perspectivesOf(calls)).toEqual(["third_person", "third_person"]);
  });

  it("control: a set perspective is the setting's, whatever the session recorded", async () => {
    begin(SOLO);
    await generateNarratorStubs(sector, { perspective: "third_person", tone: "wry" });
    expect(perspectivesOf(calls)).toEqual(["third_person", "third_person"]);
  });
});
