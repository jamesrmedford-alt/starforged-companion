/**
 * STARFORGED COMPANION
 * tests/unit/xcardBeforeRevealWriteWithholdsTruth.test.js
 *
 * Issue #364 XCARD-BEFORE-REVEAL-WRITE (out of XCARD-REVEAL-REREVEAL-NO-LORE).
 *
 * After the X-Card takes back a narration that revealed a hidden plan's
 * truth, the truth is withheld (`truthWithheldBy` — the maintainer's ruling):
 * the X-Card's undo marks the plan by the reveal it takes back. But a
 * narration's plan writes run after its card is on screen, one at a time
 * (secrets.js serialiseSecretWrite), and updateSkeleton refuses a write for a
 * narration the X-Card has already removed (issue #362 AC35). When the card
 * was played before the reveal's write had its turn, the reveal was never
 * recorded, so the undo found nothing to withhold — while the X-carded prose
 * had told the truth, and the narrator was still given it under UNREVEALED to
 * reveal again.
 *
 * Reachable: applyPlanSideData is started before the card posts and is not
 * stopped by the X-Card — each of its writes checks for itself. Here the
 * narration's first reveal (a clue of another plan) waits on a slow server
 * write, the X-Card lands meanwhile, and its reveal of the escort's truth
 * comes after it. Now the refused reveal still marks the truth withheld —
 * bookkeeping, nothing else of the reveal filed — and the GMs are told once.
 *
 * The real path: the skeleton table's narrator, the X-Card from Pat's
 * client, the GM's Resume.
 */

/* global silenceConsoleErrors */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import {
  MODULE_ID, resetSkeletonTable, gmOf, plansOf, narrationCallsOf, onGm, moveResolution, narrateMoveOn, playXCard, patSpeaks,
} from '../helpers/skeletonTable.js';

const TRUTH = 'The escort is a Keeper drone collecting names for the Pale Choir.';
const WARDEN_TRUTH = 'The warden sold the station\'s codes to the Choir.';
const WARDEN_CLUE = 'A ledger with one page torn out';

function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}

let table;
let restore;
/** While set, the next flag write on the plan page of `planId` waits on `open` — a slow server round trip. */
let hold = null;

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  hold = null;
  restore = await resetSkeletonTable(table);
  const inner = globalThis.JournalEntry.create;
  globalThis.JournalEntry = {
    async create(data) {
      const journal = await inner(data);
      if (data?.flags?.[MODULE_ID]?.worldJournalCategory !== 'secrets') return journal;
      const create = journal.createEmbeddedDocuments.bind(journal);
      journal.createEmbeddedDocuments = async (...args) => {
        const pages = await create(...args);
        for (const page of pages) {
          const setFlag = page.setFlag.bind(page);
          page.setFlag = async (scope, key, value) => {
            const gate = hold;
            if (gate && value?.id === gate.planId) { hold = null; gate.reached.resolve(); await gate.open.promise; }
            return setFlag(scope, key, value);
          };
        }
        return pages;
      };
      return journal;
    },
  };
  silenceConsoleErrors();
});
afterEach(() => restore?.());

const planOf = (id) => plansOf(table).find(p => p.id === id);
const plain = () => ({ prose: 'Silence.', sidecar: { newTruths: [], stateChanges: [] } });
const lastNarrationId = () => table.cards(f => f.narratorCard === true && f.narrationId).at(-1).flags[MODULE_ID].narrationId;
const notices = () => table.cards(f => f.xcardTruthWithheldNotice === true);
const settleAll = async () => { for (let i = 0; i < 5; i += 1) { await table.settle(); await table.drain(); } };

async function confirmedLore(text) {
  const { getConfirmedLore } = await gmOf(table).import('../../src/world/worldJournal.js');
  return gmOf(table).run(() => getConfirmedLore(null)).filter(e => e.text === text);
}

/** The Lore stating it, confirmed or pending the GM (a narration's reveal is pending since issue #402, change 1b). */
async function loreStating(text) {
  const { getConfirmedLore, getNarratorAssertedLore } = await gmOf(table).import('../../src/world/worldJournal.js');
  return gmOf(table).run(() => [...getConfirmedLore(null), ...getNarratorAssertedLore(null)]).filter(e => e.text === text);
}

/** Two decided plans in this scene, filed as the canonical GM files them. */
async function seedPlans() {
  const secrets = await gmOf(table).import('../../src/world/secrets.js');
  const escort = await onGm(table, () => secrets.createSkeleton({
    kind: 'threat', subject: { type: 'name', name: 'the escort' }, truth: TRUTH, wants: 'A name the crew carries.',
    escalation: ['It asks again, closer'], clues: ['A pulse that counts down'],
    oracleSeeds: ['Character Role: Scout'], sceneId: 'sc-1', sessionId: 's-1',
  }));
  const warden = await onGm(table, () => secrets.createSkeleton({
    kind: 'threat', subject: { type: 'name', name: 'the warden' }, truth: WARDEN_TRUTH, wants: 'To leave before the Choir comes.',
    escalation: ['He seals his office'], clues: [WARDEN_CLUE],
    oracleSeeds: ['Character Role: Administrator'], sceneId: 'sc-1', sessionId: 's-1',
  }));
  return { escort, warden };
}

/**
 * A narration whose beat shows the warden's clue, then reveals `reveal` of
 * the escort; the warden's write is held on its way while the X-Card is
 * played from Pat's client, then lands. Its narration id.
 */
