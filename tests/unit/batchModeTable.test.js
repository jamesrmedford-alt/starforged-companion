/**
 * STARFORGED COMPANION
 * tests/unit/batchModeTable.test.js
 *
 * Batch Mode (issue #340) on a simulated table (tests/helpers/multiClient.js):
 * a GM and three players, each with a PC, Claude answered at the fetch
 * boundary. Each player acts through their Round window's relays
 * (src/batch/relay.js); the canonical GM's driver (src/batch/driver.js) reads,
 * resolves, rolls, records and narrates. The window itself renders the view
 * model (src/batch/roundView.js), pinned in batchRoundView.test.js.
 *
 * Mocked leaves, as elsewhere (multiplayerConcurrency.test.js): the pacing
 * decision and the interpreter answer by the line, the ability scan finds
 * nothing, the dice are scripted inside the REAL resolveMove, and the capture
 * pass's detection is a no-op (its 2 s timer would land in a later test).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({
  pace: null, interpret: null, dice: [], calls: [],
}));
vi.mock('../../src/pacing/router.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    // A free-flow line (the mode off, a non-participant's card move): a move.
    routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
    decidePacing: vi.fn(async ({ playerText }) => {
      control.calls.push({ fn: 'decidePacing', client: globalThis.game?.user?.id ?? null, text: playerText });
      return control.pace(playerText);
    }),
  };
});
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    interpretMove: vi.fn(async (text) => {
      control.calls.push({ fn: 'interpretMove', client: globalThis.game?.user?.id ?? null, text });
      return control.interpret(text);
    }),
  };
});
vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/entities/entityExtractor.js', async (importOriginal) => ({
  ...(await importOriginal()),
  runCombinedDetectionPass: vi.fn(async () => ({ worldJournal: [], entities: [], renames: [] })),
  appendGenerativeTierUpdates: vi.fn(async () => {}),
}));
vi.mock('../../src/moves/resolver.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random');
      for (const d of control.dice.shift() ?? []) dice.mockReturnValueOnce(d);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude, holdWrites } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const P3 = Object.freeze({ id: 'pl-3', name: 'Rook', isGM: false });
const NARRATION_MODEL = 'claude-sonnet-5-5';
const ROUND_REPLY = 'Kira slips through the vent as Ren keeps the corridor covered.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

// challenge 3 and 4, action die 6 (+edge 2 = 8): a strong hit.
const STRONG = [0.25, 0.35, 0.9];
// challenge 4 and 8, action die 3 (+edge 2 = 5): a weak hit a burn of 9 raises.
const WEAK   = [0.35, 0.75, 0.4];
// challenge 9 and 10, action die 1 (+edge 2 = 3): a miss.
const MISS   = [0.85, 0.95, 0.0];

const FACE_DANGER = { moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 'risky', mischiefApplied: false };
const MOVE = { runMove: true, decision: 'MOVE', suggestedMove: null };
const NARRATIVE = { runMove: false, decision: 'NARRATIVE', suggestedMove: null, suggestedTargetId: null };

let table;
const world = () => table.world.campaignState();
const round = () => table.world.getSetting('batchMode.round');
const roundCards = () => table.cards(f => f.narratorCard && f.roundId);
const narrations = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL);
let seq = 0;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2, P3] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.pace = (text) => (/^I (keep|watch|wait)/.test(text) ? { ...NARRATIVE } : { ...MOVE });
  control.interpret = () => ({ ...FACE_DANGER });
  control.dice = [];
  control.calls = [];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    narratorSessionSummary: false,
    combatTrackerEnabled: false,
    campaignState: {
      ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1,
      currentSceneId: 'sc-1', sceneTruths: [],
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [] } });
  table.addActor({ id: 'pc-ash',  name: 'Ash',  ownership: { 'pl-3': 3 }, items: { contents: [] } });
  scriptClaude(table, { fallback: () => ROUND_REPLY });
  silenceConsoleErrors();
});

async function relay(userId, kind, payload) {
  const c = table.client(userId);
  const gmRelay = await c.import('../../src/multiplayer/gmRelay.js');
  const res = await c.run(() => gmRelay.requestGmAction(kind, payload));
  await table.settle();
  return res;
}

async function batchModeOn() {
  await table.client('gm-1').setSetting('batchMode.enabled', true);
  await table.settle();
}

async function submit(userId, text) {
  const submissionId = `sub-${userId}-${++seq}`;
  await relay(userId, 'batch.submit', { roundId: round().id, text, submissionId });
  return submissionId;
}

async function confirm(userId, choices = {}) {
  const r = round();
  return relay(userId, 'batch.confirm', { roundId: r.id, submissionId: r.entries[userId].submissionId, choices });
}

const pass = (userId) => relay(userId, 'batch.pass', { roundId: round().id });

describe('turning Batch Mode on', () => {
  it('opens one round, with an entry for each participant — a second write opens nothing more', async () => {
    await batchModeOn();
    const r = round();
    expect(r).toMatchObject({ number: 1, phase: 'collecting', sessionId: 'sess-1' });
    expect(Object.keys(r.entries).sort()).toEqual(['pl-1', 'pl-2', 'pl-3']);
    expect(r.entries['pl-1']).toMatchObject({ actorId: 'pc-kira', status: 'waiting' });

    // A GM with no assigned PC is no participant — never another player's PC.
    expect(r.entries['gm-1']).toBeUndefined();

    const id = r.id;
    await table.client('gm-1').setSetting('batchMode.enabled', true);   // unchanged: no update
    await table.settle();
    expect(round().id).toBe(id);
  }, 30_000);
});

describe('a round', () => {
  it('reads each action once on the GM, resolves on the last confirm, narrates once, credits the roller, and opens round 2', async () => {
    await batchModeOn();
    control.dice = [STRONG];
    const momentumBefore = { kira: table.actors.get('pc-kira').system.momentum.value, ren: table.actors.get('pc-ren').system.momentum.value };

    await submit('pl-1', 'I slip through the vent before the drones turn.');
    await submit('pl-2', 'I keep the corridor covered.');
    await pass('pl-3');

    // Each reading ran once, on the canonical GM.
    const readings = control.calls.filter(c => c.fn === 'decidePacing');
    expect(readings.map(c => c.client)).toEqual(['gm-1', 'gm-1']);
    expect(control.calls.filter(c => c.fn === 'interpretMove').map(c => c.client)).toEqual(['gm-1']);
    expect(round().entries['pl-1']).toMatchObject({ status: 'read', reading: { kind: 'move', moveId: 'face_danger' } });
    expect(round().entries['pl-2']).toMatchObject({ status: 'read', reading: { kind: 'narrative' } });

    await confirm('pl-1');
    expect(round().phase).toBe('collecting');            // Ren has not confirmed
    await confirm('pl-2');
    await table.drain();

    // One narration, both actions, Ash named nowhere.
    expect(narrations()).toHaveLength(1);
    const call = narrations()[0];
    expect(call.userText).toContain('Kira');
    expect(call.userText).toContain('Ren');
    expect(call.userText).toContain('I slip through the vent');
    expect(`${call.system}\n${call.userText}`).not.toMatch(/\bAsh\b/);
    expect(roundCards()).toHaveLength(1);
    expect(roundCards()[0].flags[MODULE_ID].roundEntries.map(e => e.playerName)).toEqual(['Kira', 'Ren']);

    // Kira's strong hit is Kira's.
    expect(table.actors.get('pc-kira').system.momentum.value).toBe(momentumBefore.kira + 1);
    expect(table.actors.get('pc-ren').system.momentum.value).toBe(momentumBefore.ren);

    expect(world().pendingMove).toBe(false);
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
  }, 30_000);

  it('Send now resolves without the player who hasn\'t acted, who is named nowhere — and a player\'s Send now is refused', async () => {
    await batchModeOn();
    control.dice = [STRONG];
    await submit('pl-1', 'I slip through the vent before the drones turn.');
    await confirm('pl-1');
    expect(round().phase).toBe('collecting');

    const refused = await relay('pl-2', 'batch.sendNow', { roundId: round().id });
    expect(round().phase).toBe('collecting');
    expect(table.cards(f => f.batchRefusedNotice).map(c => c.whisper)).toEqual([['pl-2']]);
    expect(refused).toMatchObject({ ok: true, relayed: true });

    await relay('gm-1', 'batch.sendNow', { roundId: round().id });
    await table.drain();
    expect(narrations()).toHaveLength(1);
    const call = narrations()[0];
    expect(`${call.system}\n${call.userText}`).not.toMatch(/\bRen\b|\bAsh\b/);
    expect(roundCards()[0].flags[MODULE_ID].roundEntries.map(e => e.playerName)).toEqual(['Kira']);
    expect(table.cards().filter(m => /Ren|Ash/.test(m.content ?? '') && m.flags?.[MODULE_ID]?.batchNotice)).toEqual([]);
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
  }, 30_000);
});

describe('typed chat while Batch Mode is on', () => {
  it('is table talk: no reading, no narration; its author is told once a round and keeps it as a draft', async () => {
    await batchModeOn();
    await table.client('pl-1').chat('I think we should check the vents first.', { speaker: { actor: 'pc-kira' } });
    await table.settle();
    await table.client('pl-1').chat('Seriously, the vents.', { speaker: { actor: 'pc-kira' } });
    await table.settle();

    expect(control.calls).toEqual([]);
    expect(narrations()).toEqual([]);
    const told = table.client('pl-1').notifications.filter(n => /table talk/.test(n.message));
    expect(told).toHaveLength(1);
    expect(table.client('pl-1').getSetting('batchMode.draft')).toBe('I think we should check the vents first.');
    // Nobody else is told.
    expect(table.client('pl-2').notifications.filter(n => /table talk/.test(n.message))).toEqual([]);
  }, 30_000);
});

/** A card button's move, as cardActions posts it on the canonical GM: the roller's line, forced. */
async function cardMove(actorId, moveId, extra = {}) {
  const msg = await table.client('gm-1').run(() => globalThis.ChatMessage.create({
    content: extra.content ?? 'I press the attack from the card.',
    speaker: { actor: actorId },
    flags: { [MODULE_ID]: { bypassPacing: true, forcedMoveId: moveId, deferWhileBusy: true, ...(extra.flags ?? {}) } },
  }));
  await table.settle();
  return msg;
}

