/**
 * PROBE (sectors audit, SO-05) — the Sector Creator's narrator stubs ignore
 * the campaign's narration perspective: they are always written in second
 * person.
 *
 * What the user does: a multiplayer table (Narration Perspective "Auto" with
 * more than one player, or "Third person") creates a sector in the Sector
 * Creator with narrator stubs on (the default).
 * What happens: sectorPanel.js getNarratorSettings passes the stored
 * `narrationPerspective` ("auto" | "second_person" | "third_person" —
 * settingsPanel.js NARRATION_PERSPECTIVES), and generateNarratorStubs
 * (sectorGenerator.js) compares it with "first", a value the setting never
 * holds — every other value, third person included, gets "Narrate in second
 * person (address the protagonist as 'you')". The sector's Sector Record page
 * and every settlement's sheet description are then written to "you", in a
 * campaign whose narrator speaks of the characters by name (decisions.md,
 * "Perspective: auto — … third person (character names) for multiplayer").
 * What should happen: the stubs follow the resolved perspective the narrator
 * uses (narratorPrompt.js resolveNarrationPerspective).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const calls = vi.hoisted(() => []);
vi.mock("../../../src/api-proxy.js", () => ({
  apiPost: vi.fn(async (_url, _headers, body) => {
    calls.push(body.messages[0].content);
    return { content: [{ type: "text", text: "The station turns slowly over the ice." }], stop_reason: "end_turn" };
  }),
}));

import { generateNarratorStubs } from "../../../src/sectors/sectorGenerator.js";

const MODULE_ID = "starforged-companion";

const sector = {
  id: "s1", name: "Devil's Maw", region: "outlands", regionLabel: "Outlands",
  trouble: "Ships regularly go missing", faction: null,
  settlements: [{ id: "st1", name: "Bleakhold", locationType: "orbital", population: "Hundreds", authority: "Fair", projects: ["Mining"], firstLook: [], planet: null }],
};

describe("PROBE SO-05: sector narrator stubs follow the narration perspective", () => {
  beforeEach(() => {
    calls.length = 0;
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, "sk-ant-test");
  });

  it("a third-person campaign's stubs are not written in second person", async () => {
    // What sectorPanel.js getNarratorSettings passes for the "Third person" setting.
    await generateNarratorStubs(sector, { perspective: "third_person", tone: "wry" });
    expect(calls).toHaveLength(2);   // the sector stub and Bleakhold's
    // FAILS today: both prompts say "Narrate in second person (address the protagonist as 'you')".
    for (const prompt of calls) expect(prompt).not.toMatch(/second person/i);
  });

  it("control: a second-person campaign's stubs are written in second person", async () => {
    await generateNarratorStubs(sector, { perspective: "second_person", tone: "wry" });
    for (const prompt of calls) expect(prompt).toMatch(/second person/i);
  });
});
