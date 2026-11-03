// tests/unit/narratorModeLength.test.js
// Each narrator mode is told one length — its own (issue #326 W40).
// buildNarratorSystemPrompt rendered "Length: <Length (sentences)>" in the
// STYLE block of every mode: an @scene request said "Length: 6 sentences"
// beside its user message's "Answer this question with 1–2 sentences" (the
// Scene Response Length setting), the campaign recap "Length: 3 sentences"
// beside "3–5 paragraphs", and the vignette, vow, clock, oracle and inciting
// beats their own counts against it. The Length line is now sent to move
// and paced narration only, whose user messages repeat it.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/api-proxy.js", () => ({ apiPost: vi.fn() }));
vi.mock("../../src/system/campaignTruths.js", async () => {
  const actual = await vi.importActual("../../src/system/campaignTruths.js");
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => "") };
});

import { apiPost } from "../../src/api-proxy.js";
import { interrogateScene } from "../../src/narration/narrator.js";
import { buildNarratorSystemPrompt, buildCampaignRecapUserMessage } from "../../src/narration/narratorPrompt.js";

const MODULE_ID = "starforged-companion";

beforeEach(() => {
  vi.clearAllMocks();
  apiPost.mockResolvedValue({
    content: [{ type: "text", text: 'Ozone and old grease.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' }],
    usage: {}, stop_reason: "end_turn",
  });
  ChatMessage._reset();
  game.settings._store.clear();
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, "sk-ant-test");
  game.settings._store.set(`${MODULE_ID}.narrationLength`, 6);
  game.settings._store.set(`${MODULE_ID}.sceneResponseLength`, 1);
  game.settings._store.set(`${MODULE_ID}.campaignState`, { currentSessionId: "s1", sessionNumber: 1, currentSceneId: "sc-1" });
  global.game.messages = { contents: [] };
});

const systemFor = (mode, narrationLength = 3) =>
  buildNarratorSystemPrompt({}, { narrationLength }, null, "", { mode });

describe("each narrator mode is told one length — its own (issue #326 W40)", () => {
  it("@scene: the request carries the Scene Response Length, not the move-narration Length", async () => {
    await interrogateScene("what does the hangar smell like?", game.settings.get(MODULE_ID, "campaignState"));
    const [[, , body]] = apiPost.mock.calls;
    expect(String(body.messages[0].content)).toContain("1–2 sentences");   // control: the scene setting is sent
    expect(body.system[0].text).not.toContain("Length: 6 sentences");
  });

  it('campaign recap: the system prompt does not say "Length: 3 sentences" beside "3–5 paragraphs"', () => {
    const user = buildCampaignRecapUserMessage(["[Session 1]\nKira swore to find Chen."]);
    expect(user).toContain("3–5 paragraphs");                                 // control
    expect(systemFor("campaign_recap")).not.toContain("Length: 3 sentences");
  });

  it("the vignette, inciting, vow, clock and oracle modes carry no Length line", () => {
    for (const mode of ["session_vignette", "inciting_incident", "vow_swearing", "clock_advance", "oracle_followup", "scene_interrogation"]) {
      expect(systemFor(mode, 5), mode).not.toMatch(/Length: \d+ sentence/);
    }
  });

  it("control: move and paced narration keep the Length setting in STYLE", () => {
    expect(systemFor("move_resolution", 5)).toContain("Length: 5 sentences");
    expect(systemFor("paced_narrative", 1)).toContain("Length: 1 sentence\n");
  });
});
