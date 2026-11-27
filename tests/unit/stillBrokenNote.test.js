/**
 * STARFORGED COMPANION
 * tests/unit/stillBrokenNote.test.js
 *
 * Issue #399's bug audit, N16 (the maintainer's call: "address all bugs from
 * audit with recommended choice"): a narration that still breaks a line after
 * its one re-ask — `stillBroken` — reached only the telemetry page, and the GM
 * never knew. It now posts a GM-only ◈ Narrative Review card a line, once the
 * narration's own card has posted: the line, the narration's words, and the
 * remedy, say the correction at the table. It carries the narration it is
 * about, so a later X-Card withdraws it, and the audit posts no second card
 * for a kind it names.
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../src/system/campaignTruths.js', async (importOriginal) => ({
  ...(await importOriginal()),
  buildCampaignTruthsBlock: vi.fn(async () => ''),
}));

import { apiPost } from '../../src/api-proxy.js';
import { narratePacedInput, registerStillBrokenNoteHook, stillBrokenKindsOf } from '../../src/narration/narrator.js';
import { postStillBrokenNote, runConsistencyCheck } from '../../src/factContinuity/consistencyCheck.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const SIDECAR = '\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const reply = (text) => ({ content: [{ type: 'text', text }], usage: {}, stop_reason: 'end_turn' });
const BROKEN = 'It is a strong hit, and the hatch gives under your hands.';
const reviewCards = () => ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.factContinuityReview);
const narrationCards = () => ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.narratorCard && m.flags[MODULE_ID].narrationId);

beforeAll(() => registerStillBrokenNoteHook());

beforeEach(() => {
  vi.clearAllMocks();
  ChatMessage._reset();
  game.settings._store.clear();
  game.actors._reset();
  global.game.messages = { contents: ChatMessage._created, get: (id) => ChatMessage._created.find(m => m.id === id) ?? null };
  global.game.users = Object.assign([{ id: 'gm-1', isGM: true, active: true }], {
    get: (id) => (id === 'gm-1' ? { id: 'gm-1', isGM: true, active: true } : null),
  });
  global.game.user = global.game.users[0];
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
  game.settings._store.set(`${MODULE_ID}.worldSnapshot`, false);
  game.actors._set('pc-mira', makeTestActor({ id: 'pc-mira', name: 'Mira Kestrel' }));
  game.settings._store.set(KEY, {
    currentSessionId: 'sess-2', sessionNumber: 2, currentSceneId: `sc-${Math.random().toString(36).slice(2, 8)}`,
    sceneTruths: [], sceneState: { bySubject: {} }, sceneFrame: null, xCardActive: false, xCardPlays: 0,
  });
  // Both drafts name the outcome: the one re-ask is spent, and the line is still broken.
  apiPost.mockImplementation(async (_url, _headers, _body, opts) => (String(opts?.label ?? '').startsWith('narrator:narratePacedInput')
    ? reply(BROKEN + SIDECAR) : reply('Session 1 ended at the hatch.')));
});

describe('N16 — the GM is told of a narration still broken after its re-ask', () => {
  it('a paced narration that names the outcome in both drafts: its card posts, then the GM\'s note about it', async () => {
    await narratePacedInput('I force the hatch', game.settings.get(MODULE_ID, 'campaignState'), { speakerActorId: 'pc-mira' });
    const [card] = narrationCards();
    expect(card, 'the narration posted').toBeTruthy();
    const narrationId = card.flags[MODULE_ID].narrationId;
    expect(reviewCards(), 'no note before its narration posts').toHaveLength(0);
    expect(stillBrokenKindsOf(narrationId)).toEqual(new Set(['apparatus']));
    // The narration's card is created: its note follows.
    Hooks.call('createChatMessage', card);
    await vi.waitFor(() => expect(reviewCards()).toHaveLength(1));
    const [note] = reviewCards();
    expect(note.flags[MODULE_ID].reviewOf).toBe(narrationId);
    expect(note.content).toContain('[apparatus]');
    expect(note.content).toContain('still broken after the narration was asked again');
    expect(note.content).toContain('strong hit');
    expect(note.content).toContain('say the correction at the table');
    expect(note.whisper).toEqual(['gm-1']);
    // Once: the card's posting spends it.
    expect(stillBrokenKindsOf(narrationId).size).toBe(0);
    Hooks.call('createChatMessage', card);
    await new Promise(r => setTimeout(r, 0));
    expect(reviewCards()).toHaveLength(1);
  });

  it('a fallback card or an X-carded one carries no note', async () => {
    await narratePacedInput('I force the hatch', game.settings.get(MODULE_ID, 'campaignState'), { speakerActorId: 'pc-mira' });
    const [card] = narrationCards();
    Hooks.call('createChatMessage', { ...card, flags: { [MODULE_ID]: { ...card.flags[MODULE_ID], xCarded: true } } });
    await new Promise(r => setTimeout(r, 0));
    expect(reviewCards()).toHaveLength(0);
  });

  it('a player\'s client holds no note: the GM-only card is a GM\'s to post', async () => {
    global.game.users = Object.assign([{ id: 'gm-1', isGM: true, active: true }, { id: 'pl-1', isGM: false, active: true }], {
      get: (id) => ({ 'gm-1': { id: 'gm-1', isGM: true, active: true }, 'pl-1': { id: 'pl-1', isGM: false, active: true } })[id] ?? null,
    });
    global.game.user = { id: 'pl-1', isGM: false, active: true };
    await narratePacedInput('I force the hatch', game.settings.get(MODULE_ID, 'campaignState'), { speakerActorId: 'pc-mira' });
    for (const card of narrationCards()) {
      expect(stillBrokenKindsOf(card.flags[MODULE_ID].narrationId).size).toBe(0);
    }
  });

  it('the note is withheld for a narration the X-Card removed; posted for one it did not', async () => {
    const cs = game.settings.get(MODULE_ID, 'campaignState');
    game.settings._store.set(KEY, { ...cs, xCardedNarrationIds: ['nar-gone'] });
    const broke = [{ tag: 'apparatus', quote: 'strong hit', class: 'certain' }];
    expect(await postStillBrokenNote(broke, cs, { narrationId: 'nar-gone' })).toBe(0);
    expect(reviewCards()).toHaveLength(0);
    expect(await postStillBrokenNote(broke, cs, { narrationId: 'nar-kept' })).toBe(1);
    expect(reviewCards().map(c => c.flags[MODULE_ID].reviewOf)).toEqual(['nar-kept']);
  });

  it('the audit posts no second card for a kind the note names', async () => {
    game.settings._store.set(`${MODULE_ID}.factContinuity.consistencyCheck`, true);
    const st = { ...game.settings.get(MODULE_ID, 'campaignState'),
      sceneTruths: [{ id: 'tr-1', subject: { kind: 'text', text: 'the hatch' }, fact: 'is welded shut', basis: 'player', retracted: false, sessionId: 'sess-2' }] };
    apiPost.mockResolvedValueOnce(reply(JSON.stringify({ contradictions: [{ line: 1, subject: '[cost]', violated: 'the cost is the player\'s to choose',
      evidence: 'the effort costs you', kind: 'obligation', confidence: 'high' }] })));
    const out = await runConsistencyCheck('You are through, and the effort costs you.', st, {
      obligations: [{ kind: 'cost', list: 'NOT YET', text: 'THE COST IS THE PLAYER\'S CHOICE.', judge: 'The narration tells as paid a cost the player has not chosen yet.' }],
      notedKinds: new Set(['cost']),
    });
    expect(out.dispatched).toBe(false);
    expect(out.contradictions[0]).toMatchObject({ obligationKind: 'cost', action: 'already posted' });
  });
});
