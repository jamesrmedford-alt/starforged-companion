// tests/probes/narration/modeLengthConflict.probe.js
//
// PROBE (eighth audit, AREA=narration). Asserts the CORRECT behaviour; fails today.
//
// NR LENGTH-EVERY-MODE — the move narration's Length setting is sent as the
// STYLE of every narrator mode, contradicting the mode's own length.
//
// What the user does: the GM sets Length (sentences) to 6 for rich move
// narration and Scene Response Length to 1 for terse `@scene` answers, then a
// player asks "@scene what does the hangar smell like?". Or anyone types
// `!recap` for the campaign recap.
//
// What happens: buildNarratorSystemPrompt (src/narration/narratorPrompt.js)
// always renders `Length: ${narrationLength} sentences` in [0] STYLE, whatever
// the mode. The @scene request then says "Length: 6 sentences" in its system
// prompt and "Answer this question with 1–2 sentences" in its user message
// (buildSceneUserMessage, from Scene Response Length — "Target sentence count
// for scene responses", help journal). The campaign recap's system prompt says
// "Length: 3 sentences" while its user message asks for "a campaign recap of
// 3–5 paragraphs" (buildCampaignRecapUserMessage); the vignette, vow, clock
// and inciting roles state their own sentence counts against it too. The
// narrator gets two lengths in one request; the setting the help names for a
// mode is not the only one it is given.
//
// What should happen: a mode with a length of its own (the @scene setting, the
// recap's paragraphs) is not also told the move-narration length.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});

import { apiPost } from '../../../src/api-proxy.js';
import { interrogateScene } from '../../../src/narration/narrator.js';
import { buildNarratorSystemPrompt, buildCampaignRecapUserMessage } from '../../../src/narration/narratorPrompt.js';

const MODULE_ID = 'starforged-companion';

beforeEach(() => {
  vi.clearAllMocks();
  apiPost.mockResolvedValue({
    content: [{ type: 'text', text: 'Ozone and old grease.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' }],
    usage: {}, stop_reason: 'end_turn',
  });
  ChatMessage._reset();
  game.settings._store.clear();
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
  game.settings._store.set(`${MODULE_ID}.narrationLength`, 6);
  game.settings._store.set(`${MODULE_ID}.sceneResponseLength`, 1);
  game.settings._store.set(`${MODULE_ID}.campaignState`, { currentSessionId: 's1', sessionNumber: 1, currentSceneId: 'sc-1' });
  global.game.messages = { contents: [] };
});

describe('each mode is told one length — its own', () => {
  it('@scene: the request does not also carry the move-narration Length', async () => {
    await interrogateScene('what does the hangar smell like?', game.settings.get(MODULE_ID, 'campaignState'));
    const [[, , body]] = apiPost.mock.calls;
    expect(String(body.messages[0].content)).toContain('1–2 sentences');   // control: the scene setting is sent
    expect(body.system[0].text).not.toContain('Length: 6 sentences');
  });

  it('campaign recap: the system prompt does not say "Length: 3 sentences" beside "3–5 paragraphs"', () => {
    const system = buildNarratorSystemPrompt({}, { narrationLength: 3 }, null, '', { mode: 'campaign_recap' });
    const user = buildCampaignRecapUserMessage(['[Session 1]\nKira swore to find Chen.']);
    expect(user).toContain('3–5 paragraphs');                                 // control
    expect(system).not.toContain('Length: 3 sentences');
  });
});
