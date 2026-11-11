/**
 * STARFORGED COMPANION
 * tests/unit/finishSceneRollAtZeroProgress.test.js
 *
 * Issue #345 AA68 (FINISH-SCENE-ROLL-BLOCKED-AT-ZERO) — Finish the Scene
 * (vendored Starforged/Moves/Scene_Challenge): "When the scene challenge
 * tension clock or progress track is filled, or when events lead to the
 * scene's conclusion, roll the challenge dice and compare to your progress."
 * A challenge whose tension clock fills before any progress is marked must
 * be finished — a certain miss, and Pay the Price. The help says the same
 * ("When the track or the clock is full, the scene is due to end … Its ⬡
 * Progress Roll is Finish the Scene"), and the card the full clock posts
 * points at the ⬡.
 *
 * The Progress Tracks panel's ⬡ could not make that roll: the row's canRoll
 * was `ticks > 0`, so the ⬡ rendered disabled, and the press handler returned
 * on a track with no progress. The table pressed ✓ Mark Complete instead —
 * the challenge ended with no move and no price. A scene challenge's ⬡ now
 * rolls once its tension clock is full, progress or none; other tracks keep
 * the guard (a fight's zero-progress roll is the trap the Enter the Fray card
 * leaves off), and so does a challenge whose clock is not full yet.
 *
 * On a booted GM / player table, through the panel's real render and press
 * handlers; the GM's pipeline resolves the move (dice scripted), as
 * tests/unit/finishTheScene.test.js does.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [] }));
vi.mock('../../src/pacing/router.js', async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
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

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { StubElement } from '../helpers/cardDom.js';
import { CampaignStateSchema } from '../../src/schemas.js';

let table, journal, store, clocks;
const gm = () => table.client('gm-1');
const LABEL = 'Escape the flooding chamber';
const MISS = [0.45, 0.65];    // 5, 7 — no match

function makeTracksJournal() {
  const flags = {};
  return {
    id: 'tracks-journal', name: 'Starforged Progress Tracks',
    getFlag: (scope, key) => flags[`${scope}.${key}`],
    setFlag: async (scope, key, value) => { flags[`${scope}.${key}`] = JSON.parse(JSON.stringify(value)); },
  };
}

const tracks = () => journal.getFlag(MODULE_ID, 'tracks') ?? [];
const trackById = (id) => tracks().find(t => t.id === id) ?? null;
const forcedRolls = () => table.world.messages().filter(m => m.flags?.[MODULE_ID]?.forcedMoveId);
const finishRolls = () => forcedRolls().filter(m => m.flags[MODULE_ID].forcedMoveId === 'finish_the_scene');
const moveCard = () => table.cards(f => f.moveResolution).at(-1);
const ptpCards = () => table.cards(f => f.payThePriceCard);

/** Press the row's ⬡ (the panel's rollProgress action), and let the move resolve. */
async function pressRoll(trackId) {
  control.dice = MISS;
  await gm().run(() =>
    store.ProgressTrackApp.DEFAULT_OPTIONS.actions.rollProgress.call({ render() {} }, null, { dataset: { trackId } }));
  await table.settle();
  await table.drain();
}

/** The row as the open panel renders it: its context and whether its ⬡ is disabled. */
async function renderedRow(trackId) {
  const savedDocument = globalThis.document;
  globalThis.document = { createElement: (tag) => new StubElement(tag), activeElement: null };
  try {
    return await gm().run(async () => {
      const app = {};
      const context = await store.ProgressTrackApp.prototype._prepareContext.call(app, {});
      const row = [...context.active, ...context.completed].find(t => t.id === trackId);
      const root = await store.ProgressTrackApp.prototype._renderHTML.call(app, context, {});
      const button = root.querySelector(`[data-track-id="${trackId}"] .btn-roll`);
      return { row, rollDisabled: button?.hasAttribute?.('disabled') ?? (button?.disabled === true) };
    });
  } finally {
    globalThis.document = savedDocument;
  }
}

/** A scene challenge (with its paired 4-segment clock), `marks` of progress, its clock moved `fill` segments. */
async function challenge({ marks = 0, fill = 4 } = {}) {
  const track = await gm().run(() => store.addProgressTrack({ type: 'scene_challenge', label: LABEL, rank: 'dangerous' }));
  await table.settle();
  if (marks) { await gm().run(() => store.markProgressById(track.id, marks)); await table.settle(); }
  if (fill) { await gm().run(() => clocks.adjustClockSegments(track.tensionClockId, fill)); await table.settle(); }
  const clock = table.world.campaignState().clocks.find(c => c._id === track.tensionClockId);
  expect(clock, 'the challenge\'s tension clock (setup)').toMatchObject({ filled: fill, segments: 4 });
  return track;
}

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
  store  = await gm().import('../../src/ui/progressTracks.js');
  clocks = await gm().import('../../src/clocks/clocks.js');
}, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'fsz-s1', sessionNumber: 1,
      lastSessionTimestamp: new Date().toISOString(), currentSceneId: 'fsz-scene', sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  journal = makeTracksJournal();
  table.journal._set(journal);
  scriptClaude(table, { fallback: () => 'The water rises.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
});

describe('issue #345 AA68 — a scene challenge whose tension clock filled before any progress', () => {
  it('its ⬡ is drawn enabled, and pressing it makes the Finish the Scene roll', async () => {
    const track = await challenge();
    const { row, rollDisabled } = await renderedRow(track.id);
    expect(row.tensionClock, 'the row shows the full clock (setup)').toMatchObject({ filled: 4, triggered: true });
    expect(row.ticks, 'no progress (setup)').toBe(0);

    await pressRoll(track.id);

    expect(rollDisabled).toBe(false);
    expect(finishRolls().map(m => m.content)).toEqual([`Finish the scene — ${LABEL}.`]);
  }, 60_000);

  it('the roll is the move the rule calls for: a certain miss, the price paid, and the scene over', async () => {
    const track = await challenge();
    await pressRoll(track.id);

    expect(moveCard()?.content ?? '', 'the move card').toMatch(/Finish the Scene/i);
    expect(moveCard()?.content ?? '').toMatch(/Miss/i);
    expect(ptpCards()).toHaveLength(1);
    expect(trackById(track.id)?.completed).toBe(true);
  }, 60_000);

  it('control: the same challenge with one mark of progress rolls Finish the Scene from its ⬡', async () => {
    const track = await challenge({ marks: 1 });
    const { rollDisabled } = await renderedRow(track.id);
    await pressRoll(track.id);

    expect(rollDisabled).toBe(false);
    expect(finishRolls().map(m => m.content)).toEqual([`Finish the scene — ${LABEL}.`]);
  }, 60_000);

  it('control: no progress and the clock not full yet — the ⬡ stays disabled, and a press rolls nothing', async () => {
    const track = await challenge({ fill: 3 });
    const { rollDisabled } = await renderedRow(track.id);
    await pressRoll(track.id);

    expect(rollDisabled).toBe(true);
    expect(forcedRolls()).toEqual([]);
    expect(trackById(track.id)?.completed).toBeFalsy();
  }, 60_000);

  it('control: an expedition with no progress keeps its guard — its ⬡ is disabled and a press rolls nothing', async () => {
    const track = await gm().run(() => store.addProgressTrack({ type: 'expedition', label: 'Cross the Shattered Reach', rank: 'dangerous' }));
    await table.settle();
    const { rollDisabled } = await renderedRow(track.id);
    await pressRoll(track.id);

    expect(rollDisabled).toBe(true);
    expect(forcedRolls()).toEqual([]);
  }, 60_000);
});
