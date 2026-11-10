/**
 * PROBE — R2F-3 FINISH-SCENE-ROLL-BLOCKED-AT-ZERO (twelfth audit, round 2 —
 * follow-up of the ui report's "Not probed: ⬡ roll disabled at 0 ticks (scene
 * challenge whose clock fills first can't be finished from the panel)")
 *
 * Finish the Scene (vendored Starforged/Moves/Scene_Challenge, Finish the
 * Scene): "When the scene challenge tension clock or progress track is
 * filled, or when events lead to the scene's conclusion, roll the challenge
 * dice and compare to your progress." A challenge whose danger clock fills
 * before any progress is marked must be finished — a certain miss, and Pay
 * the Price. The help (helpJournal.js, Progress Tracks page): "When the track
 * or the clock is full, the scene is due to end … Its ⬡ Progress Roll is
 * Finish the Scene, rolled and narrated like any move: whatever the result
 * the scene is over … and a weak hit or a miss pays the price."
 *
 * The panel's ⬡ cannot make that roll:
 *   src/ui/progressTracks.js:434   canRoll: t.ticks > 0  (the row shows
 *     "Tension: 4/4 ⚠" beside it, :511-516)
 *   src/ui/progressTracks.js:475-477 the ⬡ is rendered `disabled`;
 *   src/ui/progressTracks.js:680-685 #onRollProgress returns on
 *     `track.ticks === 0` even when pressed.
 * The row's other ending, ✓ Mark Complete (:480-483 → op 'complete'),
 * completes the challenge and retires its clock with no move — no miss, no
 * Pay the Price — which is what a table that sees the ⬡ greyed out presses.
 * (Typing "we finish the scene" still reaches the move — the help mentions it
 * — but the panel's own control for the rule is dead exactly when the rule
 * says to roll.)
 *
 * Driven on a booted GM / player table through the panel's real actions, as
 * tests/unit/sceneChallengeClock.test.js does.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { StubElement } from '../../helpers/cardDom.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

let table, journal, store, clocks;
const gm = () => table.client('gm-1');
const LABEL = 'Escape the flooding chamber';

function makeTracksJournal() {
  const flags = {};
  return {
    id: 'tracks-journal', name: 'Starforged Progress Tracks',
    getFlag: (scope, key) => flags[`${scope}.${key}`],
    setFlag: async (scope, key, value) => { flags[`${scope}.${key}`] = JSON.parse(JSON.stringify(value)); },
  };
}

const panelAction = (action, trackId) => gm().run(() =>
  store.ProgressTrackApp.DEFAULT_OPTIONS.actions[action].call({ render() {} }, null, { dataset: { trackId } }));

/** The row as the open panel renders it: its context and its ⬡ button. */
async function renderedRow(trackId) {
  const savedDocument = globalThis.document;
  globalThis.document = { createElement: (tag) => new StubElement(tag), activeElement: null };
  try {
    return await renderRow(trackId);
  } finally {
    globalThis.document = savedDocument;
  }
}

function renderRow(trackId) {
  return gm().run(async () => {
    const app = {};
    const context = await store.ProgressTrackApp.prototype._prepareContext.call(app, {});
    const row = [...context.active, ...context.completed].find(t => t.id === trackId);
    const root = await store.ProgressTrackApp.prototype._renderHTML.call(app, context, {});
    const button = root.querySelector(`[data-track-id="${trackId}"] .btn-roll`);
    return { row, rollDisabled: button?.hasAttribute?.('disabled') ?? (button?.disabled === true) };
  });
}

const finishRolls = () => table.world.messages().filter(m => m.flags?.[MODULE_ID]?.forcedMoveId === 'finish_the_scene');

async function challengeWithFullClock({ marks = 0 } = {}) {
  const track = await gm().run(() => store.addProgressTrack({ type: 'scene_challenge', label: LABEL, rank: 'dangerous' }));
  await table.settle();
  if (marks) { await gm().run(() => store.markProgressById(track.id, marks)); await table.settle(); }
  await gm().run(() => clocks.adjustClockSegments(track.tensionClockId, 4));
  await table.settle();
  const clock = table.world.campaignState().clocks.find(c => c._id === track.tensionClockId);
  expect(clock, 'the challenge\'s danger clock is full (setup)').toMatchObject({ filled: 4, segments: 4 });
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
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  journal = makeTracksJournal();
  table.journal._set(journal);
  scriptClaude(table, { fallback: () => 'The water rises.' });
});

describe('R2F-3 — a scene challenge whose danger clock filled before any progress', () => {
  it('its ⬡ makes the Finish the Scene roll the rule calls for', async () => {
    const track = await challengeWithFullClock();
    const { row, rollDisabled } = await renderedRow(track.id);
    expect(row.tensionClock, 'the row shows the full clock (setup)').toMatchObject({ filled: 4, triggered: true });

    await panelAction('rollProgress', track.id);
    await table.settle();

    expect.soft(rollDisabled, 'the ⬡ is rendered disabled').toBe(false);
    expect(finishRolls().map(m => m.content)).toEqual([`Finish the scene — ${LABEL}.`]);
  }, 60_000);

  it('control: the same challenge with one mark of progress rolls Finish the Scene from its ⬡', async () => {
    const track = await challengeWithFullClock({ marks: 1 });
    const { rollDisabled } = await renderedRow(track.id);
    await panelAction('rollProgress', track.id);
    await table.settle();

    expect(rollDisabled).toBe(false);
    expect(finishRolls().map(m => m.content)).toEqual([`Finish the scene — ${LABEL}.`]);
  }, 60_000);
});
