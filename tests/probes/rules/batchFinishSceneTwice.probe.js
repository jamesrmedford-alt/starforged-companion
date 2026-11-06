/**
 * Probe — RULE-4 BATCH-FINISH-SCENE-TWICE (eleventh audit, rules).
 *
 * Finish the Scene (vendored Starforged/Moves/Scene_Challenge/Finish_the_Scene)
 * is the scene challenge's progress move: "roll the challenge dice and compare
 * to your progress". The scene-challenge card tells the whole table, once the
 * track or clock is full, "the scene is due to end — Finish the Scene (its ⬡
 * Progress Roll in the Progress Tracks panel)". In Batch Mode the ⬡ press is
 * its roller's round entry (a card button's move), so Kira and Ren can each
 * make it their action.
 *
 * The round rolls Kira's first: the challenge completes, its clock retires.
 * Ren's Finish the Scene then rolls against nothing: enrichProgressTicks finds
 * no open challenge for its id, so it scores 0 — a certain miss — and the
 * miss routes Pay the Price, paid for a scene that has already ended. Two
 * guards that exist for the other progress moves miss it:
 *   - rollMove's "track gone" refusal (issue #306 R06 / #321 U02: "a roll
 *     started from a track names it by id. When that track was deleted or
 *     finished meanwhile, nothing is rolled — and it says so … a score of 0
 *     would be a certain miss with its consequences") lists combat,
 *     expedition and vow — not scene_challenge (movePipeline.js);
 *   - the round's own "ended earlier in this round" refusal (driver.js
 *     noteReadTrack / refusalFor) notes fights and expeditions only.
 *
 * Harness: batchModeTable.test.js's.
 */

/* global silenceConsoleErrors, structuredClone */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ pace: null, interpret: null, dice: [] }));
vi.mock('../../../src/pacing/router.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
    decidePacing: vi.fn(async ({ playerText }) => control.pace(playerText)),
  };
});
vi.mock('../../../src/moves/interpreter.js', async (importOriginal) => {
  const original = await importOriginal();
  return { ...original, interpretMove: vi.fn(async (text) => control.interpret(text)) };
});
vi.mock('../../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/entities/entityExtractor.js', async (importOriginal) => ({
  ...(await importOriginal()),
  runCombinedDetectionPass: vi.fn(async () => ({ worldJournal: [], entities: [], renames: [] })),
  appendGenerativeTierUpdates: vi.fn(async () => {}),
}));
vi.mock('../../../src/moves/resolver.js', async (importOriginal) => {
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

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const P3 = Object.freeze({ id: 'pl-3', name: 'Rook', isGM: false });
const ROUND_REPLY = 'The hatch seals behind them.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const MOVE = { runMove: true, decision: 'MOVE', suggestedMove: null };
const CHALLENGE = 'The Escape';

let table;
const round = () => table.world.getSetting('batchMode.round');

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2, P3] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.pace = () => ({ ...MOVE });
  control.interpret = () => ({ moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 'r', mischiefApplied: false });
  control.dice = [];
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
async function confirm(userId, choices = {}) {
  const r = round();
  return relay(userId, 'batch.confirm', { roundId: r.id, submissionId: r.entries[userId].submissionId, choices });
}
const pass = (userId) => relay(userId, 'batch.pass', { roundId: round().id });

async function sceneChallenge() {
  const gm = table.client('gm-1');
  const store = await gm.import('../../src/ui/progressTracks.js');
  if (!table.journal.get('tracks-journal')) {
    table.journal._set({ id: 'tracks-journal', name: 'Starforged Progress Tracks', _flags: {},
      getFlag(mod, key) { return this._flags[`${mod}.${key}`]; },
      async setFlag(mod, key, value) { this._flags[`${mod}.${key}`] = structuredClone(value); } });
  }
  const track = await gm.run(() => store.addProgressTrack({ label: CHALLENGE, type: 'scene_challenge', rank: 'dangerous' }));
  await table.settle();
  await gm.run(() => store.markProgressById(track.id, 2));
  await table.settle();
  return { gm, store, track };
}

/** The ⬡ Progress Roll of the challenge row, as the panel posts it (progressTracks.js rollProgress). */
async function panelRoll(actorId, track) {
  await table.client('gm-1').run(() => globalThis.ChatMessage.create({
    content: `Finish the scene — ${track.label}.`,
    speaker: { actor: actorId },
    flags: { [MODULE_ID]: { bypassPacing: true, forcedMoveId: 'finish_the_scene', forcedMoveTarget: track.label, forcedMoveTargetId: track.id } },
  }));
  await table.settle();
}

const cardsOf = (userId) => table.cards(f => f.moveResolution && f.roundUserId === userId).map(c => c.content ?? '');
const ptpCards = () => table.cards(f => f.payThePriceCard).map(c => c.content ?? '');

describe('RULE-4 a second Finish the Scene in the round, after the first ended the challenge', () => {
  it('control: alone in the round, Kira\'s Finish the Scene scores the challenge\'s progress and a strong hit pays no price', async () => {
    const { gm, store, track } = await sceneChallenge();
    await batchModeOn();
    await panelRoll('pc-kira', track);
    expect(round().entries['pl-1']).toMatchObject({ status: 'read', reading: { moveId: 'finish_the_scene' } });
    control.dice = [[0.0, 0.05]];     // challenge 1, 1 vs progress 2: a strong hit
    await confirm('pl-1');
    await pass('pl-2');
    await pass('pl-3');
    await table.drain();
    const after = (await gm.run(() => store.listProgressTracks())).find(t => t.id === track.id);
    expect(after.completed).toBe(true);
    expect(cardsOf('pl-1')).toHaveLength(1);
    expect(cardsOf('pl-1')[0]).toMatch(/Strong Hit/);
    expect(ptpCards()).toEqual([]);
  }, 30_000);

  it('Ren\'s Finish the Scene, after Kira\'s ended the challenge, is a certain miss that pays the price', async () => {
    const { gm, store, track } = await sceneChallenge();
    await batchModeOn();
    await panelRoll('pc-kira', track);
    await panelRoll('pc-ren', track);
    expect(round().entries['pl-2']).toMatchObject({ status: 'read', reading: { moveId: 'finish_the_scene' } });
    // Kira's progress roll: challenge 1, 1 (a strong hit). Ren's: challenge 6, 7.
    control.dice = [[0.0, 0.05], [0.55, 0.65]];
    await confirm('pl-1');
    await confirm('pl-2');
    await pass('pl-3');
    await table.drain();

    const after = (await gm.run(() => store.listProgressTracks())).find(t => t.id === track.id);
    expect(after.completed).toBe(true);                 // Kira's ended it
    expect(round()).toMatchObject({ number: 2 });

    // Ren's must not be rolled against an ended challenge (refused, as a
    // fight that ended earlier in the round is) — no score-0 miss, no price.
    const ren = cardsOf('pl-2');
    const score = /progress \((\d+) ticks\)/.exec(ren.join(' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '))?.[1] ?? null;
    expect({
      renRolled: ren.length,
      renMissed: ren.some(c => /Miss/.test(c)),
      pricesPaid: ptpCards().length,
    }, `Ren's roll: progress (${score} ticks); prices paid: ${ptpCards().map(c => c.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()).join(' | ')}`).toEqual({ renRolled: 0, renMissed: false, pricesPaid: 0 });
  }, 30_000);
});
