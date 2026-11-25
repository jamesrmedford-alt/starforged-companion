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
 * card sink left after issue #331 X27 that showed the tags. It stripped the
 * markup before the sentence split, as every fiction card does
 * (escapeHtml(stripMarkup(…))).
 *
 * Since issue #382 slice 5 the card is a view of the session record — a line
 * a move — and quotes no narration at all, so nothing of a telling's markup
 * can reach it; the narration card itself still shows clean prose and keeps
 * the markup for the audio.
 *
 * (From the tenth audit's probe
 * tests/probes/narration/sessionRecapNpcMarkup.probe.js.)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));

import { postNarrationCard, postSessionRecap } from '../../src/narration/narrator.js';
import { installJournalMock } from '../helpers/fullStateFixture.js';
import { recordedEvent, seedSessionRecord } from '../helpers/sessionRecordSeed.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;

// A narration as the model writes it with the markup instruction in force.
const PROSE = '<npc>"Run. Now."</npc> The engineer shoves you toward the hatch. Alarms follow you out.';

let journals;
beforeEach(() => {
  vi.clearAllMocks();
  ChatMessage._reset();
  game.settings._store.clear();
  journals = installJournalMock();
  global.game.messages = { contents: [] };
  global.game.user = { id: 'gm-1', isGM: true };
  game.settings._store.set(KEY, { currentSessionId: 'sess-1', sessionNumber: 1 });
});
afterEach(() => journals.restore());

const recapCard = () => ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.recapCard && m.flags[MODULE_ID].recapType === 'session');

/** The beat on the session record: its roll, and its telling as the card hook takes it. */
const recorded = (text) => seedSessionRecord('sess-1', [
  recordedEvent('sess-1', 'move.resolved', { ref: { res: 'res-1' }, d: { moveId: 'face_danger', outcome: 'weak_hit' } }),
  recordedEvent('sess-1', 'narration', { ref: { nar: 'nar-1', res: 'res-1' }, d: { mode: 'move' }, text }),
], { number: 1 });

describe('issue #336 Y29 — the session recap shows no narration, so none of its NPC markup', () => {
  it('!recap session: the move line, and nothing of the narration — its <npc> tags with it', async () => {
    const cs = game.settings.get(MODULE_ID, 'campaignState');
    const card = await postNarrationCard(PROSE, { moveId: 'face_danger', outcome: 'weak_hit', _id: 'res-1' }, cs,
      { playerText: 'I bolt for the hatch.', playerName: 'Kira', narrationId: 'nar-1' });
    // control: the narration card itself shows clean prose, and keeps the markup for the audio
    expect(card.content).toContain('Run. Now.');
    expect(card.content).not.toMatch(/npc&gt;|<npc>/);
    expect(card.flags[MODULE_ID].narrationText).toBe(PROSE);

    await recorded(PROSE);
    await postSessionRecap(cs);

    const recap = recapCard();
    expect(recap).toBeDefined();
    expect(recap.content).toContain('• Face Danger → Weak Hit');
    expect(recap.content).not.toMatch(/npc&gt;|&lt;npc|<npc>|Run\. Now/);
  });

  it('control: a narration with no markup is not quoted either', async () => {
    const cs = game.settings.get(MODULE_ID, 'campaignState');
    await recorded('The engineer shoves you toward the hatch. Alarms follow you out.');
    await postSessionRecap(cs);
    expect(recapCard().content).toContain('• Face Danger → Weak Hit');
    expect(recapCard().content).not.toContain('The engineer shoves you');
  });
});
