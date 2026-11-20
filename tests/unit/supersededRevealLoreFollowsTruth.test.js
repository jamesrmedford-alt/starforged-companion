/**
 * STARFORGED COMPANION
 * tests/unit/supersededRevealLoreFollowsTruth.test.js
 *
 * Issue #364 SUPERSEDED-REVEAL-LORE-STANDS. A narration that reveals a hidden
 * plan's truth files it as confirmed Lore ("Threat: the escort" — secrets.js
 * onTruthRevealed): the plan's truth, mirrored into the journal players read
 * and the narrator is given as established. A Burn Momentum / Improve Result
 * that supersedes that narration un-reveals the truth and retracts its scene
 * fact (resultUpgrade.js undoSupersededPlans), and the Lore entry stayed
 * confirmed: the Secrets journal said "hidden", the Lore journal stated it.
 *
 * The Lore entry a reveal files now names its plan (`revealOf`), and the
 * supersede takes it back with the truth it mirrors: the page the reveal made
 * is deleted, one it rewrote is put back as it was. Nothing else of the
 * superseded narration's World Journal is touched — its own capture's lore
 * stands beside the re-narration (decisions.md, issue #338 D8).
 *
 * The first block is the real pipeline: Kira (momentum 6, edge 1) Faces
 * Danger and misses, the miss's narration reveals the truth, and she burns
 * the miss to a weak hit.
 */

/* global silenceConsoleErrors */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [], interpretation: null, ptp: [47] }));
vi.mock('../../src/pacing/router.js', async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: 'chat' })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../src/moves/resolver.js', async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, 'random');
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});
vi.mock('../../src/oracles/roller.js', async (original) => {
  const real = await original();
  return { ...real, rollOracle: (...args) => {
    if (args[0] !== 'pay_the_price') return real.rollOracle(...args);
    const rng = vi.spyOn(Math, 'random');
    for (const value of control.ptp) rng.mockReturnValueOnce((value - 0.5) / 100);
    try { return real.rollOracle(...args); } finally { rng.mockRestore(); }
  } };
});

import { simulateTable, USERS } from '../helpers/multiClient.js';
import {
  MODULE_ID, resetSkeletonTable, gmOf, plansOf, onGm, narrateMoveOn, moveResolution, playXCard, patSpeaks,
} from '../helpers/skeletonTable.js';

const TRUTH = 'The escort is a Keeper drone collecting names for the Pale Choir.';
const LORE_TITLE = 'Threat: the escort';

let table;
let restore;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  control.ptp = [47];
  // The price is paid and the result narrated at once, and a burn undoes them.
  restore = await resetSkeletonTable(table, { holdResultForUpgrade: false });
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 },
    system: { momentum: { value: 6 }, health: { value: 5 }, spirit: { value: 5 }, supply: { value: 5 }, iron: 1, edge: 1 } });
  silenceConsoleErrors();
});
afterEach(() => restore?.());

const stored = () => gmOf(table).run(() => game.settings.get(MODULE_ID, 'campaignState'));
const flags = (id) => table.world.message(id).flags[MODULE_ID];
const BURN = '[data-action="sf-burn-momentum"]';
// challenge 4 and 8; action die 1 — edge 1 → 2: a miss; momentum 6 beats one die (a weak hit).
const MISS = [0.35, 0.75, 0.0];
const planOf = (id) => plansOf(table).find(p => p.id === id);
const plain = () => ({ prose: 'Silence.', sidecar: { newTruths: [], stateChanges: [] } });
const revealing = (plan) => () => ({ prose: 'The escort speaks in the Choir\'s voice.',
  sidecar: { newTruths: [], stateChanges: [], reveals: [{ id: plan.id, revealed: ['truth'] }] } });
const lastNarrationId = () => table.cards(f => f.narratorCard === true && f.narrationId).at(-1).flags[MODULE_ID].narrationId;
const sceneFact = () => (stored().sceneTruths ?? []).filter(t => t.fact === TRUTH && !t.retracted);

/** Every entry of the Lore journal, as stored. */
const loreEntries = () => {
  const journal = gmOf(table).run(() => game.journal.find(j => j.flags?.[MODULE_ID]?.worldJournalCategory === 'lore')) ?? null;
  return (journal?.pages?.contents ?? []).map(p => p.flags?.[MODULE_ID]?.loreEntry).filter(Boolean);
};
const loreTitled = (title) => loreEntries().filter(e => e.title === title);
/** What the narrator is given as ESTABLISHED LORE that states the truth. */
async function confirmedLore() {
  const { getConfirmedLore } = await gmOf(table).import('../../src/world/worldJournal.js');
  return gmOf(table).run(() => getConfirmedLore(null)).filter(e => e.text === TRUTH || e.fact === TRUTH);
}

