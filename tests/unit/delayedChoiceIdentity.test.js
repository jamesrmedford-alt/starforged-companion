/**
 * STARFORGED COMPANION
 * tests/unit/delayedChoiceIdentity.test.js
 *
 * Known-issues DELAYED-CHOICE-IDENTITY — issue #309 N04's discipline applied
 * to the other delayed choices: a choice card's effect acts on what its move
 * was about, resolved when the move was rolled, never on what a lookup finds
 * when the card is clicked.
 *
 * Enter the Fray's weak-hit "You are in control" resolved the sole open fight
 * (or the newest threshold card) at click time: picked with an older fight
 * open it positioned that fight, with two open nothing, and after a way out
 * it positioned a fight the move never began. Its choice card now names the
 * threshold card its move posted (`thresholdResolutionId`): still waiting,
 * the position waits on that card; entered, it lands on the fight that card
 * began (the card's `frayTrackId`); a way out taken, on none. Explore a
 * Waypoint's "Mark expedition progress" marked the sole open expedition at
 * click time; its card now names the expedition the move explored
 * (`expeditionTrackId`) — that one, or none once it is over.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

// The pipeline: no pacing call, the confirm dialog accepted, the interpreter
// answering `control.interpretation` (a typed move), and scripted dice inside
// the REAL resolveMove (`control.dice`, consumed in order).
const control = vi.hoisted(() => ({ dice: [], interpretation: null, onConfirm: null }));
vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (narration) => ({
    ...control.interpretation, playerNarration: narration, inputMethod: 'chat',
  })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => { await control.onConfirm?.(); return true; }),
}));
vi.mock('../../src/moves/resolver.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random');
      for (const r of control.dice) dice.mockReturnValueOnce(r);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const REPLY = 'Steel rings down the corridor.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

let table, journal;
// The moves narrated this session, as each move narration's flags (moveId,
// outcome), oldest first — it read the session move log, retired with issue
// #326 W58.
const sessionLog = () => table.cards(f => f.narratorCard && f.resolutionId && !f.burnSuperseded).map(c => c.flags[MODULE_ID]);
const tracks = () => journal.getFlag(MODULE_ID, 'tracks') ?? [];
const track = (id) => tracks().find(t => t.id === id);

/** The "Starforged Progress Tracks" journal: a document-level flag store, as progressTracks.js writes it. */
function makeTracksJournal() {
  const flags = {};
  return {
    id:      'tracks-journal',
    name:    'Starforged Progress Tracks',
    getFlag: (mod, key) => flags[`${mod}.${key}`],
    setFlag: async (mod, key, value) => { flags[`${mod}.${key}`] = JSON.parse(JSON.stringify(value)); },
  };
}

/** Open a track through the real store on the GM's client. */
async function openTrack(label, { type = 'combat', rank = 'dangerous', ...fields } = {}) {
  const gm = table.client('gm-1');
  const store = await gm.import('../../src/ui/progressTracks.js');
  return gm.run(async () => {
    const created = await store.addProgressTrack({ label, type, rank });
    await store.updateTrackFields(created.id, fields);
    return created;
  });
}

/** A player types a combat move; the canonical GM's pipeline runs it. */
async function typedMove(interpretation, dice) {
  control.interpretation = interpretation;
  control.dice = dice;
  await table.client('pl-1').chat('I go for the turret controls.', { speaker: { actor: 'pc-pat' } });
  await table.settle();
  await table.drain();
}

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.dice = [];
  control.interpretation = null;
  control.onConfirm = null;
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    campaignState: {
      ...CampaignStateSchema,
      sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [],
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-pat', name: 'Kira', ownership: { 'pl-1': 3 } });
  journal = makeTracksJournal();
  table.journal._set(journal);
  scriptClaude(table, { fallback: () => REPLY });
});

/** A player (or the GM) clicks a card's button; the pipeline it starts runs to the end. */
async function clickCard(userId, cardId, selector) {
  table.client(userId).click(cardId, selector);
  await table.settle();
  await table.drain();
}

// Enter the Fray +edge: challenge 3 and 9, action 6 + edge 2 = 8 — beats 3, not 9: a weak hit.
const FRAY_WEAK = [0.25, 0.85, 0.9];
// Explore a Waypoint +wits: challenge 2 and 3, action 6 + wits 2 = 8 — a strong hit.
const WAYPOINT_STRONG = [0.15, 0.25, 0.9];

const typedFray = (moveTarget) => ({
  moveId: 'enter_the_fray', moveName: 'Enter the Fray', statUsed: 'edge', adds: 0,
  moveTarget, combatRank: 'formidable', rationale: 'test', mischiefApplied: false,
});
const typedWaypoint = (moveTarget) => ({
  moveId: 'explore_a_waypoint', moveName: 'Explore a Waypoint', statUsed: 'wits', adds: 0,
  moveTarget, rationale: 'test', mischiefApplied: false,
});

