/**
 * STARFORGED COMPANION
 * tests/unit/batchRound.test.js
 *
 * Issue #340 — a Batch Mode round as data (src/batch/round.js), pure:
 * who takes part, every transition (legal and refused), when a round
 * resolves, what a confirm may choose, numbering, and what a recovery finds.
 */

import { describe, it, expect } from 'vitest';
import {
  ROUND_PHASE, ENTRY_STATUS, READING_KIND, ROUND_TEXT_MAX, RoundRefusal,
  participantsFrom, createRound, addParticipant, closeRound, nextRoundNumber, storedRound,
  submitEntry, withdrawEntry, passEntry, recordReading, readingFailed, confirmEntry, rereadEntry, offerForcedMove, takeCardMoves, isOwedEntry,
  validateChoices, cleanSubmissionText,
  readyToResolve, readingsInFlight, beginResolution, actingOrder, fixActing,
  markRolled, markRecorded, markRefused, allSettled,
  beginUpgrades, decideUpgrade, keepUndecidedUpgrades, upgradesSettled, beginNarration, claimNarration,
  recoveryPlan,
} from '../../src/batch/round.js';

const NOW = '2026-11-06T10:00:00.000Z';
const users = [
  { id: 'gm-1', name: 'Gina', isGM: true,  active: true,  characterId: null },
  { id: 'pl-1', name: 'Pat',  isGM: false, active: true,  characterId: 'pc-kira' },
  { id: 'pl-2', name: 'Quinn', isGM: false, active: true, characterId: null },
  { id: 'pl-3', name: 'Rook', isGM: false, active: true,  characterId: null },
];
const pcs = [
  { id: 'pc-kira', name: 'Kira', ownerIds: ['pl-1'] },
  { id: 'pc-ren',  name: 'Ren',  ownerIds: ['pl-2'] },
];
const participants = () => participantsFrom({ users, pcs });
const open = () => createRound({ id: 'r1', number: 1, sessionId: 's1', sceneId: 'sc', now: NOW, participants: participants() });

const MOVE_READING = {
  kind: READING_KIND.MOVE, moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge',
  abilities: [
    { key: 'a1', assetName: 'Ace', adds: 1, statReplacement: '' },
    { key: 'a2', assetName: 'Empath', adds: 0, statReplacement: 'heart' },
  ],
  statOptions: ['heart'],
  targetChoices: null,
  interpretation: { moveId: 'face_danger' },
};
const NARRATIVE_READING = { kind: READING_KIND.NARRATIVE, suggestedMove: 'compel' };

/** submit → read for one user. */
function readied(round, userId, reading = MOVE_READING, sid = `s-${userId}`) {
  const a = submitEntry(round, { userId, text: `${userId} acts`, submissionId: sid, now: NOW });
  return recordReading(a, { userId, submissionId: sid, reading });
}
const refusedWith = (fn, reason) => {
  try { fn(); } catch (err) {
    expect(err).toBeInstanceOf(RoundRefusal);
    expect(err.reason).toBe(reason);
    return;
  }
  throw new Error(`expected a refusal "${reason}"`);
};

describe('participants', () => {
  it('a player with an assigned PC, a player who owns one, a player with none (left out)', () => {
    const p = participants();
    expect(p.map(x => [x.userId, x.actorId])).toEqual([['pl-1', 'pc-kira'], ['pl-2', 'pc-ren']]);
  });

  it('a GM with an assigned PC takes part; without one, never another player\'s PC', () => {
    expect(participantsFrom({ users: [{ id: 'gm-1', isGM: true, active: true, characterId: null }], pcs }).length).toBe(0);
    const withPc = participantsFrom({ users: [{ id: 'gm-1', isGM: true, active: true, characterId: 'pc-kira' }], pcs });
    expect(withPc).toEqual([expect.objectContaining({ userId: 'gm-1', actorId: 'pc-kira', isGM: true })]);
  });

  it('only PCs count — the caller passes player characters; an assigned NPC card is no character of theirs', () => {
    const p = participantsFrom({ users: [{ id: 'pl-1', isGM: false, active: true, characterId: 'npc-card' }], pcs });
    expect(p.map(x => x.actorId)).toEqual(['pc-kira']);
  });

  it('a disconnected user is not a participant; one connecting mid-round is added once', () => {
    const off = participantsFrom({ users: users.map(u => (u.id === 'pl-2' ? { ...u, active: false } : u)), pcs });
    const r = createRound({ id: 'r', number: 1, sessionId: 's', now: NOW, participants: off });
    expect(Object.keys(r.entries)).toEqual(['pl-1']);
    const joined = addParticipant(r, participants().find(p => p.userId === 'pl-2'));
    expect(Object.keys(joined.entries).sort()).toEqual(['pl-1', 'pl-2']);
    expect(addParticipant(joined, participants().find(p => p.userId === 'pl-2'))).toBe(joined);
  });

  it('a round can have one participant, and resolves on its one ready entry', () => {
    const r = createRound({ id: 'r', number: 1, sessionId: 's', now: NOW, participants: participants().slice(0, 1) });
    const ready = confirmEntry(readied(r, 'pl-1'), { userId: 'pl-1', submissionId: 's-pl-1', choices: {}, now: NOW });
    expect(readyToResolve(ready, { connectedUserIds: ['pl-1'] })).toBe(true);
  });
});

