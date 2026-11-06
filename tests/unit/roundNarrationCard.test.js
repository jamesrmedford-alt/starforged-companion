/**
 * STARFORGED COMPANION
 * tests/unit/roundNarrationCard.test.js
 *
 * Issue #340 — a Batch Mode round's narrator card, and every consumer of the
 * `narratorCard` flag family that a new card shape has to be audited against
 * (rules/narrator-memory.md invariant 1; docs/narrator/narrator-memory-
 * architecture.md §2): the ring and the rolling summary read one PLAYER line
 * per entry; the session recap counts each entry's move; the fallback round
 * card is counted by the recap and left out of the ring; a Burn Momentum's
 * supersede never matches a round card; and the X-Card takes exactly the
 * newest round's card, not the round before — round submissions are not chat
 * messages, so nothing else ends a beat between two rounds.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));

import { apiPost } from '../../src/api-proxy.js';
import {
  postRoundNarrationCard,
  getRecentNarrationContext,
  getRollingSessionSummary,
  postSessionRecap,
  xCardedNarrationCards,
  narrateRound,
} from '../../src/narration/narrator.js';
import { supersedeOriginalNarration } from '../../src/moves/burnMomentum.js';

const MODULE_ID = 'starforged-companion';
const SESSION = 'sess-1';
const CS = { currentSessionId: SESSION, sessionNumber: 2, currentSceneId: 'sc-1' };

const entries = () => [
  { userId: 'pl-1', actorId: 'pc-kira', actorName: 'Kira', text: 'I slip through the vent.', input: {
    kind: 'move', moveId: 'face_danger', moveName: 'Face Danger', outcome: 'weak_hit', outcomeLabel: 'Weak Hit', isMatch: true, resolutionId: 'res-1',
    relevance: { resolvedClass: 'embellishment', entityIds: [], entityTypes: [] },
  } },
  { userId: 'pl-2', actorId: 'pc-ren', actorName: 'Ren', text: 'I keep the corridor covered.', input: { kind: 'narrative' } },
];
const round = (id = 'round-1', number = 3) => ({ id, number });

/** The card a create would have posted, as a live message. */
async function postCard(text = 'Kira slips through the vent while Ren holds the corridor.', r = round(), atMs = Date.now()) {
  const card = await postRoundNarrationCard(text, r, entries(), CS, { matchedEntityIds: [], narrationId: `n-${r.id}` });
  card.id = `card-${r.id}`;
  card.timestamp = atMs;
  return card;
}

function setMessages(list) {
  game.messages = {
    contents: list,
    get: (id) => list.find(m => m.id === id) ?? null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  ChatMessage._reset();
  game.settings._store.clear();
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
  game.settings._store.set(`${MODULE_ID}.chronicleAutoEntry`, false);
  game.settings._store.set(`${MODULE_ID}.campaignState`, { ...CS });
  setMessages([]);
});

