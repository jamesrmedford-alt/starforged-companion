/**
 * PIPE-6 FINISH-SCENE-GONE-TRACK-ROLLED — a Finish the Scene started from a
 * scene challenge's row (it names the challenge by id) whose challenge was
 * finished or deleted meanwhile is rolled at a score of 0 — a certain miss —
 * and pays a price for a scene that is already over.
 *
 * rollMove's "not rolled" guard (issue #306 R06, #321 U02: "When that track
 * was deleted or finished meanwhile, nothing is rolled — and it says so … a
 * score of 0 would be a certain miss with its consequences") covers the
 * tick sources combat, expedition and vow. Issue #326 D6 made Finish the
 * Scene a progress move "like Finish an Expedition", with its own tick source
 * (`scene_challenge`), but the guard was not extended to it.
 */

/* global silenceConsoleErrors, structuredClone */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [] }));
vi.mock('../../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../../src/moves/resolver.js', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, 'random');
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const REPLY = 'The dust settles.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

function makeTracksJournal(tracks = []) {
  const store = { [`${MODULE_ID}.tracks`]: structuredClone(tracks) };
  return {
    id: 'tracks-journal', name: 'Starforged Progress Tracks',
    getFlag: (mod, key) => store[`${mod}.${key}`],
    setFlag: async (mod, key, value) => { store[`${mod}.${key}`] = structuredClone(value); },
  };
}

let table;
const moveCards  = () => table.cards(f => f.moveResolution);
const goneCards  = () => table.cards(f => f.trackGoneCard);
const priceCards = () => table.cards().filter(m => /Pay the Price/i.test(m.content ?? '') && !m.flags?.[MODULE_ID]?.moveResolution);

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.dice = [0.3, 0.6];   // challenge 4, 7 — against a score of 0, a miss
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: {
      ...CampaignStateSchema, sessionActive: true, currentSessionId: 'fs-s1', sessionNumber: 1,
      lastSessionTimestamp: new Date().toISOString(), currentSceneId: 'fs-scene', sceneTruths: [], clocks: [],
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  // Both tracks finished a moment ago (by another player's roll, or the GM's ✓ Complete).
  table.journal._set(makeTracksJournal([
    { id: 'sc-collapse', label: 'Escape the Collapse', type: 'scene_challenge', rank: 'dangerous', ticks: 24, completed: true },
    { id: 'ex-ridge',    label: 'The Ridge Crossing',  type: 'expedition',      rank: 'dangerous', ticks: 24, completed: true },
  ]));
  scriptClaude(table, { fallback: () => REPLY });
  silenceConsoleErrors();
});

/** Kira's Progress Tracks panel still shows the row: its Roll posts the move by the row's id (rollProgress). */
async function rollFromRow(moveId, track) {
  const lines = { finish_the_scene: `Finish the scene — ${track.label}.`, finish_an_expedition: `Attempt to finish the expedition — ${track.label}.` };
  await table.client('pl-1').run(() => globalThis.ChatMessage.create({
    content: lines[moveId],
    speaker: { actor: 'pc-kira', alias: 'Kira' },
    flags: { [MODULE_ID]: { bypassPacing: true, forcedMoveId: moveId, forcedMoveTarget: track.label, forcedMoveTargetId: track.id } },
  }));
  await table.settle(); await table.drain();
}

describe('PIPE-6 — a Finish the Scene on a challenge already over is not rolled', () => {
  it('nothing is rolled, no price is paid, and the card says the challenge is no longer open', async () => {
    await rollFromRow('finish_the_scene', { id: 'sc-collapse', label: 'Escape the Collapse' });

    expect(moveCards()).toEqual([]);
    expect(priceCards()).toEqual([]);
    expect(goneCards()).toHaveLength(1);
  }, 30_000);

  it('control: a Finish an Expedition on an expedition already over is not rolled (R06)', async () => {
    await rollFromRow('finish_an_expedition', { id: 'ex-ridge', label: 'The Ridge Crossing' });

    expect(moveCards()).toEqual([]);
    expect(goneCards()).toHaveLength(1);
  }, 30_000);
});
