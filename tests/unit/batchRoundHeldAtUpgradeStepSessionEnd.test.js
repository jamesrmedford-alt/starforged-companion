/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/batchRoundHeldAtUpgradeStepSessionEnd.test.js
 *
 * Issue #362 AC57 ROUND-HELD-AT-UPGRADE-STEP-LEFT-OPEN-AT-SESSION-END (an
 * incomplete fix of known-issues ROUND-CLOSED-UNNARRATED-WORDING). A Batch
 * Mode round is rolled and recorded; the X-Card is played during its upgrade
 * step (Burn / Improve / Keep). Every offered roller has decided, so only the
 * X-Card holds the round — issue #345 AA43 holds it at the upgrade step. The
 * GM ends the session.
 *
 * ROUND-CLOSED-UNNARRATED-WORDING: "a round End a Session left while the
 * X-Card was in play … The session ending closes it: the paused notice lists
 * its results, and the GMs are told it closed without its narration". That
 * close saw only a round held in `narrating`; one held at `upgrading` stayed
 * open — every Round window said "The round is being resolved…" — until the
 * next load's recovery closed it unseen, or it blocked the next session's
 * round. Now the session ending takes a decided round from its upgrade step
 * to the narrating phase, whose close under the X-Card posts the paused
 * notice and tells the GMs; nothing is narrated.
 *
 * Booted GM + two-player table (tests/helpers/multiClient.js), from the
 * audit's probe (tests/probes/batch/roundHeldByXCardAtUpgradeStepSessionEnd.probe.js).
 */

import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('../../src/entities/entityExtractor.js', async (importOriginal) => ({
  ...(await importOriginal()),
  runCombinedDetectionPass: vi.fn(async () => ({ worldJournal: [], entities: [], renames: [] })),
  appendGenerativeTierUpdates: vi.fn(async () => {}),
}));

import { simulateTable, USERS } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import {
  createRound, submitEntry, recordReading, confirmEntry, passEntry, beginResolution, fixActing,
  markRolled, markRecorded, beginUpgrades, decideUpgrade, beginNarration, upgradesSettled,
} from '../../src/batch/round.js';

const REPLY = 'The round turns.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const NARRATION_MODEL = 'claude-sonnet-5-5';
const hoursAgo = (h) => new Date(Date.now() - h * 3_600_000).toISOString();
const NOW = hoursAgo(0.01);

let table = null;
afterEach(async () => { await table?.teardown(); table = null; });

const round = () => table.world.getSetting('batchMode.round');
const world = () => table.world.campaignState();
const roundCards = (pred = () => true) => table.cards(f => f.roundId === 'round-4' && pred(f));
const roundNarrations = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL && /THIS ROUND/.test(c.userText ?? ''));
const unnarratedNotices = () => table.cards(f => f.batchRoundUnnarratedNotice);

async function endSession(userId) {
  const c = table.client(userId);
  c.answerDialogs(d => d.submit({ 'input[name="questFocus"]': '', 'input[name="connectionFocus"]': '' }));
  await c.chat('!end-session');
  await table.settle();
  await table.drain();
}

/** Kira's weak hit rolled and recorded, its Burn offered and answered Keep: the upgrade step, all decided. */
function decidedRound({ narrating = false } = {}) {
  const reading = {
    kind: 'move', moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', rationale: 't', mischiefAside: '',
    abilities: [], statOptions: [], targetChoices: null, blocked: null, forced: null,
    interpretation: { moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 't', mischiefApplied: false, extractedRiders: [] },
  };
  const narrationInput = {
    kind: 'move', resolutionId: 'res-kira', moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge',
    outcome: 'weak_hit', outcomeLabel: 'Weak Hit', isMatch: false, loremasterContext: 'Kira slips through, at a cost.', oracleSeeds: null,
    relevance: { resolvedClass: 'embellishment', entityIds: [], entityTypes: [] },
  };
  let r = createRound({
    id: 'round-4', number: 4, sessionId: 'live-s1', now: NOW,
    participants: [
      { userId: 'pl-1', userName: 'Pat', isGM: false, actorId: 'pc-kira', actorName: 'Kira' },
      { userId: 'pl-2', userName: 'Quinn', isGM: false, actorId: 'pc-ren', actorName: 'Ren' },
    ],
  });
  r = submitEntry(r, { userId: 'pl-1', text: 'I slip through the vent.', submissionId: 'k1', now: NOW });
  r = recordReading(r, { userId: 'pl-1', submissionId: 'k1', reading });
  r = confirmEntry(r, { userId: 'pl-1', submissionId: 'k1', choices: {}, now: NOW });
  r = passEntry(r, { userId: 'pl-2' });
  r = beginResolution(r, { resolverId: 'gm-1', now: NOW });
  r = fixActing(r);
  r = markRolled(r, { userId: 'pl-1', rolled: { resolutionId: 'res-kira', cardId: null, moveId: 'face_danger', outcome: 'weak_hit', narrationInput } });
  r = markRecorded(r, { userId: 'pl-1', recordedAt: NOW });
  r = beginUpgrades(r, { offers: { 'pl-1': { burn: { momentum: 9, previewOutcome: 'strong_hit' }, improve: null, cardId: 'card-gone' } } });
  r = decideUpgrade(r, { userId: 'pl-1', decision: 'keep', now: NOW });
  return narrating ? beginNarration(r) : r;
}

