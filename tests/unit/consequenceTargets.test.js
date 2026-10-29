/**
 * STARFORGED COMPANION
 * tests/unit/consequenceTargets.test.js
 *
 * A move's consequences change what the move was about (issue #309), on a
 * booted GM / player table, through the real move pipeline: the interpreter
 * answers a typed move, the REAL resolveMove rolls scripted dice, and the
 * suffer-choice card's buttons are clicked by the player.
 *
 *   - N02: Withstand Damage's integrity choices went to the PC's meters,
 *     which have no integrity — dropped, and reported applied. The vehicle
 *     the roll read now rides onto the card.
 *   - N03: Companion Takes a Hit's health changes went the same way, and the
 *     weak hit's recovery was always unavailable. The companion the roll read
 *     now rides onto the card, and the strong hit heals that one.
 *   - N07: a pick is claimed before its effects; a write the world refuses
 *     after the claim is told on the card and goes to the GMs, whose Retry
 *     applies it once — the pick itself cannot be pressed again.
 *   - N04: Gain Ground's "Mark progress" re-selected the sole open fight when
 *     clicked: with two open it marked nothing, and an old choice marked a
 *     fight opened after its own had finished. The move's fight (the
 *     pipeline's moveFight) now rides onto the card. Tracks are written by
 *     the real store (src/ui/progressTracks.js) on the GM's client.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

// The pipeline: no pacing call, the confirm dialog accepted, the interpreter
// answering `control.interpretation` (a typed move), and scripted dice inside
// the REAL resolveMove (`control.dice`, consumed in order).
const control = vi.hoisted(() => ({ dice: [], interpretation: null }));
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
  confirmInterpretation: vi.fn(async () => true),
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

const REPLY = 'Sparks fly across the deck.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
// d10 challenge dice: 0.25 → 3, 0.35 → 4; d6 action die: 0.9 → 6, 0.2 → 2.
const STRONG = [0.25, 0.35, 0.9];
const WEAK   = [0.25, 0.35, 0.2];

let table, pat, journal;
const world = () => table.world.campaignState();
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

/** Open (or update) a track through the real store on the GM's client. */
async function openTrack(label, { type = 'combat', rank = 'dangerous', ...fields } = {}) {
  const gm = table.client('gm-1');
  const store = await gm.import('../../src/ui/progressTracks.js');
  return gm.run(async () => {
    const created = await store.addProgressTrack({ label, type, rank });
    await store.updateTrackFields(created.id, fields);
    return created;
  });
}
const sessionLog = () => world().sessionLogs?.['sess-1'] ?? [];
const sufferCards = (moveId) => table.cards(f => f.sufferCard && f.moveId === moveId);

/** A vendor-shaped Companion asset (subtypes/asset.ts): its health is the track. */
function companion(id, value) {
  const item = {
    id, name: id, type: 'asset',
    system: { category: 'Companion', abilities: [], track: { enabled: true, name: 'Health', value, min: 0, max: 3 } },
    update: async (changes) => {
      if ('system.track.value' in changes) item.system.track.value = changes['system.track.value'];
    },
  };
  return item;
}

/** A player types a move; the canonical GM's pipeline runs it. */
async function typedMove(interpretation, dice) {
  control.interpretation = interpretation;
  control.dice = dice;
  await table.client('pl-1').chat('I brace for it.', { speaker: { actor: 'pc-pat' } });
  await table.settle();
  await table.drain();
}

/** The player clicks option `i` on the move's suffer-choice card. */
async function choose(moveId, i) {
  const cards = sufferCards(moveId);
  expect(cards, 'one suffer-choice card').toHaveLength(1);
  table.client('pl-1').click(cards[0]._id, `[data-option-index="${i}"]`);
  await table.settle();
  await table.drain();
  return table.world.message(cards[0]._id);
}

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.dice = [];
  control.interpretation = null;
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    campaignState: {
      ...CampaignStateSchema,
      sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [],
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  journal = makeTracksJournal();
  table.journal._set(journal);
  scriptClaude(table, { fallback: () => REPLY });
});

describe('Companion Takes a Hit — the companion the roll was made for (issue #309 N03)', () => {
  let glow, drone;
  beforeEach(() => {
    glow  = companion('glowcat', 2);
    drone = companion('drone', 1);
    pat = table.addActor({ id: 'pc-pat', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [glow, drone] } });
  });
  const move = { moveId: 'companion_takes_a_hit', statUsed: 'companion_health', adds: 0, confidence: 1 };

  it('a strong hit gives that companion +1 health', async () => {
    await typedMove(move, STRONG);
    expect(sessionLog().map(e => [e.moveId, e.outcome])).toEqual([['companion_takes_a_hit', 'strong_hit']]);
    expect({ glow: glow.system.track.value, drone: drone.system.track.value }).toEqual({ glow: 3, drone: 1 });
  });

  it('a weak hit offers the recovery, and the trade heals that companion for a momentum', async () => {
    await typedMove(move, WEAK);
    const [card] = sufferCards('companion_takes_a_hit');
    expect(card.content).not.toMatch(/data-option-index="0"[^>]*disabled/);
    expect(card.flags[MODULE_ID].executorOpts.companionItemId).toBe('glowcat');

    const resolved = await choose('companion_takes_a_hit', 0);
    expect(resolved.flags[MODULE_ID].resolved).toBe(true);
    expect({ glow: glow.system.track.value, momentum: pat.system.momentum.value }).toEqual({ glow: 3, momentum: 1 });
  });
});

