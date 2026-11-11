/**
 * STARFORGED COMPANION
 * tests/unit/sessionPanelPlayerBegin.test.js
 *
 * A player's Session panel offers Begin / End Session, as their chat commands
 * do (issue #326 W85).
 *
 * The panel's Begin Session and End Session rendered `disabled title="GM
 * only"` for every non-GM. The gate predated the GM relay: a player's
 * `!begin-session` / `!end-session` run on their own client (RUN_ON.AUTHOR)
 * and the dialogs' writes relay to the canonical GM (GM_ACTIONS
 * session.begin / session.end) — the panel's own header says so, and the
 * help lists the panel for Everyone. A player could type the command but not
 * press the button. The buttons are now disabled by the session state only.
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { StubElement } from "../helpers/cardDom.js";

vi.mock("../../src/safety/sessionLifecycleDialogs.js", () => ({
  openBeginSessionDialog: vi.fn(async () => {}),
  openEndSessionDialog:   vi.fn(async () => {}),
}));

import { SessionPanelApp } from "../../src/ui/sessionPanel.js";
import { openBeginSessionDialog, openEndSessionDialog } from "../../src/safety/sessionLifecycleDialogs.js";

const MODULE_ID = "starforged-companion";
let restore, savedDocument, index;

beforeAll(async () => { index = await import("../../src/index.js"); }, 60_000);

beforeEach(() => {
  savedDocument = globalThis.document;
  globalThis.document = { createElement: (tag) => new StubElement(tag) };
  vi.mocked(openBeginSessionDialog).mockClear();
  vi.mocked(openEndSessionDialog).mockClear();
  restore = asPlayer();
});

afterEach(() => {
  restore?.();
  globalThis.document = savedDocument;
  game.settings._store.delete(`${MODULE_ID}.campaignState`);
});

async function renderPanel(campaignState) {
  game.settings._store.set(`${MODULE_ID}.campaignState`, campaignState);
  const app = new SessionPanelApp();
  const root = await app._renderHTML(await app._prepareContext({}), {});
  const button = (action) => {
    const el = root.querySelector(`[data-action="${action}"]`);
    return { disabled: el.hasAttribute("disabled"), title: el.getAttribute("title") };
  };
  return { begin: button("beginSession"), end: button("endSession"), incite: button("envisionIncite") };
}

describe("a player's Begin / End Session in the Session panel (issue #326 W85)", () => {
  it("control: a player's !begin-session / !end-session run on the player's own client", () => {
    const { CHAT_COMMAND_ROUTES } = index;
    for (const name of ["!begin-session", "!end-session"]) {
      expect(CHAT_COMMAND_ROUTES.find(r => r.name === name)?.runOn).toBe("author");
    }
  });

  it("before a session, a player's Begin Session is enabled and End is disabled by the state", async () => {
    const { begin, end } = await renderPanel({ sessionActive: false, sessionNumber: 3 });
    expect(begin).toEqual({ disabled: false, title: null });
    expect(end).toEqual({ disabled: true, title: "Session not active" });
  });

  it("during a session, a player's End Session is enabled and Begin is disabled by the state", async () => {
    // A live session: its id and its mint's stamp. With neither the session
    // reads over (sessionNeedsMint), and Begin is offered (issue #345 AA59).
    const { begin, end } = await renderPanel({ sessionActive: true, sessionActiveStartedAt: new Date().toISOString(), sessionNumber: 3,
      currentSessionId: "s3", lastSessionTimestamp: new Date().toISOString() });
    expect(begin).toEqual({ disabled: true, title: "Session already active — end it first" });
    expect(end).toEqual({ disabled: false, title: null });
  });

  it("a player's press opens the same dialogs their commands open", async () => {
    await SessionPanelApp.DEFAULT_OPTIONS.actions.beginSession.call(null);
    await SessionPanelApp.DEFAULT_OPTIONS.actions.endSession.call(null);
    expect(openBeginSessionDialog).toHaveBeenCalledTimes(1);
    expect(openEndSessionDialog).toHaveBeenCalledTimes(1);
  });

  it("Envision Inciting Incident is a player's too (issue #330 D15)", async () => {
    const { incite } = await renderPanel({ sessionActive: false, sessionNumber: 3 });
    expect(incite.disabled).toBe(false);
    expect(incite.title).toMatch(/inciting incident/i);
  });

  it("control: a GM's buttons follow the same state", async () => {
    restore();
    restore = withUser({ isGM: true });
    const { begin, end } = await renderPanel({ sessionActive: false, sessionNumber: 3 });
    expect(begin).toEqual({ disabled: false, title: null });
    expect(end).toEqual({ disabled: true, title: "Session not active" });
  });
});
