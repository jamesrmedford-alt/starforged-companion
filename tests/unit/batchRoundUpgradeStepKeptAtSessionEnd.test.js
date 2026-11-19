/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/batchRoundUpgradeStepKeptAtSessionEnd.test.js
 *
 * Issue #364 ROUND-UPGRADE-STEP-AT-SESSION-END (found while fixing issue #362
 * AC57).
 *
 * A Batch Mode round has rolled and recorded its moves and asks Kira's player
 * Burn / Improve / Keep — the upgrade step. The GM ends the session. AC57
 * closed a round the X-Card held there once every roller had decided; one
 * still waiting for a roller kept waiting: "the round is being resolved" in
 * every Round window through End a Session, and it was narrated whenever the
 * roller came back to the card — after the session had ended, hours or a day
 * later, into the next session's chat.
 *
 * The session ending is now Keep for everyone still deciding, as a GM's Send
 * now applies it (driver.js keepUpgrades(null)): the round goes on to its one
 * narration at once, its cards' Burn / Improve closed. Under the X-Card it
 * closes as AC57's decided round does — the paused notice lists its results.
 *
 * Booted GM + two-player table (tests/helpers/multiClient.js); the round is
 * driven through the real relays, and End a Session through its own.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (narration) => ({
    moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 'test',
    mischiefApplied: false, playerNarration: narration, inputMethod: 'chat',
  })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/entities/entityExtractor.js', async (importOriginal) => ({
  ...(await importOriginal()),
  runCombinedDetectionPass: vi.fn(async () => ({ worldJournal: [], entities: [], renames: [] })),
  appendGenerativeTierUpdates: vi.fn(async () => {}),
}));
vi.mock('../../src/moves/resolver.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    // challenge 4 and 8, action 3 (+edge 2 = 5): a weak hit a burn of 9 raises.
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.35).mockReturnValueOnce(0.75).mockReturnValueOnce(0.4);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-5-5';
const REPLY = 'Kira slips through the vent, scraped and late.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

let table;
const world = () => table.world.campaignState();
const round = () => table.world.getSetting('batchMode.round');
const roundNarrations = () => table.cards(f => f.roundId && f.narratorCard);
const roundCalls = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL && /THIS ROUND/.test(c.userText ?? ''));
const kirasCard = () => table.cards(f => f.moveResolution && f.actorId === 'pc-kira').at(-1);

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false, combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, sessionStartedId: 'sess-1', currentSessionId: 'sess-1', sessionNumber: 1,
      currentSceneId: 'sc-1', sceneTruths: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [] } });
  table.actors.get('pc-kira').system.momentum.value = 9;
  scriptClaude(table, { fallback: () => REPLY });
  silenceConsoleErrors();
  await table.client('gm-1').setSetting('batchMode.enabled', true);
  await table.settle();
});

async function relay(userId, kind, payload) {
  const c = table.client(userId);
  const gmRelay = await c.import('../../src/multiplayer/gmRelay.js');
  const res = await c.run(() => gmRelay.requestGmAction(kind, payload));
  await table.settle();
  return res;
}

/** Kira's weak hit is rolled and recorded; the round asks her player Burn / Keep. */
async function weakHitWaitingForKira() {
  await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I slip through the vent before the drones turn.', submissionId: 'k1' });
  await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'k1', choices: {} });
  await relay('pl-2', 'batch.pass', { roundId: round().id });
  await table.drain();
  expect(round(), 'setup: the round waits at its upgrade step').toMatchObject({ number: 1, phase: 'upgrading' });
  expect(round().entries['pl-1'].upgrade, 'setup: Kira has not decided').toMatchObject({ burn: { previewOutcome: 'strong_hit' }, decided: null });
  expect(roundCalls(), 'setup: nothing narrated yet').toHaveLength(0);
}

/** The GM's End a Session, through its dialog and relay. */
async function endSession() {
  const gm = table.client('gm-1');
  gm.answerDialogs(d => d.submit({ 'input[name="questFocus"]': '', 'input[name="connectionFocus"]': '' }));
  await gm.chat('!end-session');
  await table.settle();
  await table.drain();
}

describe('issue #364 ROUND-UPGRADE-STEP-AT-SESSION-END — End a Session with a roller still deciding Burn / Improve / Keep', () => {
  it('keeps the result for everyone still deciding: the round is narrated at once, and closed', async () => {
    await weakHitWaitingForKira();
    const roundId = round().id;
    await endSession();
    expect(world().sessionActive, 'setup: the session ended').toBe(false);

    expect(round()).toMatchObject({ id: roundId, phase: 'closed', closeReason: 'resolved' });
    expect(round().entries['pl-1'].upgrade).toMatchObject({ decided: 'keep' });
    expect(roundCalls()).toHaveLength(1);
    expect(roundNarrations()).toHaveLength(1);
    // The rolled result stands: nothing was burned, and the card's Burn is closed.
    expect(table.actors.get('pc-kira').system.momentum.value).toBe(9);
    expect(kirasCard().flags[MODULE_ID].burn).toMatchObject({ roundClosed: true });
    expect(kirasCard().flags[MODULE_ID].burn.consumed ?? false).toBe(false);
  }, 60_000);

  it('a Keep pressed afterwards has nothing left to decide — the round is not narrated twice', async () => {
    await weakHitWaitingForKira();
    const roundId = round().id;
    await endSession();
    await relay('pl-1', 'batch.keep', { roundId });
    await table.drain();
    expect(roundCalls()).toHaveLength(1);
    expect(roundNarrations()).toHaveLength(1);
  }, 60_000);

  it('under the X-Card it is closed as a decided round is: its results listed, nothing narrated, the GMs told', async () => {
    await weakHitWaitingForKira();
    await table.client('gm-1').setSetting('campaignState', { ...world(), xCardActive: true, xCardPlays: 1 });
    await table.settle();
    expect(round(), 'setup: still waiting for Kira, under the X-Card').toMatchObject({ phase: 'upgrading' });
    await endSession();

    expect(round()).toMatchObject({ phase: 'closed' });
    expect(round().entries['pl-1'].upgrade).toMatchObject({ decided: 'keep' });
    expect(roundCalls(), 'nothing is narrated under the X-Card').toHaveLength(0);
    const paused = table.cards(f => f.roundId && f.narrationPaused);
    expect(paused).toHaveLength(1);
    expect(paused[0].content).toMatch(/Kira — Face Danger: Weak Hit/);
    expect(table.cards(f => f.batchRoundUnnarratedNotice)).toHaveLength(1);
  }, 60_000);

  it('control: while the session lasts the round waits for Kira — another campaignState write decides nothing', async () => {
    await weakHitWaitingForKira();
    await table.client('gm-1').setSetting('campaignState', { ...world(), updatedAt: new Date().toISOString() });
    await table.settle(); await table.drain();
    expect(round()).toMatchObject({ phase: 'upgrading' });
    expect(round().entries['pl-1'].upgrade).toMatchObject({ decided: null });
    expect(roundCalls()).toHaveLength(0);
  }, 60_000);
});
