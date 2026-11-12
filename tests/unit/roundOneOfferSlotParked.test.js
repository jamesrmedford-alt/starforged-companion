/**
 * STARFORGED COMPANION
 * tests/unit/roundOneOfferSlotParked.test.js
 *
 * ROUND-ONE-OFFER-SLOT (issue #345 AA37's residual). A Batch Mode entry had
 * one offer slot for a card button's move pressed beside the player's own
 * action:
 *   - an action written, card A offered, Withdraw, card B pressed (B is the
 *     entry, A still offered beside it): Pass / Withdraw / Edit kept A and
 *     dropped B — its card claimed, never rolled or held;
 *   - offerForcedMove replaced an undecided offer with a second card move,
 *     dropping the first the same way.
 * Now the card moves beyond the slot are parked on the entry (`parked`) and
 * handed back with the offer when the round stops collecting (takeCardMoves),
 * for the driver to hold for the next round.
 */

import { describe, it, expect } from 'vitest';
import {
  ENTRY_STATUS, READING_KIND, participantsFrom, createRound,
  submitEntry, recordReading, withdrawEntry, passEntry, offerForcedMove, takeCardMoves,
} from '../../src/batch/round.js';

const NOW = '2026-11-06T10:00:00.000Z';
const users = [
  { id: 'gm-1', name: 'Gina', isGM: true,  active: true, characterId: null },
  { id: 'pl-1', name: 'Pat',  isGM: false, active: true, characterId: 'pc-kira' },
];
const pcs = [{ id: 'pc-kira', name: 'Kira', ownerIds: ['pl-1'] }];
const open = () => createRound({ id: 'r1', number: 1, sessionId: 's1', now: NOW, participants: participantsFrom({ users, pcs }) });
const READING = { kind: READING_KIND.MOVE, moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', abilities: [], statOptions: [], targetChoices: null, interpretation: {} };

function written(round) {
  const a = submitEntry(round, { userId: 'pl-1', text: 'I slip through the vent.', submissionId: 's1', now: NOW });
  return recordReading(a, { userId: 'pl-1', submissionId: 's1', reading: READING });
}
const press = (round, messageId, moveId) => offerForcedMove(round, {
  userId: 'pl-1', text: `Card ${messageId}`, forced: { moveId }, submissionId: `f-${messageId}`, now: NOW, messageId,
});
const handedBack = (round) => takeCardMoves(round).held.map(h => h.messageId).sort();

/** An action written, card A offered, Withdraw, card B pressed: B is the entry, A offered beside it. */
function bEntryBesideOfferA() {
  let r = written(open());
  r = press(r, 'm-a', 'face_danger').round;
  expect(r.entries['pl-1'].offer).toMatchObject({ messageId: 'm-a' });
  r = withdrawEntry(r, { userId: 'pl-1' });
  const b = press(r, 'm-b', 'secure_an_advantage');
  expect(b.read).toBe(true);
  expect(b.round.entries['pl-1']).toMatchObject({ readAs: { messageId: 'm-b' }, offer: { messageId: 'm-a' } });
  return b.round;
}

describe('ROUND-ONE-OFFER-SLOT — a card move beyond the one offer slot is parked, not dropped', () => {
  it('Pass with card B the entry and card A offered: both are handed back for the next round', () => {
    const passed = passEntry(bEntryBesideOfferA(), { userId: 'pl-1' });
    expect(passed.entries['pl-1']).toMatchObject({ status: ENTRY_STATUS.PASSED, offer: { messageId: 'm-a' } });
    expect(handedBack(passed)).toEqual(['m-a', 'm-b']);
  });

  it('Withdraw (and Edit, which withdraws) likewise keeps both', () => {
    const withdrawn = withdrawEntry(bEntryBesideOfferA(), { userId: 'pl-1' });
    expect(handedBack(withdrawn)).toEqual(['m-a', 'm-b']);
  });

  it('a second card pressed beside an undecided offer is offered; the first is parked and handed back too', () => {
    let r = written(open());
    r = press(r, 'm-a', 'face_danger').round;
    const second = press(r, 'm-b', 'secure_an_advantage');
    expect(second.held, 'nothing handed back yet').toEqual([]);
    expect(second.round.entries['pl-1'].offer).toMatchObject({ messageId: 'm-b' });
    expect(handedBack(second.round)).toEqual(['m-a', 'm-b']);
  });

  it('takeCardMoves clears what it hands back: the offer and the parked moves come off the entry', () => {
    const passed = passEntry(bEntryBesideOfferA(), { userId: 'pl-1' });
    const taken = takeCardMoves(passed);
    expect(taken.round.entries['pl-1'].offer).toBeNull();
    expect(taken.round.entries['pl-1'].parked).toBeUndefined();
    expect(takeCardMoves(taken.round).held).toEqual([]);
  });

  it('control: one card move pressed before anything was written, then Pass — offered, handed back once (AA37)', () => {
    const r = press(open(), 'm-a', 'face_danger').round;
    const passed = passEntry(r, { userId: 'pl-1' });
    expect(passed.entries['pl-1'].parked).toBeUndefined();
    expect(handedBack(passed)).toEqual(['m-a']);
  });
});
