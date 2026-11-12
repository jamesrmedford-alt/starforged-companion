/**
 * STARFORGED COMPANION
 * tests/unit/roundTakeoverNamesItsResolver.test.js
 *
 * Issue #347 AB18 (RETURNING-RESOLVER-FINISHES-ROUND-TOO) — a round left
 * resolving names the GM who began it (`resolverId`), and recoverRound leaves
 * a resolving round alone while "that GM is resolving it". When the resolving
 * GM's page died, the co-GM took the round over without re-stamping
 * `resolverId`; the first GM reloaded — a page load is shorter than a round's
 * narration call — was canonical again (lowest id), read the round as its own
 * and resumed it beside the co-GM's pass still in flight. Both closed the
 * round from their own caches and both ran finishRound's riders: every
 * automatic asset rider was paid twice. Now the takeover re-stamps
 * `resolverId` (round.js takeOverResolution), and so does the GM who claims
 * the narration (claimNarration): the returning GM leaves the round to the
 * co-GM resolving it.
 *
 * Setup: the stored round is what gm-1's dead page left (built with round.js's
 * own transitions: narrating, resolverId gm-1). gm-2 loads and takes it over;
 * while gm-2's narration call is out, gm-1's page loads (a real boot: init →
 * ready → recoverRound("ready")).
 *
 * (Converted from the thirteenth audit's probe
 * tests/probes/batch/returningResolverResumesBesideCoGm.probe.js.)
 */

import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/entities/entityExtractor.js', async (importOriginal) => ({
  ...(await importOriginal()),
  runCombinedDetectionPass: vi.fn(async () => ({ worldJournal: [], entities: [], renames: [] })),
  appendGenerativeTierUpdates: vi.fn(async () => {}),
}));

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude, holdWrites } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import {
  createRound, submitEntry, recordReading, confirmEntry, passEntry, beginResolution, fixActing,
  markRolled, markRecorded, beginUpgrades, claimNarration,
} from '../../src/batch/round.js';

const REPLY = 'The hull groans and holds.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const hoursAgo = (h) => new Date(Date.now() - h * 3_600_000).toISOString();
const NOW = hoursAgo(0.01);

// Kira's asset: "on a hit, take +1 momentum" — an automatic rider, as the
// reading stores it (interpretation.extractedRiders — consequenceRiders.js extractRiders).
const RIDERS = [{ key: 'ace:0', assetName: 'Ace', riders: [{ resource: 'momentum', condition: 'hit', amount: 1, label: '+1 momentum' }] }];
const ABILITY = { key: 'ace:0', assetName: 'Ace', abilityName: 'Steady', text: 'When you Face Danger, on a hit take +1 momentum.', adds: 0, detection: 'structured' };

/** The round as gm-1's page left it: Kira's strong hit rolled and recorded, the narration begun. */
function roundLeftByGm1() {
  const reading = {
    kind: 'move', moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'iron', rationale: 't', mischiefAside: '',
    abilities: [ABILITY], statOptions: [], targetChoices: null, blocked: null, forced: null,
    interpretation: {
      moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'iron', adds: 0, rationale: 't', mischiefApplied: false,
      applicableAbilities: [ABILITY], extractedRiders: RIDERS,
    },
  };
  const narrationInput = {
    kind: 'move', resolutionId: 'res-kira', moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'iron',
    outcome: 'strong_hit', outcomeLabel: 'Strong Hit', isMatch: false, loremasterContext: 'Kira holds.', oracleSeeds: null,
    relevance: { resolvedClass: 'embellishment', entityIds: [], entityTypes: [] },
  };
  let r = createRound({
    id: 'round-7', number: 7, sessionId: 'live-s1', now: NOW,
    participants: [
      { userId: 'pl-1', userName: 'Pat', isGM: false, actorId: 'pc-kira', actorName: 'Kira' },
      { userId: 'pl-2', userName: 'Quinn', isGM: false, actorId: 'pc-ren', actorName: 'Ren' },
    ],
  });
  r = submitEntry(r, { userId: 'pl-1', text: 'I brace against the hull and push through.', submissionId: 'k1', now: NOW });
  r = recordReading(r, { userId: 'pl-1', submissionId: 'k1', reading });
  r = confirmEntry(r, { userId: 'pl-1', submissionId: 'k1', choices: { abilityIds: ['ace:0'] }, now: NOW });
  r = passEntry(r, { userId: 'pl-2' });
  r = beginResolution(r, { resolverId: 'gm-1', now: NOW });
  r = fixActing(r);
  r = markRolled(r, { userId: 'pl-1', rolled: { resolutionId: 'res-kira', cardId: null, moveId: 'face_danger', outcome: 'strong_hit', narrationInput } });
  r = markRecorded(r, { userId: 'pl-1', recordedAt: NOW });
  r = beginUpgrades(r, { offers: {} });
  return claimNarration(r, { narrationClaim: 'claim-of-gm-1s-dead-page', now: NOW });
}