async function journal() {
  const gm = table.client('gm-1');
  const store = await gm.import('../../src/ui/progressTracks.js');
  if (!table.journal.get('tracks-journal')) {
    table.journal._set({ id: 'tracks-journal', name: 'Starforged Progress Tracks', _flags: {},
      getFlag(mod, key) { return this._flags[`${mod}.${key}`]; },
      async setFlag(mod, key, value) { this._flags[`${mod}.${key}`] = structuredClone(value); } });
  }
  return { gm, store };
}

describe('upgrades are decided before the narration', () => {
  async function weakHitRound() {
    table.actors.get('pc-kira').system.momentum.value = 9;
    await batchModeOn();
    control.dice = [WEAK];
    await submit('pl-1', 'I slip through the vent before the drones turn.');
    await confirm('pl-1');
    await pass('pl-2');
    await pass('pl-3');
    await table.drain();
  }
  // The result card the round recorded for Kira's roll (its id is the round's).
  const resultCard = () => ({ id: round().entries['pl-1']?.rolled?.cardId ?? lastCardId });
  let lastCardId = null;

  it('the round waits for the roller, with the move lock free; a Burn from the window applies once and the narration tells the strong hit', async () => {
    await weakHitRound();
    expect(round()).toMatchObject({ phase: 'upgrading' });
    expect(round().entries['pl-1'].upgrade).toMatchObject({ burn: { previewOutcome: 'strong_hit' }, decided: null });
    expect(world().pendingMove).toBe(false);          // no lock across the wait
    expect(narrations()).toEqual([]);

    const card = resultCard();
    lastCardId = card.id;
    await relay('pl-1', 'move.burnMomentum', { messageId: card.id });
    await table.drain();
    expect(table.world.message(card.id).flags[MODULE_ID].burn.consumed).toBe(true);
    // A second press — the card's own button — changes nothing.
    await relay('pl-1', 'move.burnMomentum', { messageId: card.id });
    await table.drain();

    expect(narrations()).toHaveLength(1);
    expect(narrations()[0].userText).toMatch(/Face Danger[^\n]*: strong hit/);
    expect(narrations()[0].userText).not.toMatch(/weak hit/);
    expect(roundCards()).toHaveLength(1);
    expect(roundCards()[0].flags[MODULE_ID].roundEntries[0].outcome).toBe('strong_hit');
    expect(table.cards(f => f.narratorCard && !f.roundId)).toEqual([]);   // no narration of its own
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
  }, 30_000);

  it('Keep narrates the result as rolled, and closes the card\'s Burn Momentum', async () => {
    await weakHitRound();
    lastCardId = resultCard().id;
    await relay('pl-1', 'batch.keep', { roundId: round().id });
    await table.drain();
    expect(narrations()).toHaveLength(1);
    expect(narrations()[0].userText).toMatch(/: weak hit/);
    const burn = () => table.world.message(resultCard().id).flags[MODULE_ID].burn;
    expect(burn().roundClosed).toBe(true);
    expect(burn().consumed).not.toBe(true);
    // The card's own Burn is refused now.
    await relay('pl-1', 'move.burnMomentum', { messageId: resultCard().id });
    await table.drain();
    expect(burn().consumed).not.toBe(true);
  }, 30_000);

  it('Send now during the upgrade step means Keep; a card\'s move pressed meanwhile joins the next round, not free-flow', async () => {
    await weakHitRound();
    const { resolveMove } = await import('../../src/moves/resolver.js');
    const rolls = resolveMove.mock.calls.length;
    await cardMove('pc-ren', 'face_danger', { content: 'I cover Kira from the doorway.' });
    await table.drain();
    expect(resolveMove.mock.calls.length).toBe(rolls);        // held, not rolled as free-flow
    expect(round().phase).toBe('upgrading');

    await relay('gm-1', 'batch.sendNow', { roundId: round().id });
    await table.drain();
    expect(narrations()).toHaveLength(1);
    expect(narrations()[0].userText).toMatch(/: weak hit/);
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
    // Ren's card move is Ren's entry in round 2, read as Face Danger, waiting for Quinn's confirm.
    expect(round().entries['pl-2']).toMatchObject({ status: 'read', text: 'I cover Kira from the doorway.', reading: { kind: 'move', moveId: 'face_danger' } });
  }, 30_000);

  it('after the narration, the round\'s result cards\' Burn / Improve are closed', async () => {
    await weakHitRound();
    lastCardId = resultCard().id;
    await relay('gm-1', 'batch.sendNow', { roundId: round().id });
    await table.drain();
    const f = table.world.message(resultCard().id).flags[MODULE_ID];
    expect(f.burn.roundClosed).toBe(true);
    expect(f.burn.consumed).not.toBe(true);
  }, 30_000);
});

