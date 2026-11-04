/**
 * PROBE — NARRATION-06 CLOCK-VIGNETTE-NPC-MARKUP
 *
 * What the user does: with audio narration on (`audio.enabled`), advances a
 * clock (`!clock advance <name>`, the Clocks panel's ↻ / +, a Pay the Price
 * that fills a tension clock, Begin a Session's campaign-clock roll).
 *
 * What happens: the clock beat is narrated in the `clock_advance` mode, whose
 * system prompt carries the NPC DIALOGUE MARKUP instruction like every other
 * prose mode (narratorPrompt.js:1667-1670 — appendNpcMarkupInstruction for
 * every non-meta mode when audio is on), so the model wraps NPC speech in
 * <npc>…</npc>. The three clock-vignette post sites put that text on the
 * card through escapeHtml alone — src/clocks/clocks.js:792
 * (`<em>${escapeHtml(text)}</em>`), src/clocks/payThePriceClocks.js:103
 * (escapeChatHtml(text)) and src/safety/sessionLifecycleDialogs.js:274
 * (escapeHtml(text)) — so the players read the literal tags:
 * `<npc>"Run."</npc>`. Every other fiction card strips the markup first
 * (escapeHtml(stripMarkup(text)): narrator.js:960, 2086, 2720, 3282,
 * galleyVignette.js:211, endSessionVignette.js:183, incitingIncident.js:332 —
 * the inciting card's own leak was "Finding A", known-issues.md, fixed).
 * The clock cards carry no Play button either, so the markup serves nothing
 * there.
 *
 * What should happen: the card shows the dialogue without the tags
 * (stripMarkup, src/audio/segments.js — "the chat card strips the markers at
 * render time; players see clean prose", narratorPrompt.js:29-35).
 *
 * Controls: the oracle follow-up card strips the same reply's markup.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/narration/clockVignetteNpcMarkup.probe.js
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});

import { apiPost } from '../../../src/api-proxy.js';
import { narrateOracleFollowup } from '../../../src/narration/narrator.js';
import { createClock, handleClockCommand } from '../../../src/clocks/clocks.js';
import { advanceClocksOnPayThePrice } from '../../../src/clocks/payThePriceClocks.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;

const PROSE = 'The reactor gauge ticks down. The engineer grabs your arm. <npc>"Run. Now."</npc> Alarms follow you out.';
const RAW   = `${PROSE}\n\`\`\`json\n{"newTruths":[],"stateChanges":[]}\n\`\`\``;
const reply = (text) => ({ content: [{ type: 'text', text }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'end_turn' });

async function waitForCard(pred, label, ms = 1500) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const card = ChatMessage._created.find(m => pred(m.flags?.[MODULE_ID] ?? {}));
    if (card) return card;
    await new Promise(r => setTimeout(r, 5));
  }
  throw new Error(`timed out waiting for ${label}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  ChatMessage._reset();
  game.settings._store.clear();
  game.actors._reset();
  global.game.messages = { contents: [] };
  global.game.user = { id: 'gm-1', isGM: true };
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
  game.settings._store.set(`${MODULE_ID}.audio.enabled`, true);
  game.settings._store.set(KEY, {
    currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1',
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' }, sceneFrame: null, clocks: [],
  });
  apiPost.mockResolvedValue(reply(RAW));
});

describe('PROBE NARRATION-06 CLOCK-VIGNETTE-NPC-MARKUP', () => {
  it('!clock advance: the vignette card shows the dialogue without <npc> tags', async () => {
    await createClock({ name: 'Reactor breach', segments: 4, type: 'tension' });
    ChatMessage._reset();

    await handleClockCommand({ content: '!clock advance Reactor', flags: {} });
    const card = await waitForCard(f => f.clockVignetteCard, 'the clock vignette card');

    const request = apiPost.mock.calls.find(([, , body]) => /clock "Reactor breach"/.test(String(body?.messages?.[0]?.content)));
    expect(request?.[2]?.system?.[0]?.text).toContain('NPC DIALOGUE MARKUP');   // the request asks for the markup
    expect(card.flags[MODULE_ID].narratorCard).toBe(true);
    expect(card.content).toContain('Run. Now.');
    // Expected: no tag on the card. Today: &lt;npc&gt;"Run. Now."&lt;/npc&gt; — the players read the markup.
    expect.soft(card.content).not.toMatch(/npc&gt;|<npc>/);
  });

  it('Pay the Price filling a tension clock: the trigger vignette card shows the dialogue without <npc> tags', async () => {
    await createClock({ name: 'Reactor breach', segments: 4, type: 'tension' });
    const cs = game.settings.get(MODULE_ID, 'campaignState');
    cs.clocks = cs.clocks.map(c => ({ ...c, filled: 3 }));
    game.settings._store.set(KEY, cs);
    ChatMessage._reset();

    const advanced = await advanceClocksOnPayThePrice();
    expect(advanced.map(a => a.triggered)).toEqual([true]);
    const card = await waitForCard(f => f.clockVignetteCard, 'the trigger vignette card');

    expect(card.content).toContain('Run. Now.');
    // Expected: no tag on the card. Today: the escaped tags are shown.
    expect.soft(card.content).not.toMatch(/npc&gt;|<npc>/);
  });

  it("control: the oracle follow-up card strips the same reply's markup", async () => {
    await narrateOracleFollowup({
      kind: 'oracle_yes_no', oracleName: 'Ask the Oracle (50/50)', question: 'Is the reactor failing?',
      rolledLine: 'd100 = 47 → Yes', campaignState: game.settings.get(MODULE_ID, 'campaignState'), speakerActorId: null,
    });
    const card = ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.oracleNarrationCard);
    expect(card).toBeDefined();
    expect(card.content).toContain('Run. Now.');
    expect(card.content).not.toMatch(/npc&gt;|<npc>/);
  });
});