describe('transitions', () => {
  it('submit → read → ready, and the confirm order', () => {
    let r = readied(open(), 'pl-2');
    r = readied(r, 'pl-1');
    r = confirmEntry(r, { userId: 'pl-2', submissionId: 's-pl-2', choices: {}, now: NOW });
    r = confirmEntry(r, { userId: 'pl-1', submissionId: 's-pl-1', choices: {}, now: NOW });
    expect(r.order).toEqual(['pl-2', 'pl-1']);
    expect(r.entries['pl-1'].status).toBe(ENTRY_STATUS.READY);
  });

  it('an edit after Ready is read again, and moves to the end of the order', () => {
    let r = confirmEntry(readied(open(), 'pl-1'), { userId: 'pl-1', submissionId: 's-pl-1', choices: {}, now: NOW });
    r = confirmEntry(readied(r, 'pl-2'), { userId: 'pl-2', submissionId: 's-pl-2', choices: {}, now: NOW });
    r = submitEntry(r, { userId: 'pl-1', text: 'I change my mind', submissionId: 's2', now: NOW });
    expect(r.entries['pl-1']).toMatchObject({ status: ENTRY_STATUS.SUBMITTED, reading: null });
    expect(r.order).toEqual(['pl-2']);
    r = recordReading(r, { userId: 'pl-1', submissionId: 's2', reading: MOVE_READING });
    r = confirmEntry(r, { userId: 'pl-1', submissionId: 's2', choices: {}, now: NOW });
    expect(r.order).toEqual(['pl-2', 'pl-1']);
  });

  it('a reading of an older submission does not land; a newer one does', () => {
    let r = submitEntry(open(), { userId: 'pl-1', text: 'first', submissionId: 'a', now: NOW });
    r = submitEntry(r, { userId: 'pl-1', text: 'second', submissionId: 'b', now: NOW });
    const stale = recordReading(r, { userId: 'pl-1', submissionId: 'a', reading: MOVE_READING });
    expect(stale).toBe(r);
    expect(recordReading(r, { userId: 'pl-1', submissionId: 'b', reading: MOVE_READING }).entries['pl-1'].status).toBe(ENTRY_STATUS.READ);
  });

  it('a confirm with a stale submissionId is refused; a submit while rolling is refused', () => {
    const r = readied(open(), 'pl-1');
    refusedWith(() => confirmEntry(r, { userId: 'pl-1', submissionId: 'old', choices: {}, now: NOW }), 'stale');
    const rolling = beginResolution(r, { resolverId: 'gm-1', resolverClaim: 'c', now: NOW });
    refusedWith(() => submitEntry(rolling, { userId: 'pl-2', text: 'late', submissionId: 'x', now: NOW }), 'resolving');
  });

  it('withdraw goes back to waiting; pass is passed; a repeat of the same submission changes nothing', () => {
    let r = readied(open(), 'pl-1');
    expect(submitEntry(r, { userId: 'pl-1', text: 'pl-1 acts', submissionId: 's-pl-1', now: NOW })).toBe(r);
    r = withdrawEntry(r, { userId: 'pl-1' });
    expect(r.entries['pl-1']).toMatchObject({ status: ENTRY_STATUS.WAITING, reading: null, submissionId: null });
    r = passEntry(r, { userId: 'pl-1' });
    expect(r.entries['pl-1'].status).toBe(ENTRY_STATUS.PASSED);
  });

  it('a user with no entry is refused; the text is bounded like a chat line', () => {
    refusedWith(() => submitEntry(open(), { userId: 'pl-9', text: 'hi', submissionId: 'x', now: NOW }), 'not-participant');
    refusedWith(() => submitEntry(open(), { userId: 'pl-1', text: '   ', submissionId: 'x', now: NOW }), 'bad-text');
    refusedWith(() => submitEntry(open(), { userId: 'pl-1', text: 'x'.repeat(ROUND_TEXT_MAX + 1), submissionId: 'x', now: NOW }), 'bad-text');
    expect(cleanSubmissionText(`  ${'y'.repeat(ROUND_TEXT_MAX)}  `)).toHaveLength(ROUND_TEXT_MAX);
  });

  it('"Roll a move instead" re-reads a narrative reading as a move — the offered move only', () => {
    let r = readied(open(), 'pl-1', NARRATIVE_READING);
    refusedWith(() => rereadEntry(r, { userId: 'pl-1', submissionId: 's-pl-1', newSubmissionId: 'n', now: NOW, moveId: 'strike' }), 'bad-move');
    r = rereadEntry(r, { userId: 'pl-1', submissionId: 's-pl-1', newSubmissionId: 'n', now: NOW, moveId: 'compel' });
    expect(r.entries['pl-1']).toMatchObject({ status: ENTRY_STATUS.SUBMITTED, submissionId: 'n', readAs: { move: true, moveId: 'compel' } });
    refusedWith(() => rereadEntry(readied(open(), 'pl-1'), { userId: 'pl-1', submissionId: 's-pl-1', newSubmissionId: 'n', now: NOW }), 'not-narrative');
  });

  it('a card button\'s move becomes the entry — or, beside an action already submitted, an offer', () => {
    const forced = { moveId: 'take_decisive_action', moveTargetId: 'f1' };
    const taken = offerForcedMove(open(), { userId: 'pl-1', text: 'Finish it', forced, submissionId: 'f', now: NOW });
    expect(taken.read).toBe(true);
    expect(taken.round.entries['pl-1']).toMatchObject({ status: ENTRY_STATUS.SUBMITTED, readAs: { move: true, forced } });
    const offered = offerForcedMove(readied(open(), 'pl-1'), { userId: 'pl-1', text: 'Finish it', forced, submissionId: 'f', now: NOW });
    expect(offered.read).toBe(false);
    expect(offered.round.entries['pl-1']).toMatchObject({ status: ENTRY_STATUS.READ, offer: { text: 'Finish it', forced } });
    const used = rereadEntry(offered.round, { userId: 'pl-1', submissionId: 's-pl-1', newSubmissionId: 'u', now: NOW, useOffer: true });
    expect(used.entries['pl-1']).toMatchObject({ status: ENTRY_STATUS.SUBMITTED, text: 'Finish it', offer: null, readAs: { move: true, forced } });
  });

  it('a card move carries its chat message\'s id — as the entry, as an offer, and when the offer is used (issue #342 Z05)', () => {
    const forced = { moveId: 'take_decisive_action' };
    const taken = offerForcedMove(open(), { userId: 'pl-1', text: 'Finish it', forced, submissionId: 'f', now: NOW, messageId: 'm-1' });
    expect(taken.round.entries['pl-1'].readAs).toMatchObject({ messageId: 'm-1' });
    const offered = offerForcedMove(readied(open(), 'pl-1'), { userId: 'pl-1', text: 'Finish it', forced, submissionId: 'f', now: NOW, messageId: 'm-2' });
    expect(offered.round.entries['pl-1'].offer).toMatchObject({ messageId: 'm-2' });
    const used = rereadEntry(offered.round, { userId: 'pl-1', submissionId: 's-pl-1', newSubmissionId: 'u', now: NOW, useOffer: true });
    expect(used.entries['pl-1'].readAs).toMatchObject({ messageId: 'm-2' });
  });

  it('only Keep mine drops an offer — on a Ready entry too; Withdraw and Pass leave it offered (issue #342 Z05)', () => {
    const forced = { moveId: 'face_danger' };
    const offer = (r) => offerForcedMove(r, { userId: 'pl-1', text: 'Dive', forced, submissionId: 'f', now: NOW, messageId: 'm' }).round;
    const ready = confirmEntry(readied(open(), 'pl-1'), { userId: 'pl-1', submissionId: 's-pl-1', choices: {}, now: NOW });
    const kept = confirmEntry(offer(ready), { userId: 'pl-1', submissionId: 's-pl-1', choices: {}, now: NOW });
    expect(kept.entries['pl-1']).toMatchObject({ status: ENTRY_STATUS.READY, offer: null });
    expect(confirmEntry(ready, { userId: 'pl-1', submissionId: 's-pl-1', choices: {}, now: NOW })).toBe(ready);   // nothing to drop
    expect(withdrawEntry(offer(ready), { userId: 'pl-1' }).entries['pl-1']).toMatchObject({ status: ENTRY_STATUS.WAITING, offer: { text: 'Dive' } });
    expect(passEntry(offer(ready), { userId: 'pl-1' }).entries['pl-1']).toMatchObject({ status: ENTRY_STATUS.PASSED, offer: { text: 'Dive' } });
  });
});

