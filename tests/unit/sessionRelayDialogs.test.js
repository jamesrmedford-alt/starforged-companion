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
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const calls = [];

vi.mock("../../src/factContinuity/sceneLifecycle.js", async () => ({
  ...(await vi.importActual("../../src/factContinuity/sceneLifecycle.js")),
  endScene: vi.fn(async () => { calls.push("endScene"); }),
}));
vi.mock("../../src/narration/narrator.js", () => ({
  getRollingSessionSummary: vi.fn(async () => { calls.push("summary"); }),
  narrateSessionVignette:   vi.fn(async () => null),
  narrateClockAdvancement:  vi.fn(async () => null),
}));
vi.mock("../../src/world/worldJournal.js", () => ({
  writeSessionLog: vi.fn(async () => { calls.push("sessionLog"); }),
}));
vi.mock("../../src/clocks/clocks.js", () => ({
  advanceCampaignClocksForBeginSession: vi.fn(async () => { calls.push("clocks"); return []; }),
}));
vi.mock("../../src/character/actorBridge.js", () => ({
  getPlayerActors:   vi.fn(() => [{ id: "a1", name: "Kira" }, { id: "a2", name: "Ren" }]),
  applyMeterChanges: vi.fn(async (actor, changes) => { calls.push(`momentum:${actor.id}:${changes.momentum}`); }),
}));
vi.mock("../../src/oracles/roller.js", () => ({
  rollOracle: vi.fn(() => ({ result: "A quiet moment on the bridge" })),
}));

import {
  openSetFlagDialog,
  openTakeABreakDialog,
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
  delete foundry.applications.api.DialogV2;
  game.settings._store.delete(`${MODULE_ID}.campaignState`);
  game.settings._store.delete(`${MODULE_ID}.sessionLogAutoWrite`);
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// Set a Flag
// ─────────────────────────────────────────────────────────────────────────────

describe("Set a Flag", () => {
  const form = fakeForm({
    'textarea[name="text"]':      "  spiders  ",
    'select[name="visibility"]':  "public",
  });

  it("player: relays safety.setFlag (no local write) and posts the card", async () => {
    setUsers([GM, PLAYER], "pl-1");
    installDialog({ form });
    await openSetFlagDialog();
    expect(game.socket._emitted).toHaveLength(1);
    expect(game.socket._emitted[0].payload).toMatchObject({
      kind: "gmRelay.safety.setFlag",
      payload: { text: "spiders", visibility: "public" },
      requesterId: "pl-1",
    });
    expect(state().safetyFlags).toBeUndefined();
    expect(ChatMessage._created).toHaveLength(1);
    expect(ChatMessage._created[0].content).toContain("spiders");
    expect(ChatMessage._created[0].content).not.toContain("sf-not-recorded");
  });

  it("canonical GM: records the flag locally, credited to the GM", async () => {
    setUsers([GM, PLAYER], "gm-1");
    installDialog({ form });
    await openSetFlagDialog();
    expect(game.socket._emitted ?? []).toHaveLength(0);
    expect(state().safetyFlags).toHaveLength(1);
    expect(state().safetyFlags[0]).toMatchObject({ text: "spiders", visibility: "public", createdBy: "Gina" });
  });

  it("no GM connected: the card says the flag was not saved", async () => {
    setUsers([PLAYER], "pl-1");
    installDialog({ form });
    await openSetFlagDialog();
    expect(ChatMessage._created[0].content).toMatch(/The flag was not saved — no GM is connected/);
  });

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
  it("player: relays session.takeBreak and posts the card", async () => {
    setUsers([GM, PLAYER], "pl-1");
    installDialog({ waitChoice: "move_on" });
    await openTakeABreakDialog();
    expect(game.socket._emitted[0].payload.kind).toBe("gmRelay.session.takeBreak");
    expect(state().nextMoveAdd).toBeUndefined();
    expect(ChatMessage._created[0].flags[MODULE_ID].takeBreakCard).toBe(true);
  });

  it("canonical GM: records nextMoveAdd locally", async () => {
    setUsers([GM], "gm-1");
    installDialog({ waitChoice: "move_on" });
    await openTakeABreakDialog();
    expect(state().nextMoveAdd).toMatchObject({ value: 1, source: "take_a_break" });
  });

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

  it("player: posts the card, then relays session.begin (no local writes)", async () => {
    setUsers([GM, PLAYER], "pl-1");
    installDialog({ form });
    await openBeginSessionDialog();
    expect(ChatMessage._created).toHaveLength(1);
    expect(ChatMessage._created[0].content).toContain("A quiet moment on the bridge");
    expect(game.socket._emitted).toHaveLength(1);
    expect(game.socket._emitted[0].payload).toMatchObject({
      kind: "gmRelay.session.begin",
      payload: { vignetteRolled: true, includeGalley: false },
    });
    expect(state().sessionActive).toBe(false);
    expect(applyMeterChanges).not.toHaveBeenCalled();
  });

  it("canonical GM: momentum → flip → clocks run locally, in order", async () => {
    setUsers([GM, PLAYER], "gm-1");
    installDialog({ form });
    await openBeginSessionDialog();
    expect(state().sessionActive).toBe(true);
    expect(calls).toEqual(["momentum:a1:1", "momentum:a2:1", "clocks"]);
    expect(Hooks.callAll).toHaveBeenCalledWith(`${MODULE_ID}.sessionStateChanged`, { active: true });
    // Galley unchecked → no vignette scheduled.
    expect(vi.getTimerCount()).toBe(0);
  });

  it("no GM connected: the card says the session was not started", async () => {
    setUsers([PLAYER], "pl-1");
    installDialog({ form });
    await openBeginSessionDialog();
    expect(ChatMessage._created[0].content).toMatch(/No GM is connected — the session was not started and no momentum was applied/);
  });

  it("applyBeginSession schedules the galley vignette when included", async () => {
    await applyBeginSession({ vignetteRolled: false, includeGalley: true }, {});
    expect(vi.getTimerCount()).toBe(1);
    expect(applyMeterChanges).not.toHaveBeenCalled();
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

  it("player: relays session.end with the foci (no local writes), then posts the card", async () => {
    setUsers([GM, PLAYER], "pl-1");
    game.settings._store.set(`${MODULE_ID}.campaignState`, { sessionActive: true });
    installDialog({ form });
    await openEndSessionDialog();
    expect(game.socket._emitted[0].payload).toMatchObject({
      kind: "gmRelay.session.end",
      payload: { questFocus: "Find the beacon", connectionFocus: "Mara" },
    });
    expect(state().sessionActive).toBe(true);
    expect(ChatMessage._created[0].content).toContain("Find the beacon");
    expect(ChatMessage._created[0].content).not.toContain("sf-not-recorded");
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

  it("no GM connected: the card says nothing was recorded", async () => {
    setUsers([PLAYER], "pl-1");
    installDialog({ form });
    await openEndSessionDialog();
    expect(ChatMessage._created[0].content).toMatch(/No GM is connected — the session was not ended/);
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
