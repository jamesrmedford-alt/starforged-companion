// tests/unit/sectorStubPerspective.test.js
// The Sector Creator's narrator stubs follow the narration perspective
// (issue #326 W73). generateNarratorStubs compared the perspective with
// "first", a value the setting never holds (auto / second_person /
// third_person), so every stub was written in second person — a
// third-person campaign's Sector Record and settlement descriptions
// addressed "you". The setting is now resolved as the narrator resolves it
// (resolveNarrationPerspective).

import { describe, it, expect, beforeEach, vi } from "vitest";

const calls = vi.hoisted(() => []);
vi.mock("../../src/api-proxy.js", () => ({
  apiPost: vi.fn(async (_url, _headers, body) => {
    calls.push(body.messages[0].content);
    return { content: [{ type: "text", text: "The station turns slowly over the ice." }], stop_reason: "end_turn" };
  }),
}));

import { generateNarratorStubs } from "../../src/sectors/sectorGenerator.js";

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
