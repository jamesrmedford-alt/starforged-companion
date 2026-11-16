/**
 * SKEL — PLAN-TITLE-FALSE-MERGE
 *
 * Scenario: the crew's connection "Captain Reyes" has an agenda plan waiting
 * to be decided (secrets.js planNpcAgenda files one for every connection).
 * A miss's price reveals a new enemy; the narration names it "the Captain"
 * (the raider ship's) and decides its plan under DECIDE NOW.
 *
 * Correct: the enemy gets its own threat plan. "Captain" is a title, not
 * Reyes's name — the entity gates the plan matcher says it follows
 * (entityExtractor.js normalizeEntityName: HONORIFIC_PREFIXES, connection.js
 * NAME_TITLE_ROLES) strip it before they compare people's names, so to them
 * "the Captain" is nobody the table knows.
 *
 * Today: secrets.js planIsAbout compares the raw names with
 * nameMatch.personNameMatch, which takes a single word that is the other
 * name's FIRST or last word as "part of the name". "captain" is the first
 * word of "Captain Reyes", so the enemy's decision is merged into Reyes's
 * agenda (applyPlanSideData → activePlanAbout → mergePlanInto): an ally's
 * hidden agenda becomes the raider's truth, wants and escalation, "the
 * Captain" becomes one of Reyes's names, and no plan is filed for the enemy.
 * A `newThreats: ["the Captain"]` entry is dropped the same way.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../../helpers/multiClient.js';
import {
  resetSkeletonTable, gmOf, plansOf, onGm, moveResolution, narrateMoveOn,
} from '../../helpers/skeletonTable.js';
import { withPayThePriceSeed } from '../../../src/moves/resolver.js';
import { normalizeEntityName } from '../../../src/entities/entityExtractor.js';
import { personNameMatch } from '../../../src/entities/nameMatch.js';

const ENEMY_TRUTH = 'SENTINEL: the raider captain is hunting the crew for the bounty on Kira.';

let table;
let restore;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => { restore = await resetSkeletonTable(table); });
afterEach(() => restore?.());

const active = () => plansOf(table).filter(p => p.status === 'active');

/** The agenda plan a connection gets, waiting to be decided. */
async function agendaFor(name) {
  const secrets = await gmOf(table).import('../../src/world/secrets.js');
  return onGm(table, () => secrets.createSkeleton({
    kind: 'npcAgenda', subject: { type: 'name', id: null, name },
    oracleSeeds: ['Their goal: Protect a secret', 'Character Disposition: Friendly'],
    sceneId: 'sc-0', sessionId: 's-1', createdFrom: { trigger: 'connection' },
  }));
}

/** A miss whose price reveals a new enemy; the narration decides it under the name it gives it. */
async function priceRevealsEnemyNamed(subject) {
  table.replies = (call) => {
    const ref = /- id (plan-[\w-]+-enemy):/.exec(call.system ?? '')?.[1];
    return { prose: `${subject} hails the ship.`, sidecar: { newTruths: [], stateChanges: [],
      ...(ref ? { plans: [{ id: ref, subject, truth: ENEMY_TRUTH, wants: 'The bounty.', escalation: ['Their ship closes'] }] } : {}) } };
  };
  await narrateMoveOn(table, moveResolution({ oracleSeeds: withPayThePriceSeed(null, 'face_danger', 'A new enemy is revealed') }));
}

describe('SKEL PLAN-TITLE-FALSE-MERGE — a title is not a person\'s name', () => {
  it('control: the entity gate tells "the Captain" from Captain Reyes (it strips the title first)', () => {
    expect(personNameMatch(normalizeEntityName('the Captain'), normalizeEntityName('Captain Reyes'))).toBeNull();
    expect(personNameMatch(normalizeEntityName('Reyes'), normalizeEntityName('Captain Reyes'))).toBeTruthy();
  });

  it('control: an enemy the narration names "Reyes" IS Captain Reyes — the decision joins their plan', async () => {
    const agenda = await agendaFor('Captain Reyes');
    await priceRevealsEnemyNamed('Reyes');
    expect(active()).toHaveLength(1);
    expect(active()[0]).toMatchObject({ id: agenda.id, truth: ENEMY_TRUTH });
  }, 40_000);

  it('a new enemy the narration calls "the Captain" gets its own plan; Captain Reyes\'s agenda is left alone', async () => {
    const agenda = await agendaFor('Captain Reyes');
    await priceRevealsEnemyNamed('the Captain');

    const reyes = plansOf(table).find(p => p.id === agenda.id);
    // Correct: the ally's agenda is still undecided, under her own name only.
    expect(reyes.truth, 'Captain Reyes\'s agenda took the enemy\'s truth').toBe('');
    expect(reyes.aliases ?? []).not.toContain('the Captain');
    // Correct: the enemy has a threat plan of its own.
    const enemy = active().find(p => p.kind === 'threat');
    expect(enemy, 'the new enemy\'s plan').toBeTruthy();
    expect(enemy.truth).toBe(ENEMY_TRUTH);
  }, 40_000);
});
