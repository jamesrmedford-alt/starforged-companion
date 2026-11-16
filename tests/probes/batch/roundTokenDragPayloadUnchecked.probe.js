/* global silenceConsoleErrors -- tests/setup.js */
/**
 * PROBE — BATCH · ROUND-TOKEN-DRAG-PAYLOAD-UNCHECKED (INCOMPLETE-FIX of issue #347 AB23)
 *
 * Scenario: Batch Mode is on. A player's hand-made chat message carries the
 * flags a ship-token drop posts — a forced Set a Course with
 * `tokenDragSetCourse: { sceneId, tokenId, destX, destY }` — but the payload
 * names a foe's token on an encounter Scene the GM prepared. In Batch Mode a
 * forced post becomes its roller's round entry; the player confirms it and the
 * round rolls a hit.
 *
 * Correct (AB23, decisions.md "a forged request can only cause an effect the
 * UI could legitimately have produced"): the payload is checked as free-flow
 * checks it (sectorSceneHooks.js checkedTokenDragCourse — a sector Scene, the
 * command vehicle's token, a settlement pin): no token is moved by it, and the
 * Set a Course is still rolled.
 *
 * Today: only index.js's free-flow pipeline reads the flag through
 * checkedTokenDragCourse. The round driver copies it raw
 * (driver.js forcedFromFlags → readAction → reading.forced → rollEntry →
 * rollMove), and on the hit the resolving GM's client moves the foe's token.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [] }));
vi.mock('../../../src/moves/abilityScanner.js', async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../../src/entities/entityExtractor.js', async (original) => ({
  ...(await original()),
  runCombinedDetectionPass: vi.fn(async () => ({ worldJournal: [], entities: [], renames: [] })),
  appendGenerativeTierUpdates: vi.fn(async () => {}),
}));
vi.mock('../../../src/moves/resolver.js', async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, 'random');
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const STRONG_HIT = [0.05, 0.05, 0.99];   // challenge 1, 1; action die 6

let table, pc, shipToken, raiderToken;
const round = () => table.world.getSetting('batchMode.round');

function makeToken(id, x, y, flags = {}) {
  const token = { id, x, y, flags, actorId: null };
  token.update = vi.fn(async (changes) => { Object.assign(token, changes); return token; });
  return token;
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    campaignState: {
      ...CampaignStateSchema, sessionActive: true, currentSessionId: 's1', sessionNumber: 1,
      currentSceneId: 'scene-1', sceneTruths: [], clocks: [],
      sectors: [{ id: 'sec-1', name: 'Vega Reach' }], activeSectorId: 'sec-1',
      settlementIds: ['actor-bleak'], shipIds: ['ship-cv'],
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  pc = table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  table.addActor({
    id: 'ship-cv', type: 'starship', name: 'Wayfarer',
    flags: { [MODULE_ID]: { entityType: 'ship', ship: { _id: 'rec-ship', name: 'Wayfarer', isCommandVehicle: true, integritySheetReconciled: true } } },
  });
  table.addActor({
    id: 'actor-bleak', type: 'location', name: 'Bleakhold',
    system: { subtype: 'settlement', klass: 'orbital' },
    flags: { [MODULE_ID]: { entityType: 'settlement', settlement: { _id: 'rec-bleak', name: 'Bleakhold', sectorId: 'sec-1' } } },
  });
  // The sector map: the ship's token and Bleakhold's pin at (500, 300) …
  shipToken = makeToken('tok-ship', 100, 100, { [MODULE_ID]: { commandVehicle: true, sectorId: 'sec-1' } });
  table.scenes._reset();
  table.scenes.set('scene-sector', {
    id: 'scene-sector', flags: { [MODULE_ID]: { sectorScene: true, sectorId: 'sec-1' } },
    tokens: { contents: [shipToken] },
    notes: { contents: [{ id: 'note-bleak', x: 500, y: 300, text: 'Bleakhold',
      flags: { [MODULE_ID]: { settlementId: 'rec-bleak', actorId: 'actor-bleak' } } }] },
  });
  // … and an encounter Scene the GM prepared: a foe's token no player owns.
  raiderToken = makeToken('tok-raider', 1200, 800);
  table.scenes.set('scene-ambush', {
    id: 'scene-ambush', flags: {},
    tokens: { contents: [raiderToken] }, notes: { contents: [] },
  });
  scriptClaude(table, { fallback: () => 'You arrive.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  control.dice = STRONG_HIT;
  silenceConsoleErrors();
});

/** Batch Mode on; the player's forced Set a Course (this payload) becomes their entry; they confirm; the round resolves. */
async function setCourseInARound(tokenDragSetCourse) {
  await table.client('gm-1').setSetting('batchMode.enabled', true);
  await table.settle();
  expect(round(), 'setup: a round is collecting').toMatchObject({ phase: 'collecting' });
  const roundId = round().id;

  await table.client('pl-1').chat('I set a course for Bleakhold.', {
    speaker: { actor: pc.id },
    flags: { [MODULE_ID]: {
      bypassPacing: true, forcedMoveId: 'set_a_course',
      forcedMoveTarget: 'Bleakhold', forcedMoveTargetId: 'actor-bleak',
      tokenDragSetCourse,
    } },
  });
  await table.settle(); await table.drain();
  const entry = round().entries['pl-1'];
  expect(entry, 'setup: the forced post is the player\'s entry, read as Set a Course').toMatchObject({
    status: 'read', reading: { kind: 'move', moveId: 'set_a_course' } });

  const c = table.client('pl-1');
  const gmRelay = await c.import('../../src/multiplayer/gmRelay.js');
  await c.run(() => gmRelay.requestGmAction('batch.confirm', { roundId, submissionId: entry.submissionId, choices: {} }));
  await table.settle(); await table.drain();
}
const moveCards = () => table.cards(f => f.moveResolution);

describe('BATCH — the token a Set a Course drop moves, when the drop is a round entry', () => {
  it('a payload naming another token on another Scene moves nothing — the Set a Course is still rolled', async () => {
    await setCourseInARound({ sceneId: 'scene-ambush', tokenId: 'tok-raider', destX: 0, destY: 0 });

    expect(moveCards(), 'setup: the round rolled the move').toHaveLength(1);
    expect(moveCards()[0].content, 'setup: a hit').toMatch(/Strong Hit/i);
    // FAILS today: the GM's client moved the foe's token to (0, 0).
    expect(raiderToken.update).not.toHaveBeenCalled();
    expect({ x: raiderToken.x, y: raiderToken.y }).toEqual({ x: 1200, y: 800 });
  }, 60_000);

  it('control: the real drop\'s payload moves the ship\'s own token onto its pin', async () => {
    await setCourseInARound({ sceneId: 'scene-sector', tokenId: 'tok-ship', destX: 500, destY: 300 });
    expect(moveCards()).toHaveLength(1);
    expect(shipToken.update).toHaveBeenCalledWith({ x: 500, y: 300 }, { sfcPositionSync: true });
    expect(raiderToken.update).not.toHaveBeenCalled();
  }, 60_000);
});
