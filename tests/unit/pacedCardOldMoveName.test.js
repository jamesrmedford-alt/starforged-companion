/**
 * STARFORGED COMPANION
 * tests/unit/pacedCardOldMoveName.test.js
 *
 * Known-issues PACED-CARD-OLD-MOVE-NAME — a paced card posted before issue
 * #321 U45 may hold the pacing classifier's display name ("Gather
 * Information") as its `suggestedMove`. Its Roll button (`paced.roll`,
 * cardActions.applyPacedRoll) posted that name as the forced move id, which
 * the pipeline throws on as an unknown move. The relay now maps the name to
 * its MOVES key (`toMoveId`) and rolls nothing — the card left unclaimed —
 * for a name that is no move.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { applyPacedRoll } from '../../src/moves/cardActions.js';

const MODULE_ID = 'starforged-companion';

function makeCard(id, flags) {
  const msg = {
    id,
    flags: { [MODULE_ID]: { ...flags } },
    update: vi.fn(async (changes) => {
      for (const [path, val] of Object.entries(changes)) {
        msg.flags[MODULE_ID][path.split('.').slice(2).join('.')] = val;
      }
    }),
  };
  return msg;
}

const pacedCard = (suggestedMove) => makeCard('paced-1', {
  pacedNarrative: true, narratorCard: true, narrationText: 'The hatch hisses.',
  playerText: 'I look over the hatch for a way through.', suggestedMove,
});

let created;
beforeEach(() => {
  created = [];
  globalThis.ChatMessage = { create: vi.fn(async (data) => { created.push(data); return { id: 'm-new', ...data }; }) };
});

const GM_CTX = { requesterIsGM: true, requesterId: 'gm-1' };

describe('PACED-CARD-OLD-MOVE-NAME — the paced Roll maps an old card\'s display name', () => {
  it('rolls the move key for a card that holds the display name', async () => {
    const card = pacedCard('Gather Information');
    game.messages = { get: (id) => (id === card.id ? card : null) };

    const result = await applyPacedRoll({ messageId: card.id }, GM_CTX);

    expect(result).toEqual({ posted: true });
    expect(created).toHaveLength(1);
    expect(created[0].flags[MODULE_ID].forcedMoveId).toBe('gather_information');
  });

  it('keeps a card that already holds the key', async () => {
    const card = pacedCard('face_danger');
    game.messages = { get: (id) => (id === card.id ? card : null) };

    await applyPacedRoll({ messageId: card.id }, GM_CTX);

    expect(created[0].flags[MODULE_ID].forcedMoveId).toBe('face_danger');
  });

  it('rolls nothing, and leaves the card unclaimed, for a name that is no move', async () => {
    const card = pacedCard('Dance Wildly');
    game.messages = { get: (id) => (id === card.id ? card : null) };

    const result = await applyPacedRoll({ messageId: card.id }, GM_CTX);

    expect(result).toMatchObject({ posted: false, reason: 'nothing-to-roll' });
    expect(created).toHaveLength(0);
    expect(card.flags[MODULE_ID].rolled).toBeUndefined();
  });
});
