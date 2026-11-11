/**
 * Issue #330 D15 — a player's ✦ Envision Inciting Incident in the Session
 * panel.
 *
 * A player can type `!incite`: the route is RUN_ON.CLAUDE (it runs on the
 * keyed GM's client, else the author's own key) and its handler has no role
 * check. The panel rendered the same button `disabled title="GM only"` for
 * every non-GM and its handler warned "GM-only" — the shape issue #326 W85
 * fixed for Begin / End. Decided (option A): the panel offers it to players
 * as the command does; a player's press posts their `!incite` line, which
 * the router runs where a key lives. Since issue #345 D6 a GM's press posts
 * it too (tests/unit/sessionPanelInciteRunsWhereKeyLives.test.js).
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { StubElement } from "../helpers/cardDom.js";

vi.mock("../../src/session/incitingIncident.js", () => ({
  runIncitingIncident: vi.fn(async () => {}),
}));

import { SessionPanelApp } from "../../src/ui/sessionPanel.js";
import { runIncitingIncident } from "../../src/session/incitingIncident.js";

const MODULE_ID = "starforged-companion";
let index, restore, savedDocument;

beforeAll(async () => { index = await import("../../src/index.js"); }, 60_000);

beforeEach(() => {
  savedDocument = globalThis.document;
  globalThis.document = { createElement: (tag) => new StubElement(tag) };
  game.settings._store.set(`${MODULE_ID}.campaignState`, { sessionActive: true, sessionNumber: 1 });
  ChatMessage._reset();
  vi.mocked(runIncitingIncident).mockClear();
  restore = asPlayer();
});

afterEach(() => {
  restore?.();
  globalThis.document = savedDocument;
  game.settings._store.delete(`${MODULE_ID}.campaignState`);
  ChatMessage._reset();
});

async function inciteButton() {
  const app = new SessionPanelApp();
  const root = await app._renderHTML(await app._prepareContext({}), {});
  const el = root.querySelector('[data-action="envisionIncite"]');
  return { disabled: el.hasAttribute("disabled"), title: el.getAttribute("title") };
}

const press = () => SessionPanelApp.DEFAULT_OPTIONS.actions.envisionIncite.call(null);

describe("issue #330 D15 — a player's ✦ Envision Inciting Incident in the Session panel", () => {
  it("the panel offers a player the same ✦ Envision their typed `!incite` gives them", async () => {
    expect(await inciteButton()).toEqual({ disabled: false, title: expect.stringMatching(/inciting incident/i) });
  });

  it("a player's press posts their `!incite` line — the routed command, not a local run", async () => {
    await press();
    const lines = ChatMessage._created.filter(m => m.content === "!incite");
    expect(lines).toHaveLength(1);
    expect(index.isIncitingIncidentCommand(lines[0])).toBe(true);
    expect(index.CHAT_COMMAND_ROUTES.find(r => r.name === "!incite")?.runOn).toBe("claude");
    expect(runIncitingIncident).not.toHaveBeenCalled();
  });

  // issue #345 D6 (the maintainer's option A): a GM's press is routed like
  // the typed command too — it ran on the GM's own client, so a keyless
  // co-GM's press never reached the keyed GM.
  it("a GM's press posts the `!incite` line too — routed where a key lives, not run on the GM's client", async () => {
    restore();
    restore = withUser({ isGM: true });
    await press();
    expect(ChatMessage._created.filter(m => m.content === "!incite")).toHaveLength(1);
    expect(runIncitingIncident).not.toHaveBeenCalled();
  });

  it("control: the GM's button reads the same as the player's", async () => {
    restore();
    restore = withUser({ isGM: true });
    expect(await inciteButton()).toEqual({ disabled: false, title: expect.stringMatching(/inciting incident/i) });
  });
});
