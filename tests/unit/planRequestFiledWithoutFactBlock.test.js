/* global expectConsoleError -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/planRequestFiledWithoutFactBlock.test.js
 *
 * Issue #362 AC07 (PLAN-REQUEST-LOST-WITHOUT-SIDECAR): a narration asked to
 * decide a hidden plan (UNREVEALED → DECIDE NOW — a price's new enemy, a
 * vow's swearing scene) whose reply has no readable fact block — cut off
 * inside the fence, malformed, missing — or that is never written (the call
 * fails, the reply has no prose) still files the plan with its oracle rolls
 * alone, for the next narration it is in play for to decide (decisions.md →
 * "The narrative skeleton": "If it decides none, the plan is filed with its
 * rolls alone … keep the raw rolls as the skeleton"). The request was dropped:
 * no plan, and its rolls gone.
 *
 * From the fourteenth audit's probes (nara/planRequestLostWithoutSidecar,
 * narb/planRequestDroppedWithoutFactBlock, fc/planRequestLostOnUnreadSidecar),
 * on a simulated table.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { claudeFault } from '../helpers/faults.js';
import {
  MODULE_ID, NARRATION_MODEL, resetSkeletonTable, gmOf, plansOf, narrationCallsOf, onGm, narrateMoveOn, moveResolution,
} from '../helpers/skeletonTable.js';
import { withPayThePriceSeed } from '../../src/moves/resolver.js';

let table;
let restore;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => { restore = await resetSkeletonTable(table); });
afterEach(() => restore?.());

const isNarration = (call) => call.model === NARRATION_MODEL;
const isFollowup  = (call) => isNarration(call) && /The player invoked the oracle/.test(call.userText ?? '');
const newEnemyMiss = () => moveResolution({ oracleSeeds: withPayThePriceSeed(null, 'face_danger', 'A new enemy is revealed') });
const narrationCards = () => table.cards(f => f.narratorCard === true && f.narrationFallback !== true && typeof f.narrationText === 'string');

/** The one plan filed, undecided, with its Character Role / Goal / Disposition rolls. */
function expectEnemyFiledWithRolls(message = 'the new enemy this price revealed has a plan waiting to be decided') {
  const plans = plansOf(table);
  expect(plans, message).toHaveLength(1);
  expect(plans[0]).toMatchObject({ kind: 'threat', truth: '', status: 'active' });
  expect(plans[0].oracleSeeds.some(s => s.startsWith('Character Role: '))).toBe(true);
  return plans[0];
}

async function narrateNewEnemyPrice(clientId = 'gm-1') {
  const client = table.client(clientId);
  const { narrateOracleFollowup } = await client.import('../../src/narration/narrator.js');
  const work = () => narrateOracleFollowup({
    kind: 'pay_the_price', oracleName: 'Pay the Price', question: '',
    rolledLine: 'd100 = 3 → A new enemy is revealed', speakerActorId: 'pc-kira',
    campaignState: foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')),
  });
  if (clientId === 'gm-1') return onGm(table, work);
  const text = await client.run(work);
  for (let i = 0; i < 3; i += 1) { await table.settle(); await table.drain(); }
  return text;
}

describe('issue #362 AC07 — a move\'s plan request is filed when its narration\'s fact block cannot be read', () => {
  it('control: a readable fact block that decides nothing files the plan with its rolls alone', async () => {
    await narrateMoveOn(table, newEnemyMiss());
    expect(narrationCallsOf(table)[0].system).toMatch(/- id plan-[\w-]+-enemy: Threat — the new enemy this price reveals\. Oracle: Character Role: /);
    expect(narrationCards()).toHaveLength(1);
    expectEnemyFiledWithRolls();
  }, 40_000);

  it('a reply cut off inside its fact block (max_tokens): the prose posts, and the plan is filed with its rolls', async () => {
    table.script.when(isNarration, 'A second shape detaches from the dark.\n```json\n{"newTruths":[{"subject":"the escort","fact":"It carries no mark');
    await narrateMoveOn(table, newEnemyMiss());
    expect(narrationCards().at(-1)?.flags?.[MODULE_ID]?.narrationText).toBe('A second shape detaches from the dark.');
    const plan = expectEnemyFiledWithRolls();
    // Filed through the narration's own side-data: stamped with its card's id.
    expect(plan.narrationId).toBe(narrationCards().at(-1).flags[MODULE_ID].narrationId);
  }, 40_000);

  it('a fact block with one unescaped quote: the narration posts clean, and the plan is filed', async () => {
    table.script.when(isNarration,
      'A second shape detaches from the dark: an escort, waiting.\n'
      + '```json\n{"newTruths":[{"subject":"the escort","fact":"answers to "Warden" on the comm"}],"stateChanges":[]}\n```');
    await narrateMoveOn(table, newEnemyMiss());
    expect(narrationCards()).toHaveLength(1);
    expect(narrationCards()[0].content).not.toContain('newTruths');
    expectEnemyFiledWithRolls();
  }, 40_000);

  it('no fact block at all: the plan is filed, and the next narration is asked to decide it', async () => {
    table.script.when(isNarration, 'A second shape detaches from the dark.');
    await narrateMoveOn(table, newEnemyMiss());
    const plan = expectEnemyFiledWithRolls();

    await narrateMoveOn(table, moveResolution({ outcome: 'weak_hit', outcomeLabel: 'Weak Hit' }));
    expect(narrationCallsOf(table).at(-1).system).toContain(`- id ${plan.id}: Threat — the new enemy this price reveals.`);
  }, 40_000);

  it('a narration that fails outright (Claude overloaded): the fallback card posts, and the plan is filed unstamped', async () => {
    expectConsoleError(/narrateResolution failed/);
    table.script.when(isNarration, claudeFault.overloaded());
    await narrateMoveOn(table, newEnemyMiss());
    expect(table.cards(f => f.narrationFallback === true), 'the "narration unavailable" card').toHaveLength(1);
    const plan = expectEnemyFiledWithRolls();
    expect(plan.narrationId ?? null, 'no card carries the failed narration\'s id').toBeNull();
  }, 40_000);

  it('a reply that is its fact block alone, deciding the plan: nothing of it is recorded, and the plan is filed undecided', async () => {
    table.script.when(isNarration, (call) => {
      const ref = /- id (plan-[\w-]+-enemy):/.exec(call.system ?? '')?.[1];
      return '```json\n' + JSON.stringify({ newTruths: [], stateChanges: [],
        plans: [{ id: ref, subject: 'the escort', truth: 'NEVER-NARRATED: a Keeper drone.' }] }) + '\n```';
    });
    await narrateMoveOn(table, newEnemyMiss());
    expect(table.cards(f => f.narrationFallback === true)).toHaveLength(1);
    expectEnemyFiledWithRolls();
    expect(plansOf(table).map(p => p.truth)).not.toContain('NEVER-NARRATED: a Keeper drone.');
  }, 40_000);
});