let table = null;
const round = () => table.world.getSetting('batchMode.round');
const momentum = (id) => table.actors.get(id).system.momentum.value;
const roundCards = () => table.cards(f => f.narratorCard && f.roundId === 'round-7');
const roundNarrations = () => table.claude.calls.filter(c => /THIS ROUND/.test(c.userText ?? ''));

/** gm-1 is away (its page died mid-narration); gm-2 and the players are at the table. */
async function tableAfterGm1Died() {
  table = await simulateTable({
    users: [{ ...USERS.GM, active: false }, USERS.GM2, USERS.P1, USERS.P2], boot: false,
    clientSettings: { 'gm-1': { claudeApiKey: 'sk-ant-gina' }, 'gm-2': { claudeApiKey: 'sk-ant-gus' } },
    world: { settings: {
      chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false, autoRecapEnabled: false,
      combatTrackerEnabled: false,
      'batchMode.enabled': true,
      'batchMode.round':   roundLeftByGm1(),
      campaignState: {
        ...CampaignStateSchema, sessionActive: true, sessionActiveStartedAt: hoursAgo(2), currentSessionId: 'live-s1',
        sessionStartedId: 'live-s1', sessionNumber: 6, lastSessionTimestamp: hoursAgo(0.05),
        currentSceneId: 'sc-1', sceneTruths: [],
      },
    } },
  });
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [] } });
  silenceConsoleErrors();
  const claude = scriptClaude(table, { fallback: () => REPLY });
  const narration = claude.hold(call => /THIS ROUND/.test(call.userText ?? ''));
  // gm-2 takes the round over (its recovery finds the resolver gone) and narrates it.
  for (const id of ['gm-2', 'pl-1', 'pl-2']) await table.client(id).boot();
  await narration.arrived;
  return narration;
}

afterEach(async () => { await table?.teardown(); table = null; });

describe('issue #347 AB18 — the GM who began a round reloads while the co-GM narrates it', () => {
  it('control: gm-1 stays away — gm-2 narrates and closes the round, the rider pays once (+1)', async () => {
    const narration = await tableAfterGm1Died();
    const before = momentum('pc-kira');
    expect(round()).toMatchObject({ id: 'round-7', phase: 'narrating' });
    narration.release();
    await table.drain();
    await table.settle();
    expect(roundCards()).toHaveLength(1);
    expect(roundNarrations().map(c => c.client)).toEqual(['gm-2']);
    expect(round()).toMatchObject({ number: 8, phase: 'collecting' });
    expect(momentum('pc-kira')).toBe(before + 1);
  }, 60_000);

  it('gm-1\'s page loads while gm-2\'s narration call is out — the round is still finished once (the rider pays +1, not +2)', async () => {
    const narration = await tableAfterGm1Died();
    const before = momentum('pc-kira');

    await table.join('gm-1');            // a real page load: init → ready → its recovery
    await table.settle();
    // gm-2's call is still out, and the round names gm-2 as its resolver…
    expect(round()).toMatchObject({ id: 'round-7', phase: 'narrating', resolverId: 'gm-2' });
    // …so gm-1, canonical again, leaves it to gm-2: its recovery resumes nothing.
    expect(table.bootLog.some(l => l.client === 'gm-1' && /resuming round 7/.test(l.message))).toBe(false);

    // gm-2's lock release follows its card by a round trip; gm-1's persist of
    // the sidecar gm-2 relayed to it (gm-1 is canonical) is one hop: it lands
    // first. Hold the release until the table is quiet, then let it land.
    const release = holdWrites(table, (w) => w.kind === 'setting' && w.key === `${MODULE_ID}.campaignState`
      && w.client === 'gm-2' && w.value?.pendingMove === false);
    narration.release();
    await release.arrived;
    await table.settle();
    expect(roundCards()).toHaveLength(1);            // gm-2's round card is up
    release.release();
    await table.drain();
    await table.settle();

    expect(roundCards()).toHaveLength(1);
    expect(roundNarrations()).toHaveLength(1);
    expect(round()).toMatchObject({ number: 8, phase: 'collecting' });
    // The round is finished once: Kira's "+1 momentum on a hit" pays once.
    expect({ riderMomentum: momentum('pc-kira') - before, riderSummaries: table.cards(f => f.riderSummary).length })
      .toEqual({ riderMomentum: 1, riderSummaries: 1 });
  }, 60_000);
});
