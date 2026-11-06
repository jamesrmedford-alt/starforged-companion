/**
 * STARFORGED COMPANION
 * tests/unit/batchDraftKeptAuthorAway.test.js
 *
 * Issue #342 Z31 (UNROLLED-ACTION-TEXT-LOST; the session auditor's probe —
 * SESS-4). "End a Session closes a collecting round and keeps the authors'
 * drafts" (decisions.md, Batch Mode); the help: "each window keeps the text
 * as a draft". The draft came back only through the round setting's change
 * hook on a client connected when the round closed. An author who was not
 * connected then was whispered "Your Round window keeps it as a draft", and
 * their window never got it: nothing at load read a closed round's entry
 * back. The window's hooks now read the stored round at load too
 * (roundWindow.js draftAfterRound): an action a round closed without rolling
 * is its author's draft again when they return — while the closed round is
 * the one stored (the next round, at the next Begin a Session, replaces it;
 * a draft written in this browser is kept until the round takes it anyway).
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.mock('../../src/narration/narrator.js', async (orig) => ({
  ...(await orig()),
  narrateSessionVignette:   vi.fn(async () => null),
  getRollingSessionSummary: vi.fn(async () => null),
  finalizeSessionSummary:   vi.fn(async () => null),
  getCampaignRecap:         vi.fn(async () => ''),
}));

import { simulateTable, USERS } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { createRound, submitEntry } from '../../src/batch/round.js';

const TEXT = 'I slip through the maintenance shaft before the drones turn.';
const now = () => new Date().toISOString();

function seededRound() {
  const r = createRound({
    id: 'round-a', number: 3, sessionId: 'bd-s1', now: now(),
    participants: [{ userId: 'pl-1', userName: 'Pat', isGM: false, actorId: 'pc-kira', actorName: 'Kira' }],
  });
  return submitEntry(r, { userId: 'pl-1', text: TEXT, submissionId: 'sub-1', now: now() });
}

const SESSION = {
  ...CampaignStateSchema, sessionActive: true, sessionActiveStartedAt: now(), currentSessionId: 'bd-s1',
  sessionStartedId: 'bd-s1', sessionNumber: 2, lastSessionTimestamp: now(), currentSceneId: 'sc-1', sceneTruths: [],
};

const WORLD = {
  chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false, combatTrackerEnabled: false,
  'batchMode.enabled': true,
  'batchMode.round':   seededRound(),
  campaignState:       SESSION,
};

let table;
const round = () => table.world.getSetting('batchMode.round');

beforeAll(async () => {
  // Pat submitted earlier; his browser is closed when the session ends.
  table = await simulateTable({ users: [USERS.GM, { ...USERS.P1, active: false }], world: { settings: WORLD } });
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
}, 30_000);
afterAll(() => table?.teardown());

async function gmEndsTheSession() {
  const api = await table.client('gm-1').import('../../src/multiplayer/gmRelay.js');
  await table.client('gm-1').run(() => api.requestGmAction('session.end', { questFocus: '', connectionFocus: '' }));
  await table.settle(); await table.drain();
}

describe('End a Session closes a collecting round while its author is away (issue #342 Z31)', () => {
  it("the author's submitted text comes back as their window's draft when they return", async () => {
    expect(round()).toMatchObject({ id: 'round-a', phase: 'collecting' });   // sanity
    await gmEndsTheSession();
    expect(round()).toMatchObject({ phase: 'closed', closeReason: 'session-ended' });
    // He is told the window keeps it …
    const told = table.cards(f => f.batchRoundClosedNotice);
    expect(told.map(c => c.whisper)).toEqual([['pl-1']]);
    expect(told[0].content).toMatch(/keeps it as a draft/);

    await table.join('pl-1');                       // Pat opens Foundry again
    // … and it must.
    expect(table.client('pl-1').getSetting('batchMode.draft')).toBe(TEXT);
  }, 30_000);

  it('control: the author connected when the round closes — the draft comes back', async () => {
    await table.reset({ world: { settings: { ...WORLD, 'batchMode.round': seededRound() } } });
    table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
    await table.join('pl-1');                       // reset() took him back to his seeded (absent) state
    await table.client('pl-1').setSetting('batchMode.draft', '');
    await gmEndsTheSession();
    expect(round()).toMatchObject({ phase: 'closed', closeReason: 'session-ended' });
    expect(table.client('pl-1').getSetting('batchMode.draft')).toBe(TEXT);
  }, 30_000);
});
