/**
 * STARFORGED COMPANION
 * tests/unit/narratorModeRoles.test.js
 *
 * Issue #322 V23 (traced):
 *   - narrateClockAdvancement built its prompt in the session-vignette mode,
 *     whose role says to "depict the calm before / the calm after, not the
 *     start or end of the action" — for a threat materialising. It has its own
 *     mode now, `clock_advance`, whose role makes the advance felt and, when
 *     the clock fills, depicts the threat's arrival; its latitude is
 *     interaction (an established threat, the known cast).
 *   - `vow_swearing` had no entry in DEFAULT_PERMISSION_CLASS_BY_MODE, so the
 *     oath scene carried no latitude block at all; it is embellishment.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/api-proxy.js", () => ({
  apiPost: vi.fn(async () => ({
    content: [{ type: "text", text: 'Klaxons wake the station.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' }],
    stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 },
  })),
}));

import { buildNarratorSystemPrompt } from "../../src/narration/narratorPrompt.js";
import { narrateClockAdvancement } from "../../src/narration/narrator.js";
import { apiPost } from "../../src/api-proxy.js";

const MODULE_ID = "starforged-companion";

describe("each narrator mode has its role and latitude", () => {
  it("clock_advance: the threat's own role, and the interaction block — not the vignette's calm", () => {
    const prompt = buildNarratorSystemPrompt({}, {}, null, "", { mode: "clock_advance" });
    expect(prompt).toContain("a tracked threat moving closer");
    expect(prompt).toContain("the threat MATERIALISES");
    expect(prompt).toContain("## NARRATOR PERMISSIONS — INTERACTION MODE");
    expect(prompt).not.toContain("the calm before / the calm after");
  });

  it("vow_swearing carries the embellishment block", () => {
    const prompt = buildNarratorSystemPrompt({}, {}, null, "", { mode: "vow_swearing" });
    expect(prompt).toContain("render the moment a character swears a vow");
    expect(prompt).toContain("## NARRATOR PERMISSIONS — EMBELLISHMENT MODE");   // it had none
  });

  it("control: the session vignette keeps its own role", () => {
    const prompt = buildNarratorSystemPrompt({}, {}, null, "", { mode: "session_vignette" });
    expect(prompt).toContain("the calm before / the calm after");
  });
});

describe("narrateClockAdvancement narrates in the clock_advance mode", () => {
  beforeEach(() => {
    ChatMessage._reset();
    apiPost.mockClear();
    game.settings._store.clear();
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, "sk-ant-test");
    global.game.messages = { contents: [] };
  });

  it("a filled clock's beat is narrated with the threat's role", async () => {
    const text = await narrateClockAdvancement({
      clock: { name: "Syndicate Hunt", type: "campaign", filled: 6, segments: 6, triggered: true },
      campaignState: { currentSessionId: "s1", currentSceneId: "sc-1", sceneTruths: [] },
    });
    expect(text).toMatch(/Klaxons/);
    const system = JSON.stringify(apiPost.mock.calls.at(-1)?.[2]?.system ?? apiPost.mock.calls.at(-1));
    expect(system).toContain("a tracked threat moving closer");
    expect(system).not.toContain("the calm before / the calm after");
  });
});