describe('a roll a card owes — the resist roll at 0 (issue #342 D2, ruling A)', () => {
  const owedMove = { moveId: 'endure_harm', owed: true };
  const press = (r, extra = {}) => offerForcedMove(r, {
    userId: 'pl-1', text: 'Kira resists the harm.', forced: owedMove, submissionId: 'o', now: NOW, messageId: 'm-resist', ...extra,
  });

  it('is the entry even beside an action already written — which is set aside for the next round, not offered', () => {
    const ready = confirmEntry(readied(open(), 'pl-1'), { userId: 'pl-1', submissionId: 's-pl-1', choices: {}, now: NOW });
    const res = press(ready);
    expect(res.read).toBe(true);
    expect(res.held).toEqual([]);
    const e = res.round.entries['pl-1'];
    expect(e).toMatchObject({ status: ENTRY_STATUS.SUBMITTED, text: 'Kira resists the harm.', submissionId: 'o', offer: null,
      readAs: { move: true, forced: owedMove, messageId: 'm-resist' }, setAside: { text: 'pl-1 acts' } });
    expect(isOwedEntry(e)).toBe(true);
    expect(res.round.order).toEqual([]);                                  // out of the confirm order until confirmed
  });

  it('a card move it displaces is held for the next round; a second owed move is held itself', () => {
    const tda = offerForcedMove(open(), { userId: 'pl-1', text: 'Finish it', forced: { moveId: 'take_decisive_action' }, submissionId: 't', now: NOW, messageId: 'm-tda' }).round;
    const res = press(tda);
    expect(res.held).toEqual([{ userId: 'pl-1', messageId: 'm-tda' }]);
    expect(res.round.entries['pl-1'].setAside).toBeNull();
    const again = offerForcedMove(res.round, { userId: 'pl-1', text: 'Kira resists the stress.', forced: { moveId: 'endure_stress', owed: true }, submissionId: 'o2', now: NOW, messageId: 'm-stress' });
    expect(again.round).toBe(res.round);
    expect(again.held).toEqual([{ userId: 'pl-1', messageId: 'm-stress' }]);
  });

  it('refuses Withdraw, Pass, a rewrite and a re-read; a confirm keeps an offer beside it undecided', () => {
    let r = press(open()).round;
    r = recordReading(r, { userId: 'pl-1', submissionId: 'o', reading: MOVE_READING });
    refusedWith(() => withdrawEntry(r, { userId: 'pl-1' }), 'owed');
    refusedWith(() => passEntry(r, { userId: 'pl-1' }), 'owed');
    refusedWith(() => submitEntry(r, { userId: 'pl-1', text: 'I run.', submissionId: 'n', now: NOW }), 'owed');
    r = offerForcedMove(r, { userId: 'pl-1', text: 'Dive', forced: { moveId: 'face_danger' }, submissionId: 'd', now: NOW, messageId: 'm-dive' }).round;
    refusedWith(() => rereadEntry(r, { userId: 'pl-1', submissionId: 'o', newSubmissionId: 'u', now: NOW, useOffer: true }), 'owed');
    const confirmed = confirmEntry(r, { userId: 'pl-1', submissionId: 'o', choices: {}, now: NOW });
    expect(confirmed.entries['pl-1']).toMatchObject({ status: ENTRY_STATUS.READY, offer: { text: 'Dive' } });
    expect(confirmEntry(confirmed, { userId: 'pl-1', submissionId: 'o', choices: {}, now: NOW })).toBe(confirmed);
  });
});

