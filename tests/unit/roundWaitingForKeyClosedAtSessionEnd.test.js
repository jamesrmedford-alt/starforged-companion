/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/roundWaitingForKeyClosedAtSessionEnd.test.js
 *
 * Issue #347 residual ROUND-WAITS-FOR-ABSENT-KEYED-GM (D3's residual). A GM
 * without a Claude key leaves a narrating Batch Mode round waiting for a GM
 * the keyed-GM registry lists (D3, the maintainer's option A). When that GM
 * did not come back that session, End a Session left the round narrating:
 * nothing was posted, the GMs were not told, and the round closed only at
 * the next load's recovery ("session-ended") — its moves never shown as a
 * round. Now End a Session closes it as a table with no keyed GM does: the
 * round's "narration unavailable" card lists each result, the round closes,
 * and the GMs are told why.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => ({ moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 't', mischiefApplied: false })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/entities/entityExtractor.js', async (importOriginal) => ({
  ...(await importOriginal()),
  runCombinedDetectionPass: vi.fn(async () => ({ worldJournal: [], entities: [], renames: [] })),
  appendGenerativeTierUpdates: vi.fn(async () => {}),
}));
vi.mock('../../src/moves/resolver.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    // a strong hit: nothing to upgrade, the round goes straight to its narration
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.25).mockReturnValueOnce(0.35).mockReturnValueOnce(0.9);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude, failWrites } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import {
  createRound, submitEntry, recordReading, confirmEntry, passEntry, beginResolution, fixActing,
  markRolled, markRecorded, beginUpgrades, claimNarration,
} from '../../src/batch/round.js';

const REPLY = 'The round turns.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';
const hoursAgo = (h) => new Date(Date.now() - h * 3_600_000).toISOString();
const NOW = hoursAgo(0.01);

let table = null;
afterEach(async () => { await table?.teardown(); table = null; });

const round = () => table.world.getSetting('batchMode.round');
const world = () => table.world.campaignState();
const roundCards = (roundId, pred = () => true) => table.cards(f => f.narratorCard && f.roundId === roundId && pred(f));
const roundNarrations = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL && /THIS ROUND/.test(c.userText ?? ''));
const unnarratedNotices = () => table.cards(f => f.batchRoundUnnarratedNotice);

/** End a Session from `userId`'s chat, its dialog answered with no focus. */
async function endSession(userId) {
  const c = table.client(userId);
  c.answerDialogs(d => d.submit({ 'input[name="questFocus"]': '', 'input[name="connectionFocus"]': '' }));
  await c.chat('!end-session');
  await table.settle();
  await table.drain();
}

/** Kira's strong hit rolled and recorded, the narration begun by gm-1's page, which died. */
function roundLeftByGm1() {
  const reading = {
    kind: 'move', moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', rationale: 't', mischiefAside: '',
    abilities: [], statOptions: [], targetChoices: null, blocked: null, forced: null,
    interpretation: { moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 't', mischiefApplied: false, extractedRiders: [] },
  };
  const narrationInput = {
    kind: 'move', resolutionId: 'res-kira', moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge',
    outcome: 'strong_hit', outcomeLabel: 'Strong Hit', isMatch: false, loremasterContext: 'Kira slips through.', oracleSeeds: null,
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
  r = markRolled(r, { userId: 'pl-1', rolled: { resolutionId: 'res-kira', cardId: null, moveId: 'face_danger', outcome: 'strong_hit', narrationInput } });
  r = markRecorded(r, { userId: 'pl-1', recordedAt: NOW });
  r = beginUpgrades(r, { offers: {} });
  return claimNarration(r, { narrationClaim: 'claim-of-gm-1s-dead-page', now: NOW });
}

/** gm-1 (keyed, listed in the registry) is away; gm-2 (keyless) and the players load. */
async function tableWithKeyedGmAway() {
  table = await simulateTable({
    users: [{ ...USERS.GM, active: false }, USERS.GM2, USERS.P1, USERS.P2], boot: false,
    clientSettings: { 'gm-1': { claudeApiKey: 'sk-ant-gina' } },
    world: { settings: {
      chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false, autoRecapEnabled: false,
      combatTrackerEnabled: false,
      keyedGmUserIds: ['gm-1'],
      'batchMode.enabled': true,
      'batchMode.round':   roundLeftByGm1(),
      campaignState: {
        ...CampaignStateSchema, sessionActive: true, sessionActiveStartedAt: hoursAgo(2), currentSessionId: 'live-s1',
        sessionStartedId: 'live-s1', sessionNumber: 3, lastSessionTimestamp: hoursAgo(0.05),
        currentSceneId: 'sc-1', sceneTruths: [],
      },
    } },
  });
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [] } });
  silenceConsoleErrors();
  scriptClaude(table, { fallback: () => REPLY });
  for (const id of ['gm-2', 'pl-1', 'pl-2']) await table.client(id).boot();
  await table.settle();
}

