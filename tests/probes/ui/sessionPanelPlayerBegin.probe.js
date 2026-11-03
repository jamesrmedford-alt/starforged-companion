/**
 * Probe UI-05 — SESSION-PANEL-BEGIN-GM-ONLY (UX / DOC-DRIFT)
 *
 * What the user does: a player opens the Session panel (toolbar → Session,
 * shown to Everyone) to Begin a Session — the help's Toolbar Buttons row says
 * "Session | Everyone | Open the Session panel: Begin / End Session, Set a
 * Flag, Change Your Fate, Take a Break, and ✦ Envision Inciting Incident (GM)",
 * marking only the last as GM-only.
 *
 * What happens: Begin Session and End Session render `disabled title="GM only"`
 * for every non-GM (sessionPanel.js:144, :149). The gate predates the GM relay
 * (fe3b857, June 2026): since the 2026-10 audit a player's Begin / End is
 * relayed to the canonical GM (`!begin-session` / `!end-session` are
 * RUN_ON.AUTHOR, the dialogs' writes go through GM_ACTIONS
 * session.begin / session.end, and the Playwright suite drives "a player's
 * Begin a Session"). The panel's own header comment describes that relayed
 * player path. A player can type the command but not press the button.
 *
 * What should happen: the panel offers players the same Begin / End the chat
 * commands give them (disabled only by the session state), as the help says.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { StubElement } from "../../helpers/cardDom.js";

const MODULE_ID = "starforged-companion";
let restore;
let index;
beforeAll(async () => { index = await import("../../../src/index.js"); }, 60_000);

beforeEach(() => {
  globalThis.document = { createElement: (tag) => new StubElement(tag) };
  game.settings._store.set(`${MODULE_ID}.campaignState`, { sessionActive: false, sessionNumber: 3 });
  restore = asPlayer();
});

afterEach(() => {
  restore?.();
  delete globalThis.document;
  game.settings._store.delete(`${MODULE_ID}.campaignState`);
});

describe("UI-05 a player's Begin / End Session in the Session panel", () => {
  it("control: a player's !begin-session runs on the player's own client (no GM gate)", async () => {
    const { CHAT_COMMAND_ROUTES } = index;
    const route = CHAT_COMMAND_ROUTES.find(r => r.name === "!begin-session");
    expect(route.runOn).toBe("author");
  });

  it("the panel's Begin Session button is enabled for a player when no session is active", async () => {
    const { SessionPanelApp } = await import("../../../src/ui/sessionPanel.js");
    const app = new SessionPanelApp();
    const root = await app._renderHTML(await app._prepareContext({}), {});
    const begin = root.querySelector('[data-action="beginSession"]');
    // FAILS today: disabled, title "GM only".
    expect({ disabled: begin.hasAttribute("disabled"), title: begin.getAttribute("title") })
      .toEqual({ disabled: false, title: null });
  });
});
