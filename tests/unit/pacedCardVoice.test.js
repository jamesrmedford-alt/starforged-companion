/**
 * STARFORGED COMPANION
 * tests/unit/pacedCardVoice.test.js
 *
 * Issue #322 V22 (traced): the paced narration card stamped
 * `matchedEntityIds: []`, so resolveNpcVoiceForCard (src/audio/index.js),
 * which picks an NPC's pronoun-keyed voice from the card's matched
 * connections, never had one to read: a paced beat with Sable's lines always
 * played the generic NPC voice, though the move narration card in the same
 * scene used hers. The card stamps the scene's matched entities now, as the
 * move narration card does — the composition here runs the real
 * narratePacedInput, its lexical relevance and the real voice picker.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../src/api-proxy.js", () => ({
  apiPost: vi.fn(async (_url, _headers, body) => {
    const model = String(body?.model ?? "");
    const text = model.includes("haiku") ? "{}"
      : 'Sable leans on the counter. <npc>"Name your price."</npc>\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
    return { content: [{ type: "text", text }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } };
  }),
}));

import { narratePacedInput } from "../../src/narration/narrator.js";
import { resolveNpcVoiceForCard } from "../../src/audio/index.js";
import { CampaignStateSchema } from "../../src/schemas.js";

const MODULE_ID = "starforged-companion";

beforeEach(() => {
  game.actors._reset();
  ChatMessage._reset();
  global.game.messages = { contents: [] };
  const store = game.settings._store;
  store.clear();
  store.set(`${MODULE_ID}.claudeApiKey`, "sk-ant-test");
  store.set(`${MODULE_ID}.chronicleAutoEntry`, false);
  store.set(`${MODULE_ID}.campaignState`, {
    ...CampaignStateSchema, sessionActive: true, currentSessionId: "s1", sessionNumber: 1,
    currentSceneId: "sc-1", sceneTruths: [], connectionIds: ["npc-sable"],
  });
  game.actors._set("npc-sable", makeTestActor({
    id: "npc-sable", type: "character", name: "Sable Ortiz",
    flags: { [MODULE_ID]: { entityType: "connection", connection: {
      _id: "rec-sable", name: "Sable Ortiz", role: "Fixer", rank: "dangerous", pronouns: "she/her",
      relationshipTicks: 0, bonded: false, active: true, history: [],
    } } },
  }));
});

describe("a paced narration card carries the scene's matched entities (V22)", () => {
  it("names the connection the player named, so its pronoun-keyed voice is picked", async () => {
    silenceConsoleErrors();   // unrelated best-effort passes log in this bare unit env
    await narratePacedInput("I ask Sable Ortiz about the cargo.", game.settings.get(MODULE_ID, "campaignState"), {});

    const card = ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.pacedNarrative);
    expect(card, "the paced card posted").toBeTruthy();
    expect(card.flags[MODULE_ID].matchedEntityIds).toContain("npc-sable");     // was []

    const voice = await resolveNpcVoiceForCard(card, {
      npcVoiceId: "voice-generic", npcVoiceByKey: { feminine: "voice-she", masculine: "", neutral: "" },
    });
    expect(voice).toBe("voice-she");
  });

  it("control: a paced beat that names nobody keeps the generic NPC voice", async () => {
    silenceConsoleErrors();
    await narratePacedInput("I look around the salvage market.", game.settings.get(MODULE_ID, "campaignState"), {});
    const card = ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.pacedNarrative);
    expect(card.flags[MODULE_ID].matchedEntityIds).toEqual([]);
    expect(await resolveNpcVoiceForCard(card, { npcVoiceId: "voice-generic", npcVoiceByKey: { feminine: "voice-she" } }))
      .toBe("voice-generic");
  });
});
