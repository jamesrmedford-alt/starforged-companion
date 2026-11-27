/**
 * STARFORGED COMPANION
 * tests/unit/reviewCardPath.test.js
 *
 * Issue #399, slice 3 — the ◈ Narrative Review card's path, from the bug
 * audit's list on the issue:
 *   - N21: the X-Card withdraws a review card already posted about the
 *     narration it removes. The card quoted the removed prose ("The narration
 *     said: …") and offered to change a truth because of it; the audit kept
 *     only a late card out (XCARD-LATE-REVIEW).
 *   - N22: the dedup. Its key holds the kind; a late audit for an earlier
 *     scene clears no live scene's keys; two audits racing post one card; a
 *     card that never posted (notifications off) is not counted as routed,
 *     and posts once they are on.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../src/pacing/telemetry.js', async (importOriginal) => ({
  ...(await importOriginal()),
  logConsistencyDecision: vi.fn(async () => {}),
}));

import { apiPost } from '../../src/api-proxy.js';
import { logConsistencyDecision } from '../../src/pacing/telemetry.js';
import { runConsistencyCheck, contradictionDedupKey } from '../../src/factContinuity/consistencyCheck.js';
import { postNarrationCard } from '../../src/narration/narrator.js';
import { suppressScene } from '../../src/context/safety.js';
import { withdrawReviewCards } from '../../src/world/worldJournal.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const stored = () => game.settings.get(MODULE_ID, 'campaignState');
const syncChat = () => {
  global.game.messages = { contents: ChatMessage._created, get: (id) => ChatMessage._created.find(m => m.id === id) ?? null };
};
const reviewCards = () => ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.factContinuityReview && !m._deleted);

const TRUTH = (sceneId) => ({ id: `tr-limp-${sceneId}`, subject: { kind: 'text', text: 'Vance' }, fact: 'walks with a limp',
  sessionId: 'sess-1', sceneId, asserter: 'narrator', basis: 'player', retracted: false, correctedTo: null, createdAt: 1 });
const finding = (over = {}) => ({ subject: 'Vance', violated: 'walks with a limp', evidence: 'Vance sprints across the hangar', kind: 'truth', confidence: 'high', ...over });
const answer = (...found) => ({ content: [{ type: 'text', text: JSON.stringify({ contradictions: found }) }] });
const state = (sceneId) => ({ currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: sceneId, dismissedEntities: [],
  sceneTruths: [TRUTH(sceneId)], sceneState: { bySubject: {}, sceneId } });
let scene = 0;
const freshScene = () => `sc-path-${++scene}-${Math.random().toString(36).slice(2, 7)}`;

beforeEach(() => {
  vi.clearAllMocks();
  apiPost.mockReset();
  ChatMessage._reset();
  // A deleted card is marked so (the double's delete): the X-Card's finish deletes, the test reads what is left.
  syncChat();
  game.settings._store.clear();
  game.settings._store.set(`${MODULE_ID}.factContinuity.consistencyCheck`, true);
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
  global.game.users = Object.assign([{ id: 'gm-1', isGM: true, active: true }], {
    get: (id) => (id === 'gm-1' ? { id: 'gm-1', isGM: true, active: true } : null),
  });
  global.game.user = global.game.users[0];
});

describe('N21 — the X-Card withdraws the review card about the narration it removes', () => {
  it('the card carries the narration\'s id; withdrawReviewCards deletes it, and only it', async () => {
    const sc = freshScene();
    apiPost.mockResolvedValueOnce(answer(finding()));
    await runConsistencyCheck('Vance sprints across the hangar.', state(sc), { narrationId: 'nar-aaa111' });
    apiPost.mockResolvedValueOnce(answer(finding({ violated: 'walks with a limp', subject: 'Vance ' })));
    await runConsistencyCheck('Vance sprints again.', state(freshScene()), { narrationId: 'nar-bbb222' });
    const cards = reviewCards();
    expect(cards.map(c => c.flags[MODULE_ID].reviewOf)).toEqual(['nar-aaa111', 'nar-bbb222']);
    const deleted = [];
    for (const c of cards) { const del = c.delete.bind(c); c.delete = async () => { deleted.push(c.flags[MODULE_ID].reviewOf); return del(); }; }
    expect(await withdrawReviewCards(['nar-aaa111'])).toBe(1);
    expect(deleted).toEqual(['nar-aaa111']);
  });

  it('through the X-Card itself: a narration posted, audited and carded, then the X-Card played — its card is withdrawn', async () => {
    const sc = freshScene();
    game.settings._store.set(KEY, { ...state(sc), xCardActive: false, xCardPlays: 0 });
    await postNarrationCard('Vance sprints across the hangar, no limp in his stride.', { moveId: 'face_danger', outcome: 'strong_hit', _id: 'res-1' },
      stored(), { playerText: 'I watch Vance.', playerName: 'Kira', narrationId: 'nar-xcard1' });
    apiPost.mockResolvedValueOnce(answer(finding()));
    await runConsistencyCheck('Vance sprints across the hangar, no limp in his stride.', stored(), { narrationId: 'nar-xcard1' });
    const [card] = reviewCards();
    expect(card.flags[MODULE_ID].reviewOf).toBe('nar-xcard1');
    let withdrawn = false;
    const del = card.delete.bind(card);
    card.delete = async () => { withdrawn = true; return del(); };
    syncChat();
    expect(await suppressScene({}, { local: true })).toBe(true);
    await vi.waitFor(() => expect(withdrawn).toBe(true));
  });
});

describe('N22 — the dedup', () => {
  it('(a) its key holds the kind: a retraction of the struck truth is a card of its own', () => {
    expect(contradictionDedupKey('sc', finding())).not.toBe(contradictionDedupKey('sc', finding({ kind: 'retraction' })));
    expect(contradictionDedupKey('sc', finding())).toBe(contradictionDedupKey('sc', finding({ subject: ' vance ', violated: 'Walks with a limp ' })));
  });

  it('(b) a late audit for an earlier scene does not clear the live scene\'s keys', async () => {
    const live = freshScene();
    const earlier = freshScene();
    apiPost.mockResolvedValue(answer(finding()));
    await runConsistencyCheck('Vance sprints.', state(live));
    await runConsistencyCheck('Vance sprints.', state(earlier));
    await runConsistencyCheck('Vance sprints.', state(live));
    expect(reviewCards()).toHaveLength(2);
    apiPost.mockReset();
  });

  it('(c) two audits racing on one standing contradiction post one card', async () => {
    const sc = freshScene();
    apiPost.mockResolvedValue(answer(finding()));
    await Promise.all([runConsistencyCheck('Vance sprints.', state(sc)), runConsistencyCheck('Vance sprints.', state(sc))]);
    expect(reviewCards()).toHaveLength(1);
    apiPost.mockReset();
  });

  it('(d) a card that did not post is not counted as routed, and posts once the notifications are on', async () => {
    const sc = freshScene();
    game.settings._store.set(`${MODULE_ID}.contradictionNotifications`, false);
    apiPost.mockResolvedValue(answer(finding()));
    const off = await runConsistencyCheck('Vance sprints.', state(sc));
    expect(off.dispatched).toBe(false);
    expect(logConsistencyDecision.mock.calls.at(-1)[0]).toMatchObject({ dispatched: false });
    expect(reviewCards()).toHaveLength(0);
    game.settings._store.set(`${MODULE_ID}.contradictionNotifications`, true);
    const on = await runConsistencyCheck('Vance sprints.', state(sc));
    expect(on.dispatched).toBe(true);
    expect(reviewCards()).toHaveLength(1);
    apiPost.mockReset();
  });
});
