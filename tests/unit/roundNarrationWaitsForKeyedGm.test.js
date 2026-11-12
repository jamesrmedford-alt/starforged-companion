/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/roundNarrationWaitsForKeyedGm.test.js
 *
 * Issue #347 D3 (KEYLESS-TAKEOVER-NARRATES-FALLBACK) — the maintainer's
 * option A: a takeover by a GM without a Claude key leaves the round waiting
 * for a keyed GM, as the readings and Send now already do.
 *
 * The driver kept a round's readings for a GM with a key (startReading: "with
 * no key here the entry waits"; requestSendNow refuses "no-key") but not its
 * narration. When the keyed GM resolving a round reloaded, the keyless co-GM
 * was canonical for those seconds, took the round over and narrated it at
 * once: narrateRound had no key, posted the "narration unavailable" fallback,
 * and the round closed — its moves never narrated, though the keyed GM was
 * back within a page load. Now a keyless GM leaves a narrating round alone
 * while the keyed-GM registry lists a GM with a key (handed back when it
 * names this GM, the GMs told once; its Send now is refused, saying why) and
 * the keyed GM's own recovery narrates it. A table with no keyed GM at all
 * still gets the fallback (issue #345 D1).
 *
 * (The first two tests are converted from the thirteenth audit's probe
 * tests/probes/batch/keylessCoGmTakeoverNarratesFallback.probe.js.)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

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
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import {
  createRound, submitEntry, recordReading, confirmEntry, passEntry, beginResolution, fixActing,
  markRolled, markRecorded, beginUpgrades, claimNarration,
} from '../../src/batch/round.js';

const REPLY = 'The round turns.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const NARRATION_MODEL = 'claude-sonnet-5-5';
const WAITS = /round waits for a GM with a Claude key/;

describe('issue #347 D3 — the keyed GM reloads while narrating a round; the co-GM has no Claude key', () => {
  let table;
  let claude;
  const round = () => table.world.getSetting('batchMode.round');
  const roundCards = (pred = () => true) => table.cards(f => f.narratorCard && f.roundId && pred(f));

  beforeAll(async () => {
    table = await simulateTable({ users: [USERS.GM, USERS.GM2, USERS.P1, USERS.P2] });
  }, 30_000);
  afterAll(() => table?.teardown());

  beforeEach(async () => {
    await table.reset({ world: { settings: {
      chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
      campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [] },
    } } });
    await table.setClaudeKey('gm-1', 'sk-ant-gina');     // gm-2 (an assistant GM) has no key
    table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
    table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [] } });
    claude = scriptClaude(table, { fallback: () => REPLY });
    silenceConsoleErrors();
    await table.client('gm-1').setSetting('batchMode.enabled', true);
    await table.settle();
  });

  async function relay(userId, kind, payload) {
    const c = table.client(userId);
    const gmRelay = await c.import('../../src/multiplayer/gmRelay.js');
    const res = await c.run(() => gmRelay.requestGmAction(kind, payload));
    await table.settle();
    return res;
  }

  async function kiraActsRenPasses() {
    await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I slip through the vent.', submissionId: 'k1' });
    await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'k1', choices: {} });
    await relay('pl-2', 'batch.pass', { roundId: round().id });
  }

  it('control: the keyed GM stays — the round is narrated on its key and closes', async () => {
    await kiraActsRenPasses();
    await table.drain();
    expect(roundCards(f => !f.narrationFallback)).toHaveLength(1);
    expect(roundCards(f => f.narrationFallback)).toHaveLength(0);
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
  }, 30_000);

  it('the keyed GM\'s page goes away mid-narration — the keyless co-GM leaves the round waiting, and the GMs are told', async () => {
    const narration = claude.hold(call => /THIS ROUND/.test(call.userText ?? ''));
    await kiraActsRenPasses();
    await narration.arrived;
    expect(round()).toMatchObject({ number: 1, phase: 'narrating', resolverId: 'gm-1' });
    const roundId = round().id;

    await table.leave('gm-1');           // the keyed GM presses F5
    await table.settle();

    const fallbacks = table.cards(f => f.narratorCard && f.roundId === roundId && f.narrationFallback).length;
    const stored = round();
    // The round is still this one, waiting to be narrated by a GM who can.
    expect({ fallbackCards: fallbacks, round: stored.id === roundId ? stored.phase : `closed — round ${stored.number} open` })
      .toEqual({ fallbackCards: 0, round: 'narrating' });
    // gm-2 did not take it over, and told the GMs why it waits — once.
    expect(stored.resolverId).not.toBe('gm-2');
    expect(table.cards(f => f.batchNarrationWaitsNotice)).toHaveLength(1);
    expect(table.cards(f => f.batchNarrationWaitsNotice)[0].content).toMatch(WAITS);
    narration.fail();
    await table.settle();
    await table.join('gm-1');
  }, 30_000);
});