/** A decided plan in this scene, filed as the canonical GM files one. */
async function seedPlan() {
  const secrets = await gmOf(table).import('../../src/world/secrets.js');
  return onGm(table, () => secrets.createSkeleton({
    kind: 'threat', subject: { type: 'name', name: 'the escort' }, truth: TRUTH, wants: 'A name the crew carries.',
    escalation: ['It asks again, closer'], clues: ['A pulse that counts down'],
    oracleSeeds: ['Character Role: Scout'], sceneId: 'sc-1', sessionId: 's-1',
  }));
}

async function kiraFacesDangerAndMisses() {
  control.interpretation = { moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 'test', mischiefApplied: false };
  control.dice = MISS;
  await onGm(table, () => table.client('pl-1').chat('Kira slips past the escort — Face Danger.', { speaker: { actor: 'pc-kira' } }));
  await table.settle(); await table.drain();
  return table.cards(f => f.moveResolution).at(-1);
}

async function kiraBurns(card) {
  await onGm(table, () => table.client('pl-1').click(card._id, BURN));
  await table.settle(); await table.drain();
  expect(flags(card._id).burn.consumed).toBe(true);
  expect(table.world.message(card._id).content).toMatch(/Burned → Weak Hit/);
}

/** A move narration whose beat reveals the plan's truth; its narration id. */
async function narrationRevealsTruth(plan) {
  table.replies = revealing(plan);
  await narrateMoveOn(table, moveResolution());
  table.replies = plain;
  return lastNarrationId();
}

async function supersede(narrationId) {
  const { retractSupersededNarrations } = await gmOf(table).import('../../src/moves/resultUpgrade.js');
  await onGm(table, () => retractSupersededNarrations([narrationId], { label: 'burn' }));
}

async function fileLore(title, entry) {
  const { recordLoreDiscovery } = await gmOf(table).import('../../src/world/worldJournal.js');
  return onGm(table, () => recordLoreDiscovery(title, entry, game.settings.get(MODULE_ID, 'campaignState')));
}

describe('issue #364 SUPERSEDED-REVEAL-LORE-STANDS — the real pipeline: the miss that revealed the truth is burned to a weak hit', () => {
  it('the burn un-reveals the truth, and the Lore entry its reveal filed goes with it — a later reveal files it once', async () => {
    const plan = await seedPlan();
    table.replies = revealing(plan);
    const card = await kiraFacesDangerAndMisses();
    const revealer = lastNarrationId();
    expect(planOf(plan.id)).toMatchObject({ truthRevealed: true, truthRevealedBy: revealer });
    expect(await confirmedLore(), 'the reveal is confirmed lore').toHaveLength(1);
    expect(loreTitled(LORE_TITLE)[0]).toMatchObject({ confirmed: true, narrationId: revealer });

    table.replies = plain;   // the weak hit's narration reveals nothing
    await kiraBurns(card);
    expect(table.cards(f => f.narratorCard === true && f.narrationId === revealer)[0].flags[MODULE_ID].burnSuperseded, 'the miss\'s narration is superseded').toBe(true);
    expect(planOf(plan.id), 'the Secrets journal: hidden again').toMatchObject({ truthRevealed: false, truth: TRUTH, status: 'active' });
    expect(sceneFact(), 'no scene fact states it').toEqual([]);
    expect(await confirmedLore(), 'and the narrator is given no established lore that states it').toEqual([]);
    expect(loreTitled(LORE_TITLE), 'the Lore journal players read holds no page of it').toEqual([]);

    // A later narration reveals the same truth: one confirmed entry, the new
    // reveal's. (Before the fix there was one entry here too — the page is
    // found by its title — but it was the superseded reveal's, never
    // withdrawn, re-stamped with that reveal's version kept under it.)
    const again = await narrationRevealsTruth(plan);
    expect(planOf(plan.id).truthRevealed).toBe(true);
    expect(await confirmedLore()).toHaveLength(1);
    expect(loreTitled(LORE_TITLE)).toHaveLength(1);
    expect(loreTitled(LORE_TITLE)[0]).toMatchObject({ confirmed: true, retracted: false, narrationId: again, revealOf: plan.id });
    expect(loreTitled(LORE_TITLE)[0].previous ?? null, 'a new entry: nothing of the superseded reveal is kept under it').toBeNull();
  }, 120_000);

  it('the burn\'s own re-narration reveals the truth again: one confirmed entry, the re-narration\'s', async () => {
    const plan = await seedPlan();
    table.replies = revealing(plan);
    const card = await kiraFacesDangerAndMisses();
    const revealer = lastNarrationId();

    await kiraBurns(card);   // the re-narration reveals it too
    const renarration = lastNarrationId();
    expect(renarration).not.toBe(revealer);
    expect(planOf(plan.id)).toMatchObject({ truthRevealed: true, truthRevealedBy: renarration });
    expect(await confirmedLore()).toHaveLength(1);
    expect(loreTitled(LORE_TITLE)).toHaveLength(1);
    expect(loreTitled(LORE_TITLE)[0]).toMatchObject({ confirmed: true, narrationId: renarration, revealOf: plan.id });
  }, 120_000);
});

