/**
 * STARFORGED COMPANION
 * tests/unit/movePipelineStages.test.js
 *
 * Issue #340 Phase 0 — the move pipeline split into stages
 * (src/moves/movePipeline.js) with no behaviour change. A typed line ran as one
 * closure in src/index.js (registerChatHook's onMessage); Batch Mode needs its
 * stages separately — a round reads each action on Submit, rolls and records
 * every confirmed entry when it resolves, and narrates once. These tests run
 * the stages on their own, on the canonical GM of a simulated table, the way a
 * round does, and check they give what the free-flow line gives: the same
 * result card and the same record. The free-flow tests elsewhere keep pinning
 * the whole path (pipeline.test.js, multiplayerConcurrency.test.js, …).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [], interpretation: null, abilities: [], scans: 0 }));
vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => ({ ...control.interpretation })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => { control.scans += 1; return control.abilities.map(a => ({ ...a })); }),
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
      for (const d of control.dice) dice.mockReturnValueOnce(d);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

// challenge 3 and 4, action die 6 (+iron 3 = 9): a strong hit.
const STRONG = [0.25, 0.35, 0.9];
// challenge 4 and 8, action die 3 (+iron 3 = 6): a weak hit a burn of 9 raises.
const WEAK   = [0.35, 0.75, 0.4];
const FACE_DANGER = { moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'iron', adds: 0, rationale: 'test', mischiefApplied: false };
const LINE = 'I brace against the hull and push through the breach.';

let table, store, pipeline;
const gm = () => table.client('gm-1');
const world = () => table.world.campaignState();
const resultCards = () => table.cards(f => f.moveResolution);

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.dice = STRONG;
  control.interpretation = { ...FACE_DANGER };
  control.abilities = [];
  control.scans = 0;
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [] },
  } } });
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  scriptClaude(table);
  store    = await gm().import('../../src/ui/progressTracks.js');
  pipeline = await gm().import('../../src/moves/movePipeline.js');
  const journal = { id: 'tracks-journal', name: 'Starforged Progress Tracks', _flags: {},
    getFlag(mod, key) { return this._flags[`${mod}.${key}`]; },
    async setFlag(mod, key, value) { this._flags[`${mod}.${key}`] = structuredClone(value); } };
  table.journal._set(journal);
});

/** The canonical GM's working copy of campaignState, as a round takes it. */
const workingCopy = () => gm().run(() => foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')));

/** Read, roll, record and finish a line on the canonical GM — what a round does for one entry. */
async function runStages(narration = LINE, { speakerActorId = 'pc-kira' } = {}) {
  return gm().run(async () => {
    const campaignState = foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState'));
    const read = await pipeline.readMove({
      narration, speakerActorId, campaignState, apiKey: 'sk-ant-gina', dial: 'balanced', gatherChoices: true,
    });
    const rolled = await pipeline.rollMove({
      interpretation: read.interpretation, campaignState, speakerActorId, narration, combatPosition: read.combatPosition,
    });
    if (!rolled.refused) {
      await pipeline.recordMove(rolled, campaignState);
      await pipeline.finishMove(rolled, campaignState);
    }
    return { read, rolled };
  });
}

/** What a result card says, without the ids and times that differ run to run. */
function cardShape(card) {
  const f = card.flags[MODULE_ID];
  return {
    content: String(card.content).replace(/data-resolution-id="[^"]*"/g, ''),
    actorId: f.actorId ?? null,
    burn:    f.burn ? { canBurn: f.burn.canBurn, originalOutcome: f.burn.originalOutcome, originalApplied: f.burn.originalApplied ?? false } : null,
  };
}

describe('the stages run on their own give what the free-flow line gives', () => {
  it('the same result card and the same record as a typed line', async () => {
    // Free-flow: the player types the line; the canonical GM runs the closure.
    await table.client('pl-1').chat(LINE, { speaker: { actor: 'pc-kira' } });
    await table.settle();
    await table.drain();
    const typed = resultCards();
    expect(typed).toHaveLength(1);
    const typedCard   = cardShape(typed[0]);
    const typedMeters = { momentum: table.actors.get('pc-kira').system.momentum.value };

    // Again from the same start, through the stages alone.
    await table.reset({ world: { settings: {
      chronicleAutoEntry: false,
      combatTrackerEnabled: false,
      campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [] },
    } } });
    table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
    await table.setClaudeKey('gm-1', 'sk-ant-gina');
    scriptClaude(table);
    pipeline = await gm().import('../../src/moves/movePipeline.js');
    const { rolled } = await runStages();
    await table.settle();

    expect(rolled.refused).toBeNull();
    expect(rolled.resolution).toMatchObject({ moveId: 'face_danger', outcome: 'strong_hit', statUsed: 'iron' });
    const staged = resultCards();
    expect(staged).toHaveLength(1);
    expect(cardShape(staged[0])).toEqual(typedCard);
    expect({ momentum: table.actors.get('pc-kira').system.momentum.value }).toEqual(typedMeters);
    // The stages narrate nothing: a round narrates once, after every entry is recorded.
    expect(table.cards(f => f.narratorCard)).toEqual([]);
  }, 30_000);

  it('rollMove credits the roller it is given — the result card and the momentum are Kira\'s, not the first PC\'s', async () => {
    table.addActor({ id: 'pc-ren', name: 'Ren', ownership: {}, items: { contents: [] } });
    const before = { ren: table.actors.get('pc-ren').system.momentum.value, kira: table.actors.get('pc-kira').system.momentum.value };
    await runStages(LINE, { speakerActorId: 'pc-kira' });
    await table.settle();
    expect(resultCards()[0].flags[MODULE_ID].actorId).toBe('pc-kira');
    expect(table.actors.get('pc-kira').system.momentum.value).toBe(before.kira + 1);   // Face Danger's strong hit
    expect(table.actors.get('pc-ren').system.momentum.value).toBe(before.ren);
  }, 30_000);
});