describe('issue #347 D3 — a round left narrating by the keyed GM\'s dead page', () => {
  const hoursAgo = (h) => new Date(Date.now() - h * 3_600_000).toISOString();
  const NOW = hoursAgo(0.01);
  let table = null;
  const round = () => table.world.getSetting('batchMode.round');
  const roundCards = (pred = () => true) => table.cards(f => f.narratorCard && f.roundId === 'round-4' && pred(f));
  const roundNarrations = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL && /THIS ROUND/.test(c.userText ?? ''));

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

  /** gm-1 (keyed) is away; gm-2 (keyless) and the players load. */
  async function tableWithGm1Away({ keyedRegistry }) {
    table = await simulateTable({
      users: [{ ...USERS.GM, active: false }, USERS.GM2, USERS.P1, USERS.P2], boot: false,
      clientSettings: { 'gm-1': { claudeApiKey: 'sk-ant-gina' } },
      world: { settings: {
        chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false, autoRecapEnabled: false,
        combatTrackerEnabled: false,
        keyedGmUserIds: keyedRegistry,
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

  afterEach(async () => { await table?.teardown(); table = null; });

  it('the keyless co-GM waits, refuses its own Send now, and the keyed GM narrates the round once its page loads', async () => {
    await tableWithGm1Away({ keyedRegistry: ['gm-1'] });

    // gm-2 is canonical, has no key, and leaves the round waiting.
    expect(round()).toMatchObject({ id: 'round-4', phase: 'narrating' });
    expect(roundCards()).toHaveLength(0);
    expect(table.cards(f => f.batchNarrationWaitsNotice)).toHaveLength(1);

    // gm-2's Send now changes nothing, and says why.
    const gmRelay = await table.client('gm-2').import('../../src/multiplayer/gmRelay.js');
    const res = await table.client('gm-2').run(() => gmRelay.requestGmAction('batch.sendNow', { roundId: 'round-4' }));
    await table.settle();
    expect(res.result).toMatchObject({ ok: false, reason: 'narration-no-key' });
    expect(table.client('gm-2').notifications.some(n => /narration needs a GM with a Claude key/.test(n.message))).toBe(true);
    expect(round()).toMatchObject({ id: 'round-4', phase: 'narrating' });
    expect(roundCards()).toHaveLength(0);

    // gm-1's page loads (init → ready → its recovery): the round is narrated on its key.
    await table.join('gm-1');
    await table.settle();
    await table.drain();
    expect(roundCards(f => !f.narrationFallback)).toHaveLength(1);
    expect(roundCards(f => f.narrationFallback)).toHaveLength(0);
    expect(roundNarrations().map(c => c.client)).toEqual(['gm-1']);
    expect(round()).toMatchObject({ number: 5, phase: 'collecting' });
  }, 60_000);

  it('control: a table with no keyed GM at all — the keyless GM\'s round falls back to "narration unavailable" (issue #345 D1)', async () => {
    await tableWithGm1Away({ keyedRegistry: [] });
    await table.drain();
    expect(roundCards(f => f.narrationFallback)).toHaveLength(1);
    expect(table.cards(f => f.batchNarrationWaitsNotice)).toHaveLength(0);
    expect(round()).toMatchObject({ number: 5, phase: 'collecting' });
  }, 60_000);
});