describe('issue #362 AC07 — the oracle follow-up and the vow scene file theirs too', () => {
  it('control: an empty fact block files the price\'s new enemy with its rolls alone', async () => {
    const text = await narrateNewEnemyPrice();
    expect(text).toBeTruthy();
    expect(narrationCallsOf(table).at(-1).system).toMatch(/### DECIDE NOW[\s\S]*- id plan-nar-[\w]+-enemy: Threat — the new enemy this price reveals/);
    expectEnemyFiledWithRolls();
  }, 40_000);

  it('a follow-up with prose and no fact block posts, and files the new enemy with its rolls', async () => {
    table.script.when(isFollowup, 'A second engine signature slides out of the debris.');
    expect(await narrateNewEnemyPrice()).toContain('second engine signature');
    expect(table.cards(f => f.oracleNarrationCard === true)).toHaveLength(1);
    expectEnemyFiledWithRolls();
  }, 40_000);

  it('a follow-up whose fact block was cut off files it', async () => {
    table.script.when(isFollowup, 'A second engine signature slides out of the debris.\n```json\n{"newTruths":[{"subject":"the signature","fact":"it is');
    expect(await narrateNewEnemyPrice()).toContain('second engine signature');
    expectEnemyFiledWithRolls();
  }, 40_000);

  it('a follow-up whose call fails files it', async () => {
    expectConsoleError(/narrateOracleFollowup failed/);
    table.script.when(isFollowup, claudeFault.serverError());
    expect(await narrateNewEnemyPrice()).toBeNull();
    expectEnemyFiledWithRolls();
  }, 40_000);

  it('a follow-up narrated on a player\'s own key that fails: the canonical GM files it, by relay', async () => {
    expectConsoleError(/narrateOracleFollowup failed/);
    await table.setClaudeKey('gm-1', '');
    await table.setClaudeKey('pl-1', 'sk-ant-pat');
    table.script.when(isFollowup, claudeFault.serverError());
    expect(await narrateNewEnemyPrice('pl-1')).toBeNull();
    expect(table.claude.calls.filter(isFollowup)).toHaveLength(1);
    expectEnemyFiledWithRolls('the player\'s failed narration\'s request reached the GM\'s plan store');
  }, 40_000);

  it('a vow\'s swearing scene with prose and no fact block files what is behind the vow, with its roll', async () => {
    const isVowScene = (call) => isNarration(call) && /A character is swearing/.test(call.userText ?? '');
    table.script.when(isVowScene, 'Kira lays her palm on the cold iron and says the words.');
    const { narrateAndPostVowSwearing } = await gmOf(table).import('../../src/narration/narrator.js');
    const text = await onGm(table, () => narrateAndPostVowSwearing({
      vow: { name: 'Find the lost ark', rank: 'dangerous', vowId: 'vow-ark-1' },
      campaignState: foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')), speakerActorId: 'pc-kira',
    }));
    expect(text).toContain('cold iron');
    expect(table.cards(f => f.vowSceneCard === true)).toHaveLength(1);
    expect(narrationCallsOf(table).at(-1).system).toMatch(/### DECIDE NOW[\s\S]*- id plan-nar-[\w]+-vow: Vow — what is really behind the vow "Find the lost ark"/);
    const plans = plansOf(table);
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({ kind: 'vow', truth: '', subject: { type: 'vow', id: 'vow-ark-1' } });
  }, 40_000);
});
