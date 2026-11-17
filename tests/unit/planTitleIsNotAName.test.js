/**
 * STARFORGED COMPANION
 * tests/unit/planTitleIsNotAName.test.js
 *
 * Issue #362 AC12 PLAN-TITLE-FALSE-MERGE. The crew's connection "Captain
 * Reyes" has an agenda plan waiting to be decided (planNpcAgenda files one
 * for every connection). A miss's price reveals a new enemy, and the
 * narration names it "the Captain" (the raider ship's) and decides its plan.
 * secrets.js planIsAbout compared the raw names with personNameMatch, which
 * takes a single word that is the other name's first or last word as "part of
 * the name" — and "captain" is the first word of "Captain Reyes". So the
 * enemy's decision was laid onto Reyes's agenda: an ally's hidden agenda took
 * the raider's truth, "the Captain" became one of her names, and the enemy
 * got no plan. The entity gates the plan matcher follows strip the title
 * before they compare people (entityExtractor.js normalizeEntityName); the
 * plans now do too, and a title alone is nobody's part-name.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import {
  resetSkeletonTable, gmOf, plansOf, onGm, moveResolution, narrateMoveOn,
} from '../helpers/skeletonTable.js';
import { withPayThePriceSeed } from '../../src/moves/resolver.js';
import { normalizeEntityName } from '../../src/entities/entityExtractor.js';
import { personNameMatch } from '../../src/entities/nameMatch.js';
import { planIsAbout } from '../../src/world/secrets.js';

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

/** A narration whose prose introduces an enemy (`newThreats`) and decides nothing. */
async function narrationIntroduces(name) {
  table.replies = () => ({ prose: `${name} watches from the gantry.`, sidecar: { newTruths: [], stateChanges: [], newThreats: [name] } });
  await narrateMoveOn(table, moveResolution({ outcome: 'weak_hit', outcomeLabel: 'Weak Hit' }));
}

describe('issue #362 AC12 — a title is not a person\'s name', () => {
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
    expect(reyes.truth, 'Captain Reyes\'s agenda took the enemy\'s truth').toBe('');
    expect(reyes.aliases ?? []).not.toContain('the Captain');
    const enemy = active().find(p => p.kind === 'threat');
    expect(enemy, 'the new enemy\'s plan').toBeTruthy();
    expect(enemy.truth).toBe(ENEMY_TRUTH);
    expect(enemy.subject.name).toBe('the Captain');
  }, 40_000);

  it('an enemy the prose introduces as "the Captain" is planned beside Captain Reyes\'s agenda', async () => {
    await agendaFor('Captain Reyes');
    await narrationIntroduces('the Captain');
    const threats = active().filter(p => p.kind === 'threat');
    expect(threats.map(p => p.subject.name)).toEqual(['the Captain']);
  }, 40_000);

  it('a PC called by their title ("Captain Ryn") does not make "the Captain" a player character', async () => {
    table.addActor({ id: 'pc-ryn', name: 'Captain Ryn', ownership: { 'pl-1': 3 } });
    await narrationIntroduces('the Captain');
    expect(active().filter(p => p.kind === 'threat').map(p => p.subject.name)).toEqual(['the Captain']);
  }, 40_000);

  it('control: the PC\'s own name is still never planned as an enemy', async () => {
    table.addActor({ id: 'pc-ryn', name: 'Captain Ryn', ownership: { 'pl-1': 3 } });
    await narrationIntroduces('Ryn');
    expect(active().filter(p => p.kind === 'threat')).toEqual([]);
  }, 40_000);
});

describe('planIsAbout — an NPC\'s agenda, titles aside (issue #362 AC12)', () => {
  const agenda = (name) => ({ kind: 'npcAgenda', status: 'active', subject: { type: 'name', id: null, name } });

  it('a title alone is not the titled person', () => {
    expect(planIsAbout(agenda('Captain Reyes'), 'the Captain')).toBe(false);
    expect(planIsAbout(agenda('Captain Reyes'), 'Captain')).toBe(false);
    expect(planIsAbout(agenda('Mara the Captain'), 'the Captain')).toBe(false);
    expect(planIsAbout(agenda('Administrator Lyssa Chen'), 'the Administrator')).toBe(false);
  });

  it('the titled person under either of their names, or the title written another way', () => {
    expect(planIsAbout(agenda('Captain Reyes'), 'Reyes')).toBe(true);
    expect(planIsAbout(agenda('Administrator Lyssa Chen'), 'Lyssa')).toBe(true);
    expect(planIsAbout(agenda('Dr. Chen'), 'Doctor Chen')).toBe(true);
    expect(planIsAbout(agenda('the Captain'), 'The Captain')).toBe(true);
  });

  it('two people who share a title stay two people', () => {
    expect(planIsAbout(agenda('Captain Reyes'), 'Captain Vale')).toBe(false);
  });
});
