/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/narrationFailureByCause.test.js
 *
 * known-issues ERROR-TEXT-BLAMES-KEY: every narration failure — Anthropic
 * overloaded, a server error, a timeout, a malformed reply, a reply with no
 * text — posted "Narration unavailable — check your API key and proxy" (a
 * move's fallback card, a round's, @scene's "Scene query failed — …", the
 * paced line's notice). Only a refused key (401) is about the key. Each card
 * now names its cause (src/narration/failureReason.js).
 *
 * ROUND-CLOSED-UNNARRATED-WORDING: a round closed unnarrated because the
 * session ended while it waited for a GM with a Claude key said "check your
 * API key and proxy" too; narrateRound's `noKeyReason` carries the real one.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../src/api-proxy.js", () => ({ apiPost: vi.fn() }));
vi.mock("../../src/system/campaignTruths.js", async () => {
  const actual = await vi.importActual("../../src/system/campaignTruths.js");
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => "") };
});

import { apiPost } from "../../src/api-proxy.js";
import { narrateResolution, interrogateScene, narrateRound } from "../../src/narration/narrator.js";
import { claudeFailureReason, NO_CLAUDE_KEY_REASON, EMPTY_REPLY_REASON } from "../../src/narration/failureReason.js";

const MODULE_ID = "starforged-companion";
const RESOLUTION = { _id: "r1", moveId: "face_danger", moveName: "Face Danger", outcome: "weak_hit", outcomeLabel: "Weak Hit" };
const STATE = () => ({ currentSessionId: "s1", sessionNumber: 2, currentSceneId: "sc-1", sceneTruths: [] });
const ROUND = {
  id: "round-1", number: 1, sessionId: "s1", acting: ["pl-1"],
  entries: { "pl-1": { userId: "pl-1", actorId: "pc-kira", actorName: "Kira", text: "I slip through.",
    rolled: { narrationInput: { kind: "move", moveId: "face_danger", moveName: "Face Danger", outcome: "strong_hit", outcomeLabel: "Strong Hit" } } } },
};

const apiError = (status, body = "{}") => new Error(`Anthropic API error ${status}: ${body}`);
const errorLine = () => {
  const html = String(ChatMessage._created.at(-1)?.content ?? "");
  return html.match(/class="sf-(?:narration|scene)-error">([^<]*)</)?.[1] ?? "";
};

beforeEach(() => {
  ChatMessage._reset();
  apiPost.mockReset();
  game.settings._store.clear();
  global.game.messages = { contents: [] };
  silenceConsoleErrors();
});

describe("claudeFailureReason names the cause", () => {
  it.each([
    [apiError(401), /API key was refused/],
    [apiError(529, '{"type":"overloaded_error"}'), /overloaded/],
    [apiError(500), /servers returned an error/],
    [apiError(429), /rate limit/],
    [apiError(400), /refused the request \(error 400\)/],
    [new Error("Anthropic request timed out after 120s"), /timed out/],
    [new TypeError("Failed to fetch"), /could not be reached/],
    [new SyntaxError("Unexpected end of JSON input"), /cut off or malformed/],
    [new Error("Narrator API returned no text content."), /no text/],
    [new Error("Claude API key not configured. Set it in module settings."), /no Claude API key is set/],
    [new Error("campaignState write refused"), /see the console/],
  ])("%s", (err, expected) => {
    expect(claudeFailureReason(err)).toMatch(expected);
  });

  it("only a refused or missing key mentions the key", () => {
    for (const err of [apiError(529), apiError(500), new Error("x timed out after 1s"), new SyntaxError("Unexpected end of JSON input")]) {
      expect(claudeFailureReason(err)).not.toMatch(/key/i);
    }
  });
});

describe("a move's fallback card names its cause", () => {
  beforeEach(() => game.settings._store.set(`${MODULE_ID}.claudeApiKey`, "sk-ant-test"));

  it("Anthropic overloaded (529): 'overloaded', not 'check your API key'", async () => {
    apiPost.mockRejectedValue(apiError(529, '{"type":"overloaded_error"}'));
    await narrateResolution(RESOLUTION, STATE());
    expect(errorLine()).toMatch(/^Narration unavailable — Claude is overloaded right now/);
    expect(errorLine()).not.toMatch(/API key/);
    expect(ChatMessage._created.at(-1).flags[MODULE_ID].narrationFallback).toBe(true);
  });

  it("a reply with no prose says so", async () => {
    apiPost.mockResolvedValue({ content: [{ type: "text", text: '```json\n{"newTruths":[],"stateChanges":[]}\n```' }], stop_reason: "end_turn" });
    await narrateResolution(RESOLUTION, STATE());
    expect(errorLine()).toBe(`Narration unavailable — ${EMPTY_REPLY_REASON}.`);
  });

  it("a refused key (401) is the one that names the key", async () => {
    apiPost.mockRejectedValue(apiError(401));
    await narrateResolution(RESOLUTION, STATE());
    expect(errorLine()).toMatch(/the Claude API key was refused/);
  });

  it("no key on this game says that", async () => {
    game.settings._store.delete(`${MODULE_ID}.claudeApiKey`);
    await narrateResolution(RESOLUTION, STATE());
    expect(errorLine()).toBe(`Narration unavailable — ${NO_CLAUDE_KEY_REASON}.`);
  });
});

describe("@scene and a round name theirs too", () => {
  beforeEach(() => game.settings._store.set(`${MODULE_ID}.claudeApiKey`, "sk-ant-test"));

  it("@scene: a server error", async () => {
    apiPost.mockRejectedValue(apiError(500));
    await interrogateScene("what is on the console?", STATE());
    expect(errorLine()).toMatch(/^Scene query failed — Claude's servers returned an error/);
    expect(errorLine()).not.toMatch(/API key/);
  });

  it("a round: a timeout", async () => {
    apiPost.mockRejectedValue(new Error("Anthropic request timed out after 120s"));
    const told = await narrateRound({ round: ROUND, campaignState: STATE() });
    expect(told.posted).toBe("fallback");
    expect(errorLine()).toMatch(/^Narration unavailable — the request to Claude timed out/);
  });

  it("a round closed for want of a keyed GM carries that reason (ROUND-CLOSED-UNNARRATED-WORDING)", async () => {
    game.settings._store.delete(`${MODULE_ID}.claudeApiKey`);
    const reason = "the session ended while the round waited for a GM with a Claude key to narrate it";
    await narrateRound({ round: ROUND, campaignState: STATE(), noKeyReason: reason });
    expect(errorLine()).toBe(`Narration unavailable — ${reason}.`);
    expect(apiPost).not.toHaveBeenCalled();
  });
});