describe('a track the round ends', () => {
  it('Kira\'s Take Decisive Action wins the fight Ren\'s Strike named: Ren is not rolled, the card says why, the narration has Ren\'s action', async () => {
    const { gm, store } = await journal();
    const fight = await gm.run(() => store.addProgressTrack({ label: 'Archive guards', type: 'combat', rank: 'troublesome' }));
    await gm.run(() => store.markProgressById(fight.id, 9));   // full: a decisive action wins
    await batchModeOn();
    control.interpret = (text) => (/decisive/i.test(text)
      ? { moveId: 'take_decisive_action', moveName: 'Take Decisive Action', statUsed: null, adds: 0, isProgressMove: true, moveTarget: 'Archive guards', rationale: 'r', mischiefApplied: false }
      : { moveId: 'strike', moveName: 'Strike', statUsed: 'iron', adds: 0, moveTarget: 'Archive guards', rationale: 'r', mischiefApplied: false });
    control.dice = [[0.0, 0.05]];   // challenge 1 and 1: the progress roll wins

    await submit('pl-1', 'I take decisive action against the guards.');
    await submit('pl-2', 'I strike the nearest guard.');
    await pass('pl-3');
    await confirm('pl-1');
    await confirm('pl-2');
    await table.drain();

    const tracks = await gm.run(() => store.listProgressTracks());
    expect(tracks.find(t => t.id === fight.id)?.completed).toBe(true);
    expect(round().number).toBe(2);
    const refused = table.cards(f => f.roundRefusedCard);
    expect(refused).toHaveLength(1);
    expect(refused[0].content).toMatch(/Ren — Strike: not rolled/);
    expect(refused[0].content).toMatch(/Archive guards ended earlier in this round/);
    expect(table.cards(f => f.moveResolution && f.roundId).map(c => c.flags[MODULE_ID].roundUserId)).toEqual(['pl-1']);
    const user = narrations()[0].userText;
    expect(user).toContain('### 2. Ren — Strike: not rolled');
    expect(user).toContain('I strike the nearest guard.');
  }, 30_000);
});

