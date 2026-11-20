/**
 * STARFORGED COMPANION
 * tests/unit/planRollsCardGoesWithItsPlan.test.js
 *
 * Issue #364 TAKEN-BACK-PLAN-ROLLS-CARD-STAYS. A hidden plan's oracle rolls
 * are shown to the table on a card, "The oracle, behind the scenes": when the
 * plan is made, with "Show hidden oracle rolls" on, or when a narration
 * reveals its truth. Nothing read that card afterwards:
 *   (i)  a plan taken back — the X-Card on the narration that made it, a Burn
 *        Momentum / Improve Result that superseded it, a reverted price, a GM
 *        deleting its page — left the card in chat, showing the rolls of a
 *        plan that no longer exists;
 *   (ii) a reveal taken back un-shows the plan's rolls, so the next reveal
 *        posted a second rolls card while the first still stood.
 * The card is now withdrawn — struck, with a line saying why, and flagged
 * `rollsWithdrawn` — with the plan (the canonical GM's page hook, secrets.js)
 * and with the reveal that showed it (worldJournal.js undoNarrationEntries).
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import {
  MODULE_ID, makeJournal, resetSkeletonTable, gmOf, plansOf, onGm, moveResolution, narrateMoveOn, playXCard, patSpeaks,
} from '../helpers/skeletonTable.js';
import { withPayThePriceSeed } from '../../src/moves/resolver.js';

const TRUTH = 'The escort is a Keeper drone collecting names for the Pale Choir.';

let table;
let restore;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
afterEach(() => restore?.());

/**
 * As Foundry does: a journal page deleted — by an undo, or by a GM in the
 * sidebar — fires `deleteJournalEntryPage` (the harness's pages fire nothing).
 */
function pagesFireTheirDeleteHook() {
  const create = globalThis.JournalEntry.create;
  globalThis.JournalEntry.create = async (data) => {
    const journal = await create(data);
    const make = journal.createEmbeddedDocuments.bind(journal);
    journal.createEmbeddedDocuments = async (type, list) => {
      const pages = await make(type, list);
      for (const page of pages) {
        const remove = page.delete.bind(page);
        page.delete = async () => {
          const gone = await remove();
          table.fireDocumentHook('gm-1', 'deleteJournalEntryPage', page);
          return gone;
        };
      }
      return pages;
    };
    return journal;
  };
}

async function reset(settings = {}) {
  restore = await resetSkeletonTable(table, settings);
  pagesFireTheirDeleteHook();
}

const rollsCards = () => table.cards(f => f.secretRollsCard === true);
const standing = () => rollsCards().filter(m => !m.flags[MODULE_ID].rollsWithdrawn);
const withdrawn = () => rollsCards().filter(m => m.flags[MODULE_ID].rollsWithdrawn);
const planOf = (id) => plansOf(table).find(p => p.id === id);
const plain = () => ({ prose: 'Silence.', sidecar: { newTruths: [], stateChanges: [] } });
const lastNarrationId = () => table.cards(f => f.narratorCard === true && f.narrationId).at(-1).flags[MODULE_ID].narrationId;
const secretsJournal = () => gmOf(table).run(() => game.journal.find(j => j.flags?.[MODULE_ID]?.worldJournalCategory === 'secrets'));
const pageOf = (planId) => secretsJournal().pages.contents.find(p => p.flags?.[MODULE_ID]?.secretEntry?.id === planId);

/** A price reveals a new enemy: its plan is filed by the move's narration, and — the setting on — its rolls shown at once. */
async function priceRevealsAnEnemy(over = {}) {
  await narrateMoveOn(table, moveResolution({ oracleSeeds: withPayThePriceSeed(null, 'face_danger', 'A new enemy is revealed'), ...over }));
  return plansOf(table).at(-1);
}

/** A decided plan with oracle rolls, filed as the canonical GM files one. */
async function seedPlan() {
  const secrets = await gmOf(table).import('../../src/world/secrets.js');
  return onGm(table, () => secrets.createSkeleton({
    kind: 'threat', subject: { type: 'name', name: 'the escort' }, truth: TRUTH, wants: 'A name the crew carries.',
    escalation: ['It asks again, closer'], clues: ['A pulse that counts down'],
    oracleSeeds: ['Character Role: Scout', 'Character Disposition: Hostile'], sceneId: 'sc-1', sessionId: 's-1',
  }));
}