async function bootTable({ narrating = false } = {}) {
  const stored = decidedRound({ narrating });
  expect(upgradesSettled(stored)).toBe(true);
  table = await simulateTable({
    users: [USERS.GM, USERS.P1, USERS.P2], boot: false,
    clientSettings: { 'gm-1': { claudeApiKey: 'sk-ant-gina' } },
    world: { settings: {
      chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false, autoRecapEnabled: false,
      combatTrackerEnabled: false,
      keyedGmUserIds: ['gm-1'],
      'batchMode.enabled': true,
      'batchMode.round':   stored,
      campaignState: {
        ...CampaignStateSchema, sessionActive: true, sessionActiveStartedAt: hoursAgo(2), currentSessionId: 'live-s1',
        sessionStartedId: 'live-s1', sessionNumber: 3, lastSessionTimestamp: hoursAgo(0.05),
        currentSceneId: 'sc-1', sceneTruths: [], xCardActive: true, xCardPlays: 1,
      },
    } },
  });
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [] } });
  silenceConsoleErrors();
  scriptClaude(table, { fallback: () => REPLY });
  for (const u of [USERS.GM, USERS.P1, USERS.P2]) await table.client(u.id).boot();
  await table.settle();
  await table.drain();
}

describe('BATCH — a round the X-Card holds when the session ends', () => {
  it('held at the upgrade step (every roller decided): End a Session closes it, its results listed and the GMs told', async () => {
    await bootTable();
    // Setup: while the session lasts, the X-Card holds it at the upgrade step (AA43).
    expect(round()).toMatchObject({ id: 'round-4', phase: 'upgrading' });
    expect(roundCards()).toHaveLength(0);

    await endSession('gm-1');
    expect(world().sessionActive, 'setup: the session ended').toBe(false);
    expect(roundNarrations(), 'nothing is narrated under the X-Card').toHaveLength(0);

    // Not left "upgrading" — no card, nobody told (AC57).
    expect(round()).toMatchObject({ id: 'round-4', phase: 'closed' });
    const paused = roundCards(f => f.narrationPaused);
    expect(paused).toHaveLength(1);
    expect(paused[0].content).toMatch(/Kira — Face Danger: Weak Hit/);
    expect(unnarratedNotices()).toHaveLength(1);
  }, 60_000);

  it('control: held in the narrating phase, End a Session closes it (ROUND-CLOSED-UNNARRATED-WORDING)', async () => {
    await bootTable({ narrating: true });
    expect(round()).toMatchObject({ id: 'round-4', phase: 'narrating' });
    await endSession('gm-1');
    expect(world().sessionActive).toBe(false);
    expect(round()).toMatchObject({ id: 'round-4', phase: 'closed' });
    expect(roundCards(f => f.narrationPaused)).toHaveLength(1);
    expect(unnarratedNotices()).toHaveLength(1);
  }, 60_000);
});

describe('issue #362 AC57 — control: while the session lasts, the X-Card still holds a decided round at its upgrade step', () => {
  it('a campaignState write that is not the session ending leaves it upgrading, unnarrated', async () => {
    await bootTable();
    expect(round()).toMatchObject({ id: 'round-4', phase: 'upgrading' });
    await table.client('gm-1').setSetting('campaignState', { ...world(), updatedAt: new Date().toISOString() });
    await table.settle(); await table.drain();
    expect(round()).toMatchObject({ id: 'round-4', phase: 'upgrading' });
    expect(roundCards()).toHaveLength(0);
    expect(unnarratedNotices()).toHaveLength(0);
  }, 60_000);
});