describe('a card button\'s move', () => {
  it('while collecting, becomes its roller\'s entry, waiting for their confirm', async () => {
    await batchModeOn();
    await cardMove('pc-kira', 'face_danger', { content: 'I dive for the console.' });
    await table.drain();
    expect(round().entries['pl-1']).toMatchObject({ status: 'read', text: 'I dive for the console.', reading: { moveId: 'face_danger' } });
    expect(table.cards(f => f.moveResolution)).toEqual([]);
  }, 30_000);

  it('beside an action already submitted, is offered — the window asks which to keep', async () => {
    await batchModeOn();
    await submit('pl-1', 'I slip through the vent.');
    await cardMove('pc-kira', 'face_danger', { content: 'I dive for the console.' });
    expect(round().entries['pl-1']).toMatchObject({ status: 'read', text: 'I slip through the vent.', offer: { text: 'I dive for the console.' } });
    const r = round();
    await relay('pl-1', 'batch.reread', { roundId: r.id, submissionId: r.entries['pl-1'].submissionId, newSubmissionId: 'use-offer', useOffer: true });
    expect(round().entries['pl-1']).toMatchObject({ status: 'read', text: 'I dive for the console.', offer: null });
  }, 30_000);

  it('whose roller is no participant runs as today — at once while the round collects', async () => {
    table.addActor({ id: 'pc-orphan', name: 'Vex', ownership: {}, items: { contents: [] } });
    await batchModeOn();
    control.dice = [STRONG];
    await cardMove('pc-orphan', 'face_danger', { content: 'Vex hurls the grenade.' });
    await table.drain();
    expect(table.cards(f => f.moveResolution && !f.roundId)).toHaveLength(1);
    expect(round().entries['pc-orphan']).toBeUndefined();
  }, 30_000);
});