describe('the round card', () => {
  it('carries the flag family, its round, and roundEntries naming only the players who acted', async () => {
    const f = (await postCard()).flags[MODULE_ID];
    expect(f).toMatchObject({
      narratorCard: true, narrationText: expect.stringContaining('Kira slips'), sessionId: SESSION,
      narrationId: 'n-round-1', roundId: 'round-1', roundNumber: 3,
      moveId: null, outcome: null, resolutionId: '',
    });
    expect(f.roundEntries).toEqual([
      { userId: 'pl-1', actorId: 'pc-kira', playerName: 'Kira', playerText: 'I slip through the vent.', moveId: 'face_danger', outcome: 'weak_hit', isMatch: true, resolutionId: 'res-1' },
      { userId: 'pl-2', actorId: 'pc-ren', playerName: 'Ren', playerText: 'I keep the corridor covered.', moveId: null, outcome: null, isMatch: false, resolutionId: '' },
    ]);
    const card = await postCard();
    expect(card.content).toContain('◈ Round 3');
    expect(card.content).toContain('Kira</strong> — Face Danger: Weak Hit');
    expect(card.content).toContain('Ren</strong> — no roll');
    expect(card.content).toContain('data-action="audioPlayToggle"');   // the audio hook plays it like any narration
  });

  it('the ring reads one PLAYER line per entry, then the prose', async () => {
    setMessages([await postCard()]);
    expect(getRecentNarrationContext(SESSION, 3)).toBe(
      'PLAYER — Kira wrote: "I slip through the vent."\n'
      + 'PLAYER — Ren wrote: "I keep the corridor covered."\n'
      + 'Kira slips through the vent while Ren holds the corridor.');
  });

  it('the rolling summary is made from the same lines', async () => {
    game.settings._store.set(`${MODULE_ID}.narratorSessionSummary`, true);
    setMessages([await postCard()]);
    apiPost.mockResolvedValue({ content: [{ type: 'text', text: 'A summary.' }], usage: {}, stop_reason: 'end_turn' });
    await getRollingSessionSummary({ ...CS }, { forceRefresh: true });
    const user = String(apiPost.mock.calls[0][2].messages[0].content);
    expect(user).toContain('PLAYER — Kira wrote: "I slip through the vent."');
    expect(user).toContain('PLAYER — Ren wrote: "I keep the corridor covered."');
  });

  it('the session recap counts each entry\'s move, outcome and match', async () => {
    setMessages([await postCard()]);
    const recap = await postSessionRecap({ ...CS });
    expect(recap.content).toContain('1 move resolved.');
    expect(recap.content).toContain('A match was rolled — Face Danger.');
    expect(recap.content).toContain('Round 3: Face Danger → Weak Hit');
  });
});

describe('the fallback round card', () => {
  it('is counted by the recap and left out of the ring', async () => {
    game.settings._store.delete(`${MODULE_ID}.claudeApiKey`);   // no key → the fallback
    const res = await narrateRound({
      round: { id: 'round-9', number: 9, acting: ['pl-1'], entries: { 'pl-1': {
        userId: 'pl-1', actorId: 'pc-kira', actorName: 'Kira', text: 'I slip through.', rolled: { narrationInput: entries()[0].input },
      } } },
      campaignState: { ...CS },
    });
    expect(res.posted).toBe('fallback');
    const card = ChatMessage._created.at(-1);
    expect(card.flags[MODULE_ID]).toMatchObject({ narratorCard: true, narrationFallback: true, roundId: 'round-9' });
    expect(card.flags[MODULE_ID].narrationText).toContain('Face Danger: Weak Hit — narration unavailable.');
    setMessages([card]);
    expect(getRecentNarrationContext(SESSION, 3)).toBe('');
    const recap = await postSessionRecap({ ...CS });
    expect(recap.content).toContain('1 move resolved.');
  });
});

describe('a Burn Momentum\'s supersede', () => {
  it('never matches a round card — its own resolutionId is empty, its entries\' are not searched', async () => {
    const card = await postCard();
    card.update = vi.fn(async () => card);
    setMessages([card]);
    await supersedeOriginalNarration({ resolutionId: 'res-1' });
    expect(card.update).not.toHaveBeenCalled();
  });
});

describe('the X-Card\'s pick', () => {
  it('takes the newest round\'s card, not the round before it, though no chat came between them', async () => {
    const now = Date.now();
    const first  = await postCard('Round one happened.', round('round-1', 1), now - 60_000);
    const second = await postCard('Round two happened.', round('round-2', 2), now - 10_000);
    setMessages([first, second]);
    const picked = xCardedNarrationCards(SESSION);
    expect(picked.map(m => m.id)).toEqual(['card-round-2']);
  });

  it('control: two ordinary narrations in one beat are both taken', async () => {
    const now = Date.now();
    const a = await postCard('A.', round('r-a', 1), now - 20_000);
    const b = await postCard('B.', round('r-b', 2), now - 10_000);
    delete a.flags[MODULE_ID].roundId;
    delete b.flags[MODULE_ID].roundId;
    setMessages([a, b]);
    expect(xCardedNarrationCards(SESSION).map(m => m.id)).toEqual(['card-r-a', 'card-r-b']);
  });
});
