/**
 * STARFORGED COMPANION
 * tests/unit/sessionRelayDialogs.test.js
 *
 * B3 / B4 (2026-10 multiplayer audit): the session / safety dialogs keep their
 * dialog + chat card on the invoking client and move every world write into a
 * GM-relay handler (applySafetyFlag, applyTakeBreak, applyBeginSession,
 * applyEndSession), invoked through requestGmAction — locally on the canonical
 * GM, relayed over the socket from anyone else. Also covers the End → Begin
 * focus round trip and the Session Panel's campaignState refresh hook.
 *
 * Who-runs-what across clients — the dialog on the typist's screen, the write
 * on the canonical GM, one card, the no-GM wording — runs on the multi-client
 * harness (tests/helpers/multiClient.js, issue #282): "across a booted table"
 * below. The mocks spread the real modules so src/index.js can boot on the
 * simulated clients; their recorders also note which user ran them.
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";

const calls = [];
const ranOn = [];   // `${userId} ${what}` — which simulated client ran a mocked step

vi.mock("../../src/factContinuity/sceneLifecycle.js", async (importOriginal) => ({
  ...(await importOriginal()),
  endScene: vi.fn(async () => { calls.push("endScene"); }),
}));
vi.mock("../../src/narration/narrator.js", async (importOriginal) => ({
  ...(await importOriginal()),
  getRollingSessionSummary: vi.fn(async () => { calls.push("summary"); }),
  narrateSessionVignette:   vi.fn(async () => null),
  narrateClockAdvancement:  vi.fn(async () => null),
}));
vi.mock("../../src/world/worldJournal.js", async (importOriginal) => ({
  ...(await importOriginal()),
  writeSessionLog: vi.fn(async () => { calls.push("sessionLog"); }),
}));
vi.mock("../../src/clocks/clocks.js", async (importOriginal) => ({
  ...(await importOriginal()),
  advanceCampaignClocksForBeginSession: vi.fn(async () => {
    calls.push("clocks");
    ranOn.push(`${globalThis.game?.user?.id} clocks`);
    return [];
  }),
}));
vi.mock("../../src/character/actorBridge.js", async (importOriginal) => ({
  ...(await importOriginal()),
  getPlayerActors:   vi.fn(() => [{ id: "a1", name: "Kira" }, { id: "a2", name: "Ren" }]),
  applyMeterChanges: vi.fn(async (actor, changes) => {
    calls.push(`momentum:${actor.id}:${changes.momentum}`);
    ranOn.push(`${globalThis.game?.user?.id} momentum:${actor.id}`);
  }),
}));
vi.mock("../../src/oracles/roller.js", async (importOriginal) => ({
  ...(await importOriginal()),
  rollOracle: vi.fn(() => ({ result: "A quiet moment on the bridge" })),
}));

import {
  applySafetyFlag,
  applyTakeBreak,
} from "../../src/safety/sessionDialogs.js";
import {
  openBeginSessionDialog,
  openEndSessionDialog,
  applyBeginSession,
  applyEndSession,
} from "../../src/safety/sessionLifecycleDialogs.js";
import { SessionPanelApp } from "../../src/ui/sessionPanel.js";
import { applyMeterChanges } from "../../src/character/actorBridge.js";
import { getRollingSessionSummary } from "../../src/narration/narrator.js";
import { writeSessionLog } from "../../src/world/worldJournal.js";
import { simulateTable, USERS } from "../helpers/multiClient.js";

const MODULE_ID = "starforged-companion";
const GM     = { id: "gm-1", name: "Gina", isGM: true,  active: true };
const PLAYER = { id: "pl-1", name: "Pat",  isGM: false, active: true };

let savedUsers;
let savedUser;

function setUsers(users, currentUserId) {
  game.users = Object.assign([...users], {
    get: (id) => users.find(u => u.id === id) ?? null,
  });
  game.user = users.find(u => u.id === currentUserId) ?? null;
}

function state() {
  return game.settings.get(MODULE_ID, "campaignState");
}

/** Fake DialogV2.prompt form: inputs keyed by their querySelector string. */
function fakeForm(values) {
  return {
    querySelector: (sel) => {
      if (!(sel in values)) return null;
      const v = values[sel];
      return typeof v === "boolean" ? { checked: v } : { value: v };
    },
  };
}

