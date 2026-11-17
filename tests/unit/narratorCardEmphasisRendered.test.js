/**
 * STARFORGED COMPANION
 * tests/unit/narratorCardEmphasisRendered.test.js
 *
 * Issue #362 AC73 VOW-SCENE-CARD-LITERAL-ASTERISKS (an incomplete fix of
 * issue #348 PT13). The narrator writes Markdown emphasis — a ship's name, a
 * stressed word ("*Forgeborn*"). PT13 made every narrator-prose card render
 * it through proseToHtml (src/audio/segments.js), but two sinks were missed:
 * the vow-swearing scene's card (narrator.js narrateAndPostVowSwearing:
 * stripMarkup + a hand escape) and the Pay the Price trigger vignette's card
 * (payThePriceClocks.js: escapeChatHtml(stripMarkup(text))). Both showed the
 * literal asterisks. Both now render through proseToHtml, as the other clock
 * vignette cards and the oracle follow-up do.
 *
 * Controls: the oracle follow-up card and the `!clock advance` vignette card
 * render the emphasis; the stored narration keeps its markup; markup that
 * is HTML is escaped on both cards, as before.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});

import { apiPost } from '../../src/api-proxy.js';
import { narrateOracleFollowup, narrateAndPostVowSwearing } from '../../src/narration/narrator.js';
import { createClock, handleClockCommand } from '../../src/clocks/clocks.js';
import { advanceClocksOnPayThePrice } from '../../src/clocks/payThePriceClocks.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;

const PROSE = 'Kira lays her palm on the hull of the *Forgeborn* and says the words. The <b>hatch</b> seals.';
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

/** The card renders the emphasis, shows no asterisk, and escapes the HTML the prose holds. */
function expectRenderedEmphasis(card) {
  expect(card.content).toContain('<em>Forgeborn</em>');
  expect(card.content).not.toContain('*Forgeborn*');
  expect(card.content).not.toContain('<b>hatch</b>');
  expect(card.content).toContain('&lt;b&gt;hatch&lt;/b&gt;');
}

beforeEach(() => {
  vi.clearAllMocks();
  ChatMessage._reset();
  game.settings._store.clear();
  game.actors._reset();
  global.game.messages = { contents: [] };
  global.game.user = { id: 'gm-1', isGM: true };
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
  game.settings._store.set(KEY, {
    currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1',
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' }, sceneFrame: null, clocks: [],
  });
  apiPost.mockResolvedValue(reply(RAW));
});

describe('issue #362 AC73 — every narrator-prose card renders the narrator\'s emphasis', () => {
  it('control: an oracle follow-up\'s card renders *emphasis* as <em>', async () => {
    await narrateOracleFollowup({
      kind: 'oracle_yes_no', oracleName: 'Ask the Oracle (50/50)', question: 'Does the hull hold?',
      rolledLine: 'd100 = 47 → Yes', campaignState: game.settings.get(MODULE_ID, 'campaignState'), speakerActorId: null,
    });
    const card = ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.oracleNarrationCard);
    expect(card).toBeDefined();
    expectRenderedEmphasis(card);
  });

  it('the vow-swearing scene\'s card shows the emphasis, not literal asterisks', async () => {
    const text = await narrateAndPostVowSwearing({
      vow: { name: 'Find the lost ark', rank: 'dangerous' }, campaignState: game.settings.get(MODULE_ID, 'campaignState'),
    });
    expect(text).toBe(PROSE);
    const card = await waitForCard(f => f.vowSceneCard, 'the oath scene card');
    expect(card.flags[MODULE_ID].narrationText).toBe(PROSE);   // the stored prose keeps its markup
    expect(card.content).toMatch(/^<div class="sf-card sf-vow-scene"><div class="sf-card-body"><p>⚔ <em>/);
    expectRenderedEmphasis(card);
  });

  it('control: the !clock advance vignette card renders the emphasis', async () => {
    await createClock({ name: 'Reactor breach', segments: 4, type: 'tension' });
    ChatMessage._reset();
    await handleClockCommand({ content: '!clock advance Reactor', flags: {} });
    expectRenderedEmphasis(await waitForCard(f => f.clockVignetteCard, 'the clock vignette card'));
  });

  it('Pay the Price filling a tension clock: the trigger vignette card shows the emphasis, not literal asterisks', async () => {
    await createClock({ name: 'Reactor breach', segments: 4, type: 'tension' });
    const cs = game.settings.get(MODULE_ID, 'campaignState');
    cs.clocks = cs.clocks.map(c => ({ ...c, filled: 3 }));
    game.settings._store.set(KEY, cs);
    ChatMessage._reset();

    const advanced = await advanceClocksOnPayThePrice();
    expect(advanced.map(a => a.triggered)).toEqual([true]);
    const card = await waitForCard(f => f.clockVignetteCard, 'the trigger vignette card');
    expect(card.content).toMatch(/^<div class="sf-clock-card"><strong>⚠ TRIGGERED — <\/strong><em>/);
    expect(card.flags[MODULE_ID].narrationText).toBe(PROSE);
    expectRenderedEmphasis(card);
  });
});
