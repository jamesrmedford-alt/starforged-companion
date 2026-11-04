/**
 * PROBE — NARRATION-01 CAMPAIGN-RECAP-CARD-UNESCAPED
 *
 * What the user does: types `!recap campaign` (or the session-start auto-recap
 * posts, or a GM presses ↻ Refresh on the recap card).
 *
 * What happens: postCampaignRecap (src/narration/narrator.js:1774-1779) splits
 * the model's recap text into paragraphs and puts them into the card HTML
 * raw — `<p>${p.trim()}</p>` — with no escapeHtml. A phrase in angle brackets
 * ("<signal lost>") vanishes from the card as an unknown tag, and any markup
 * the model (or a corrected chronicle entry the recap quotes) emits is
 * rendered as HTML. The session recap beside it escapes its quoted sentence
 * (escapeHtml(firstSentence), narrator.js:1391-1395).
 *
 * What should happen: model text goes into card HTML through escapeHtml —
 * decisions.md "Issue #322 audit" V18 ("Card text is escaped": narrator,
 * paced and @scene prose), issue #326 W71 (the `!lore` card) and W26 (panel
 * text) applied the same rule to every other model-text sink.
 *
 * Controls: the session recap card escapes the sentence it quotes.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/narration/campaignRecapCardUnescaped.probe.js
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});

import {
  postCampaignRecap,
  postSessionRecap,
  postNarrationCard,
  campaignRecapCacheKey,
} from '../../../src/narration/narrator.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const SESSION = 'sess-3';

function syncChat() {
  global.game.messages = { contents: ChatMessage._created.slice() };
}

beforeEach(() => {
  vi.clearAllMocks();
  ChatMessage._reset();
  game.settings._store.clear();
  game.actors._reset();
  global.game.messages = { contents: [] };
  global.game.user = { id: 'gm-1', isGM: true };
});

describe('PROBE NARRATION-01 CAMPAIGN-RECAP-CARD-UNESCAPED', () => {
  it('the campaign recap card escapes the model text it renders', async () => {
    const cs = { currentSessionId: SESSION, sessionNumber: 3, characterIds: [], connectionIds: [] };
    const text =
      'Vex spoke over the comm: <signal lost>. Then silence.\n\n' +
      'The derelict\'s beacon read <script>alert("recap")</script> on every pass.';
    // The cache as End a Session leaves it: made from the chronicle as it stands.
    cs.campaignRecapCache = { text, generatedAt: new Date().toISOString(), ...(await campaignRecapCacheKey(cs)) };
    game.settings._store.set(KEY, cs);

    await postCampaignRecap(cs);

    const card = ChatMessage._created.at(-1);
    expect(card?.flags?.[MODULE_ID]?.recapCard).toBe(true);
    expect(card.flags[MODULE_ID].recapType).toBe('campaign');
    // Expected: the phrase survives as text. Today: raw "<signal lost>" — an unknown tag the browser drops.
    expect.soft(card.content).toContain('&lt;signal lost&gt;');
    // Expected: the markup is text. Today: a live <script> element in the card.
    expect.soft(card.content).not.toContain('<script>');
    expect.soft(card.content).toContain('&lt;script&gt;');
  });

  it('control: the session recap card escapes the sentence it quotes', async () => {
    const cs = { currentSessionId: SESSION, sessionNumber: 3 };
    game.settings._store.set(KEY, cs);
    await postNarrationCard('<signal lost> crackles through the deck. You wait.',
      { moveId: 'face_danger', outcome: 'weak_hit', _id: 'res-1' }, cs, { narrationId: 'nar-1' });
    syncChat();

    await postSessionRecap(cs);

    const card = ChatMessage._created.at(-1);
    expect(card.flags[MODULE_ID].recapType).toBe('session');
    expect(card.content).toContain('&lt;signal lost&gt; crackles through the deck');
    expect(card.content).not.toContain('<signal lost>');
  });
});
