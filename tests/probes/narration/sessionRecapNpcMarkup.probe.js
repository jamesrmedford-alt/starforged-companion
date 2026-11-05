/**
 * PROBE — NARRATION-05 SESSION-RECAP-NPC-MARKUP
 *
 * What the user does: with audio narration on (`audio.enabled`), the table
 * plays a few moves whose narration opens with NPC speech — the prompt's NPC
 * DIALOGUE MARKUP instruction (narratorPrompt.js appendNpcMarkupInstruction)
 * has the model wrap it as `<npc>"Run. Now."</npc>`. Then anyone types
 * `!recap session`.
 *
 * What happens: the session recap card quotes each move's first sentence
 * from the card's `narrationText` — the prose as the model wrote it, markup
 * included (postNarrationCard stores the un-stripped text so the audio
 * pipeline can split voices) — through escapeHtml alone
 * (src/narration/narrator.js postSessionRecap, the `firstSentence` line), so
 * the players read `• Face Danger → Weak Hit: &lt;npc&gt;"Run` on the recap.
 * Every other fiction card strips the markup before escaping
 * (escapeHtml(stripMarkup(text)) — the narration card, the vignettes, since
 * issue #331 X27 the three clock cards); the recap is the one card sink left
 * that shows the tags.
 *
 * What should happen: the recap quotes the sentence without the markup
 * (stripMarkup, src/audio/segments.js — "the chat card strips the markers at
 * render time; players see clean prose", narratorPrompt.js).
 *
 * Control: the narration card the recap reads from strips the same prose.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/narration/sessionRecapNpcMarkup.probe.js
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));

import { postNarrationCard, postSessionRecap } from '../../../src/narration/narrator.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;

// A narration as the model writes it with the markup instruction in force.
const PROSE = '<npc>"Run. Now."</npc> The engineer shoves you toward the hatch. Alarms follow you out.';

beforeEach(() => {
  vi.clearAllMocks();
  ChatMessage._reset();
  game.settings._store.clear();
  global.game.messages = { contents: [] };
  global.game.user = { id: 'gm-1', isGM: true };
  game.settings._store.set(KEY, { currentSessionId: 'sess-1', sessionNumber: 1 });
});

const recapCard = () => ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.recapCard && m.flags[MODULE_ID].recapType === 'session');

describe('PROBE NARRATION-05 SESSION-RECAP-NPC-MARKUP', () => {
  it('!recap session: the move line quotes the narration without <npc> tags', async () => {
    const cs = game.settings.get(MODULE_ID, 'campaignState');
    const card = await postNarrationCard(PROSE, { moveId: 'face_danger', outcome: 'weak_hit', _id: 'res-1' }, cs,
      { playerText: 'I bolt for the hatch.', playerName: 'Kira', narrationId: 'nar-1' });
    // control: the narration card itself shows clean prose
    expect(card.content).toContain('Run. Now.');
    expect(card.content).not.toMatch(/npc&gt;|<npc>/);

    global.game.messages = { contents: ChatMessage._created.slice() };
    await postSessionRecap(cs);

    const recap = recapCard();
    expect(recap).toBeDefined();
    expect(recap.content).toMatch(/Face Danger → Weak Hit: /);
    expect(recap.content).toMatch(/Run/);
    // Expected: the quoted sentence without the markup. Today: `&lt;npc&gt;&quot;Run` on the card.
    expect(recap.content).not.toMatch(/npc&gt;|<npc>/);
  });

  it('control: a narration with no markup is quoted as written', async () => {
    const cs = game.settings.get(MODULE_ID, 'campaignState');
    await postNarrationCard('The engineer shoves you toward the hatch. Alarms follow you out.',
      { moveId: 'face_danger', outcome: 'weak_hit', _id: 'res-2' }, cs, { narrationId: 'nar-2' });
    global.game.messages = { contents: ChatMessage._created.slice() };
    await postSessionRecap(cs);
    expect(recapCard().content).toContain('Face Danger → Weak Hit: The engineer shoves you toward the hatch');
  });
});
