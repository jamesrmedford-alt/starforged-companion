/**
 * PROBE — SESSION-09 END-SESSION-GATE-OPEN-WINDOW (ninth audit, area session)
 *
 * What the user does: the GM presses End a Session. A player, mid-thought,
 * types one more line a moment later.
 *
 * What happens: `endSessionOnce` (src/safety/sessionLifecycleDialogs.js:
 * 475-583) flips the gate OFF on its copy (:492) but persists it only at
 * :531-532 — after `await endScene` (:508, scene migration writes) and the
 * rolling summary's Claude call (:518, seconds). Through that window the
 * world still says `sessionActive: true`, so the session gate
 * (src/index.js:783) lets the line through: the move is rolled and narrated
 * into the session being ended — after its scene was closed (the narration
 * reopens one), after its summary was finalised, and its session-log entry
 * lands after `writeSessionLog` (:537-544) wrote the page. decisions.md
 * ("a session ends once", issue #309 N08) orders End's steps "session-active
 * flip OFF and mark the session ended → close the active scene → finalise
 * the rolling session summary" — the flip is first in memory only.
 *
 * What should happen: the gate closes before End's awaits — End writes its
 * flip (and `sessionEndedId`) first, then closes the scene and finalises the
 * summary — so nothing is rolled into a session that is ending; a line typed
 * then is treated as it is after End (dropped; SESSION-03 asks that the
 * player be told).
 *
 * Control: once End has completed, the same line is dropped (today: passes).
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/session/endSessionGateOpenWindow.probe.js
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [0.25, 0.35, 0.9], hold: null }));
vi.mock('../../../src/factContinuity/sceneLifecycle.js', async (orig) => ({
  ...(await orig()),
  // End a Session's scene close, held open by the test (the scene migration's
  // writes and the summary's Claude call are where End spends its seconds).
  endScene: vi.fn(async () => { if (control.hold) await control.hold; }),
}));
vi.mock('../../../src/narration/narrator.js', async (orig) => ({
  ...(await orig()),
  getRollingSessionSummary: vi.fn(async () => null),
  narrateSessionVignette:   vi.fn(async () => null),
  getCampaignRecap:         vi.fn(async () => ''),
}));
vi.mock('../../../src/pacing/router.js', async (orig) => ({
  ...(await orig()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (orig) => ({
  ...(await orig()), interpretMove: vi.fn(async (text) => ({
    moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'iron', adds: 0, rationale: 'test',
    mischiefApplied: false, playerNarration: text, inputMethod: 'chat',
  })),
}));
vi.mock('../../../src/moves/abilityScanner.js', async (orig) => ({
  ...(await orig()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (orig) => ({
  ...(await orig()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../../src/moves/resolver.js', async (orig) => {
  const real = await orig();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, 'random');
    for (const d of control.dice) rng.mockReturnValueOnce(d);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { scriptClaude, deferred } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

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

describe('SESSION-09 a line typed while End a Session is closing the scene is rolled into the ending session', () => {
  it('the gate is still open through End\'s awaits: the move is rolled after End was pressed', async () => {
    silenceConsoleErrors();
    const gate = deferred();
    control.hold = gate.promise;
    const ending = endSessionOnGm();            // End pressed; its scene close is in flight
    await new Promise(r => setTimeout(r, 30));
    expect(world().sessionActive).toBe(true);   // nothing persisted yet

    await typeLine();                           // the player's one more line
    gate.resolve();
    await ending;
    await table.settle(); await table.drain();

    expect(world().sessionActive).toBe(false);  // End finished
    // FAILS today: a move card — the line was rolled into the session being ended.
    expect(moveCards()).toHaveLength(0);
  }, 30_000);

  it('control: once End has completed, the same line is dropped by the gate', async () => {
    await endSessionOnGm();
    await table.settle(); await table.drain();
    expect(world().sessionActive).toBe(false);
    await typeLine();
    expect(moveCards()).toHaveLength(0);
  }, 30_000);
});
