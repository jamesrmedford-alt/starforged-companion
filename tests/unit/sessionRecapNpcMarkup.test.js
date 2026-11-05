/**
 * STARFORGED COMPANION
 * tests/unit/sessionRecapNpcMarkup.test.js
 *
 * Issue #336 Y29 (SESSION-RECAP-NPC-MARKUP). With audio narration on, the
 * prompt's NPC DIALOGUE MARKUP instruction has the model wrap NPC speech as
 * `<npc>"Run. Now."</npc>`, and the narration card's `narrationText` keeps
 * the markup (the audio pipeline splits voices on it). `!recap session`
 * quoted each move's first sentence from that text through escapeHtml alone,
 * so the recap read `• Face Danger → Weak Hit: &lt;npc&gt;"Run` — the one
 * card sink left after issue #331 X27 that showed the tags. It strips the
 * markup before the sentence split now, as every fiction card does
 * (escapeHtml(stripMarkup(…))).
 *
 * (From the tenth audit's probe
 * tests/probes/narration/sessionRecapNpcMarkup.probe.js.)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));

import { postNarrationCard, postSessionRecap } from '../../src/narration/narrator.js';

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

describe('issue #336 Y29 — the session recap quotes narration without its NPC markup', () => {
  it('!recap session: the move line quotes the narration without <npc> tags', async () => {
    const cs = game.settings.get(MODULE_ID, 'campaignState');
    const card = await postNarrationCard(PROSE, { moveId: 'face_danger', outcome: 'weak_hit', _id: 'res-1' }, cs,
      { playerText: 'I bolt for the hatch.', playerName: 'Kira', narrationId: 'nar-1' });
    // control: the narration card itself shows clean prose, and keeps the markup for the audio
    expect(card.content).toContain('Run. Now.');
    expect(card.content).not.toMatch(/npc&gt;|<npc>/);
    expect(card.flags[MODULE_ID].narrationText).toBe(PROSE);

    global.game.messages = { contents: ChatMessage._created.slice() };
    await postSessionRecap(cs);

    const recap = recapCard();
    expect(recap).toBeDefined();
    // The first sentence as the card shows it: the quoted line's opening, unmarked.
    expect(recap.content).toContain('• Face Danger → Weak Hit: &quot;Run</div>');
    expect(recap.content).not.toMatch(/npc&gt;|&lt;npc|<npc>/);
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
