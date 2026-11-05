// tests/unit/xcardBeatForcedMove.test.js
// The X-Card removes the narration it answers, not the beat before the
// player acted (issue #326 W42). xCardedNarrationCards walks back from the
// newest narrator card and stops at "the last message someone sent" — a
// message with no module flags. The paced card's Roll button re-posts the
// player's line with `bypassPacing` / `forcedMoveId` (the pipeline reads it
// as player narration), so the walk passed it and the paced narration
// before it was removed with the move narration. A forced move's post — the
// Roll re-post, a way-out / Battle / milestone / fulfil button, a token
// drag — now bounds the beat, as a typed line does.

import { describe, it, expect, beforeEach } from 'vitest';
import { xCardedNarrationCards, postNarrationCard } from '../../src/narration/narrator.js';

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

describe('the X-Card removes the narration it answers, not the beat before the player acted (issue #326 W42)', () => {
  it('a move started from the Roll button: only the move narration is X-carded', async () => {
    await ChatMessage.create({ content: 'I creep along the outer hull toward the breach.', flags: {} });   // typed
    await pacedNarration();
    // The Roll button re-posts the player's line (src/index.js, NWMA handler).
    await ChatMessage.create({
      content: 'I creep along the outer hull toward the breach.',
      flags: { [MODULE_ID]: { bypassPacing: true, forcedMoveId: 'face_danger' } },
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
  it('a move started from a milestone / way-out button post: the paced narration before it is not removed', async () => {
    await ChatMessage.create({ content: 'I creep along the outer hull toward the breach.', flags: {} });
    await pacedNarration();
    // A button's forced move (src/moves/cardActions.js) — no player line, but the player acting.
    await ChatMessage.create({
      content: 'Reach a milestone.',
      flags: { [MODULE_ID]: { bypassPacing: true, forcedMoveId: 'reach_a_milestone', deferWhileBusy: true } },
    });
    await moveCard();
    await moveNarration();
    syncChat();

    expect(xCardedNarrationCards(SESSION).map(m => m.flags[MODULE_ID].narrationId)).toEqual(['nar-move']);
  });

  it('control: a narration with no player act between it and the paced card is in the same beat', async () => {
    await ChatMessage.create({ content: 'I creep along the outer hull toward the breach.', flags: {} });
    await pacedNarration();
    await moveCard();
    await moveNarration();
    syncChat();

    expect(xCardedNarrationCards(SESSION).map(m => m.flags[MODULE_ID].narrationId)).toEqual(['nar-paced', 'nar-move']);
  });
});
