/**
 * STARFORGED COMPANION
 * tests/unit/privateChannelSessionChange.test.js
 *
 * known-issues PRIVATE-WINDOW-SESSION-CHANGE: the Private Channel window read
 * its session's saved turns once, on its first render, and kept them in
 * `this.turns`. Kept open across a session change (End a Session, Begin a
 * Session), it went on showing the previous session's conversation and
 * sending it to the narrator as this session's transcript. The window now
 * notes which session its turns are of and, when that has changed, starts the
 * new session's conversation (the old page keeps the old turns).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../src/private-channel/narrate.js", () => ({
  requestPrivateNarration: vi.fn(async () => ({ ok: true, text: "The narrator answers." })),
}));

import { PrivateChannelApp } from "../../src/private-channel/app.js";
import { requestPrivateNarration } from "../../src/private-channel/narrate.js";
import { _resetBuffers } from "../../src/private-channel/transcript.js";

const MODULE_ID = "starforged-companion";
let saved;

const typed = (app, text) => { app.element = { querySelector: (s) => (s === "[data-pc-input]" ? { value: text } : null) }; };
const send  = (app, text) => { typed(app, text); return PrivateChannelApp.DEFAULT_OPTIONS.actions.send.call(app, {}, null); };
const setSession = (id) => game.settings._store.set(`${MODULE_ID}.campaignState`, { currentSessionId: id });

beforeEach(() => {
  _resetBuffers();
  saved = { journal: global.game.journal, users: global.game.users };
  global.game.journal = { contents: [], getName: () => null, find: () => null };
  const users = new Map([["player-1", { id: "player-1", name: "Sam", isGM: false, active: true, character: { id: "pc-dax", name: "Dax" } }]]);
  global.game.users = { get: (id) => users.get(id) ?? null, get contents() { return [...users.values()]; } };
  setSession("ses-1");
});

afterEach(() => {
  _resetBuffers();
  PrivateChannelApp._resetInstances();
  global.game.journal = saved.journal;
  global.game.users = saved.users;
  game.settings._store.delete(`${MODULE_ID}.campaignState`);
  vi.clearAllMocks();
});

describe("PRIVATE-WINDOW-SESSION-CHANGE — a window kept open across a session change", () => {
  it("the next session's first message does not carry the last session's turns to the narrator", async () => {
    const app = await PrivateChannelApp.open({ userId: "player-1" });
    await app._prepareContext({});
    await send(app, "Last week's secret.");
    expect(requestPrivateNarration.mock.calls[0][0].transcriptTurns).toHaveLength(1);

    setSession("ses-2");        // End a Session, then Begin a Session — the window stayed open
    await send(app, "A new night.");

    expect(requestPrivateNarration.mock.calls[1][0].transcriptTurns).toEqual(["You: A new night."]);
  });

  it("the window shows the new session's conversation on its next render", async () => {
    const app = await PrivateChannelApp.open({ userId: "player-1" });
    await app._prepareContext({});
    await send(app, "Last week's secret.");

    setSession("ses-2");
    const { transcriptHtml } = await app._prepareContext({});
    expect(transcriptHtml).not.toContain("Last week");
  });

  it("control: within one session the turns are kept", async () => {
    const app = await PrivateChannelApp.open({ userId: "player-1" });
    await app._prepareContext({});
    await send(app, "First.");
    await send(app, "Second.");
    expect(requestPrivateNarration.mock.calls[1][0].transcriptTurns).toEqual([
      "You: First.", "Narrator: The narrator answers.", "You: Second.",
    ]);
  });
});
