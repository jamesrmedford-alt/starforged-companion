// tests/probes/narration/sessionRecapCounts.probe.test.js
//
// PROBE (audit, AREA=narration). Asserts the CORRECT behaviour; fails today.
//
// RECAP-SESSION-SUPERSEDED: postSessionRecap (src/narration/narrator.js) has
// its own narrator-card filter (narratorCard + sessionId) instead of
// sessionNarratorCards, so it skips the defensive excludes — above all
// `burnSuperseded`, the pre-burn prose decisions/architecture §2 say "no
// longer happened". A burned move shows twice in `!recap session` (the
// struck-through miss AND the upgraded hit) and the headline counts every
// narrator card — paced narration, @scene answers, vignettes, the fallback
// card — as "moves resolved".

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));

import { postSessionRecap, postNarrationCard } from '../../../src/narration/narrator.js';
import { supersedeOriginalNarration } from '../../../src/moves/burnMomentum.js';

const MODULE_ID = 'starforged-companion';
const state = { currentSessionId: 'sess-3', sessionNumber: 3 };

beforeEach(() => {
  ChatMessage._reset();
  global.game.messages = { contents: [] };
});

describe('!recap session reports what happened this session', () => {
  it('a burned move counts once, at its upgraded outcome; paced prose is not a "move resolved"', async () => {
    // Strike misses; the narration posts.
    await postNarrationCard('Your shot goes wide and the raider closes in.',
      { moveId: 'strike', outcome: 'miss', isMatch: false, _id: 'res-strike' }, state);
    global.game.messages = { contents: ChatMessage._created };
    // The player burns momentum: the original narration is superseded (real producer)…
    await supersedeOriginalNarration({ resolutionId: 'res-strike' });
    expect(ChatMessage._created[0].flags[MODULE_ID].burnSuperseded).toBe(true);
    // …and the re-narration of the strong hit posts.
    await postNarrationCard('You drop the raider with a clean shot.',
      { moveId: 'strike', outcome: 'strong_hit', isMatch: false, _id: 'res-strike-burn', inputMethod: 'burn' }, state);
    // A paced (no-roll) narration in the same session.
    ChatMessage._created.push(makeTestMessage({ flags: { [MODULE_ID]: {
      narratorCard: true, pacedNarrative: true, narrationText: 'The corridor smells of ozone.', sessionId: 'sess-3',
    } } }));

    const cards = ChatMessage._created.slice();
    global.game.messages = { contents: cards };
    ChatMessage._reset();
    await postSessionRecap(state);
    const recap = ChatMessage._created.at(-1).content;

    expect(recap).not.toContain('Strike → Miss');
    expect(recap).not.toContain('Your shot goes wide');
    expect(recap).toContain('Strike → Strong Hit');
    expect(recap).toContain('1 move resolved.');
  });
});