describe('the card moves a round leaves behind (takeCardMoves, issue #342 Z05)', () => {
  const forced = { moveId: 'face_danger' };
  it('hands back every undecided offer, and the card-move entries it does not roll; the offers come off', () => {
    let r = readied(open(), 'pl-1');
    r = offerForcedMove(r, { userId: 'pl-1', text: 'Dive', forced, submissionId: 'f', now: NOW, messageId: 'm-offer' }).round;
    r = offerForcedMove(r, { userId: 'pl-2', text: 'Cover', forced, submissionId: 'g', now: NOW, messageId: 'm-entry' }).round;
    const resolved = takeCardMoves(r, { acting: ['pl-1'] });
    expect(resolved.held).toEqual([{ userId: 'pl-1', messageId: 'm-offer' }, { userId: 'pl-2', messageId: 'm-entry' }]);
    expect(resolved.round.entries['pl-1'].offer).toBeNull();
    expect(r.entries['pl-1'].offer).not.toBeNull();                       // a copy: the input is untouched
    // An acting card-move entry is rolled, not held.
    expect(takeCardMoves(r, { acting: ['pl-1', 'pl-2'] }).held).toEqual([{ userId: 'pl-1', messageId: 'm-offer' }]);
  });

  it('a round closed unresolved hands back every card move; with none, the round itself comes back', () => {
    const r = offerForcedMove(open(), { userId: 'pl-2', text: 'Cover', forced, submissionId: 'g', now: NOW, messageId: 'm-entry' }).round;
    expect(takeCardMoves(r).held).toEqual([{ userId: 'pl-2', messageId: 'm-entry' }]);
    const plain = readied(open(), 'pl-1');
    expect(takeCardMoves(plain)).toEqual({ round: plain, held: [] });
  });
});