describe('the round\'s narration, and what it leaves for the next', () => {
  it('composition: the request carries each entry\'s real move outcome and line; the next free-flow narration\'s RECENT SCENE carries the round\'s lines', async () => {
    await batchModeOn();
    control.dice = [STRONG];
    await submit('pl-1', 'I slip through the vent before the drones turn.');
    await submit('pl-2', 'I keep the corridor covered.');
    await pass('pl-3');
    await confirm('pl-1');
    await confirm('pl-2');
    await table.drain();
    const roundCall = narrations()[0];
    // The real resolver's outcome text, and each player's line.
    expect(roundCall.userText).toMatch(/\[MOVE: Face Danger \+edge\] \[ROLL: Action: 6 \+ 2 = 8 vs Challenge: 3, 4\] \[OUTCOME: Strong Hit\]/);
    expect(roundCall.userText).toContain('Kira: "I slip through the vent before the drones turn."');
    expect(roundCall.userText).toContain('Ren: "I keep the corridor covered."');

    // Batch Mode off: a typed line is free-flow again, and its narration remembers the round.
    await table.client('gm-1').setSetting('batchMode.enabled', false);
    await table.settle();
    control.dice = [STRONG];
    await table.client('pl-1').chat('I seal the vent behind us.', { speaker: { actor: 'pc-kira' } });
    await table.settle();
    await table.drain();
    expect(narrations()).toHaveLength(2);
    const next = narrations()[1].userText;
    expect(next).toMatch(/## RECENT SCENE[\s\S]*PLAYER — Kira wrote: "I slip through the vent before the drones turn\."\nPLAYER — Ren wrote: "I keep the corridor covered\."/);
  }, 30_000);
});

describe('concurrency while a round resolves', () => {
  it('the X-Card played during the round\'s narration: the reply is discarded, the paused notice posts, the moves stand', async () => {
    await batchModeOn();
    control.dice = [STRONG];
    const held = scriptClaude(table, { fallback: () => ROUND_REPLY }).hold(c => c.model === NARRATION_MODEL);
    const before = table.actors.get('pc-kira').system.momentum.value;
    await submit('pl-1', 'I slip through the vent before the drones turn.');
    await confirm('pl-1');
    await pass('pl-2');
    await pass('pl-3');
    await held.arrived;
    expect(round().phase).toBe('narrating');

    await table.client('pl-2').chat('!x');
    await table.settle();
    expect(world().xCardActive).toBe(true);
    held.release(ROUND_REPLY);
    await table.drain();

    expect(roundCards()).toEqual([]);
    expect(table.cards(f => f.narrationPaused && f.roundId)).toHaveLength(1);
    expect(table.cards(f => f.moveResolution && f.roundId)).toHaveLength(1);       // the move stands
    expect(table.actors.get('pc-kira').system.momentum.value).toBe(before + 1);
    expect(world().pendingMove).toBe(false);
    // Round 2 opens but can't resolve while the X-Card is in play.
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
    await submit('pl-1', 'I check the next junction.');
    await confirm('pl-1');
    await pass('pl-2');
    await pass('pl-3');
    await table.drain();
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
  }, 30_000);

  it('a !bond relayed mid-round survives the round\'s records; a submission while it rolls is refused with a reason, not lost; one after it lands in the next round', async () => {
    await table.reset({ world: { settings: {
      chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
      campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [],
        legacyTracks: { bonds: { ticks: 4, cleared: false } } },
    } } });
    await table.setClaudeKey('gm-1', 'sk-ant-gina');
    table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
    table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [] } });
    table.addActor({ id: 'pc-ash',  name: 'Ash',  ownership: { 'pl-3': 3 }, items: { contents: [] } });
    scriptClaude(table, { fallback: () => ROUND_REPLY });
    await batchModeOn();
    control.dice = [STRONG];

    // Hold the round's result card — the round is rolling, its record not yet written.
    const held = holdWrites(table, w => w.kind === 'message.create' && w.data?.flags?.[MODULE_ID]?.moveResolution === true);
    await submit('pl-1', 'I slip through the vent before the drones turn.');
    await confirm('pl-1');
    await pass('pl-2');
    await submit('pl-3', 'I cover the rear.');
    await confirm('pl-3');
    await held.arrived;
    expect(round().phase).toBe('rolling');

    // Ren's player: a !bond (its legacy ticks relayed to the GM) and a late submission.
    const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.9).mockReturnValueOnce(0.25).mockReturnValueOnce(0.35);
    try {
      await table.client('pl-2').chat('!bond dangerous');
      await table.settle();
    } finally { dice.mockRestore(); }
    expect(world().legacyTracks.bonds.ticks).toBe(6);
    const roundId = round().id;
    await relay('pl-2', 'batch.submit', { roundId, text: 'Wait — I follow after all.', submissionId: 'late' });
    expect(table.cards(f => f.batchRefusedNotice).filter(c => c.whisper?.includes('pl-2')).map(c => c.content).join())
      .toMatch(/already being resolved — your action is kept/);

    held.release();
    await table.drain();
    expect(world().legacyTracks.bonds.ticks).toBe(6);            // the round's records kept it
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
    await relay('pl-2', 'batch.submit', { roundId: round().id, text: 'Wait — I follow after all.', submissionId: 'late-2' });
    expect(round().entries['pl-2']).toMatchObject({ status: 'read', text: 'Wait — I follow after all.' });
  }, 30_000);
});