describe('issue #364 SUPERSEDED-REVEAL-LORE-STANDS — what the supersede takes, and what it leaves', () => {
  it('the superseded narration\'s own capture lore stands (issue #338 D8): only the entry its reveal filed goes', async () => {
    const plan = await seedPlan();
    const revealer = await narrationRevealsTruth(plan);
    // As the narration's capture files what it detected: stamped with the narration, no plan's mirror.
    await fileLore('The Torch Room', { text: 'The corridor ends in a room of cutting torches.', narratorAsserted: true, confirmed: true, narrationId: revealer });

    await supersede(revealer);
    expect(loreTitled(LORE_TITLE)).toEqual([]);
    expect(loreTitled('The Torch Room')[0], 'the capture\'s entry stands beside the re-narration').toMatchObject({ confirmed: true, retracted: false, narrationId: revealer });
  }, 60_000);

  it('an entry of the same title from before the reveal is put back as it was', async () => {
    const plan = await seedPlan();
    await fileLore(LORE_TITLE, { text: 'They say the escort answers to no one.', category: 'other' });   // a GM's rumour
    const revealer = await narrationRevealsTruth(plan);
    expect(loreTitled(LORE_TITLE)[0]).toMatchObject({ confirmed: true, text: TRUTH, revealOf: plan.id });

    await supersede(revealer);
    expect(loreTitled(LORE_TITLE)).toHaveLength(1);
    expect(loreTitled(LORE_TITLE)[0]).toMatchObject({ confirmed: false, text: 'They say the escort answers to no one.', narrationId: null, revealOf: null });
    expect(await confirmedLore()).toEqual([]);
  }, 60_000);

  it('a GM\'s own Reveal now since: the truth stays revealed, and its Lore entry — the GM\'s now — stands', async () => {
    const plan = await seedPlan();
    const revealer = await narrationRevealsTruth(plan);
    const { revealSkeletonNow } = await gmOf(table).import('../../src/world/secrets.js');
    await onGm(table, () => revealSkeletonNow(plan.id));

    await supersede(revealer);
    expect(planOf(plan.id).truthRevealed).toBe(true);
    expect(await confirmedLore()).toHaveLength(1);
  }, 60_000);

  it('a reveal filed before the entry named its plan carries no mark: it stands, as before', async () => {
    const plan = await seedPlan();
    const revealer = await narrationRevealsTruth(plan);
    await onGm(table, async () => {
      const journal = game.journal.find(j => j.flags?.[MODULE_ID]?.worldJournalCategory === 'lore');
      const page = journal.pages.contents.find(p => p.flags?.[MODULE_ID]?.loreEntry?.title === LORE_TITLE);
      await page.setFlag(MODULE_ID, 'loreEntry', { ...page.flags[MODULE_ID].loreEntry, revealOf: null });
    });

    await supersede(revealer);
    expect(await confirmedLore()).toHaveLength(1);
  }, 60_000);

  it('control: a narration taken back that revealed nothing leaves the revealed truth\'s Lore alone', async () => {
    const plan = await seedPlan();
    await narrationRevealsTruth(plan);
    await narrateMoveOn(table, moveResolution());
    await supersede(lastNarrationId());
    expect(planOf(plan.id).truthRevealed).toBe(true);
    expect(await confirmedLore()).toHaveLength(1);
  }, 60_000);

  it('control: the X-Card on a reveal still retracts its Lore entry — kept, out of canon', async () => {
    const plan = await seedPlan();
    await patSpeaks(table);
    await narrationRevealsTruth(plan);
    await playXCard(table);
    expect(planOf(plan.id).truthRevealed).toBe(false);
    expect(await confirmedLore()).toEqual([]);
    expect(loreTitled(LORE_TITLE)[0], 'the X-Card\'s retraction keeps the page').toMatchObject({ confirmed: false, retracted: true });
  }, 60_000);
});