describe('issue #347 ROUND-WAITS-FOR-ABSENT-KEYED-GM — the session ends while a round waits for a GM with a Claude key', () => {
  it('End a Session closes the waiting round: its "narration unavailable" card posts, and the GMs are told', async () => {
    await tableWithKeyedGmAway();
    expect(round()).toMatchObject({ id: 'round-4', phase: 'narrating' });       // waiting (setup)
    expect(table.cards(f => f.batchNarrationWaitsNotice)).toHaveLength(1);

    // control: a change that leaves the session going leaves the round waiting
    await table.client('gm-2').setSetting('campaignState', { ...world(), lastSessionTimestamp: new Date().toISOString() });
    await table.settle();
    await table.drain();
    expect(round()).toMatchObject({ id: 'round-4', phase: 'narrating' });
    expect(roundCards('round-4')).toHaveLength(0);

    await endSession('gm-2');
    expect(world().sessionActive).toBe(false);

    // The round is closed, behind the card a table with no keyed GM gets.
    expect(round()).toMatchObject({ id: 'round-4', phase: 'closed' });
    const cards = roundCards('round-4');
    expect(cards).toHaveLength(1);
    expect(cards[0].flags['starforged-companion']).toMatchObject({ narrationFallback: true, sessionId: 'live-s1', roundNumber: 4 });
    expect(cards[0].content).toMatch(/Kira — Face Danger: Strong Hit — narration unavailable/);
    expect(roundNarrations()).toHaveLength(0);

    // The GMs are told why it closed without its narration — once.
    const told = unnarratedNotices();
    expect(told).toHaveLength(1);
    expect(told[0].content).toMatch(/session ended while round 4 waited for a GM with a Claude key/);
    expect(told[0].whisper.sort()).toEqual(['gm-1', 'gm-2']);

    // The keyed GM's load later finds nothing left to narrate.
    await table.join('gm-1');
    await table.settle();
    await table.drain();
    expect(roundCards('round-4')).toHaveLength(1);
    expect(roundNarrations()).toHaveLength(0);
    expect(unnarratedNotices()).toHaveLength(1);
  }, 60_000);

  it('the world refuses the close\'s first step at End a Session: the GMs are told the round stopped, and the Send now it asks for closes it', async () => {
    await tableWithKeyedGmAway();
    // gm-2's claim of the narration, the first step of the close.
    const refused = failWrites(table, w => w.kind === 'setting' && w.key === `${MODULE_ID}.batchMode.round`
      && w.client === 'gm-2' && w.value?.phase === 'narrating' && w.value?.resolverId === 'gm-2', { times: 1 });
    await endSession('gm-2');
    expect(refused.refused).toBe(1);
    expect(round()).toMatchObject({ id: 'round-4', phase: 'narrating' });
    expect(table.cards(f => f.batchRoundStoppedNotice)).toHaveLength(1);

    const gmRelay = await table.client('gm-2').import('../../src/multiplayer/gmRelay.js');
    const res = await table.client('gm-2').run(() => gmRelay.requestGmAction('batch.sendNow', { roundId: 'round-4' }));
    await table.settle();
    await table.drain();
    expect(res.result).toMatchObject({ ok: true });
    expect(round()).toMatchObject({ id: 'round-4', phase: 'closed' });
    expect(roundCards('round-4', f => f.narrationFallback)).toHaveLength(1);
    expect(unnarratedNotices()).toHaveLength(1);
  }, 60_000);
});

describe('control: the keyed GM narrates the round when the session ends', () => {
  it('a round the keyed GM is narrating is narrated on its key — no fallback, no notice', async () => {
    table = await simulateTable({ users: [USERS.GM, USERS.GM2, USERS.P1, USERS.P2] });
    await table.reset({ world: { settings: {
      chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false, autoRecapEnabled: false,
      combatTrackerEnabled: false,
      campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [] },
    } } });
    await table.setClaudeKey('gm-1', 'sk-ant-gina');     // gm-2 has no key
    table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
    table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [] } });
    const claude = scriptClaude(table, { fallback: () => REPLY });
    silenceConsoleErrors();
    await table.client('gm-1').setSetting('batchMode.enabled', true);
    await table.settle();

    const relay = async (userId, kind, payload) => {
      const c = table.client(userId);
      const gmRelay = await c.import('../../src/multiplayer/gmRelay.js');
      await c.run(() => gmRelay.requestGmAction(kind, payload));
      await table.settle();
    };
    const narration = claude.hold(call => /THIS ROUND/.test(call.userText ?? ''));
    await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I slip through the vent.', submissionId: 'k1' });
    await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'k1', choices: {} });
    await relay('pl-2', 'batch.pass', { roundId: round().id });
    await narration.arrived;
    const roundId = round().id;

    const c = table.client('gm-1');
    c.answerDialogs(d => d.submit({ 'input[name="questFocus"]': '', 'input[name="connectionFocus"]': '' }));
    await c.chat('!end-session');
    await table.settle();
    expect(world().sessionActive).toBe(false);

    narration.release(REPLY);
    await table.settle();
    await table.drain();
    expect(roundCards(roundId, f => !f.narrationFallback)).toHaveLength(1);
    expect(roundCards(roundId, f => f.narrationFallback)).toHaveLength(0);
    expect(unnarratedNotices()).toHaveLength(0);
    expect(round()).toMatchObject({ id: roundId, phase: 'closed' });
  }, 60_000);
});