async function revealAfterXCard({ escort, warden }, reveal) {
  await patSpeaks(table);
  hold = { planId: warden.id, reached: deferred(), open: deferred() };
  const gate = hold;
  table.replies = () => ({ prose: 'The warden looks away; the escort turns, and speaks in the Choir\'s voice.',
    sidecar: { newTruths: [], stateChanges: [], reveals: [{ id: warden.id, revealed: ['c1'] }, { id: escort.id, ...reveal }] } });
  await narrateMoveOn(table, moveResolution());
  table.replies = plain;
  const narrationId = lastNarrationId();
  await gate.reached.promise;   // the narration's first plan write is on its way

  await playXCard(table);
  const stored = gmOf(table).run(() => game.settings.get(MODULE_ID, 'campaignState'));
  expect(stored.xCardedNarrationIds ?? [], 'the X-Card removed the narration (setup)').toContain(narrationId);

  gate.open.resolve();   // the server answers the held write now
  await settleAll();
  return narrationId;
}

async function liftXCard() {
  const { clearXCard } = await gmOf(table).import('../../src/context/safety.js');
  await onGm(table, () => clearXCard());
}

describe('issue #364 XCARD-BEFORE-REVEAL-WRITE — a reveal the X-Card overtook still withholds the truth its prose told', () => {
  it('the reveal\'s write comes after the X-Card: the truth is marked withheld, stays unrevealed, and the GMs are told once', async () => {
    const plans = await seedPlans();
    const removed = await revealAfterXCard(plans, { revealed: ['truth'] });

    expect(planOf(plans.escort.id), 'withheld, by the removed narration, and still hidden')
      .toMatchObject({ truth: TRUTH, truthRevealed: false, truthWithheldBy: removed, status: 'active' });
    expect(planOf(plans.escort.id).rollsShown, 'no rolls shown for it').toBe(false);
    expect(await loreStating(TRUTH), 'nothing filed as Lore').toEqual([]);
    expect(planOf(plans.warden.id).clues[0].revealed, 'the write that landed after the X-Card is taken back').toBe(false);

    const [notice, ...more] = notices();
    expect(more, 'told once').toEqual([]);
    expect(notice, 'the GMs are told').toBeTruthy();
    expect(notice.whisper, 'GM-only').toEqual(['gm-1']);
    expect(notice.content).toContain('the escort');
    expect(notice.content, 'the notice never states the truth').not.toContain(TRUTH);
  }, 90_000);

  it('after Resume the narrator is no longer given the truth, and a later reveal of it is not recorded', async () => {
    const plans = await seedPlans();
    const removed = await revealAfterXCard(plans, { revealed: ['truth'] });
    await liftXCard();

    await patSpeaks(table);
    table.replies = () => ({ prose: 'The escort says it again.',
      sidecar: { newTruths: [], stateChanges: [], reveals: [{ id: plans.escort.id, revealed: ['truth'] }] } });
    await narrateMoveOn(table, moveResolution());
    table.replies = plain;

    const system = narrationCallsOf(table).at(-1).system ?? '';
    expect(system, 'the plan is still in play').toContain(`(id ${plans.escort.id})`);
    expect(system, 'never its truth').not.toContain(TRUTH);
    expect(planOf(plans.escort.id)).toMatchObject({ truthRevealed: false, truthWithheldBy: removed });
    expect(await loreStating(TRUTH)).toEqual([]);
  }, 120_000);
});

describe('issue #364 XCARD-BEFORE-REVEAL-WRITE — controls', () => {
  it('a refused reveal that names no truth withholds nothing and tells nobody', async () => {
    const plans = await seedPlans();
    await revealAfterXCard(plans, { revealed: ['c1'] });

    expect(planOf(plans.escort.id)).toMatchObject({ truthRevealed: false, truthWithheldBy: null });
    expect(planOf(plans.escort.id).clues[0].revealed, 'the clue of a removed narration is not filed').toBe(false);
    expect(notices()).toEqual([]);
  }, 90_000);

  it('a truth already revealed by the GM is not withheld by a refused reveal', async () => {
    const plans = await seedPlans();
    const { revealSkeletonNow } = await gmOf(table).import('../../src/world/secrets.js');
    await onGm(table, () => revealSkeletonNow(plans.escort.id));
    await revealAfterXCard(plans, { revealed: ['truth'] });

    expect(planOf(plans.escort.id)).toMatchObject({ truthRevealed: true, truthWithheldBy: null });
    expect(await confirmedLore(TRUTH), 'the GM\'s reveal stays canon').toHaveLength(1);
    expect(notices()).toEqual([]);
  }, 90_000);

  it('with no X-Card the same beat reveals the truth as before', async () => {
    const plans = await seedPlans();
    await patSpeaks(table);
    table.replies = () => ({ prose: 'The escort speaks in the Choir\'s voice.',
      sidecar: { newTruths: [], stateChanges: [], reveals: [{ id: plans.warden.id, revealed: ['c1'] }, { id: plans.escort.id, revealed: ['truth'] }] } });
    await narrateMoveOn(table, moveResolution());
    const revealer = lastNarrationId();
    await settleAll();

    expect(planOf(plans.escort.id)).toMatchObject({ truthRevealed: true, truthRevealedBy: revealer, truthWithheldBy: null });
    expect(planOf(plans.warden.id).clues[0].revealed).toBe(true);
    expect(await loreStating(TRUTH), 'filed as Lore, pending the GM').toHaveLength(1);
    expect(await confirmedLore(TRUTH)).toEqual([]);
    expect(notices()).toEqual([]);
  }, 90_000);
});
