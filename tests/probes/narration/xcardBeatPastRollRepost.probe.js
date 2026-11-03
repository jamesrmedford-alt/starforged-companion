// tests/probes/narration/xcardBeatPastRollRepost.probe.js
//
// PROBE (eighth audit, AREA=narration). Asserts the CORRECT behaviour; fails today.
//
// NR XCARD-BEAT-OVERREACH — an X-Card on a move started from a card button
// also removes the narration before the player's action.
//
// What the user does: a paced narration ends "*…this could be a Face Danger.*"
// with a Roll Face Danger button. Kira clicks it; the move is rolled and
// narrated. A table-mate plays the X-Card on that move narration.
//
// What happens: xCardedNarrationCards (src/narration/narrator.js) takes the
// newest narration and walks back through "the same beat", stopping at the
// first message with no module flags — "someone spoke: the beat began after
// it". The Roll button's re-post (src/index.js NWMA handler) is the player's
// own line, but it carries module flags { bypassPacing, fromPacedSuggestion,
// forcedMoveId }, so the walk passes over it (and over the move card) and adds
// the paced narration before it to the X-carded beat: its card is flagged
// xCarded and its sidecar's facts retracted, though nobody objected to it. The
// pipeline itself treats that re-post as player narration (isPlayerNarration's
// `bypassPacing` exception); so do the other forced-move re-posts (way-out,
// Battle / Take Decisive Action buttons, milestone, fulfil vow, token drag).
//
// What should happen: the beat starts after the player's re-posted line —
// only the move narration is removed. Control: the same move typed by hand.

import { describe, it, expect, beforeEach } from 'vitest';
import { xCardedNarrationCards, postNarrationCard } from '../../../src/narration/narrator.js';

const MODULE_ID = 'starforged-companion';
const SESSION = 'sess-1';

function syncChat() {
  global.game.messages = { contents: ChatMessage._created.slice() };
}

/** A paced narration card as postPacedNarrativeCard stamps it (with a Roll button). */
async function pacedNarration() {
  return ChatMessage.create({
    content: '<div class="sf-narration-card sf-narration-card--paced">The hull groans under your boots.</div>',
    flags: { [MODULE_ID]: {
      narratorCard: true, narrationCard: true, pacedNarrative: true,
      narrationText: 'The hull groans under your boots. *Crossing the breach could be a Face Danger.*',
      playerText: 'I creep along the outer hull toward the breach.', playerName: 'Kira',
      suggestedMove: 'face_danger', sessionId: SESSION, matchedEntityIds: [],
      narrationId: 'nar-paced', timestamp: new Date(Date.now() - 40_000).toISOString(),
    } },
  });
}

/** The move result card the pipeline posts (module flags, not a narrator card). */
async function moveCard() {
  return ChatMessage.create({ content: '<div class="sf-move-card">Face Danger — Miss</div>', flags: { [MODULE_ID]: { moveResult: true } } });
}

async function moveNarration() {
  return postNarrationCard('The plating tears away and you are flung into the dark.',
    { moveId: 'face_danger', outcome: 'miss', _id: 'res-1' },
    { currentSessionId: SESSION, sessionNumber: 1 },
    { playerText: 'I creep along the outer hull toward the breach.', playerName: 'Kira', narrationId: 'nar-move' });
}

beforeEach(() => {
  ChatMessage._reset();
  global.game.messages = { contents: [] };
});

describe('the X-Card removes the narration it answers, not the beat before the player acted', () => {
  it('a move started from the Roll button: only the move narration is X-carded', async () => {
    await ChatMessage.create({ content: 'I creep along the outer hull toward the breach.', flags: {} });   // typed
    await pacedNarration();
    // The Roll button re-posts the player's line (src/index.js, NWMA handler).
    await ChatMessage.create({
      content: 'I creep along the outer hull toward the breach.',
      flags: { [MODULE_ID]: { bypassPacing: true, fromPacedSuggestion: true, forcedMoveId: 'face_danger' } },
    });
    await moveCard();
    await moveNarration();
    syncChat();

    const ids = xCardedNarrationCards(SESSION).map(m => m.flags[MODULE_ID].narrationId);
    expect(ids).toEqual(['nar-move']);
  });

  it('control: the same move typed by hand — only the move narration is X-carded', async () => {
    await ChatMessage.create({ content: 'I creep along the outer hull toward the breach.', flags: {} });
    await pacedNarration();
    await ChatMessage.create({ content: 'I cross the breach anyway.', flags: {} });                          // typed
    await moveCard();
    await moveNarration();
    syncChat();

    const ids = xCardedNarrationCards(SESSION).map(m => m.flags[MODULE_ID].narrationId);
    expect(ids).toEqual(['nar-move']);
  });
});
