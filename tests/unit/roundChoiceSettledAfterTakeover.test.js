/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/roundChoiceSettledAfterTakeover.test.js
 *
 * CHOICE-UNSETTLED-AFTER-RELOAD (issue #345 AA12's residual). A "choose one
 * (before rolling)" an ability's add decided is settled by whether the
 * confirm kept that ability checked (consequenceRiders.settlePreRollChoices):
 * taken, its option's effects are the outcome's and the others are not
 * offered again. A Batch Mode round finished on a page that did not roll it —
 * after a reload, or by the GM who took the round over — rebuilt its riders
 * from the reading alone (driver.js rolledFor), with no applied-ability keys,
 * so the choice was not settled there and its options were offered again.
 * The rebuilt interpretation is now the one the roll took: the reading's
 * riders and abilities with the abilities the entry's choices checked.
 *
 * Setup (roundTakeoverNamesItsResolver.test.js's): the stored round is what
 * gm-1's dead page left — Kira's strong hit rolled with Gunner's "Pin them
 * down" +1 checked, recorded, the narration begun; gm-2 loads, takes the
 * round over, narrates it and finishes its moves.
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

import { simulateTable, USERS } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import {
  createRound, submitEntry, recordReading, confirmEntry, passEntry, beginResolution, fixActing,
  markRolled, markRecorded, beginUpgrades, claimNarration,
} from '../../src/batch/round.js';

const REPLY = 'Rounds chew the bulkhead.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const hoursAgo = (h) => new Date(Date.now() - h * 3_600_000).toISOString();
const NOW = hoursAgo(0.01);

// Gunner's shape: its "choose one (before rolling)" — Pin them down adds +1.
const GUNNER = {
  key: 'g:0', assetName: 'Gunner', abilityName: '', adds: 1, statReplacement: '', category: 'Module', detection: 'structured',
  text: 'Choose one (before rolling). Pin them down: Add +1 and take +1 momentum on a hit. Make them hurt: Mark progress on a hit.',
  preRollChoice: { option: 'Pin them down', options: ['Pin them down', 'Make them hurt'] },
};
const RIDERS = [{ key: 'g:0', assetName: 'Gunner', abilityName: '', riders: [
  { condition: 'hit', resource: 'momentum', amount: 1, optional: false, choiceGroup: 'gunner', option: 'Pin them down', label: 'Pin them down: +1 momentum' },
  { condition: 'hit', resource: 'progress', amount: 1, optional: false, choiceGroup: 'gunner', option: 'Make them hurt', label: 'Make them hurt: mark progress' },
] }];

/** The round as gm-1's page left it: Kira's strong hit rolled with Gunner's +1 checked, the narration begun. */
function roundLeftByGm1({ abilityIds }) {
  const reading = {
    kind: 'move', moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'iron', rationale: 't', mischiefAside: '',
    abilities: [GUNNER], statOptions: [], targetChoices: null, blocked: null, forced: null,
    interpretation: {
      moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'iron', adds: 0, rationale: 't', mischiefApplied: false,
      applicableAbilities: [GUNNER], extractedRiders: RIDERS,
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
  r = submitEntry(r, { userId: 'pl-1', text: 'I open up on the raiders with Old Reliable.', submissionId: 'k1', now: NOW });
  r = recordReading(r, { userId: 'pl-1', submissionId: 'k1', reading });
  r = confirmEntry(r, { userId: 'pl-1', submissionId: 'k1', choices: { abilityIds }, now: NOW });
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
const riderPrompts = () => table.dialogs.filter(d => String(d.title ?? '').includes('Apply asset effects'));

/** gm-1 is away (its page died mid-narration); gm-2 and the players load, and gm-2 finishes the round. */
async function gm2FinishesTheRound(opts) {
  table = await simulateTable({
    users: [{ ...USERS.GM, active: false }, USERS.GM2, USERS.P1, USERS.P2], boot: false,
    clientSettings: { 'gm-1': { claudeApiKey: 'sk-ant-gina' }, 'gm-2': { claudeApiKey: 'sk-ant-gus' } },
    world: { settings: {
      chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false, autoRecapEnabled: false,
      combatTrackerEnabled: false,
      'batchMode.enabled': true,
      'batchMode.round':   roundLeftByGm1(opts),
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
  scriptClaude(table, { fallback: () => REPLY });
  table.client('gm-2').answerDialogs(d => d.close());   // a choice offered is never answered: closed, it applies nothing
  const before = momentum('pc-kira');
  for (const id of ['gm-2', 'pl-1', 'pl-2']) await table.client(id).boot();
  await table.settle();
  await table.drain();
  expect(round()).toMatchObject({ number: 8, phase: 'collecting' });
  return before;
}

afterEach(async () => { await table?.teardown(); table = null; });

describe("CHOICE-UNSETTLED-AFTER-RELOAD — a round finished on another page settles the confirm's choose-one", () => {
  it("Gunner's +1 (Pin them down) was taken: gm-2 pays Pin them down's +1 momentum, and offers no choice", async () => {
    const before = await gm2FinishesTheRound({ abilityIds: ['g:0'] });
    expect(riderPrompts(), 'no choice offered again').toEqual([]);
    expect(momentum('pc-kira')).toBe(before + 1);
  }, 60_000);

  it("control: Gunner's +1 not taken — Pin them down is neither paid nor offered", async () => {
    const before = await gm2FinishesTheRound({ abilityIds: [] });
    expect(riderPrompts().filter(p => String(p.content ?? '').includes('Pin them down'))).toEqual([]);
    expect(momentum('pc-kira')).toBe(before);
  }, 60_000);
});
