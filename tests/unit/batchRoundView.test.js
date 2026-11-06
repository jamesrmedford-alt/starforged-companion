/**
 * STARFORGED COMPANION
 * tests/unit/batchRoundView.test.js
 *
 * Issue #340 — what each viewer's Round window shows (src/batch/roundView.js),
 * pure. A player's own entry is editable until the round resolves; other
 * players' entries appear once Ready, with their text; nothing appears for a
 * player who passed or hasn't acted (opting out is silent); a GM sees every
 * reading, who the round waits for, Send now and Discard; Send now is
 * disabled under the X-Card, with the reason.
 */

import { describe, it, expect } from 'vitest';
import { buildRoundView, ROUND_NOTICES } from '../../src/batch/roundView.js';
import {
  READING_KIND, createRound, submitEntry, recordReading, confirmEntry, passEntry,
  beginResolution, fixActing, markRolled, markRecorded, beginUpgrades, readingFailed, ENTRY_ERROR,
} from '../../src/batch/round.js';

const NOW = '2026-11-06T10:00:00.000Z';
const PARTICIPANTS = [
  { userId: 'pl-1', userName: 'Pat', actorId: 'pc-kira', actorName: 'Kira' },
  { userId: 'pl-2', userName: 'Quinn', actorId: 'pc-ren', actorName: 'Ren' },
  { userId: 'pl-3', userName: 'Rook', actorId: 'pc-ash', actorName: 'Ash' },
];
const MOVE = { kind: READING_KIND.MOVE, moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', rationale: 'risky', abilities: [], statOptions: [], targetChoices: null };
const CTX = { enabled: true, sessionActive: true, xCardActive: false, gmConnected: true, keyedGm: true, connectedUserIds: ['gm-1', 'pl-1', 'pl-2', 'pl-3'] };

function round() {
  let r = createRound({ id: 'r1', number: 3, sessionId: 's', now: NOW, participants: PARTICIPANTS });
  r = submitEntry(r, { userId: 'pl-1', text: 'I slip through the vent.', submissionId: 'a', now: NOW });
  r = recordReading(r, { userId: 'pl-1', submissionId: 'a', reading: MOVE });
  r = confirmEntry(r, { userId: 'pl-1', submissionId: 'a', choices: {}, now: NOW });
  r = submitEntry(r, { userId: 'pl-2', text: 'A draft-ish line Ren submitted but has not confirmed.', submissionId: 'b', now: NOW });
  r = recordReading(r, { userId: 'pl-2', submissionId: 'b', reading: MOVE });
  r = passEntry(r, { userId: 'pl-3' });
  return r;
}

const view = (r, userId, isGM = false, ctx = CTX) => buildRoundView(r, { userId, isGM }, ctx);

describe('a player\'s own entry', () => {
  it('is theirs to edit while the round collects, with its status', () => {
    const own = view(round(), 'pl-2').own;
    expect(own).toMatchObject({ actorName: 'Ren', status: 'read', statusLabel: 'To confirm', canEdit: true, canConfirm: true, canWithdraw: true });
    expect(own.reading).toMatchObject({ kind: 'move', moveName: 'Face Danger' });
    expect(view(round(), 'pl-1').own).toMatchObject({ statusLabel: 'Ready', canConfirm: false, canEdit: true });
    expect(view(round(), 'pl-3').own).toMatchObject({ statusLabel: 'Passed', canPass: false, canSubmit: true });
  });

  it('a reading that failed says try again; an entry whose character is gone says so — to its player and the GM (issue #342 Z35)', () => {
    let r = submitEntry(round(), { userId: 'pl-3', text: 'I cover the rear.', submissionId: 'c', now: NOW });
    r = readingFailed(r, { userId: 'pl-3', submissionId: 'c', error: 'HTTP 529' });
    expect(view(r, 'pl-3').own.error).toBe(ROUND_NOTICES.readFailed);
    r = submitEntry(r, { userId: 'pl-3', text: 'I cover the rear, again.', submissionId: 'd', now: NOW });
    r = readingFailed(r, { userId: 'pl-3', submissionId: 'd', error: ENTRY_ERROR.CHARACTER_GONE });
    expect(view(r, 'pl-3').own.error).toBe(ROUND_NOTICES.characterGone);
    expect(view(r, 'gm-1', true).gm.entries.find(e => e.userId === 'pl-3').error).toBe(ROUND_NOTICES.characterGone);
  });

  it('locks once the round resolves', () => {
    const resolving = fixActing(beginResolution(round(), { resolverId: 'gm-1', now: NOW }));
    const own = view(resolving, 'pl-1').own;
    expect(own).toMatchObject({ canEdit: false, canSubmit: false, canConfirm: false, canWithdraw: false });
    expect(view(resolving, 'pl-1').banners.map(b => b.text)).toContain(ROUND_NOTICES.resolving);
  });

  it('shows Deciding upgrade with the Burn / Improve / Keep offer while the round waits for it', () => {
    let r = fixActing(beginResolution(round(), { resolverId: 'gm-1', now: NOW }));
    r = markRecorded(markRolled(r, { userId: 'pl-1', rolled: { cardId: 'card-1', moveId: 'face_danger', outcome: 'weak_hit' } }), { userId: 'pl-1', recordedAt: NOW });
    r = beginUpgrades(r, { offers: { 'pl-1': { burn: { momentum: 9, previewOutcome: 'strong_hit' }, improve: null, cardId: 'card-1' } } });
    const own = view(r, 'pl-1').own;
    expect(own.statusLabel).toBe('Deciding upgrade');
    expect(own.upgrade).toMatchObject({ cardId: 'card-1', burn: { momentum: 9, outcome: 'Strong Hit' }, improve: null });
  });
});

describe('the other players\' entries', () => {
  it('appear once Ready, with their text — never an unconfirmed reading, a pass, or a waiting entry', () => {
    const p3 = view(round(), 'pl-3');
    expect(p3.table).toEqual([{ userId: 'pl-1', actorName: 'Kira', text: 'I slip through the vent.', moveName: 'Face Danger' }]);
    const p1 = view(round(), 'pl-1');
    expect(p1.table).toEqual([]);   // Ren's is not confirmed; Ash passed
    expect(JSON.stringify(p1)).not.toMatch(/Ash|Rook|draft-ish/);
  });

  it('a player who passed is named nowhere in anyone else\'s window', () => {
    for (const viewer of ['pl-1', 'pl-2']) {
      expect(JSON.stringify(view(round(), viewer))).not.toMatch(/\bAsh\b|Rook/);
    }
  });
});

describe('a GM\'s window', () => {
  it('adds every entry\'s reading, who the round still waits for, Send now and Discard', () => {
    const gm = view(round(), 'gm-1', true).gm;
    expect(gm.entries.map(e => [e.actorName, e.status])).toEqual([['Kira', 'ready'], ['Ren', 'read']]);
    expect(gm.waitingFor).toEqual(['Ren']);
    expect(gm.sendNow).toMatchObject({ enabled: true, reason: null });
    expect(gm.discard.enabled).toBe(true);
    expect(view(round(), 'pl-1').gm).toBeNull();
  });

  it('waits for no one who disconnected; a GM with no character has no entry of their own', () => {
    const v = view(round(), 'gm-1', true, { ...CTX, connectedUserIds: ['gm-1', 'pl-1'] });
    expect(v.gm.waitingFor).toEqual([]);
    expect(v.own).toBeNull();
  });

  it('Send now is disabled under the X-Card, with the reason; collecting continues', () => {
    const v = view(round(), 'gm-1', true, { ...CTX, xCardActive: true });
    expect(v.gm.sendNow).toEqual(expect.objectContaining({ enabled: false, reason: ROUND_NOTICES.xCard }));
    expect(v.mode).toBe('collecting');
    expect(view(round(), 'pl-2', false, { ...CTX, xCardActive: true }).banners.map(b => b.text)).toContain(ROUND_NOTICES.xCard);
  });
});

describe('the banners', () => {
  it('say why the round can\'t go on: no session, no GM, no keyed GM', () => {
    expect(view(null, 'pl-1', false, { ...CTX, sessionActive: false })).toMatchObject({ mode: 'no-session', banners: [{ text: ROUND_NOTICES.noSession }] });
    expect(view(round(), 'pl-1', false, { ...CTX, gmConnected: false }).banners.map(b => b.text)).toContain(ROUND_NOTICES.noGm);
    expect(view(round(), 'pl-1', false, { ...CTX, keyedGm: false }).banners.map(b => b.text)).toContain(ROUND_NOTICES.noKeyedGm);
    expect(view(round(), 'pl-1', false, { ...CTX, enabled: false }).mode).toBe('off');
  });

  it('a submission the round never showed is offered again', () => {
    expect(buildRoundView(round(), { userId: 'pl-2' }, { ...CTX, notReceived: true }).own.notReceived).toBe(true);
  });
});
