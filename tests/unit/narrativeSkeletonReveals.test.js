/**
 * STARFORGED COMPANION
 * tests/unit/narrativeSkeletonReveals.test.js
 *
 * Issue #353 Phase 2 — reveals follow move outcomes, and significant threats
 * get plans. On a simulated table (a keyed GM; Pat plays Kira):
 *   - a narration's sidecar `reveals` marks what its beat showed: a clue, an
 *     escalation step played, an ending — and the next beat is told so;
 *   - a revealed truth becomes a stated fact — the scene's ledger and
 *     confirmed lore, each stamped with the narration — and the oracle rolls
 *     behind it are shown to the table (decided: hidden until revealed);
 *   - the X-Card on that narration undoes the reveal, the lore and the ledger
 *     truth (the narration's id on each);
 *   - a narrated fact wins over a plan (`plans` correction);
 *   - a threat recorded at significant salience gets a plan sharing its page's
 *     id, or links the plan already named for it; an immediate threat's plan
 *     is in play every beat.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import {
  MODULE_ID, resetSkeletonTable, gmOf, plansOf, narrationCallsOf, onGm, moveResolution,
  narrateMoveOn, playXCard, patSpeaks,
} from '../helpers/skeletonTable.js';

const TRUTH = 'The escort is a Keeper drone collecting names for the Pale Choir.';

let table;
let restore;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => { restore = await resetSkeletonTable(table); });
afterEach(() => restore?.());

const lastCall = () => narrationCallsOf(table).at(-1);
const stored = () => table.world.campaignState?.() ?? gmOf(table).run(() => game.settings.get(MODULE_ID, 'campaignState'));

/** A decided plan in this scene, filed as the canonical GM files one. */
async function seedPlan(over = {}) {
  const secrets = await gmOf(table).import('../../src/world/secrets.js');
  return onGm(table, () => secrets.createSkeleton({
    kind: 'threat', subject: { type: 'name', name: 'the escort' }, truth: TRUTH, wants: 'A name the crew carries.',
    escalation: ['It asks again, closer', 'It seals the corridor'], clues: ['A pulse that counts down', 'A Choir sigil on its hull'],
    resolutions: ['Give it a false name'], oracleSeeds: ['Character Role: Scout', 'Character Disposition: Hostile'],
    sceneId: 'sc-1', sessionId: 's-1', ...over,
  }));
}

const revealing = (id, reveal, prose = 'The escort turns.') => () => ({ prose, sidecar: { newTruths: [], stateChanges: [], reveals: [{ id, ...reveal }] } });
const planOf = (id) => plansOf(table).find(p => p.id === id);