describe('readMove', () => {
  it('a Take Decisive Action naming no fight of two open asks which — and a round\'s reading still scans the abilities', async () => {
    const a = await gm().run(() => store.addProgressTrack({ label: 'Archive guards', type: 'combat', rank: 'dangerous' }));
    const b = await gm().run(() => store.addProgressTrack({ label: 'Hull wraiths', type: 'combat', rank: 'formidable' }));
    control.interpretation = { moveId: 'take_decisive_action', moveName: 'Take Decisive Action', statUsed: null, adds: 0, rationale: 'test', mischiefApplied: false };
    const campaignState = await workingCopy();

    const freeFlow = await gm().run(() => pipeline.readMove({
      narration: 'I end this.', speakerActorId: 'pc-kira', campaignState, apiKey: 'sk-ant-gina', dial: 'balanced',
    }));
    expect(freeFlow.targetChoice).toMatchObject({ kind: 'track', trackType: 'combat' });
    expect(freeFlow.targetChoice.tracks.map(t => t.id).sort()).toEqual([a.id, b.id].sort());
    expect(control.scans).toBe(0);   // free-flow stops: its "Which fight?" card goes up instead

    const round = await gm().run(() => pipeline.readMove({
      narration: 'I end this.', speakerActorId: 'pc-kira', campaignState, apiKey: 'sk-ant-gina', dial: 'balanced', gatherChoices: true,
    }));
    expect(round.targetChoice).toMatchObject({ kind: 'track', trackType: 'combat' });
    expect(control.scans).toBe(1);
    expect(round.interpretation.applicableAbilities).toEqual([]);
  }, 30_000);

  it('postTargetChoiceCard posts the "Which fight?" card free-flow posted, as the roller\'s', async () => {
    await gm().run(() => store.addProgressTrack({ label: 'Archive guards', type: 'combat', rank: 'dangerous' }));
    await gm().run(() => store.addProgressTrack({ label: 'Hull wraiths', type: 'combat', rank: 'formidable' }));
    control.interpretation = { moveId: 'strike', moveName: 'Strike', statUsed: 'iron', adds: 0, rationale: 'test', mischiefApplied: false };
    await table.client('pl-1').chat('I swing at whatever is nearest.', { speaker: { actor: 'pc-kira' } });
    await table.settle();
    const cards = table.cards(f => f.whichFightCard);
    expect(cards).toHaveLength(1);
    expect(cards[0].flags[MODULE_ID]).toMatchObject({ moveId: 'strike', actorId: 'pc-kira' });
    expect(resultCards()).toEqual([]);
    expect(world().pendingMove).toBe(false);
  }, 30_000);
});

describe('rollMove', () => {
  it('refuses a move whose track, named by id, has ended — the track-gone card goes up, nothing is rolled or taken', async () => {
    const fight = await gm().run(() => store.addProgressTrack({ label: 'Archive guards', type: 'combat', rank: 'dangerous' }));
    await gm().run(() => store.completeProgressTrack(fight.id));
    control.interpretation = { moveId: 'take_decisive_action', moveName: 'Take Decisive Action', statUsed: null, adds: 0,
      isProgressMove: true, moveTarget: 'Archive guards', moveTargetId: fight.id, rationale: 'test', mischiefApplied: false };
    const { rolled } = await runStages('I end it.');
    await table.settle();
    expect(rolled.refused).toBe('track-gone');
    expect(table.cards(f => f.trackGoneCard)).toHaveLength(1);
    expect(resultCards()).toEqual([]);
  }, 30_000);
});

describe('recordMove', () => {
  it('opens the result card\'s Burn Momentum once the original outcome is recorded', async () => {
    table.actors.get('pc-kira').system.momentum.value = 9;
    control.dice = WEAK;
    const rolled = await gm().run(async () => {
      const campaignState = foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState'));
      const read = await pipeline.readMove({ narration: LINE, speakerActorId: 'pc-kira', campaignState, apiKey: 'sk-ant-gina', dial: 'balanced' });
      const r = await pipeline.rollMove({ interpretation: read.interpretation, campaignState, speakerActorId: 'pc-kira', narration: LINE });
      return { r, campaignState };
    });
    await table.settle();
    expect(rolled.r.resolution.outcome).toBe('weak_hit');
    const before = resultCards()[0].flags[MODULE_ID].burn;
    expect(before).toMatchObject({ canBurn: true });
    expect(before.originalApplied).not.toBe(true);   // closed until the record

    await gm().run(() => pipeline.recordMove(rolled.r, rolled.campaignState));
    await table.settle();
    expect(resultCards()[0].flags[MODULE_ID].burn.originalApplied).toBe(true);
  }, 30_000);
});

describe('configureMovePipeline', () => {
  it('refuses a host that lacks a helper the stages call — a wiring bug fails at load, not mid-move', async () => {
    expect(() => gm().run(() => pipeline.configureMovePipeline({ postMoveResult: () => {} })))
      .toThrow(/the host lacks .*postWhichFightCard/);
  });
});
