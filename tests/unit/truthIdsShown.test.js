// tests/unit/truthIdsShown.test.js
// The id `!truth strike` takes is shown, and the help no longer promises a
// button narrator cards lost (issue #326 W67). The help said every narrator
// card carries a "Correct a fact" button with per-row Strike / Replace, and
// that `!truth strike` takes an id from that dialog — the button was removed
// in v1.7.26, the dialog opens only from a GM-whispered Narrative Review card,
// and a truth's id was shown nowhere, not even on the `!truth set` card. The
// set card now shows the id, `!truth list` lists the scene's truths with
// theirs, and the help describes what exists.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/api-proxy.js", () => ({ apiPost: vi.fn() }));

import { PAGES } from "../../src/help/helpJournal.js";
import { postNarrationCard } from "../../src/narration/narrator.js";
import {
  applyFactContinuityCommand, handleFactContinuityCommand, parseFactContinuityCommand,
} from "../../src/factContinuity/chatCommands.js";

const MODULE_ID = "starforged-companion";
const KEY = `${MODULE_ID}.campaignState`;
const help = (name) => PAGES.find(p => p.name === name)?.text?.content ?? "";

beforeEach(() => {
  ChatMessage._reset();
  game.settings._store.set(KEY, {
    currentSessionId: "sess-1", sessionNumber: 1, currentSceneId: "sc-1",
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: "sc-1" },
  });
});

describe("the help describes the correction affordances that exist (issue #326 W67)", () => {
  it("narrator cards carry no Correct a fact button, and the help no longer says they do", async () => {
    const card = await postNarrationCard("The dockmaster waves you through.", { moveId: "face_danger", outcome: "strong_hit", _id: "r1" },
      game.settings.get(MODULE_ID, "campaignState"), { narrationId: "nar-1" });
    expect(card.content).not.toMatch(/data-action="openCorrectionDialog"/);
    expect(help("Fact Continuity")).not.toMatch(/Every narrator card carries a <em>Correct a fact<\/em> button/);
    expect(help("Chat Commands")).not.toMatch(/from the Correct-a-fact dialog/);
    expect(help("Chat Commands")).toMatch(/<code>!truth list<\/code>/);
  });
});

describe("a truth's id is shown where `!truth strike` needs it (issue #326 W67)", () => {
  it("the `!truth set` card shows the recorded truth's id", async () => {
    await applyFactContinuityCommand({ text: '!truth set "the dockmaster" Owes the crew a favour' }, { requesterIsGM: true });
    const truth = game.settings.get(MODULE_ID, "campaignState").sceneTruths.at(-1);
    expect(ChatMessage._created.at(-1).content).toContain(truth.id.slice(0, 8));
  });

  it("`!truth list` whispers the typist the scene's live truths with their ids", async () => {
    const state = game.settings.get(MODULE_ID, "campaignState");
    state.sceneTruths = [
      { id: "tr-live0001", subject: { kind: "text", text: "the dockmaster" }, fact: "Owes the crew a favour", asserter: "narrator", retracted: false },
      { id: "tr-gone0002", subject: { kind: "text", text: "Vance" }, fact: "is dead", asserter: "narrator", retracted: true },
      { id: "tr-gmgm0003", subject: { kind: "scene" }, fact: "The station is sealed", asserter: "gm", retracted: false },
    ];
    const restore = asPlayer();
    try {
      await handleFactContinuityCommand({ content: "!truth list", author: { id: "test-user-player" } });
    } finally { restore(); }
    const card = ChatMessage._created.at(-1);
    expect(card.content).toContain("tr-live0");
    expect(card.content).toContain("Owes the crew a favour");
    expect(card.content).not.toContain("is dead");                       // struck: not listed
    expect(card.content).toMatch(/tr-gmgm0[\s\S]*only a GM can strike it/);  // a player is told which they cannot strike
    expect(card.whisper).toEqual(["test-user-player"]);
  });

  it("`!truth list` parses, and the usage line names it", () => {
    expect(parseFactContinuityCommand("!truth list")).toMatchObject({ ok: true, verb: "list" });
    expect(parseFactContinuityCommand("!truth frobnicate x").usage).toMatch(/!truth list/);
  });
});