describe('Withstand Damage — the vehicle the roll was made against (issue #309 N02)', () => {
  let ship;
  beforeEach(async () => {
    pat = table.addActor({ id: 'pc-pat', name: 'Kira', ownership: { 'pl-1': 3 } });
    ship = table.addActor({ id: 'ship-wayfarer', name: 'Wayfarer', type: 'starship', flags: { [MODULE_ID]: {
      entityType: 'ship',
      ship: { _id: 'ship-rec', name: 'Wayfarer', isCommandVehicle: true, integrity: 2, integrityMax: 5, battered: false },
    } } });
    await table.client('gm-1').run(() => game.settings.set(MODULE_ID, 'campaignState', { ...world(), shipIds: [ship.id] }));
  });
  const move = { moveId: 'withstand_damage', statUsed: 'integrity', adds: 0, confidence: 1 };
  const integrity = () => ship.flags[MODULE_ID].ship.integrity;

  it('a strong hit\'s +1 integrity raises it', async () => {
    await typedMove(move, STRONG);
    expect(sufferCards('withstand_damage')[0].flags[MODULE_ID].executorOpts.vehicleActorId).toBe('ship-wayfarer');
    const resolved = await choose('withstand_damage', 0);
    expect(resolved.content).toContain('integrity +1');
    expect(integrity()).toBe(3);
  });

  it('a weak hit\'s trade costs a momentum and raises it', async () => {
    await typedMove(move, WEAK);
    await choose('withstand_damage', 0);
    expect({ integrity: integrity(), momentum: pat.system.momentum.value }).toEqual({ integrity: 3, momentum: 1 });
  });

  // Issue #309 N07: the trade's momentum write is refused after the pick is
  // claimed. The integrity lands; the card says the momentum did not; the
  // GMs' Retry charges it once; the card's button stays spent.
  it('a refused write in the trade is told on the card, and the GMs\' Retry applies it once', async () => {
    await typedMove(move, WEAK);
    let spent = false;
    table.interceptWrites((w) => {
      if (spent || w.kind !== 'actor.update' || w.id !== 'pc-pat'
        || !Object.keys(w.changes ?? {}).some(k => k.includes('momentum'))) return undefined;
      spent = true;
      return new Error('refused by the test');
    });
    const resolved = await choose('withstand_damage', 0);
    expect({ integrity: integrity(), momentum: pat.system.momentum.value }).toEqual({ integrity: 3, momentum: 2 });
    expect(resolved.flags[MODULE_ID].resolved).toBe(true);
    expect(resolved.content).toContain('Not applied: Lose Momentum (-1) — the world did not save it');

    const [failCard] = table.cards(f => f.payoffFailureCard);
    expect(failCard.flags[MODULE_ID]).toMatchObject({ source: 'suffer', actorId: 'pc-pat' });
    expect(failCard.whisper).toEqual(['gm-1']);
    table.client('gm-1').click(failCard._id, '[data-action="sf-payoff-retry"]');
    await table.settle();
    await table.drain();
    expect(pat.system.momentum.value).toBe(1);

    // The resolved card shows no buttons; a stale client's press, and a
    // second Retry, apply nothing.
    expect(resolved.content).not.toContain('data-option-index');
    const gm = table.client('gm-1');
    const { requestGmAction } = await gm.import('../../src/multiplayer/gmRelay.js');
    const again = await gm.run(() => requestGmAction('suffer.pick', { messageId: resolved._id, pickKind: 'enum', optionIndex: '0' }));
    expect(again.result).toEqual({ applied: false, reason: 'already-resolved' });
    table.client('gm-1').click(failCard._id, '[data-action="sf-payoff-retry"]');
    await table.settle();
    await table.drain();
    expect({ integrity: integrity(), momentum: pat.system.momentum.value }).toEqual({ integrity: 3, momentum: 1 });
  });
});

describe('Gain Ground — "Mark progress" marks the fight the move was about (issue #309 N04)', () => {
  beforeEach(() => {
    pat = table.addActor({ id: 'pc-pat', name: 'Kira', ownership: { 'pl-1': 3 } });
  });
  const move = { moveId: 'gain_ground', statUsed: 'edge', statValue: 2, adds: 0, moveTarget: 'Boarders', confidence: 1 };

  it('with two fights open, the named fight gains the progress', async () => {
    const boarders = await openTrack('Boarders', { ticks: 0 });
    const turret   = await openTrack('Turret', { ticks: 0 });
    await typedMove(move, STRONG);
    expect(sufferCards('gain_ground')[0].flags[MODULE_ID].executorOpts.combatTrackId).toBe(boarders.id);

    const resolved = await choose('gain_ground', 0);
    expect({ boarders: track(boarders.id).ticks, turret: track(turret.id).ticks }).toEqual({ boarders: 8, turret: 0 });
    expect(resolved.flags[MODULE_ID].pickedIndices).toEqual([0]);
  });

  it('an old choice marks nothing once its fight is over — not a fight opened since', async () => {
    const boarders = await openTrack('Boarders', { ticks: 0 });
    await typedMove(move, WEAK);
    const gm = table.client('gm-1');
    const store = await gm.import('../../src/ui/progressTracks.js');
    await gm.run(() => store.updateTrackFields(boarders.id, { completed: true }));
    const turret = await openTrack('Turret', { ticks: 0 });

    const resolved = await choose('gain_ground', 0);
    expect(track(turret.id).ticks).toBe(0);
    expect(resolved.content).toContain('Not applied: combat progress ×1 — its fight is over');
  });
});