const IN_CONTROL = '[data-action="sf-suffer-pick"][data-option-index="1"]';
const MARK_PROGRESS = '[data-action="sf-suffer-pick"][data-option-index="0"]';
const choiceCard = () => table.cards(f => f.sufferCard && !f.resolved)[0];

/** Kira's weak-hit Enter the Fray against a new foe while Boarders is open: its threshold card and its choice card. */
async function frayWeakHitBesideBoarders() {
  const boarders = await openTrack('Boarders', { ticks: 8, combatState: 'bad_spot', positions: { 'pc-pat': 'bad_spot' } });
  await typedMove(typedFray('Ironclad raiders'), FRAY_WEAK);
  const [threshold] = table.cards(f => f.combatThresholdCard);
  const choice = choiceCard();
  expect(threshold, 'a threshold card').toBeTruthy();
  expect(choice, 'a choice card').toBeTruthy();
  return { boarders, threshold, choice };
}

describe('Enter the Fray\'s weak-hit "You are in control" is about its own fight (DELAYED-CHOICE-IDENTITY)', () => {
  it('the choice card names the threshold card its move posted', async () => {
    const { threshold, choice } = await frayWeakHitBesideBoarders();
    expect(sessionLog().map(e => [e.moveId, e.outcome])).toEqual([['enter_the_fray', 'weak_hit']]);
    expect(choice.flags[MODULE_ID].executorOpts.thresholdResolutionId).toBe(threshold.flags[MODULE_ID].resolutionId);
  });

  it('picked before Enter the Fray, it waits on that card — not the open fight — and the fight begins in control', async () => {
    const { boarders, threshold, choice } = await frayWeakHitBesideBoarders();

    await clickCard('pl-1', choice._id, IN_CONTROL);

    expect(table.world.message(threshold._id).flags[MODULE_ID].position).toBe('in_control');
    expect(track(boarders.id).positions['pc-pat']).toBe('bad_spot');

    await clickCard('pl-1', threshold._id, '[data-action="sf-enter-fray"]');
    const raiders = tracks().find(t => t.label === 'Ironclad raiders');
    expect(raiders?.positions?.['pc-pat']).toBe('in_control');
    expect(track(boarders.id).positions['pc-pat']).toBe('bad_spot');
  });

  it('picked after Enter the Fray, it lands on the fight that card began while another is open', async () => {
    const { boarders, threshold, choice } = await frayWeakHitBesideBoarders();

    await clickCard('pl-1', threshold._id, '[data-action="sf-enter-fray"]');
    const raiders = tracks().find(t => t.label === 'Ironclad raiders');
    expect(table.world.message(threshold._id).flags[MODULE_ID].frayTrackId).toBe(raiders.id);

    await clickCard('pl-1', choice._id, IN_CONTROL);

    expect(track(raiders.id).positions?.['pc-pat']).toBe('in_control');
    expect(track(boarders.id).positions['pc-pat']).toBe('bad_spot');
  });

  it('picked after a way out was taken, it positions no fight — not the one open', async () => {
    const { boarders, threshold, choice } = await frayWeakHitBesideBoarders();

    await clickCard('pl-1', threshold._id, '[data-action="sf-way-out"]');
    await clickCard('pl-1', choice._id, IN_CONTROL);

    expect(track(boarders.id).positions['pc-pat']).toBe('bad_spot');
    expect(track(boarders.id).combatState).toBe('bad_spot');
    expect(table.world.message(choice._id).content).toContain('no fight was begun');
  });
});

describe('Explore a Waypoint\'s "Mark expedition progress" is about its own expedition (DELAYED-CHOICE-IDENTITY)', () => {
  it('marks the expedition it explored after a second one opened', async () => {
    const vault = await openTrack('The Vault of Tears', { type: 'expedition', rank: 'formidable', ticks: 12 });
    await typedMove(typedWaypoint(null), WAYPOINT_STRONG);
    const choice = choiceCard();
    expect(choice.flags[MODULE_ID].executorOpts.expeditionTrackId).toBe(vault.id);

    const drift = await openTrack('The Drift', { type: 'expedition', ticks: 0 });
    await clickCard('pl-1', choice._id, MARK_PROGRESS);

    expect(track(vault.id).ticks).toBe(12 + 4);                        // one formidable mark
    expect(track(drift.id).ticks).toBe(0);
  });

  it('marks nothing once its expedition is over — not the one open now', async () => {
    const vault = await openTrack('The Vault of Tears', { type: 'expedition', rank: 'formidable', ticks: 12 });
    await typedMove(typedWaypoint(null), WAYPOINT_STRONG);
    const choice = choiceCard();

    await journal.setFlag(MODULE_ID, 'tracks', tracks().map(t => (t.id === vault.id ? { ...t, completed: true } : t)));
    const drift = await openTrack('The Drift', { type: 'expedition', ticks: 0 });
    await clickCard('pl-1', choice._id, MARK_PROGRESS);

    expect(track(drift.id).ticks).toBe(0);
    expect(track(vault.id).ticks).toBe(12);
    expect(table.world.message(choice._id).content).toContain('its expedition is over');
  });
});
