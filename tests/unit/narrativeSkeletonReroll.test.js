/**
 * STARFORGED COMPANION
 * tests/unit/narrativeSkeletonReroll.test.js
 *
 * Issue #353 "Rules for these rolls" — one re-roll when the interpretation
 * says a result contradicts what the story has established. The narrator is
 * the interpretation step (decided: its own sidecar first), so each plan
 * awaiting its decision carries one pre-rolled re-roll (an Action + Theme):
 * DECIDE NOW offers it, the deciding plan names the result it replaced
 * (`rerolled`), and the re-roll is kept with the plan's rolls — once. A
 * correction to a decided plan re-rolls nothing; an unused re-roll is
 * dropped when the plan is decided.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { normaliseSkeleton, applyPlanToSkeleton, normalisePlans } from '../../src/world/skeletons.js';
import { formatUnrevealedBlock } from '../../src/narration/narratorPrompt.js';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import {
  resetSkeletonTable, gmOf, plansOf, narrationCallsOf, onGm, moveResolution, narrateMoveOn,
} from '../helpers/skeletonTable.js';

const REROLL = 'Action + Theme: Betray / Legacy';
const pending = (over = {}) => normaliseSkeleton({ id: 'sk-1', kind: 'threat', subject: { type: 'name', name: 'the escort' },
  oracleSeeds: ['Character Role: Scout', 'Character Disposition: Friendly'], reroll: REROLL, ...over });
const plan = (over = {}) => normalisePlans([{ id: 'sk-1', truth: 'A drone that hunts names.', ...over }])[0];

describe('the one re-roll, pure', () => {
  it('a deciding plan that used it keeps it with its rolls, and spends it', () => {
    const next = applyPlanToSkeleton(pending(), plan({ rerolled: 'Character Disposition: Friendly' }));
    expect(next.oracleSeeds.at(-1)).toBe(`Re-rolled in place of "Character Disposition: Friendly": ${REROLL}`);
    expect(next.oracleSeeds).toHaveLength(3);
    expect(next.reroll).toBe('');
  });

  it('a decision that did not use it drops it; the rolls are unchanged', () => {
    const next = applyPlanToSkeleton(pending(), plan());
    expect(next.reroll).toBe('');
    expect(next.oracleSeeds).toEqual(['Character Role: Scout', 'Character Disposition: Friendly']);
  });

  it('a correction to a decided plan re-rolls nothing; a plan with no re-roll has none to use', () => {
    const decided = applyPlanToSkeleton(pending(), plan());
    const corrected = applyPlanToSkeleton(decided, plan({ truth: 'A human in a drone shell.', rerolled: 'Character Role: Scout' }));
    expect(corrected.oracleSeeds).toEqual(decided.oracleSeeds);
    const none = applyPlanToSkeleton(pending({ reroll: '' }), plan({ rerolled: 'Character Role: Scout' }));
    expect(none.oracleSeeds).toHaveLength(2);
  });

  it('DECIDE NOW offers each subject its re-roll, with the rule', () => {
    const text = formatUnrevealedBlock([pending({ truth: '' })], {
      planRequests: [{ ref: 'plan-n1-enemy', kind: 'threat', label: 'the new enemy this price reveals',
        oracleSeeds: ['Character Role: Pilot'], reroll: 'Action + Theme: Seize / Power' }],
    });
    expect(text).toContain('use its re-roll in');
    expect(text).toContain('"rerolled": "<the result it replaces>"');
    expect(text).toContain('Oracle: Character Role: Pilot. Re-roll: Action + Theme: Seize / Power.');
    expect(text).toContain(`Re-roll: ${REROLL}.`);
  });
});

describe('the one re-roll, on the table', () => {
  let table;
  let restore;
  beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
  afterAll(() => table?.teardown());
  beforeEach(async () => { restore = await resetSkeletonTable(table); });
  afterEach(() => restore?.());

  it('a new enemy\'s request carries its re-roll; the deciding narration\'s use of it is kept with the plan\'s rolls', async () => {
    let shown = null;
    table.replies = (call) => {
      const m = call.system.match(/- id (plan-\S+-enemy): Threat — the new enemy this price reveals\. Oracle: (.*?)\. Re-roll: (Action \+ Theme: [^.]+)\./);
      if (!m) return { prose: 'Something stirs.', sidecar: { newTruths: [], stateChanges: [] } };
      shown = m[3];
      const replaced = m[2].split('; ')[0];
      return { prose: 'A voice answers from the dark.', sidecar: { newTruths: [], stateChanges: [],
        plans: [{ id: m[1], subject: 'the voice', truth: 'A salvage AI that wants the ship.', rerolled: replaced }] } };
    };
    await narrateMoveOn(table, moveResolution({ oracleSeeds: { results: ['Pay the Price: A new enemy is revealed',
      'The new enemy — Character Role: Scout', 'The new enemy — Character Goal: Find a home'], names: [], context: 'face_danger' } }));
    expect(shown, 'the re-roll was offered').toMatch(/^Action \+ Theme: \S/);
    const [filed] = plansOf(table);
    expect(filed.truth).toBe('A salvage AI that wants the ship.');
    expect(filed.oracleSeeds.at(-1)).toBe(`Re-rolled in place of "Character Role: Scout": ${shown}`);
    expect(filed.reroll).toBe('');
  }, 40_000);

  it('a plan filed with its rolls and nothing decided gets its re-roll; a decided one none', async () => {
    const secrets = await gmOf(table).import('../../src/world/secrets.js');
    const undecided = await onGm(table, () => secrets.createSkeleton({ kind: 'mystery', question: 'Which name?',
      subject: { type: 'scene', id: 'sc-1', name: 'the scene' }, oracleSeeds: ['Action + Theme: Seek / Truth'], sceneId: 'sc-1' }));
    expect(undecided.reroll).toMatch(/^Action \+ Theme: \S.* \/ \S/);
    const decided = await onGm(table, () => secrets.createSkeleton({ kind: 'threat', subject: { type: 'name', name: 'the escort' },
      truth: 'A drone.', oracleSeeds: ['Character Role: Scout'], sceneId: 'sc-1' }));
    expect(decided.reroll).toBe('');
    // The next narration in its scene offers the pending plan's re-roll.
    await narrateMoveOn(table, moveResolution());
    expect(narrationCallsOf(table).at(-1).system).toContain(`Re-roll: ${undecided.reroll}.`);
  }, 40_000);
});
