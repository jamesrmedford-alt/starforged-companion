/**
 * STARFORGED COMPANION
 * tests/unit/clockVignetteNpcMarkup.test.js
 *
 * Issue #331 X27 (CLOCK-VIGNETTE-NPC-MARKUP). With audio narration on, every
 * prose mode's prompt carries the NPC DIALOGUE MARKUP instruction, so the
 * clock beat (`clock_advance`) comes back with <npc>…</npc> around NPC
 * speech. The three clock-vignette post sites — `!clock advance` (and the
 * panel), a Pay the Price that fills a tension clock, Begin a Session's
 * campaign-clock roll — put the text on the card through escapeHtml alone, so
 * the players read the literal tags. Every other fiction card strips the
 * markup first; the clock cards have no Play button. Begin a Session's site is
 * pinned in sessionStartClocks.test.js (X27).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});

import { apiPost } from '../../src/api-proxy.js';
import { narrateOracleFollowup } from '../../src/narration/narrator.js';
import { createClock, handleClockCommand } from '../../src/clocks/clocks.js';
import { advanceClocksOnPayThePrice } from '../../src/clocks/payThePriceClocks.js';

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

describe('X27 — a clock vignette card shows the dialogue without the narrator\'s markup', () => {
  it('!clock advance: the vignette card shows the dialogue without <npc> tags', async () => {
    await createClock({ name: 'Reactor breach', segments: 4, type: 'tension' });
    ChatMessage._reset();

    await handleClockCommand({ content: '!clock advance Reactor', flags: {} });
    const card = await waitForCard(f => f.clockVignetteCard, 'the clock vignette card');

    const request = apiPost.mock.calls.find(([, , body]) => /clock "Reactor breach"/.test(String(body?.messages?.[0]?.content)));
    expect(request?.[2]?.system?.[0]?.text).toContain('NPC DIALOGUE MARKUP');   // the request asks for the markup
    expect(card.flags[MODULE_ID].narratorCard).toBe(true);
    expect(card.content).toContain('Run. Now.');
    // No tag on the card (the players read &lt;npc&gt;"Run. Now."&lt;/npc&gt;);
    // the flag keeps the narration as written, for the ring and the summary.
    expect(card.content).not.toMatch(/npc&gt;|<npc>/);
    expect(card.flags[MODULE_ID].narrationText).toContain('<npc>"Run. Now."</npc>');
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
    expect(card.content).not.toMatch(/npc&gt;|<npc>/);
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
