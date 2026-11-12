/**
 * STARFORGED COMPANION
 * tests/unit/perspectiveFixedPerSession.test.js
 *
 * Issue #348 PT03 (narrator POV flips): Perspective "Auto" was resolved on
 * every narration call from the connected non-GM users, so a second window or
 * player connecting mid-session flipped the beats from "you" to names and
 * back. The maintainer's decision: Auto is decided ONCE per session — when it
 * begins — and kept until the session ends. Begin a Session records it
 * (`campaignState.sessionPerspective`), the mint clears it, and every
 * narration of the session reads it.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../src/narration/narrator.js", async (importOriginal) => ({
  ...(await importOriginal()),
  narrateSessionVignette:  vi.fn(async () => null),
  narrateClockAdvancement: vi.fn(async () => null),
}));
vi.mock("../../src/clocks/clocks.js", async (importOriginal) => ({
  ...(await importOriginal()),
  advanceCampaignClocksForBeginSession: vi.fn(async () => []),
}));

import { applyBeginSession } from "../../src/safety/sessionLifecycleDialogs.js";
import { beginSession, mintSession, SESSION_MINT_FIELDS } from "../../src/session/lifecycle.js";
import {
  buildNarratorSystemPrompt,
  resolveNarrationPerspective,
  sessionPerspectiveOf,
} from "../../src/narration/narratorPrompt.js";

const MODULE_ID = "starforged-companion";
const GM = { id: "gm-1", name: "Gina", isGM: true,  active: true };
const P1 = { id: "pl-1", name: "Pat",  isGM: false, active: true };
const P2 = { id: "pl-2", name: "Sam",  isGM: false, active: true };
const SECOND = 'Address the player character directly as "you"';
const THIRD  = "Refer to characters by name";

let savedUsers;
let savedUser;

function setUsers(users) {
  game.users = Object.assign([...users], { get: (id) => users.find(u => u.id === id) ?? null });
  game.user  = users.find(u => u.isGM) ?? null;
}
const state = () => game.settings.get(MODULE_ID, "campaignState");
const systemFor = (cs) => buildNarratorSystemPrompt(cs, { narrationPerspective: "auto" }, { name: "Isaac" }, "", { mode: "paced_narrative" });

beforeEach(() => {
  savedUsers = game.users;
  savedUser  = game.user;
  ChatMessage._reset();
  Hooks.callAll = vi.fn();
  game.settings._store.set(`${MODULE_ID}.campaignState`, {
    currentSessionId: "s1", sessionNumber: 1, sessionActive: false,
    lastSessionTimestamp: new Date().toISOString(),
  });
});

afterEach(() => {
  game.users = savedUsers;
  game.user  = savedUser;
  delete Hooks.callAll;
  game.settings._store.delete(`${MODULE_ID}.campaignState`);
  vi.clearAllMocks();
});

describe("Auto perspective is decided once, when the session begins", () => {
  it("Begin a Session records it, and a player connecting mid-session does not flip it", async () => {
    setUsers([GM, P1]);
    await applyBeginSession({ vignetteRolled: false, includeGalley: false }, {});
    expect(state().sessionPerspective).toEqual({ sessionId: "s1", perspective: "second_person" });
    expect(systemFor(state())).toContain(SECOND);

    // A second player (or a second window) connects mid-session.
    setUsers([GM, P1, P2]);
    expect(resolveNarrationPerspective("auto")).toBe("third_person");   // the per-call count would flip
    const system = systemFor(state());
    expect(system).toContain(SECOND);
    expect(system).not.toContain(THIRD);
  });

  it("the mint clears it, and the next session decides its own at its Begin", () => {
    setUsers([GM, P1]);
    const cs = { currentSessionId: "s1", sessionNumber: 1, sessionActive: false };
    beginSession(cs);
    expect(sessionPerspectiveOf(cs)).toBe("second_person");

    mintSession(cs);
    expect(cs.sessionPerspective).toBeNull();
    expect(SESSION_MINT_FIELDS).toContain("sessionPerspective");   // every Begin and mint path persists it

    setUsers([GM, P1, P2]);
    beginSession(cs);
    expect(cs.sessionPerspective).toEqual({ sessionId: cs.currentSessionId, perspective: "third_person" });
    // One player leaving does not flip it back.
    setUsers([GM, P1]);
    expect(systemFor(cs)).toContain(THIRD);
  });

  it("a record left from another session is not read", () => {
    setUsers([GM, P1, P2]);
    const cs = { currentSessionId: "s2", sessionPerspective: { sessionId: "s1", perspective: "second_person" } };
    expect(sessionPerspectiveOf(cs)).toBeNull();
    expect(systemFor(cs)).toContain(THIRD);
  });

  it("an explicit setting, and a round speaking for two PCs, still win", () => {
    setUsers([GM, P1]);
    const cs = { currentSessionId: "s1", sessionPerspective: { sessionId: "s1", perspective: "second_person" } };
    expect(buildNarratorSystemPrompt(cs, { narrationPerspective: "third_person" }, null, "", {})).toContain(THIRD);
    expect(buildNarratorSystemPrompt(cs, { narrationPerspective: "auto" }, null, "",
      { mode: "round_resolution", roundCharacters: [{ name: "A" }, { name: "B" }] })).toContain(THIRD);
  });
});
