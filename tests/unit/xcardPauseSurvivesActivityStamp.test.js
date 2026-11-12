/**
 * STARFORGED COMPANION
 * tests/unit/xcardPauseSurvivesActivityStamp.test.js
 *
 * Issue #342 Z01 ACTIVITY-STAMP-REVERTS-RELAYED-WRITE (the continuity
 * auditor's CONT-1 probe — the X-Card half; activityStampKeepsRelayedWrites
 * has Set a Flag, Take a Break and End a Session).
 *
 * A player plays the X-Card (`!x`): their client relays `xcard.activate` to
 * the canonical GM and posts the X-Card card. On the GM the relay runs
 * suppressScene, whose pause write is a server round trip; the card's
 * createChatMessage reaches the GM in the same moment and runs the session
 * activity hook (registerSessionActivityHook → touchSessionActivity), which —
 * once every ten minutes — wrote `{ ...latest, lastSessionTimestamp }`, the
 * WHOLE campaignState as this client's cache held it. The cache did not have
 * the pause yet (Foundry updates a setting's local document when the server
 * answers), so the stamp, applied after the pause, wrote `xCardActive: false`
 * back and every removal the pause wrote with it. The stamp is now its own
 * world setting (`sessionActivity`), so the X-Card's card writes no
 * campaignState at all.
 *
 * The harness applies a write at once, so the GM's campaignState writes are
 * held and released in the order the client sent them (the server applies
 * them in that order) — the round trip the harness does not model.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => ({
    moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'iron', adds: 0, rationale: 'test', mischiefApplied: false,
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
      const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.25).mockReturnValueOnce(0.35).mockReturnValueOnce(0.9);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { campaignStateWrite, deferred } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-5-5';
const TORCH_FACT = 'His hand was burned with a cutting torch';

let table;
let gates = [];   // every held write's gate — opened after each test, so none stays pending
const world = () => table.world.campaignState();

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());
afterEach(async () => {
  for (const g of gates) g.resolve(undefined);
  gates = [];
  await table.settle();
});

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false,
    campaignState: {
      ...CampaignStateSchema,
      sessionActive: true, currentSessionId: 'sess-7', sessionNumber: 7, currentSceneId: 'sc-1', sceneTruths: [],
      sceneState: { bySubject: {}, sceneId: 'sc-1' }, lastSessionTimestamp: new Date().toISOString(),
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-pat',   name: 'Kira', ownership: { 'pl-1': 3 } });
  table.addActor({ id: 'pc-quinn', name: 'Ren',  ownership: { 'pl-2': 3 } });
  table.claude.respond((call) => {
    if (call.model !== NARRATION_MODEL) return '{}';
    return 'The interrogator lifts the cutting torch toward the prisoner\'s hand.\n```json\n' + JSON.stringify({
      newTruths:    [{ subject: 'the prisoner', fact: TORCH_FACT }],
      stateChanges: [],
      sceneFrame:   { location: 'the interrogation cell', present: ['the prisoner'], situation: 'The torch hovers' },
    }) + '\n```';
  });
});

/** The narration the X-Card answers, then the activity stamp set `minutesAgo` back. */
async function narrateThenAge(minutesAgo) {
  await table.client('pl-1').chat('I press the prisoner for the code.', { speaker: { actor: 'pc-pat' } });
  await table.settle(); await table.drain();
  expect(world().sceneTruths.find(t => t.fact === TORCH_FACT)?.retracted).toBe(false);
  // Fixture: the last activity stamp was written `minutesAgo` minutes ago.
  table.world.setSetting('campaignState', {
    ...world(), lastSessionTimestamp: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
  });
}

/** Hold the GM's campaignState writes (the round trip): each released in the order it was sent. */
function holdGmCampaignStateWrites() {
  const held = [];
  table.interceptWrites((w) => {
    if (!campaignStateWrite('gm-1')(w)) return undefined;
    const gate = deferred();
    gates.push(gate);
    held.push({ value: w.value, gate });
    return gate.promise;
  });
  return held;
}

async function releaseInOrder(held) {
  for (let i = 0; i < held.length; i++) {
    held[i].gate.resolve(undefined);
    await table.settle();
  }
  await table.drain();
}

describe('Z01 — a relayed X-Card whose card arrives while its pause write is in flight', () => {
  it("the pause stands when the GM's activity stamp (due: 15 minutes) runs on its card", async () => {
    await narrateThenAge(15);
    const held = holdGmCampaignStateWrites();

    await table.client('pl-2').chat('!x');
    await table.settle();
    expect(held[0]?.value?.xCardActive).toBe(true);   // the pause's write is in flight

    await releaseInOrder(held);

    // The player's card says the scene is paused…
    expect(table.cards(f => f.xcardCard).map(c => c.flags[MODULE_ID].xcardRecorded)).toEqual([true]);
    // …and the world must hold the removal the pause wrote, and the pause.
    expect.soft(world().sceneTruths.find(t => t.fact === TORCH_FACT)?.retractedBy, 'the removed beat\'s truth').toBe('xcard');
    expect.soft((world().xCardedNarrationIds ?? []).length, 'xCardedNarrationIds').toBe(1);
    expect(world().xCardActive, 'the X-Card pause').toBe(true);
    // The stamp ran on the card — on its own setting: the pause was the GM's
    // one campaignState write.
    expect(held.map(h => h.value?.xCardActive === true)).toEqual([true]);
    const stamp = table.world.getSetting('sessionActivity');
    expect(stamp?.sessionId).toBe('sess-7');
    expect(Date.parse(stamp?.at ?? '')).toBeGreaterThan(Date.now() - 60_000);
  }, 30_000);

  it('control: with the stamp not due (written a minute ago) the same held round trip keeps the pause', async () => {
    await narrateThenAge(1);
    const held = holdGmCampaignStateWrites();

    await table.client('pl-2').chat('!x');
    await table.settle();
    expect(held.map(h => h.value?.xCardActive === true)).toEqual([true]);

    await releaseInOrder(held);
    expect(world().xCardActive).toBe(true);
    expect(world().sceneTruths.find(t => t.fact === TORCH_FACT)?.retractedBy).toBe('xcard');
    expect((world().xCardedNarrationIds ?? []).length).toBe(1);
  }, 30_000);
});
