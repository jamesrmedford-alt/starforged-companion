/**
 * STARFORGED COMPANION
 * tests/unit/privateChannelOwnPrivateLines.test.js
 *
 * Issue #345 AA03 PRIVATE-CHANNEL-LINES-FROM-STORE (SAFETY) — the Private
 * Channel narrator carries the player's own Private Lines, read from their
 * client setting.
 *
 * The Private Channel narrator runs on the player's own client, on the
 * player's own Claude key (src/private-channel/narrate.js readApiKey). It
 * built its SAFETY block from the world-scoped campaignState copy only
 * (formatSafetyContext(campaignState, null, userId) → resolvePrivateLines,
 * the campaignState entry for that user id). A player's Private Lines reach
 * campaignState only through the canonical GM (the `safety.syncPrivateLines`
 * relay, src/ui/settingsPanel.js); with no GM connected the relay is
 * deferred until a GM's relay is ready. Shared narration built on a player's
 * client was fixed for exactly this (SAFETY-PRIVATE-LINES-SHARED —
 * formatNarratorSafetyContext reads the player's client setting, "the
 * canonical store; the campaignState copy is stale or missing when no GM was
 * online"), but the Private Channel, the sibling path on the same client,
 * still read the stale copy: the private narrator could cross the player's
 * own hard limit. Both now build the block with formatOwnSafetyContext
 * (src/context/safety.js).
 *
 * Scenario: no GM is connected; a player adds a Private Line in Companion
 * Settings (the panel's own action), opens their Private Channel and sends a
 * message. The private narrator's request must carry the line.
 *
 * Controls: (1) the same flow with the GM connected (the relay stores the
 * line in campaignState) — the private narrator's request carries the line;
 * (2) with no GM connected, the same player's `@scene` (shared narration,
 * RUN_ON.CLAUDE on the author's own key) carries the line — read from the
 * client setting. Same client, same moment: only the Private Channel dropped it.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { parseHTML } from '../helpers/cardDom.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const HAIKU = 'claude-haiku-4-5-20251001';   // the Private Channel's model (narrate.js)
let table;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 60_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: { campaignState: {
    ...CampaignStateSchema, currentSessionId: 'sess-1', sessionActive: true,
  } } } });
  await table.setClaudeKey('pl-1', 'sk-ant-pat');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
});

afterEach(async () => {
  // The send arms a 5 s debounced transcript write; drop it.
  for (const id of ['gm-1', 'pl-1']) {
    const c = table.client(id);
    if (!c.connected) continue;
    const transcript = await c.import('../../src/private-channel/transcript.js');
    c.run(() => transcript._resetBuffers());
    const { PrivateChannelApp } = await c.import('../../src/private-channel/app.js');
    c.run(() => PrivateChannelApp._resetInstances());
  }
});

/** Run one of the Companion Settings panel's own actions on a client (multiplayerComposition.test.js's helper). */
async function panelAction(userId, action, { newPrivateLine = '', item = '' } = {}) {
  const c = table.client(userId);
  const { SettingsPanelApp } = await c.import('../../src/ui/settingsPanel.js');
  const app = { element: parseHTML(`<input name="newPrivateLine" value="${newPrivateLine}">`), render() {} };
  const target = parseHTML('<button></button>').firstElementChild;
  target.dataset.item = item;   // a ✕ carries its row's text (issue #347 AB12)
  await c.run(() => SettingsPanelApp.DEFAULT_OPTIONS.actions[action].call(app, null, target));
  await table.settle();
}

/** The player sends `text` from their Private Channel window; returns the private narrator's request(s). */
async function privateSend(userId, text) {
  const c = table.client(userId);
  const { PrivateChannelApp } = await c.import('../../src/private-channel/app.js');
  const app = c.run(() => new PrivateChannelApp({ userId }));
  await c.run(() => app._prepareContext({}));   // the window's first render
  app.element = { querySelector: (s) => (s === '[data-pc-input]' ? { value: text } : null) };
  const from = table.claude.calls.length;
  await c.run(() => PrivateChannelApp.DEFAULT_OPTIONS.actions.send.call(app, {}, null));
  await table.settle();
  return table.claude.calls.slice(from).filter(call => call.model === HAIKU);
}

describe('issue #345 AA03 — the Private Channel narrator carries the player\'s own Private Lines', () => {
  it('control: with the GM connected, a Private Line the player adds is in their Private Channel narrator\'s request', async () => {
    await panelAction('pl-1', 'addPrivateLine', { newPrivateLine: 'drowning' });
    expect(table.client('pl-1').getSetting('privateLines')).toEqual(['drowning']);
    expect(table.world.campaignState().safety?.privateLines).toEqual([{ playerId: 'pl-1', lines: ['drowning'] }]);

    const calls = await privateSend('pl-1', 'I sit alone by the viewport and think about the flooded deck.');
    expect(calls.map(c => c.client)).toEqual(['pl-1']);
    expect(calls[0].system).toMatch(/### PRIVATE LINES[^\n]*\n- drowning/);
  }, 60_000);

  it('control: with no GM connected, shared narration on the same player\'s client (@scene) carries the line — from the client setting', async () => {
    await table.leave('gm-1');
    try {
      await panelAction('pl-1', 'addPrivateLine', { newPrivateLine: 'drowning' });
      expect(table.world.campaignState().safety?.privateLines ?? []).toEqual([]);
      const from = table.claude.calls.length;
      await table.client('pl-1').chat('@scene what does the flooded deck look like?');
      await table.settle();
      const calls = table.claude.calls.slice(from).filter(c => c.client === 'pl-1' && /SAFETY CONFIGURATION/.test(c.system));
      expect(calls.length).toBeGreaterThan(0);
      // formatNarratorSafetyContext reads the player's own client setting.
      expect(calls[0].system).toMatch(/### PRIVATE LINES[^\n]*\n- drowning/);
    } finally {
      await table.join('gm-1');
    }
  }, 60_000);

  it('with no GM connected, the Private Line the player just added is a hard stop in their own Private Channel', async () => {
    await table.leave('gm-1');
    try {
      await panelAction('pl-1', 'addPrivateLine', { newPrivateLine: 'drowning' });
      // The canonical store has the line; the world copy cannot until a GM relays it.
      expect(table.client('pl-1').getSetting('privateLines')).toEqual(['drowning']);
      expect(table.world.campaignState().safety?.privateLines ?? []).toEqual([]);

      const calls = await privateSend('pl-1', 'I sit alone by the viewport and think about the flooded deck.');
      // The private narrator ran — on the player's own client and key …
      expect(calls.map(c => c.client)).toEqual(['pl-1']);
      expect(calls[0].apiKey).toBe('sk-ant-pat');
      // … and must carry the player's own hard stop, as shared narration on
      // this same client does (formatNarratorSafetyContext).
      expect(calls[0].system).toMatch(/### PRIVATE LINES[^\n]*\n- drowning/);
    } finally {
      await table.join('gm-1');
    }
  }, 60_000);
});