describe('when a round resolves', () => {
  it('every connected participant ready or passed resolves it; a disconnected one is not waited for', () => {
    let r = confirmEntry(readied(open(), 'pl-1'), { userId: 'pl-1', submissionId: 's-pl-1', choices: {}, now: NOW });
    expect(readyToResolve(r, { connectedUserIds: ['pl-1', 'pl-2'] })).toBe(false);
    expect(readyToResolve(r, { connectedUserIds: ['pl-1'] })).toBe(true);
    r = passEntry(r, { userId: 'pl-2' });
    expect(readyToResolve(r, { connectedUserIds: ['pl-1', 'pl-2'] })).toBe(true);
  });

  it('nobody acting resolves it with no one in it; nobody connected leaves it waiting', () => {
    const r = passEntry(passEntry(open(), { userId: 'pl-1' }), { userId: 'pl-2' });
    expect(readyToResolve(r, { connectedUserIds: ['pl-1', 'pl-2'] })).toBe(true);
    expect(actingOrder(fixActing(beginResolution(r, { resolverId: 'gm', resolverClaim: 'c', now: NOW })))).toEqual([]);
    expect(readyToResolve(open(), { connectedUserIds: [] })).toBe(false);
  });

  it('Send now leaves out anyone who hasn\'t submitted, uses an unconfirmed reading as read, and waits for one in flight', () => {
    let r = readied(open(), 'pl-1');                                           // read, not confirmed
    r = submitEntry(r, { userId: 'pl-2', text: 'still reading', submissionId: 'q', now: NOW });   // in flight
    expect(readingsInFlight(r)).toEqual(['pl-2']);
    r = beginResolution(r, { resolverId: 'gm-1', resolverClaim: 'c', now: NOW, sendNow: true });
    // The reading in flight lands before the acting entries are fixed.
    r = recordReading(r, { userId: 'pl-2', submissionId: 'q', reading: NARRATIVE_READING });
    r = fixActing(r);
    expect(r.acting).toEqual(['pl-1', 'pl-2']);
    // Once fixed, a late reading does not land.
    const late = submitEntry(open(), { userId: 'pl-1', text: 'x', submissionId: 'z', now: NOW });
    const fixed = fixActing(beginResolution(late, { resolverId: 'g', resolverClaim: 'c', now: NOW, sendNow: true }));
    expect(recordReading(fixed, { userId: 'pl-1', submissionId: 'z', reading: MOVE_READING })).toBe(fixed);
  });

  it('a failed reading is not waited for, and Send now leaves its entry out', () => {
    let r = submitEntry(open(), { userId: 'pl-1', text: 'x', submissionId: 'z', now: NOW });
    r = readingFailed(r, { userId: 'pl-1', submissionId: 'z', error: 'boom' });
    expect(readingsInFlight(r)).toEqual([]);
    expect(r.entries['pl-1'].error).toBe('boom');
    expect(fixActing(beginResolution(r, { resolverId: 'g', resolverClaim: 'c', now: NOW, sendNow: true })).acting).toEqual([]);
  });

  it('a round already resolving cannot begin again', () => {
    const r = beginResolution(open(), { resolverId: 'g', resolverClaim: 'c', now: NOW });
    refusedWith(() => beginResolution(r, { resolverId: 'g', resolverClaim: 'c', now: NOW }), 'resolving');
  });
});

