/**
 * STARFORGED COMPANION
 * tests/unit/progressTrackSelection.test.js
 *
 * Which fight a move acts on when more than one is open — on a booted table,
 * through the real move pipeline (issue #306). Tracks are written by the real
 * store (src/ui/progressTracks.js) on the GM's client, and the Progress Tracks
 * panel's own Roll handler starts each Take Decisive Action.
 *
 * R05: the store's reader (listProgressTracks) dropped each fight's position,
 * so tick enrichment could never hand the resolver the scored fight's own
 * position: with two fights open, Take Decisive Action's bad-spot downgrade
 * never applied. And a combat move's position was written only while a single
 * fight was open — with two, nothing recorded it.
 *
 * R06: the panel's Roll posted only the row's label, so scoring and completion
 * took the first track with that label — a same-named sibling's ticks, its
 * completion and its rewards. The row's id now rides the roll; a track deleted
 * or finished before the roll resolves rolls nothing, and says so.
 *
 * TDA-BUTTON-NO-TARGET: a combat move card's "Attempt to Finish the Fight"
 * and an Enter the Fray card's "Battle instead" posted their move with no
 * fight, so with two open the roll scored nothing (a certain miss) and Battle
 * ended neither. Each card now names its fight by id; a Take Decisive Action
 * that still names none, with two or more open, asks which fight instead of
 * rolling.
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
// d10 challenge dice: 0.25 → 3, 0.35 → 4; d6 action die: 0.9 → 6, 0.1 → 1.
const CHALLENGE_3_4 = [0.25, 0.35];

let table, journal;
const world = () => table.world.campaignState();
const sessionLog = () => world().sessionLogs?.['sess-1'] ?? [];
const tracks = () => journal.getFlag(MODULE_ID, 'tracks') ?? [];
const track = (id) => tracks().find(t => t.id === id);

/** The "Starforged Progress Tracks" journal: a document-level flag store, as progressTracks.js writes it. */
function makeTracksJournal() {
  const flags = {};
  return {
    id:      'tracks-journal',
    name:    'Starforged Progress Tracks',
    getFlag: (mod, key) => flags[`${mod}.${key}`],
    setFlag: async (mod, key, value) => { flags[`${mod}.${key}`] = structuredClone(value); },
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

/** The GM clicks Roll on a Progress Tracks panel row (the panel's own handler). */
async function panelRoll(trackId) {
  const gm = table.client('gm-1');
  const { ProgressTrackApp } = await gm.import('../../src/ui/progressTracks.js');
  await gm.run(() => ProgressTrackApp.DEFAULT_OPTIONS.actions.rollProgress.call({}, null, { dataset: { trackId } }));
  await table.settle();
  await table.drain();
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

describe('two fights open: a fight\'s own position reaches Take Decisive Action (issue #306 R05)', () => {
  it('in a bad spot, a strong hit without a match counts as a weak hit', async () => {
    const boarders = await openTrack('Boarders', { ticks: 32, combatState: 'bad_spot' });
    await openTrack('Turret', { rank: 'formidable', ticks: 4 });

    control.dice = CHALLENGE_3_4;            // score 8 beats 3 and 4, no match
    await panelRoll(boarders.id);

    expect(sessionLog().map(e => [e.moveId, e.outcome])).toEqual([['take_decisive_action', 'weak_hit']]);
    expect(track(boarders.id).completed).toBe(true);    // a weak hit still ends the fight
  });

  it('in control, the same roll stays a strong hit', async () => {
    const boarders = await openTrack('Boarders', { ticks: 32, combatState: 'in_control' });
    await openTrack('Turret', { rank: 'formidable', ticks: 4 });

    control.dice = CHALLENGE_3_4;
    await panelRoll(boarders.id);

    expect(sessionLog().map(e => [e.moveId, e.outcome])).toEqual([['take_decisive_action', 'strong_hit']]);
  });

  it('a Strike\'s position lands on the fight it targeted, not on nothing', async () => {
    const boarders = await openTrack('Boarders', { ticks: 8, combatState: 'in_control' });
    const turret   = await openTrack('Turret', { rank: 'formidable', ticks: 4, combatState: 'in_control' });

    // Strike +iron: challenge 3 and 9, action 6 + iron 3 = 9 — beats 3, not 9: a weak hit.
    await typedMove(
      { moveId: 'strike', moveName: 'Strike', statUsed: 'iron', adds: 0, moveTarget: 'Turret', rationale: 'test', mischiefApplied: false },
      [0.25, 0.85, 0.9],
    );

    expect(sessionLog().map(e => [e.moveId, e.outcome])).toEqual([['strike', 'weak_hit']]);
    expect(track(turret.id).combatState).toBe('bad_spot');      // the Strike's own fight
    expect(track(turret.id).ticks).toBe(4 + 2 * 4);             // marked twice (formidable: one box a mark)
    expect(track(boarders.id).combatState).toBe('in_control');  // the other fight untouched
    expect(track(boarders.id).ticks).toBe(8);
  });
});

describe('two same-named tracks: the panel\'s Roll acts on the row clicked (issue #306 R06)', () => {
  it.each(['combat', 'expedition'])('a %s roll scores and completes the selected row, not its namesake', async (type) => {
    const first  = await openTrack('The approach', { type, ticks: 4 });
    const second = await openTrack('The approach', { type, rank: 'extreme', ticks: 32 });

    control.dice = CHALLENGE_3_4;            // score 8 (the second row) beats 3 and 4; score 1 (the first) misses
    await panelRoll(second.id);

    const moveId = type === 'combat' ? 'take_decisive_action' : 'finish_an_expedition';
    expect(sessionLog().map(e => [e.moveId, e.outcome])).toEqual([[moveId, 'strong_hit']]);
    expect(track(second.id).completed).toBe(true);
    expect(track(first.id).completed).toBe(false);
  });

  it('a row deleted before the roll resolves rolls nothing — not its namesake, not a 0 score', async () => {
    const first  = await openTrack('The approach', { ticks: 4 });
    const second = await openTrack('The approach', { rank: 'extreme', ticks: 32 });
    // The GM removes the row (the panel's Remove writes the list without it) while the roll waits.
    control.onConfirm = () => journal.setFlag(MODULE_ID, 'tracks', tracks().filter(t => t.id !== second.id));

    control.dice = CHALLENGE_3_4;
    await panelRoll(second.id);

    expect(sessionLog()).toEqual([]);
    expect(table.cards(f => f.trackGoneCard)).toHaveLength(1);
    expect(table.cards(f => f.moveResolution)).toHaveLength(0);
    expect(track(first.id).completed).toBe(false);
    expect(world().pendingMove).toBe(false);
  });
});

/** A player (or the GM) clicks a card's button; the pipeline it starts runs to the end. */
async function clickCard(userId, cardId, selector) {
  table.client(userId).click(cardId, selector);
  await table.settle();
  await table.drain();
}

// Strike +iron: challenge 2 and 3, action 6 + iron 3 = 9 — a strong hit (in control), marked twice.
const STRIKE_STRONG = [0.15, 0.25, 0.9];
const strikeAt = (moveTarget) => ({
  moveId: 'strike', moveName: 'Strike', statUsed: 'iron', adds: 0, moveTarget, rationale: 'test', mischiefApplied: false,
});
const typedTda = (moveTarget = null) => ({
  moveId: 'take_decisive_action', moveName: 'Take Decisive Action', statUsed: null, adds: 0,
  isProgressMove: true, moveTarget, rationale: 'test', mischiefApplied: false,
});

describe('a combat card names its fight (TDA-BUTTON-NO-TARGET)', () => {
  it('two fights open: a Strike\'s Finish the Fight scores and finishes the Strike\'s fight', async () => {
    const boarders = await openTrack('Boarders');
    const turret   = await openTrack('Turret', { rank: 'formidable', ticks: 28 });

    await typedMove(strikeAt('Turret'), STRIKE_STRONG);
    const [card] = table.cards(f => f.combatMoveCard);
    expect(card.flags[MODULE_ID]).toMatchObject({ combatTrackId: turret.id, combatTrackLabel: 'Turret' });
    expect(card.content).toContain('Attempt to Finish the Fight: Turret');

    control.dice = CHALLENGE_3_4;            // the Turret's 9 boxes beat 3 and 4
    await clickCard('pl-1', card._id, '[data-action="sf-take-decisive-action"]');

    expect(sessionLog().map(e => [e.moveId, e.outcome])).toEqual([['strike', 'strong_hit'], ['take_decisive_action', 'strong_hit']]);
    expect(track(turret.id).completed).toBe(true);
    expect(track(boarders.id).completed).toBe(false);
    expect(table.cards(f => f.whichFightCard)).toHaveLength(0);
  });

  it('Battle from an Enter the Fray card ends that fight while another is open', async () => {
    // The fight is entered, then the GM opens a second from the panel while
    // the card's Battle button is still live.
    const gm = table.client('gm-1');
    const { createCombatTrackFromThreshold } = await gm.import('../../src/index.js');
    await gm.run(() => createCombatTrackFromThreshold({ label: 'Turret', rank: 'formidable' }));
    await table.settle();
    const turret   = tracks().find(t => t.label === 'Turret');
    const boarders = await openTrack('Boarders', { ticks: 8 });
    const [card] = table.cards(f => f.combatTrackCard);
    expect(card.flags[MODULE_ID]).toMatchObject({ created: true, trackId: turret.id, trackLabel: 'Turret' });

    control.dice = [0.15, 0.25, 0.9];        // Battle +edge: 6 + 2 = 8 beats 2 and 3
    await clickCard('pl-1', card._id, '[data-action="sf-battle"]');

    expect(sessionLog().map(e => [e.moveId, e.outcome])).toEqual([['battle', 'strong_hit']]);
    expect(track(turret.id).completed).toBe(true);
    expect(track(boarders.id).completed).toBe(false);
  });

  it('an older card that names no fight, one fight open, still rolls that fight', async () => {
    const turret = await openTrack('Turret', { ticks: 36 });
    const card = await table.client('gm-1').run(() => ChatMessage.create({
      content: '<div class="sf-move-result"><div class="sf-combat-followup">'
        + '<button type="button" data-action="sf-take-decisive-action">⚔ Attempt to Finish the Fight</button></div></div>',
      flags: { [MODULE_ID]: { combatMoveCard: true } },
    }));
    await table.settle();

    control.dice = CHALLENGE_3_4;
    await clickCard('pl-1', card.id, '[data-action="sf-take-decisive-action"]');

    expect(sessionLog().map(e => [e.moveId, e.outcome])).toEqual([['take_decisive_action', 'strong_hit']]);
    expect(track(turret.id).completed).toBe(true);
    expect(table.cards(f => f.whichFightCard)).toHaveLength(0);
  });
});

describe('a Take Decisive Action that names no fight asks which (TDA-BUTTON-NO-TARGET)', () => {
  it('two fights open: nothing is rolled — the card lists them, and a pick rolls that fight for the roller', async () => {
    const boarders = await openTrack('Boarders');
    const turret   = await openTrack('Turret', { ticks: 36 });

    await typedMove(typedTda(), CHALLENGE_3_4);

    expect(sessionLog()).toEqual([]);
    expect(world().pendingMove).toBe(false);
    const [picker] = table.cards(f => f.whichFightCard);
    expect(picker.flags[MODULE_ID].fights.map(f => f.id)).toEqual([boarders.id, turret.id]);

    // The GM picks; the move stays the player's who typed it.
    control.dice = CHALLENGE_3_4;
    await clickCard('gm-1', picker._id, `[data-action="sf-which-fight"][data-track-id="${turret.id}"]`);

    expect(sessionLog().map(e => [e.moveId, e.outcome])).toEqual([['take_decisive_action', 'strong_hit']]);
    expect(track(turret.id).completed).toBe(true);
    expect(track(boarders.id).completed).toBe(false);
    const [forced] = table.cards(f => f.forcedMoveId === 'take_decisive_action');
    expect(forced?.speaker?.actor).toBe('pc-pat');
  });

  it('one pick per card: a second click, on another client, rolls nothing more', async () => {
    const boarders = await openTrack('Boarders');
    const turret   = await openTrack('Turret', { ticks: 36 });
    await typedMove(typedTda(), CHALLENGE_3_4);
    const [picker] = table.cards(f => f.whichFightCard);
    expect(picker, 'a which-fight card').toBeTruthy();

    control.dice = CHALLENGE_3_4;
    await clickCard('gm-1', picker._id, `[data-action="sf-which-fight"][data-track-id="${turret.id}"]`);
    await clickCard('pl-1', picker._id, `[data-action="sf-which-fight"][data-track-id="${boarders.id}"]`);

    expect(sessionLog().map(e => e.moveId)).toEqual(['take_decisive_action']);
    expect(track(boarders.id).completed).toBe(false);
  });

  it('a typed Take Decisive Action that names its fight rolls it without asking', async () => {
    const boarders = await openTrack('Boarders');
    const turret   = await openTrack('Turret', { ticks: 36 });

    await typedMove(typedTda('Turret'), CHALLENGE_3_4);

    expect(table.cards(f => f.whichFightCard)).toHaveLength(0);
    expect(sessionLog().map(e => [e.moveId, e.outcome])).toEqual([['take_decisive_action', 'strong_hit']]);
    expect(track(turret.id).completed).toBe(true);
    expect(track(boarders.id).completed).toBe(false);
  });
});