/** A move narration whose beat reveals the plan's truth; its narration id. */
async function narrationRevealsTruth(plan) {
  table.replies = () => ({ prose: 'The escort speaks in the Choir\'s voice.',
    sidecar: { newTruths: [], stateChanges: [], reveals: [{ id: plan.id, revealed: ['truth'] }] } });
  await narrateMoveOn(table, moveResolution());
  table.replies = plain;
  return lastNarrationId();
}

async function supersede(narrationId) {
  const { retractSupersededNarrations } = await gmOf(table).import('../../src/moves/resultUpgrade.js');
  await onGm(table, () => retractSupersededNarrations([narrationId], { label: 'burn' }));
}

function expectWithdrawn(card, reason, line) {
  const f = table.world.message(card._id).flags[MODULE_ID];
  const content = table.world.message(card._id).content;
  expect(f.rollsWithdrawn, 'the card says what took it back').toBe(reason);
  expect(content, 'a line says why').toContain(line);
  expect(content, 'the rolls are struck').toMatch(/sf-rolls-withdrawn[^>]*line-through/);
  expect(content, 'the card is still the rolls card').toContain('The oracle, behind the scenes');
  expect(content.match(/sf-rolls-withdrawn-note/g), 'struck once').toHaveLength(1);
}

describe('issue #364 TAKEN-BACK-PLAN-ROLLS-CARD-STAYS (i) — a plan that is gone takes its rolls card with it', () => {
  it('the X-Card on the narration that made the plan: the card is withdrawn as the X-Card withdraws a draft row', async () => {
    await reset({ narrativeSkeletonsShowRolls: true });
    await patSpeaks(table);
    const plan = await priceRevealsAnEnemy();
    expect(plan.rollsShown).toBe(true);
    const [card] = standing();
    expect(card.flags[MODULE_ID].skeletonId).toBe(plan.id);
    expect(card.content).toMatch(/Character Role: /);

    await playXCard(table);
    expect(plansOf(table), 'the plan went with its narration').toEqual([]);
    expect(standing(), 'no rolls card stands for a plan that is gone').toEqual([]);
    expectWithdrawn(card, 'xcard', 'Withdrawn — X-Card');
  }, 60_000);

  it('a Burn Momentum / Improve Result that superseded the narration: struck, with a line saying why', async () => {
    await reset({ narrativeSkeletonsShowRolls: true });
    const plan = await priceRevealsAnEnemy();
    const [card] = standing();
    expect(card.flags[MODULE_ID].skeletonId).toBe(plan.id);

    await supersede(plan.narrationId);
    expect(plansOf(table)).toEqual([]);
    expect(standing()).toEqual([]);
    expectWithdrawn(card, 'planGone', 'Withdrawn — the plan behind these rolls is no longer in play.');
  }, 60_000);

  it('a reverted price\'s plan, filed with its rolls alone under no narration: its card goes with it', async () => {
    await reset({ narrativeSkeletonsShowRolls: true });
    table.replies = () => ({ prose: '', sidecar: { newTruths: [], stateChanges: [] } });   // the narration is never written
    const plan = await priceRevealsAnEnemy({ _id: 'res-reverted' });
    expect(plan.narrationId ?? null, 'filed under no narration').toBeNull();
    expect(plan.createdFrom.resolutionId).toBe('res-reverted');
    const [card] = standing();
    expect(card.flags[MODULE_ID].skeletonId).toBe(plan.id);

    const { undoPlansFiledFor } = await gmOf(table).import('../../src/world/worldJournal.js');
    expect(await onGm(table, () => undoPlansFiledFor('res-reverted', { triggers: ['new_enemy'] }))).toBe(1);
    expect(standing()).toEqual([]);
    expectWithdrawn(card, 'planGone', 'no longer in play');
  }, 60_000);

  it('a GM deletes the plan\'s page by hand: the same step withdraws the card — and a deleted copy of the page, the plan still held, leaves it', async () => {
    await reset({ narrativeSkeletonsShowRolls: true });
    const plan = await priceRevealsAnEnemy();
    const [card] = standing();
    const original = pageOf(plan.id);
    const elsewhere = makeJournal({ name: 'GM scratch' });
    const [copy] = await elsewhere.createEmbeddedDocuments('JournalEntryPage', [{ name: original.name, flags: original.flags }]);

    await copy.delete();
    table.fireDocumentHook('gm-1', 'deleteJournalEntryPage', copy);
    await table.settle(); await table.drain();
    expect(standing().map(m => m._id), 'the plan stands: so does its card').toEqual([card._id]);

    await original.delete();   // fires the hook, as the sidebar's delete does
    await table.settle(); await table.drain();
    expect(standing()).toEqual([]);
    expectWithdrawn(card, 'planGone', 'no longer in play');
  }, 60_000);

  it('control: another plan\'s card stands when one plan goes', async () => {
    await reset({ narrativeSkeletonsShowRolls: true });
    const kept = await priceRevealsAnEnemy();
    const [keptCard] = standing();
    await patSpeaks(table);
    const taken = await priceRevealsAnEnemy();
    expect(taken.id).not.toBe(kept.id);
    expect(standing()).toHaveLength(2);

    await playXCard(table);
    expect(plansOf(table).map(p => p.id)).toEqual([kept.id]);
    expect(standing().map(m => m._id)).toEqual([keptCard._id]);
  }, 60_000);
});