describe('issue #353 Phase 2 — what a beat shows of a plan is recorded', () => {
  it('a clue shown and a step played are marked, and the next beat is told', async () => {
    const plan = await seedPlan();
    table.replies = revealing(plan.id, { revealed: ['c1'], advanced: 'e1' });
    await narrateMoveOn(table, moveResolution());
    expect(planOf(plan.id).clues[0].revealed).toBe(true);
    expect(planOf(plan.id).escalation[0].done).toBe(true);

    table.replies = () => ({ prose: 'Silence.', sidecar: { newTruths: [], stateChanges: [] } });
    await narrateMoveOn(table, moveResolution({ outcome: 'weak_hit', outcomeLabel: 'Weak Hit' }));
    expect(lastCall().system).toContain('[c1] A pulse that counts down (shown)');
    expect(lastCall().system).toContain('[e1] It asks again, closer (played)');
  }, 40_000);

  it('the truth revealed becomes a stated fact — the ledger and lore — and the oracle rolls behind it are shown', async () => {
    const plan = await seedPlan();
    table.replies = revealing(plan.id, { revealed: ['truth'] }, 'The drone speaks in the Choir\'s voice.');
    await narrateMoveOn(table, moveResolution({ outcome: 'strong_hit', outcomeLabel: 'Strong Hit' }));

    expect(planOf(plan.id)).toMatchObject({ truthRevealed: true, rollsShown: true });
    const card = table.cards(f => f.narratorCard === true && f.narrationId).at(-1);
    const nid = card.flags[MODULE_ID].narrationId;
    const truth = (stored().sceneTruths ?? []).find(t => t.fact === TRUTH);
    expect(truth, 'the ledger holds it').toBeTruthy();
    expect(truth.narrationId).toBe(nid);
    const { getConfirmedLore } = await gmOf(table).import('../../src/world/worldJournal.js');
    const lore = gmOf(table).run(() => getConfirmedLore(null)).find(e => e.text === TRUTH);
    expect(lore, 'confirmed lore').toBeTruthy();
    expect(lore.narrationId).toBe(nid);
    const rolls = table.cards(f => f.secretRollsCard === true).at(-1);
    expect(rolls?.content).toContain('Character Role: Scout; Character Disposition: Hostile');

    table.replies = () => ({ prose: 'Silence.', sidecar: { newTruths: [], stateChanges: [] } });
    await narrateMoveOn(table, moveResolution({ outcome: 'weak_hit', outcomeLabel: 'Weak Hit' }));
    expect(lastCall().system).toContain('(already revealed — the characters know it)');
  }, 40_000);

  it('the X-Card on the revealing narration undoes the reveal, its lore and its ledger truth', async () => {
    const plan = await seedPlan();
    await patSpeaks(table);
    table.replies = revealing(plan.id, { revealed: ['truth', 'c2'] });
    await narrateMoveOn(table, moveResolution({ outcome: 'strong_hit', outcomeLabel: 'Strong Hit' }));
    expect(planOf(plan.id).truthRevealed).toBe(true);

    await playXCard(table);
    expect(planOf(plan.id)).toMatchObject({ truthRevealed: false, status: 'active' });
    expect(planOf(plan.id).clues[1].revealed).toBe(false);
    const { getConfirmedLore } = await gmOf(table).import('../../src/world/worldJournal.js');
    expect(gmOf(table).run(() => getConfirmedLore(null)).some(e => e.text === TRUTH)).toBe(false);
    expect((stored().sceneTruths ?? []).find(t => t.fact === TRUTH)?.retracted).toBe(true);
  }, 40_000);

  it('a plan whose story ended leaves play', async () => {
    const plan = await seedPlan();
    table.replies = revealing(plan.id, { resolved: true });
    await narrateMoveOn(table, moveResolution({ outcome: 'strong_hit', outcomeLabel: 'Strong Hit' }));
    expect(planOf(plan.id).status).toBe('resolved');
    table.replies = () => ({ prose: 'Silence.', sidecar: { newTruths: [], stateChanges: [] } });
    await narrateMoveOn(table, moveResolution());
    expect(lastCall().system).not.toMatch(/## UNREVEALED/);
  }, 40_000);

  it('a narrated fact wins: the plan is corrected to match what the narration said', async () => {
    const plan = await seedPlan();
    table.replies = () => ({ prose: 'The escort is human after all.', sidecar: { newTruths: [], stateChanges: [],
      plans: [{ id: plan.id, truth: 'The escort is a human pilot wearing a Keeper shell.' }] } });
    await narrateMoveOn(table, moveResolution());
    expect(planOf(plan.id).truth).toBe('The escort is a human pilot wearing a Keeper shell.');
    expect(planOf(plan.id).wants).toBe('A name the crew carries.');
  }, 40_000);

  it('garbage reveals change nothing', async () => {
    const plan = await seedPlan();
    table.replies = () => ({ prose: 'Nothing.', sidecar: { newTruths: [], stateChanges: [],
      reveals: [{ id: plan.id, revealed: ['c9', 'everything'], advanced: 'x1' }, { id: 'sk-nope', revealed: ['truth'] }, 'junk'] } });
    await narrateMoveOn(table, moveResolution());
    expect(planOf(plan.id)).toMatchObject({ truthRevealed: false, status: 'active' });
    expect(planOf(plan.id).clues.every(c => !c.revealed)).toBe(true);
  }, 40_000);
});

describe('issue #353 Phase 2 — a significant threat gets a plan', () => {
  async function capture(threats, narrationId = 'nar-capture') {
    const { routeWorldJournalResults } = await gmOf(table).import('../../src/entities/entityExtractor.js');
    await onGm(table, () => routeWorldJournalResults({ lore: [], threats, factionUpdates: [], locationUpdates: [], stateTransitions: [] },
      game.settings.get(MODULE_ID, 'campaignState'), { narrationId }));
  }

  it('recorded at significant salience: a threat plan sharing the page\'s id, its agenda rolled, its truth left to decide', async () => {
    await capture([{ name: 'The Pale Choir', severity: 'active', summary: 'A cult that harvests names.', salience: 'significant' }]);
    const [plan] = plansOf(table);
    expect(plan).toMatchObject({ kind: 'threat', truth: '', narrationId: 'nar-capture',
      subject: { type: 'threat', name: 'The Pale Choir' } });
    expect(plan.subject.id).toBeTruthy();
    expect(plan.oracleSeeds).toEqual([expect.stringMatching(/^Its agenda — Action \+ Theme: \S.* \/ \S/)]);
  });

  it('below significant (or unrated), none', async () => {
    await resetSkeletonTable(table, { threatSalienceThreshold: 'notable' });
    await capture([
      { name: 'Dock thugs', severity: 'looming', summary: 'Local muscle.', salience: 'notable' },
      { name: 'A strange hum', severity: 'looming', summary: 'Unrated.' },
    ]);
    expect(plansOf(table)).toEqual([]);
  });

  it('a plan already named for it is linked to its page, not doubled', async () => {
    const plan = await seedPlan();
    await capture([{ name: 'The Escort', severity: 'active', summary: 'It hunts names.', salience: 'defining' }]);
    expect(plansOf(table)).toHaveLength(1);
    expect(planOf(plan.id).subject).toMatchObject({ type: 'threat', name: 'the escort' });
    expect(planOf(plan.id).subject.id).toBeTruthy();
  });

  it('an immediate threat\'s plan is in play every beat; a looming one only when named', async () => {
    await seedPlan({ subject: { type: 'name', name: 'The Pale Choir' }, sceneId: 'sc-elsewhere', truth: 'The Choir eats names.' });
    await capture([{ name: 'The Pale Choir', severity: 'immediate', summary: 'Closing in.', salience: 'significant' }]);
    await narrateMoveOn(table, moveResolution({ playerNarration: 'I check the reactor.' }));
    expect(lastCall().system).toContain('The Choir eats names.');
  }, 40_000);
});