describe('validation — a forged confirm can do only what the window could', () => {
  it('only offered abilities; a stat a chosen ability offers; an unchecked one\'s stat is dropped', () => {
    expect(validateChoices(MOVE_READING, { abilityIds: ['a1', 'a2'], statReplacement: 'heart' }))
      .toEqual({ abilityIds: ['a1', 'a2'], statReplacement: 'heart', targetId: null });
    expect(validateChoices(MOVE_READING, { abilityIds: ['a1'], statReplacement: 'heart' }).statReplacement).toBeNull();
    refusedWith(() => validateChoices(MOVE_READING, { abilityIds: ['zz'] }), 'bad-ability');
    refusedWith(() => validateChoices(MOVE_READING, { abilityIds: ['a2'], statReplacement: 'iron' }), 'bad-stat');
  });

  it('a target among the choices — required when there are choices, none allowed when there are not', () => {
    const withTargets = { ...MOVE_READING, targetChoices: { kind: 'track', prompt: 'Which fight?', options: [{ id: 'f1', label: 'A' }, { id: 'f2', label: 'B' }] } };
    expect(validateChoices(withTargets, { targetId: 'f2' }).targetId).toBe('f2');
    refusedWith(() => validateChoices(withTargets, {}), 'no-target');
    refusedWith(() => validateChoices(withTargets, { targetId: 'f9' }), 'bad-target');
    refusedWith(() => validateChoices(MOVE_READING, { targetId: 'f1' }), 'bad-target');
  });

  it('a reading the roll could not use cannot be confirmed; a narrative reading takes no choices', () => {
    refusedWith(() => validateChoices({ ...MOVE_READING, blocked: 'vow-gone' }, {}), 'blocked');
    expect(validateChoices(NARRATIVE_READING, { abilityIds: ['a1'] })).toEqual({ abilityIds: [], statReplacement: null, targetId: null });
  });
});