describe('issue #364 TAKEN-BACK-PLAN-ROLLS-CARD-STAYS (ii) — a reveal taken back takes the rolls card it posted', () => {
  it('superseded: the card is struck, and the next reveal\'s card is the only one standing', async () => {
    await reset();
    const plan = await seedPlan();
    const revealer = await narrationRevealsTruth(plan);
    const [first] = standing();
    expect(first.flags[MODULE_ID]).toMatchObject({ skeletonId: plan.id, narrationId: revealer });

    await supersede(revealer);
    expect(planOf(plan.id)).toMatchObject({ truthRevealed: false, rollsShown: false });
    expect(standing(), 'the taken-back reveal\'s card no longer stands').toEqual([]);
    expectWithdrawn(first, 'reveal', 'Superseded — the outcome was upgraded: this was not revealed.');

    const again = await narrationRevealsTruth(plan);
    expect(planOf(plan.id)).toMatchObject({ truthRevealed: true, rollsShown: true });
    expect(standing().map(m => m.flags[MODULE_ID].narrationId), 'one rolls card stands: the reveal that holds').toEqual([again]);
    expect(withdrawn().map(m => m._id)).toEqual([first._id]);
  }, 60_000);

  it('X-carded: the card is withdrawn with the reveal, the plan kept', async () => {
    await reset();
    const plan = await seedPlan();
    await patSpeaks(table);
    await narrationRevealsTruth(plan);
    const [card] = standing();

    await playXCard(table);
    expect(planOf(plan.id), 'the plan stays, its truth hidden again').toMatchObject({ truthRevealed: false, rollsShown: false });
    expect(standing()).toEqual([]);
    expectWithdrawn(card, 'xcard', 'Withdrawn — X-Card');
  }, 60_000);

  it('control: a GM\'s own Reveal now since keeps the rolls shown, and the card stands', async () => {
    await reset();
    const plan = await seedPlan();
    const revealer = await narrationRevealsTruth(plan);
    const [card] = standing();
    const { revealSkeletonNow } = await gmOf(table).import('../../src/world/secrets.js');
    await onGm(table, () => revealSkeletonNow(plan.id));

    await supersede(revealer);
    expect(planOf(plan.id)).toMatchObject({ truthRevealed: true, rollsShown: true });
    expect(standing().map(m => m._id), 'the rolls are still shown: their card stands').toEqual([card._id]);
  }, 60_000);

  it('control: a narration taken back that revealed nothing leaves a standing card alone', async () => {
    await reset();
    const plan = await seedPlan();
    await narrationRevealsTruth(plan);
    const [card] = standing();
    await narrateMoveOn(table, moveResolution());
    await supersede(lastNarrationId());
    expect(planOf(plan.id).rollsShown).toBe(true);
    expect(standing().map(m => m._id)).toEqual([card._id]);
  }, 60_000);
});