function installDialog({ form = null, waitChoice = null } = {}) {
  const prompts = [];
  foundry.applications.api.DialogV2 = {
    prompt: vi.fn(async (opts) => {
      prompts.push(opts);
      await opts.ok.callback(null, { form });
    }),
    wait: vi.fn(async () => waitChoice),
  };
  return prompts;
}

beforeEach(() => {
  calls.length = 0;
  ranOn.length = 0;
  savedUsers = game.users;
  savedUser  = game.user;
  game.socket._reset();
  ChatMessage._reset();
  Hooks.callAll = vi.fn();
  game.settings._store.set(`${MODULE_ID}.campaignState`, { sessionActive: false });
  vi.useFakeTimers({ toFake: ["setTimeout"] });
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  game.users = savedUsers;
  game.user  = savedUser;
  delete Hooks.callAll;
  // Assign, never delete: while a harness table is alive DialogV2 is a routed
  // accessor on foundry.applications.api, and deleting it would remove it.
  foundry.applications.api.DialogV2 = undefined;
  game.settings._store.delete(`${MODULE_ID}.campaignState`);
  game.settings._store.delete(`${MODULE_ID}.sessionLogAutoWrite`);
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// Set a Flag
// ─────────────────────────────────────────────────────────────────────────────

describe("Set a Flag", () => {
  it("applySafetyFlag credits the requester and sanitises the payload", async () => {
    setUsers([GM, PLAYER], "gm-1");
    await expect(applySafetyFlag({ text: " x ", visibility: "weird" }, { requester: PLAYER })).resolves.toBe(true);
    expect(state().safetyFlags[0]).toMatchObject({ text: "x", visibility: "public", createdBy: "Pat" });
  });

  it("applySafetyFlag refuses empty text with a warning", async () => {
    await expect(applySafetyFlag({ text: "   " }, {})).resolves.toBe(false);
    expect(globalThis.getCapturedWarns().some(w => /empty flag text/.test(w))).toBe(true);
    expect(state().safetyFlags).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Take a Break
// ─────────────────────────────────────────────────────────────────────────────

describe("Take a Break — move on", () => {
  it("applyTakeBreak writes the single-use grant", async () => {
    await applyTakeBreak({}, {});
    expect(state().nextMoveAdd.value).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Begin a Session
// ─────────────────────────────────────────────────────────────────────────────

describe("Begin a Session", () => {
  const form = fakeForm({
    'input[name="vignette"]':       true,
    'input[name="galleyVignette"]': false,
  });

  it("canonical GM: flip → momentum → clocks run locally, in order", async () => {
    setUsers([GM, PLAYER], "gm-1");
    installDialog({ form });
    await openBeginSessionDialog();
    expect(state().sessionActive).toBe(true);
    expect(calls).toEqual(["momentum:a1:1", "momentum:a2:1", "clocks"]);
    expect(Hooks.callAll).toHaveBeenCalledWith(`${MODULE_ID}.sessionStateChanged`, { active: true });
    // Galley unchecked → no vignette scheduled.
    expect(vi.getTimerCount()).toBe(0);
  });

  it("applyBeginSession schedules the galley vignette when included", async () => {
    await applyBeginSession({ vignetteRolled: false, includeGalley: true }, {});
    expect(vi.getTimerCount()).toBe(1);
    expect(applyMeterChanges).not.toHaveBeenCalled();
  });

  // Issue #300 F11: Begin again on the same session advanced its campaign
  // clocks and granted the Spotlight momentum a second time.
  it("applies a session's start effects once — a second Begin posts a note and changes nothing", async () => {
    setUsers([GM], "gm-1");
    await applyBeginSession({ vignetteRolled: true, includeGalley: true }, {});
    const sessionId = state().currentSessionId;
    expect(calls).toEqual(["momentum:a1:1", "momentum:a2:1", "clocks"]);
    expect(state().sessionStartedId).toBe(sessionId);
    expect(vi.getTimerCount()).toBe(1);

    calls.length = 0;
    vi.clearAllTimers();
    await applyBeginSession({ vignetteRolled: true, includeGalley: true }, {});
    expect(calls).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
    expect(state().currentSessionId).toBe(sessionId);
    expect(ChatMessage._created.at(-1).content).toMatch(/already begun/);
  });

  it("two Begins at once apply the start effects once", async () => {
    setUsers([GM], "gm-1");
    await Promise.all([
      applyBeginSession({ vignetteRolled: true, includeGalley: false }, {}),
      applyBeginSession({ vignetteRolled: true, includeGalley: false }, {}),
    ]);
    expect(calls).toEqual(["momentum:a1:1", "momentum:a2:1", "clocks"]);
  });

  // Issue #309 N09: Begin set its fields on the cached campaignState before
  // saving it. A refused save left this client's cache saying "begun", so
  // the retry stopped at the already-begun gate: the session never started
  // and its momentum was never paid.
  it("a refused save leaves the cached state as it was, and a retry begins the session", async () => {
    setUsers([GM], "gm-1");
    game.settings._store.set(`${MODULE_ID}.campaignState`, {
      sessionActive: false, currentSessionId: "s1", sessionStartedId: null,
      lastSessionTimestamp: new Date().toISOString(),
    });
    const cached = state();
    vi.spyOn(game.settings, "set").mockRejectedValueOnce(new Error("refused by the test"));
    await applyBeginSession({ vignetteRolled: true, includeGalley: false }, {});
    expect(state()).toBe(cached);
    expect(cached).toEqual({
      sessionActive: false, currentSessionId: "s1", sessionStartedId: null,
      lastSessionTimestamp: cached.lastSessionTimestamp,
    });
    expect(calls).toEqual([]);

    await applyBeginSession({ vignetteRolled: true, includeGalley: false }, {});
    expect(state()).toMatchObject({ sessionActive: true, currentSessionId: "s1", sessionStartedId: "s1" });
    expect(calls).toEqual(["momentum:a1:1", "momentum:a2:1", "clocks"]);
  });

  it("End then Begin applies the next session's start effects", async () => {
    setUsers([GM], "gm-1");
    await applyBeginSession({ vignetteRolled: false, includeGalley: false }, {});
    const first = state().currentSessionId;
    await applyEndSession({ questFocus: "", connectionFocus: "" }, {});
    calls.length = 0;

    await applyBeginSession({ vignetteRolled: false, includeGalley: false }, {});
    expect(state().currentSessionId).not.toBe(first);
    expect(calls).toEqual(["clocks"]);
  });

  it("a session that went idle is begun anew, although nobody ended it", async () => {
    setUsers([GM], "gm-1");
    game.settings._store.set(`${MODULE_ID}.campaignState`, {
      sessionActive: true, currentSessionId: "s-old", sessionStartedId: "s-old",
      lastSessionTimestamp: new Date(Date.now() - 5 * 3_600_000).toISOString(),
    });
    await applyBeginSession({ vignetteRolled: false, includeGalley: false }, {});
    expect(state().currentSessionId).not.toBe("s-old");
    expect(state().sessionStartedId).toBe(state().currentSessionId);
    expect(calls).toEqual(["clocks"]);
  });

  it("the dialog does not open on a session already begun", async () => {
    setUsers([GM, PLAYER], "pl-1");
    game.settings._store.set(`${MODULE_ID}.campaignState`, {
      sessionActive: true, currentSessionId: "s1", sessionStartedId: "s1",
      lastSessionTimestamp: new Date().toISOString(),
    });
    const prompts = installDialog({ form });
    const info = vi.spyOn(ui.notifications, "info");
    await openBeginSessionDialog();
    expect(prompts).toHaveLength(0);
    expect(info).toHaveBeenCalledWith(expect.stringMatching(/already begun/));
    expect(ChatMessage._created).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// End a Session
// ─────────────────────────────────────────────────────────────────────────────

describe("End a Session", () => {
  const form = fakeForm({
    'input[name="questFocus"]':      " Find the beacon ",
    'input[name="connectionFocus"]': "Mara",
  });

  it("canonical GM: every sub-step runs in the original order", async () => {
    setUsers([GM, PLAYER], "gm-1");
    game.settings._store.set(`${MODULE_ID}.campaignState`, { sessionActive: true });
    const setSpy = vi.spyOn(game.settings, "set");
    setSpy.mockImplementation(async (mod, key, val) => {
      calls.push(`set:${key}`);
      game.settings._store.set(`${mod}.${key}`, val);
      return val;
    });
    installDialog({ form });
    await openEndSessionDialog();

    expect(calls).toEqual([
      "endScene",
      "summary",
      "set:campaignState",
      "sessionLog",
      "momentum:a1:1",
      "momentum:a2:1",
    ]);
    expect(state()).toMatchObject({ sessionActive: false, questFocus: "Find the beacon", connectionFocus: "Mara" });
    expect(Hooks.callAll).toHaveBeenCalledWith(`${MODULE_ID}.sessionStateChanged`, { active: false });
    // Closing vignette scheduled on the GM.
    expect(vi.getTimerCount()).toBe(1);
    // Card posted after the GM-side work.
    expect(ChatMessage._created).toHaveLength(1);
  });

  // Second review round: `state` is read before endScene and the summary's
  // Claude call; writing it back whole reverted a move persisted meanwhile —
  // even its released pendingMove lock, so every later move was refused.
  it("merges only its own fields onto the latest store — a move persisted during the summary survives", async () => {
    setUsers([GM], "gm-1");
    game.settings._store.set(`${MODULE_ID}.campaignState`, {
      sessionActive: true, pendingMove: true, currentSessionId: "s1", sessionLogs: { s1: [] },
    });
    getRollingSessionSummary.mockImplementationOnce(async () => {
      calls.push("summary");
      // The move pipeline persists its resolution and releases its lock.
      game.settings._store.set(`${MODULE_ID}.campaignState`, {
        ...state(), pendingMove: false, sessionLogs: { s1: [{ moveId: "face_danger" }] },
      });
    });

    await applyEndSession({ questFocus: "Find the beacon", connectionFocus: "" }, {});

    expect(state()).toMatchObject({ sessionActive: false, questFocus: "Find the beacon", pendingMove: false });
    expect(state().sessionLogs.s1).toEqual([{ moveId: "face_danger" }]);
    expect(writeSessionLog).toHaveBeenCalledWith(expect.objectContaining({
      pendingMove: false, sessionLogs: { s1: [{ moveId: "face_danger" }] },
    }));
  });

  it("no focus → no momentum; sessionLogAutoWrite=false skips the log", async () => {
    game.settings._store.set(`${MODULE_ID}.sessionLogAutoWrite`, false);
    await applyEndSession({ questFocus: "", connectionFocus: "" }, {});
    expect(calls).toEqual(["endScene", "summary"]);
    expect(applyMeterChanges).not.toHaveBeenCalled();
  });

  // Issue #309 N08: End a Session never checked sessionEndedId — every
  // submission paid the party momentum again, and closed the scene, wrote the
  // Session Log and scheduled the closing vignette again.
  describe("ends a session once (issue #309 N08)", () => {
    const live = () => ({ sessionActive: true, currentSessionId: "s1", lastSessionTimestamp: new Date().toISOString() });

    it("a second End repeats nothing and pays no momentum; its focus replaces the one noted", async () => {
      setUsers([GM], "gm-1");
      game.settings._store.set(`${MODULE_ID}.campaignState`, live());
      await expect(applyEndSession({ questFocus: "Find the archive" }, {}))
        .resolves.toEqual({ alreadyEnded: false });
      expect(calls).toEqual(["endScene", "summary", "sessionLog", "momentum:a1:1", "momentum:a2:1"]);
      expect(vi.getTimerCount()).toBe(1);

      calls.length = 0;
      await expect(applyEndSession({ questFocus: "Find the beacon" }, {}))
        .resolves.toEqual({ alreadyEnded: true });
      expect(calls).toEqual([]);
      expect(vi.getTimerCount()).toBe(1);
      expect(state()).toMatchObject({ sessionActive: false, sessionEndedId: "s1", questFocus: "Find the beacon" });
      expect(ChatMessage._created.at(-1).content).toMatch(/already ended/);
      expect(ChatMessage._created.at(-1).content).toMatch(/No momentum/);
    });

    it("two Ends at once close the session and pay the momentum once", async () => {
      setUsers([GM], "gm-1");
      game.settings._store.set(`${MODULE_ID}.campaignState`, live());
      const results = await Promise.all([
        applyEndSession({ questFocus: "Find the archive" }, {}),
        applyEndSession({ connectionFocus: "Mara" }, {}),
      ]);
      expect(results.map(r => r.alreadyEnded)).toEqual([false, true]);
      expect(calls).toEqual(["endScene", "summary", "sessionLog", "momentum:a1:1", "momentum:a2:1"]);
      expect(state()).toMatchObject({ questFocus: "Find the archive", connectionFocus: "Mara" });
    });

    it("the first focus noted pays the momentum once, even when the ending noted none", async () => {
      setUsers([GM], "gm-1");
      game.settings._store.set(`${MODULE_ID}.campaignState`, live());
      await applyEndSession({}, {});
      expect(applyMeterChanges).not.toHaveBeenCalled();
      calls.length = 0;
      await expect(applyEndSession({ questFocus: "Find the archive" }, {}))
        .resolves.toEqual({ alreadyEnded: true });
      expect(calls).toEqual(["momentum:a1:1", "momentum:a2:1"]);
      expect(ChatMessage._created.at(-1).content).toMatch(/first focus noted/);
      await expect(applyEndSession({ questFocus: "Find the beacon" }, {}))
        .resolves.toEqual({ alreadyEnded: true });
      expect(calls).toEqual(["momentum:a1:1", "momentum:a2:1"]);
    });

    it("a refused save leaves the cached state as it was, and a retry ends the session", async () => {
      setUsers([GM], "gm-1");
      game.settings._store.set(`${MODULE_ID}.campaignState`, live());
      const cached = state();
      vi.spyOn(game.settings, "set").mockRejectedValueOnce(new Error("refused by the test"));
      await expect(applyEndSession({ questFocus: "Find the archive" }, {})).rejects.toThrow(/refused/);
      expect(state()).toBe(cached);
      expect(cached).toMatchObject({ sessionActive: true, currentSessionId: "s1" });
      expect(cached.sessionEndedId).toBeUndefined();
      expect(cached.questFocus).toBeUndefined();

      calls.length = 0;
      await expect(applyEndSession({ questFocus: "Find the archive" }, {}))
        .resolves.toEqual({ alreadyEnded: false });
      expect(state()).toMatchObject({ sessionActive: false, sessionEndedId: "s1", questFocus: "Find the archive" });
      expect(calls).toContain("momentum:a1:1");
    });

    it("the dialog on an ended session says a new focus corrects the old one", async () => {
      setUsers([GM, PLAYER], "pl-1");
      game.settings._store.set(`${MODULE_ID}.campaignState`, { ...live(), sessionEndedId: "s1", questFocus: "Find the archive" });
      const prompts = installDialog({ form: fakeForm({}) });
      await openEndSessionDialog();
      expect(prompts[0].content).toMatch(/already ended/);
      expect(prompts[0].content).not.toMatch(/grants <strong>\+1 momentum/);
    });
  });

  it("a handler error on the canonical GM is surfaced and the card stays honest", async () => {
    setUsers([GM], "gm-1");
    vi.spyOn(game.settings, "set").mockRejectedValue(new Error("db down"));
    globalThis.expectConsoleError(/session\.end failed/);
    installDialog({ form });
    await openEndSessionDialog();
    expect(ChatMessage._created[0].content).toMatch(/could not be ended — see the console/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B4 — foci round trip
// ─────────────────────────────────────────────────────────────────────────────

describe("questFocus / connectionFocus round trip (End → Begin)", () => {
  it("Begin surfaces the stored foci in dialog and card, then clears them", async () => {
    setUsers([GM], "gm-1");
    await applyEndSession({ questFocus: "Find the beacon", connectionFocus: "Mara <the pilot>" }, {});
    calls.length = 0;
    ChatMessage._reset();

    const prompts = installDialog({ form: fakeForm({
      'input[name="vignette"]':       false,
      'input[name="galleyVignette"]': false,
    }) });
    await openBeginSessionDialog();

    expect(prompts[0].content).toContain("Focus from last session");
    expect(prompts[0].content).toContain("Find the beacon");
    expect(prompts[0].content).toContain("Mara &lt;the pilot&gt;");
    expect(ChatMessage._created[0].content).toContain("Focus from last session");
    expect(ChatMessage._created[0].content).toContain("Find the beacon");

    expect(state()).toMatchObject({ sessionActive: true, questFocus: "", connectionFocus: "" });
  });

  it("Begin shows no focus block when none was recorded", async () => {
    setUsers([GM], "gm-1");
    const prompts = installDialog({ form: fakeForm({
      'input[name="vignette"]':       false,
      'input[name="galleyVignette"]': false,
    }) });
    await openBeginSessionDialog();
    expect(prompts[0].content).not.toContain("Focus from last session");
    expect(ChatMessage._created[0].content).not.toContain("Focus from last session");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Session Panel refresh on a relayed write
// ─────────────────────────────────────────────────────────────────────────────

describe("SessionPanelApp.onSettingChanged", () => {
  it("re-renders only for the campaignState setting", () => {
    const spy = vi.spyOn(SessionPanelApp, "rerenderIfOpen").mockImplementation(() => {});
    SessionPanelApp.onSettingChanged({ key: `${MODULE_ID}.campaignState` });
    SessionPanelApp.onSettingChanged({ key: `${MODULE_ID}.mischiefDial` });
    SessionPanelApp.onSettingChanged(null);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Across a booted table — the multi-client harness (issue #282)
// ─────────────────────────────────────────────────────────────────────────────

describe("across a booted table", () => {
  let table;
  const cs = () => table.world.campaignState();
  const sessionCards = () => table.cards(f => f.sessionLifecycleCard);

  async function type(userId, text) {
    await table.client(userId).chat(text);
    await table.settle();
  }

  async function noGm() {
    await table.leave("gm-1");
    await table.leave("gm-2");
  }

  beforeAll(async () => {
    table = await simulateTable({ users: [USERS.GM, USERS.GM2, USERS.P1, USERS.P2] });
  }, 30_000);
  afterAll(() => table?.teardown());
  beforeEach(async () => {
    await table.reset({ world: { settings: { campaignState: { sessionActive: false } } } });
    calls.length = 0;
    ranOn.length = 0;
  });

  describe("Set a Flag", () => {
    const values = { 'textarea[name="text"]': "  spiders  ", 'select[name="visibility"]': "public" };

    it("a player's flag: the dialog opens on their screen, the GM records it, one card from the player", async () => {
      table.client("pl-1").answerDialogs(d => d.submit(values));
      await type("pl-1", "!flag");
      expect(table.dialogs.map(d => [d.client, d.title])).toEqual([["pl-1", "Set a Flag"]]);
      expect(cs().safetyFlags).toMatchObject([{ text: "spiders", visibility: "public", createdBy: "Pat" }]);
      const cards = table.cards(f => f.safetyFlagCard);
      expect(cards.map(c => c.author)).toEqual(["pl-1"]);
      expect(cards[0].content).toContain("spiders");
      expect(cards[0].content).not.toContain("sf-not-recorded");
    });

    it("the canonical GM's flag is recorded locally — no relay — credited to the GM", async () => {
      table.client("gm-1").answerDialogs(d => d.submit(values));
      await type("gm-1", "!flag");
      expect(cs().safetyFlags).toMatchObject([{ text: "spiders", createdBy: "Gina" }]);
      expect(table.socketLog.filter(e => e.payload?.kind === "gmRelay.safety.setFlag")).toEqual([]);
    });

    it("a private flag's card is whispered to the GMs", async () => {
      table.client("pl-2").answerDialogs(d => d.submit({ ...values, 'select[name="visibility"]': "private" }));
      await type("pl-2", "!flag");
      expect(table.cards(f => f.safetyFlagCard)[0].whisper.sort()).toEqual(["gm-1", "gm-2"]);
      expect(cs().safetyFlags[0].visibility).toBe("private");
    });

    it("no GM connected: nothing is written and the card says the flag was not saved", async () => {
      silenceConsoleErrors();
      await noGm();
      table.client("pl-1").answerDialogs(d => d.submit(values));
      await type("pl-1", "!flag");
      expect(cs().safetyFlags).toBeUndefined();
      expect(table.cards(f => f.safetyFlagCard)[0].content).toMatch(/The flag was not saved — no GM is connected/);
    });
  });

  describe("Take a Break — move on", () => {
    it("a player moves on: the GM records the single-use +1, one card from the player", async () => {
      table.client("pl-2").answerDialogs(d => d.choose("move_on"));
      await type("pl-2", "!break");
      expect(table.dialogs.map(d => d.client)).toEqual(["pl-2"]);
      expect(cs().nextMoveAdd).toMatchObject({ value: 1, source: "take_a_break" });
      expect(table.cards(f => f.takeBreakCard).map(c => c.author)).toEqual(["pl-2"]);
    });

    it("cancelling writes nothing and posts nothing", async () => {
      table.client("pl-2").answerDialogs(d => d.choose("cancel"));
      await type("pl-2", "!break");
      expect(cs().nextMoveAdd).toBeUndefined();
      expect(table.cards(f => f.takeBreakCard)).toEqual([]);
    });
  });

  describe("Begin a Session", () => {
    const values = { 'input[name="vignette"]': true, 'input[name="galleyVignette"]': false };

    it("a player begins: their card first, then the GM starts the session and pays the momentum — on the GM", async () => {
      table.client("pl-1").answerDialogs(d => d.submit(values));
      await type("pl-1", "!begin-session");
      const cards = sessionCards();
      expect(cards.map(c => c.author)).toEqual(["pl-1"]);
      expect(cards[0].content).toContain("A quiet moment on the bridge");
      expect(cs().sessionActive).toBe(true);
      expect(ranOn).toEqual(["gm-1 momentum:a1", "gm-1 momentum:a2", "gm-1 clocks"]);
    });

    it("no GM connected: nothing is started and the card says so", async () => {
      silenceConsoleErrors();
      await noGm();
      table.client("pl-1").answerDialogs(d => d.submit(values));
      await type("pl-1", "!begin-session");
      expect(cs().sessionActive).toBe(false);
      expect(ranOn).toEqual([]);
      expect(sessionCards()[0].content)
        .toMatch(/No GM is connected — the session was not started and no momentum was applied/);
    });
  });

  describe("End a Session", () => {
    const values = { 'input[name="questFocus"]': " Find the beacon ", 'input[name="connectionFocus"]': "Mara" };

    beforeEach(() => table.world.setSetting("campaignState", { sessionActive: true }));

    it("a player ends it with foci: the GM closes the session, stores the foci and pays the momentum", async () => {
      table.client("pl-2").answerDialogs(d => d.submit(values));
      await type("pl-2", "!end-session");
      expect(cs()).toMatchObject({ sessionActive: false, questFocus: "Find the beacon", connectionFocus: "Mara" });
      expect(ranOn).toEqual(["gm-1 momentum:a1", "gm-1 momentum:a2"]);
      const cards = sessionCards();
      expect(cards.map(c => c.author)).toEqual(["pl-2"]);
      expect(cards[0].content).toContain("Find the beacon");
      expect(cards[0].content).not.toContain("sf-not-recorded");
    });

    it("no GM connected: nothing is recorded and the card says so", async () => {
      silenceConsoleErrors();
      await noGm();
      table.client("pl-2").answerDialogs(d => d.submit(values));
      await type("pl-2", "!end-session");
      expect(cs().sessionActive).toBe(true);
      expect(sessionCards()[0].content).toMatch(/No GM is connected — the session was not ended/);
    });

    // Issue #309 N08: two players ending the same session both reached the
    // GM's handler, and each paid the party momentum.
    describe("two players end the same session (issue #309 N08)", () => {
      beforeEach(() => table.world.setSetting("campaignState", {
        sessionActive: true, currentSessionId: "s1", lastSessionTimestamp: new Date().toISOString(),
      }));

      it("at once: the GM closes it and pays the momentum once; the second focus corrects the first", async () => {
        table.client("pl-1").answerDialogs(d => d.submit({ 'input[name="questFocus"]': "Find the archive" }));
        table.client("pl-2").answerDialogs(d => d.submit(values));
        await Promise.all([table.client("pl-1").chat("!end-session"), table.client("pl-2").chat("!end-session")]);
        await table.settle();
        expect(ranOn).toEqual(["gm-1 momentum:a1", "gm-1 momentum:a2"]);
        expect(calls.filter(c => c === "endScene" || c === "sessionLog")).toEqual(["endScene", "sessionLog"]);
        expect(cs()).toMatchObject({ sessionActive: false, sessionEndedId: "s1" });
        const note = sessionCards().filter(c => c.author === "gm-1");
        expect(note).toHaveLength(1);
        expect(note[0].content).toMatch(/already ended/);
      });

      it("one after the other: the second ends nothing and pays nothing — the GM's note is its only card", async () => {
        table.client("pl-2").answerDialogs(d => d.submit(values));
        await type("pl-2", "!end-session");
        expect(ranOn).toEqual(["gm-1 momentum:a1", "gm-1 momentum:a2"]);

        table.client("pl-1").answerDialogs(d => d.submit({ 'input[name="questFocus"]': "Find the archive" }));
        await type("pl-1", "!end-session");
        expect(ranOn).toEqual(["gm-1 momentum:a1", "gm-1 momentum:a2"]);
        expect(cs()).toMatchObject({ questFocus: "Find the archive", connectionFocus: "Mara" });
        expect(sessionCards().map(c => c.author)).toEqual(["pl-2", "gm-1"]);
        expect(sessionCards()[1].content).toMatch(/already ended/);
      });
    });

    it("one player's End-Session foci greet the next player's Begin, which clears them", async () => {
      table.client("pl-2").answerDialogs(d => d.submit(values));
      await type("pl-2", "!end-session");
      table.client("pl-1").answerDialogs(d => d.submit({ 'input[name="vignette"]': false, 'input[name="galleyVignette"]': false }));
      await type("pl-1", "!begin-session");
      const begin = table.dialogs.find(d => d.client === "pl-1" && d.title === "Begin a Session");
      expect(begin.content).toContain("Focus from last session");
      expect(begin.content).toContain("Find the beacon");
      expect(sessionCards().at(-1).content).toContain("Find the beacon");
      expect(cs()).toMatchObject({ sessionActive: true, questFocus: "", connectionFocus: "" });
    });
  });
});
