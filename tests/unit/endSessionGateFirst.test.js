/**
 * STARFORGED COMPANION
 * tests/unit/endSessionGateFirst.test.js
 *
 * Issue #331 X41 (END-SESSION-GATE-OPEN-WINDOW). The GM presses End a
 * Session; a player types one more line a moment later. endSessionOnce
 * flipped the gate off on its copy but persisted it only after `await
 * endScene` (scene-migration writes) and the rolling summary's Claude call
 * (seconds); the world still said `sessionActive: true`, so the session gate
 * let the line through and the move was rolled and narrated into the session
 * being ended — after its scene closed and its summary was finalised. End
 * now persists its own fields (the gate, `sessionEndedId`, the foci) first.
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [0.25, 0.35, 0.9], hold: null }));
vi.mock('../../src/factContinuity/sceneLifecycle.js', async (orig) => ({
  ...(await orig()),
  // End a Session's scene close, held open by the test (the scene migration's
  // writes and the summary's Claude call are where End spends its seconds).
  endScene: vi.fn(async () => { if (control.hold) await control.hold; }),
}));
vi.mock('../../src/narration/narrator.js', async (orig) => ({
  ...(await orig()),
  getRollingSessionSummary: vi.fn(async () => null),
  narrateSessionVignette:   vi.fn(async () => null),
  getCampaignRecap:         vi.fn(async () => ''),
}));
vi.mock('../../src/pacing/router.js', async (orig) => ({
  ...(await orig()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (orig) => ({
  ...(await orig()), interpretMove: vi.fn(async (text) => ({
    moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'iron', adds: 0, rationale: 'test',
    mischiefApplied: false, playerNarration: text, inputMethod: 'chat',
  })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (orig) => ({
  ...(await orig()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (orig) => ({
  ...(await orig()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../src/moves/resolver.js', async (orig) => {
  const real = await orig();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, 'random');
    for (const d of control.dice) rng.mockReturnValueOnce(d);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS } from '../helpers/multiClient.js';
import { scriptClaude, deferred } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

let table;
const world = () => table.world.campaignState();
const moveCards = () => table.cards(f => f.moveResolution);
const LINE = 'Kira slips past the sentry and forces the hatch open.';

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.hold = null;
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'es-s1', sessionNumber: 1,
      lastSessionTimestamp: new Date().toISOString(), currentSceneId: 'es-scene', sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  scriptClaude(table, { fallback: () => 'Steel rings.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
});

async function endSessionOnGm() {
  const api = await table.client('gm-1').import('../../src/multiplayer/gmRelay.js');
  return table.client('gm-1').run(() => api.requestGmAction('session.end', { questFocus: '', connectionFocus: '' }));
}

async function typeLine() {
  await table.client('pl-1').chat(LINE, { speaker: { actor: 'pc-kira' } });
  await table.settle(); await table.drain();
}

describe('X41 — a line typed while End a Session closes the scene is not rolled into the ending session', () => {
  it('the gate is shut in the store before End\'s awaits: the line is not rolled', async () => {
    silenceConsoleErrors();
    const gate = deferred();
    control.hold = gate.promise;
    const ending = endSessionOnGm();            // End pressed; its scene close is in flight
    await new Promise(r => setTimeout(r, 30));
    // The gate is persisted first (it was written only after the scene close
    // and the summary's call). Read now, asserted once End is released.
    const midEnd = { active: world().sessionActive, endedId: world().sessionEndedId ?? null };

    await typeLine();                           // the player's one more line
    gate.resolve();
    await ending;
    expect(midEnd).toEqual({ active: false, endedId: 'es-s1' });
    await table.settle(); await table.drain();

    expect(world().sessionActive).toBe(false);  // End finished
    // No move card: the line was rolled into the session being ended.
    expect(moveCards()).toHaveLength(0);
  }, 30_000);

  it('a refused gate write ends nothing: the scene is not closed', async () => {
    silenceConsoleErrors();
    const { endScene } = await import('../../src/factContinuity/sceneLifecycle.js');
    endScene.mockClear();
    table.interceptWrites(w => (w.kind === 'setting' && w.value?.sessionEndedId === 'es-s1')
      ? new Error('refused (test fault)') : undefined);
    await endSessionOnGm().catch(() => {});
    await table.settle(); await table.drain();
    expect(world().sessionActive).toBe(true);
    expect(endScene).not.toHaveBeenCalled();
  }, 30_000);

  it('control: once End has completed, the same line is dropped by the gate', async () => {
    await endSessionOnGm();
    await table.settle(); await table.drain();
    expect(world().sessionActive).toBe(false);
    await typeLine();
    expect(moveCards()).toHaveLength(0);
  }, 30_000);
});
