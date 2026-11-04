/**
 * PROBE — UI-02 SESSION-PANEL-ENVISION-GM-ONLY (UX — needs a decision)
 * (src/ui/sessionPanel.js _renderHTML lines 165–169 and #onEnvisionIncite
 *  lines 215–219; src/index.js CHAT_COMMAND_ROUTES "!incite" → RUN_ON.CLAUDE,
 *  handleIncitingIncidentCommand lines 3243–3251)
 *
 * What the user does: a player opens the Session panel (toolbar → Session,
 * shown to Everyone) and looks for ✦ Envision Inciting Incident — or types
 * `!incite`, which the help's Chat Commands table lists with no GM mark and
 * "Also on the Session panel as ✦ Envision Inciting Incident".
 *
 * What happens: the typed `!incite` is a RUN_ON.CLAUDE route — a player's
 * line runs on the keyed GM's client, where handleIncitingIncidentCommand has
 * no role check — so a player CAN envision the inciting incident by typing.
 * The panel's button renders `disabled title="GM only"` for every non-GM and
 * its handler warns "GM-only": the same W85 shape (SESSION-PANEL-PLAYER-BEGIN:
 * "a player can type the command but not press the button"), left in place
 * when W85 opened Begin / End. No decision records which is intended: the
 * help's Toolbar row says "(GM)", its Chat Commands row says nothing.
 *
 * What should happen — one of two (the maintainer's call):
 *   A. the panel offers players what the command gives them — the button is
 *      enabled and its press runs the incident the way `!incite` does (on the
 *      GM's client: post the `!incite` line, or relay it); or
 *   B. `!incite` is GM-gated like `!at` (handleIncitingIncidentCommand
 *      refuses a non-GM author) and the help marks it GM-only.
 * This probe asserts A (the panel and the command agree, as W85 decided for
 * Begin / End); its control pins that the command is typable by anyone today.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/ui/sessionPanelEnvisionPlayer.probe.js
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { StubElement } from '../../helpers/cardDom.js';

const MODULE_ID = 'starforged-companion';
let index;
let restore;

beforeAll(async () => { index = await import('../../../src/index.js'); }, 60_000);

beforeEach(() => {
  globalThis.document = { createElement: (tag) => new StubElement(tag) };
  game.settings._store.set(`${MODULE_ID}.campaignState`, { sessionActive: true, sessionNumber: 1 });
  restore = asPlayer();
});

afterEach(() => {
  restore?.();
  delete globalThis.document;
  game.settings._store.delete(`${MODULE_ID}.campaignState`);
});

describe("UI-02 a player's ✦ Envision Inciting Incident in the Session panel", () => {
  it('control: a player can type `!incite` — the route runs on the GM\'s client and nothing refuses a player', () => {
    const { CHAT_COMMAND_ROUTES, isIncitingIncidentCommand } = index;
    const route = CHAT_COMMAND_ROUTES.find(r => r.name === '!incite');
    expect(route.runOn).toBe('claude');
    expect(isIncitingIncidentCommand({ content: '!incite', flags: {}, author: { isGM: false } })).toBe(true);
    // The handler's body has no role check before it runs the incident.
    const handler = readFileSync('src/index.js', 'utf8').match(/async function handleIncitingIncidentCommand\(_message\) \{[\s\S]*?\n\}/)?.[0] ?? '';
    expect(handler).toMatch(/runIncitingIncident\(campaignState\)/);
    expect(handler).not.toMatch(/isGM/);
  });

  it('the panel offers the same ✦ Envision to a player as the typed command gives them', async () => {
    const { SessionPanelApp } = await import('../../../src/ui/sessionPanel.js');
    const app = new SessionPanelApp();
    const root = await app._renderHTML(await app._prepareContext({}), {});
    const btn = root.querySelector('[data-action="envisionIncite"]');
    // FAILS today: disabled, title "GM only" — while `!incite` typed by the same player runs.
    expect({ disabled: btn.hasAttribute('disabled'), title: btn.getAttribute('title') })
      .toEqual({ disabled: false, title: expect.stringMatching(/inciting incident/i) });
  });
});