describe('the round\'s life', () => {
  it('rounds number per session; a malformed stored value is no round', () => {
    const r = open();
    expect(nextRoundNumber(r, 's1')).toBe(2);
    expect(nextRoundNumber(r, 's2')).toBe(1);
    expect(nextRoundNumber(null, 's1')).toBe(1);
    expect(storedRound({ id: 'x' })).toBeNull();
    expect(storedRound(r)).toBe(r);
  });

  it('rolling → upgrading for the offered rollers → narrating → closed', () => {
    let r = confirmEntry(readied(open(), 'pl-1'), { userId: 'pl-1', submissionId: 's-pl-1', choices: {}, now: NOW });
    r = confirmEntry(readied(r, 'pl-2'), { userId: 'pl-2', submissionId: 's-pl-2', choices: {}, now: NOW });
    r = fixActing(beginResolution(r, { resolverId: 'g', resolverClaim: 'c', now: NOW }));
    r = markRolled(r, { userId: 'pl-1', rolled: { resolutionId: 'res-1', cardId: 'card-1', outcome: 'weak_hit' } });
    r = markRecorded(r, { userId: 'pl-1', recordedAt: NOW });
    expect(allSettled(r)).toBe(false);
    r = markRecorded(r, { userId: 'pl-2', recordedAt: NOW, narrationInput: { kind: 'narrative' } });
    expect(allSettled(r)).toBe(true);
    r = beginUpgrades(r, { offers: { 'pl-1': { burn: { momentum: 9, previewOutcome: 'strong_hit' }, improve: null, cardId: 'card-1' } } });
    expect(r.phase).toBe(ROUND_PHASE.UPGRADING);
    refusedWith(() => beginNarration(r), 'upgrading');
    r = decideUpgrade(r, { userId: 'pl-1', decision: 'burn', narrationInput: { kind: 'move', outcome: 'strong_hit' }, now: NOW });
    expect(upgradesSettled(r)).toBe(true);
    expect(r.entries['pl-1'].rolled).toMatchObject({ narrationInput: { outcome: 'strong_hit' }, upgradedBy: 'burn' });
    r = claimNarration(beginNarration(r), { narrationClaim: 'n1', now: NOW });
    refusedWith(() => claimNarration(r, { narrationClaim: 'n2', now: NOW }), 'narrated');
    expect(claimNarration(r, { narrationClaim: 'n2', now: NOW, takeOver: true }).narrationClaim).toBe('n2');
    expect(closeRound(r, { reason: 'resolved', now: NOW })).toMatchObject({ phase: ROUND_PHASE.CLOSED, closeReason: 'resolved' });
  });

  it('nothing offered goes straight to narrating; Keep for the undecided, or for those who left', () => {
    let r = confirmEntry(readied(open(), 'pl-1'), { userId: 'pl-1', submissionId: 's-pl-1', choices: {}, now: NOW });
    r = markRecorded(fixActing(beginResolution(r, { resolverId: 'g', resolverClaim: 'c', now: NOW })), { userId: 'pl-1', recordedAt: NOW });
    expect(beginUpgrades(r, { offers: {} }).phase).toBe(ROUND_PHASE.NARRATING);
    const up = beginUpgrades(r, { offers: { 'pl-1': { burn: {}, improve: null, cardId: 'c' } } });
    expect(keepUndecidedUpgrades(up, { now: NOW, userIds: ['pl-2'] }).entries['pl-1'].upgrade.decided).toBeNull();
    expect(keepUndecidedUpgrades(up, { now: NOW }).entries['pl-1'].upgrade.decided).toBe('keep');
  });

  it('a refused entry is settled, with the narration input of an action with no roll', () => {
    let r = confirmEntry(readied(open(), 'pl-1'), { userId: 'pl-1', submissionId: 's-pl-1', choices: {}, now: NOW });
    r = markRefused(fixActing(beginResolution(r, { resolverId: 'g', resolverClaim: 'c', now: NOW })),
      { userId: 'pl-1', reason: 'The fight ended.', narrationInput: { kind: 'refused' }, recordedAt: NOW });
    expect(r.entries['pl-1']).toMatchObject({ status: ENTRY_STATUS.REFUSED, rolled: { refused: 'The fight ended.' } });
    expect(allSettled(r)).toBe(true);
  });

  it('recovery: recorded entries are never rolled again; one rolled without a record is apart; the rest roll', () => {
    let r = confirmEntry(readied(open(), 'pl-1'), { userId: 'pl-1', submissionId: 's-pl-1', choices: {}, now: NOW });
    r = confirmEntry(readied(r, 'pl-2'), { userId: 'pl-2', submissionId: 's-pl-2', choices: {}, now: NOW });
    r = fixActing(beginResolution(r, { resolverId: 'g', resolverClaim: 'c', now: NOW }));
    r = markRecorded(markRolled(r, { userId: 'pl-1', rolled: { cardId: 'c1' } }), { userId: 'pl-1', recordedAt: NOW });
    expect(recoveryPlan(r)).toEqual({ recorded: ['pl-1'], unrecorded: [], toRoll: ['pl-2'] });
    r = markRolled(r, { userId: 'pl-2', rolled: { cardId: 'c2' } });
    expect(recoveryPlan(r)).toEqual({ recorded: ['pl-1'], unrecorded: ['pl-2'], toRoll: [] });
  });

  it('every transition leaves the round it was given unchanged', () => {
    const r = open();
    const before = JSON.stringify(r);
    submitEntry(r, { userId: 'pl-1', text: 'x', submissionId: 'a', now: NOW });
    passEntry(r, { userId: 'pl-2' });
    beginResolution(r, { resolverId: 'g', resolverClaim: 'c', now: NOW });
    expect(JSON.stringify(r)).toBe(before);
  });
});
