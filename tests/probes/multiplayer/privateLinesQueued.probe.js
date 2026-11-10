/**
 * STARFORGED COMPANION — twelfth bug audit, area: shared state and multiplayer
 * tests/probes/multiplayer/privateLinesQueued.probe.js
 *
 * MP-2 PRIVATE-LINES-QUEUED (SAFETY)
 *
 * A player's Private Lines reach the shared narrator only through the GM
 * relay `safety.syncPrivateLines` (src/ui/settingsPanel.js:808-822 →
 * applyPrivateLinesSync, :832). Every relayed action runs through ONE
 * serialised queue on the canonical GM (src/multiplayer/gmRelay.js:282-304
 * enqueueGmAction), and a Claude-calling handler holds that queue for its
 * whole call — up to GM_CLAUDE_ACTION_TIMEOUT_MS (gmRelay.js:144). Only the
 * X-Card is exempt (UNQUEUED_ACTIONS, gmRelay.js:256 — XCARD-QUEUED: "queued
 * behind a Claude-calling handler it waited ... while the move pipeline —
 * which is not queued — narrated straight through it"). The Private Lines
 * sync is the same safety write and still waits in that queue: a Private
 * Line a player adds while the GM narrates an oracle follow-up (oracle.narrate,
 * `claude: true`) is missing from every move narrated meanwhile — the move
 * pipeline reads the safety block from the store (narrator.js:313
 * buildNarratorExtras — known-issues U08) and the store does not have it yet.
 * The relay queue delay itself is an accepted limitation (known-issues →
 * "One serialised GM queue"); its safety consequence for Private Lines is
 * the one XCARD-QUEUED removed for the X-Card alone.
 *
 * Scenario: Quinn types `!oracle …`; the GM's follow-up narration call is
 * slow (held). Pat adds the Private Line "spiders" in Companion Settings.
 * Quinn then narrates a move; the canonical GM's pipeline narrates it.
 * Expected: Pat's line is a hard stop in that narration. Actual: absent.
 *
 * Control: the same with the oracle follow-up already answered — the line
 * is in the move narration (as multiplayerComposition.test.js shows).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

// The move pipeline as multiplayerComposition.test.js drives it: Face Danger
// +iron, no pacing call, no confirm dialog, scripted dice.
const control = vi.hoisted(() => ({ dice: [0.25, 0.35, 0.9] }));
vi.mock('../../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => ({
    moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'iron', adds: 0, rationale: 'test', mischiefApplied: false,
  })),
}));
vi.mock('../../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../../src/moves/resolver.js', async (importOriginal) => {
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

import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { parseHTML } from '../../helpers/cardDom.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const MOVE_TEXT = 'I brace against the hull and push through the breach.';
const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';   // narrationModel default
const ORACLE_Q  = 'is the hatch sealed';
let table;
let releaseOracle = null;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 60_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.dice = [0.25, 0.35, 0.9];
  releaseOracle = null;
  await table.reset({ world: { settings: { campaignState: {
    ...CampaignStateSchema,
    sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 3, currentSceneId: 'sc-1', sceneTruths: [],
  } } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-pat',   name: 'Kira', ownership: { 'pl-1': 3 } });
  table.addActor({ id: 'pc-quinn', name: 'Ren',  ownership: { 'pl-2': 3 } });
});

/** Run one of the Companion Settings panel's own actions on a client (the production writer of Private Lines). */
async function panelAction(userId, action, { newPrivateLine = '', index = 0 } = {}) {
  const c = table.client(userId);
  const { SettingsPanelApp } = await c.import('../../src/ui/settingsPanel.js');
  const app = { element: parseHTML(`<input name="newPrivateLine" value="${newPrivateLine}">`), render() {} };
  const target = parseHTML('<button></button>').firstElementChild;
  target.dataset.index = String(index);
  await c.run(() => SettingsPanelApp.DEFAULT_OPTIONS.actions[action].call(app, null, target));
  await table.settle();
}

/** Hold the GM's oracle follow-up narration (its prompt carries the question) until releaseOracle(). */
function holdOracleFollowup() {
  table.claude.respond((call) => {
    if (call.client === 'gm-1' && call.userText.includes(ORACLE_Q) && !call.userText.includes(MOVE_TEXT)) {
      return new Promise((resolve) => { releaseOracle = () => resolve('The hatch is fused shut.\n```json\n{"newTruths":[],"stateChanges":[]}\n```'); });
    }
    return table.claude.constructor.DEFAULT_REPLY;   // the harness default
  });
}

/** Quinn narrates a move; the canonical GM's narration call for it. */
async function narrateMove() {
  const from = table.claude.calls.length;
  await table.client('pl-2').chat(MOVE_TEXT, { speaker: { actor: 'pc-quinn' } });
  await table.settle();
  const narration = table.claude.calls.slice(from).filter(c => c.model === NARRATION_MODEL);
  expect(narration.map(c => c.client)).toEqual(['gm-1']);
  return narration[0];
}

describe('MP-2 PRIVATE-LINES-QUEUED — a Private Line added while the GM relay queue is busy', () => {
  it('control: with the oracle follow-up answered, Pat\'s new Private Line is a hard stop in Quinn\'s move narration', async () => {
    await table.client('pl-2').chat(`!oracle yes likely ${ORACLE_Q}`);
    await table.settle();
    await panelAction('pl-1', 'addPrivateLine', { newPrivateLine: 'spiders' });
    expect(table.world.campaignState().safety?.privateLines).toEqual([{ playerId: 'pl-1', lines: ['spiders'] }]);

    const call = await narrateMove();
    expect(call.system).toMatch(/### PRIVATE LINES[^\n]*\n- spiders/);
  }, 60_000);

  it('a Private Line added while the GM narrates an oracle follow-up is a hard stop in the move narrated meanwhile', async () => {
    holdOracleFollowup();
    await table.client('pl-2').chat(`!oracle yes likely ${ORACLE_Q}`);
    await table.settle();
    expect(typeof releaseOracle).toBe('function');            // the follow-up's call is out, on the GM's queue

    let call, storedAtNarration;
    try {
      await panelAction('pl-1', 'addPrivateLine', { newPrivateLine: 'spiders' });
      expect(table.client('pl-1').getSetting('privateLines')).toEqual(['spiders']);

      call = await narrateMove();
      storedAtNarration = table.world.campaignState().safety?.privateLines ?? [];
    } finally {
      releaseOracle?.();
      await table.settle();
    }
    // The sync was only waiting its turn behind the follow-up: once the queue
    // drains, the line lands — after the narration.
    expect(table.world.campaignState().safety?.privateLines).toEqual([{ playerId: 'pl-1', lines: ['spiders'] }]);
    expect(storedAtNarration).toEqual([]);
    // The move pipeline (not queued) narrated meanwhile: the player's hard
    // stop must be in it, as it would be had the X-Card's exemption covered
    // this safety write too.
    expect(call.system).toMatch(/### PRIVATE LINES[^\n]*\n- spiders/);
  }, 60_000);
});
