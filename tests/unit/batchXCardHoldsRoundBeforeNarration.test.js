/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/batchXCardHoldsRoundBeforeNarration.test.js
 *
 * Issue #345 AA43 XCARD-DURING-UPGRADE-STEP-ROUND-CLOSED-UNNARRATED (the
 * twelfth audit's R2C-2 — Batch Mode × the X-Card × Burn / Keep).
 *
 * The decision ("the X-Card stops a round resolving") and the help: while the
 * X-Card is in play every Round window says "The X-Card is in play — the
 * round can't be resolved until a GM resumes", and the GM's Send now is
 * disabled. The driver honoured that only for a COLLECTING round (advanceOnce:
 * `if (isXCardActive(null)) return false;`). An X-Card played during the
 * UPGRADE step — the moves rolled, a roller still choosing Burn / Keep — did
 * not hold the round: the roller's Keep (or Burn, or leaving) settled the
 * upgrades, the UPGRADING step began the narration at once, narrateRound
 * found the X-Card active and posted the narration-paused notice, and
 * finishRound closed the round and opened the next — while the windows still
 * said it "can't be resolved until a GM resumes". When the GM resumed the
 * round was gone: its rolled moves stand and were never narrated, and the
 * next round's narrator had no word of them (the paused notice is not a
 * narrator card).
 *
 * The fix: neither the upgrade step nor the narrating phase begins the
 * narration while the X-Card is in play; the lift (onCampaignStateChanged
 * advanceRound("x-card-lifted")) runs the pass again, and the round is
 * narrated then. An X-Card played while the narration is being written still
 * discards the reply (batchModeTable.test.js pins that).
 *
 * Scenario (a GM and two players, Batch Mode on, real driver / relays /
 * X-Card; pacing, interpreter, ability scan and detection mocked, dice
 * scripted, Claude answered by the harness): round 1, Kira's Face Danger is a
 * weak hit she may burn (momentum 9); Ren passes; the round waits on Kira.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [] }));
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
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random');
      for (const d of control.dice.shift() ?? []) dice.mockReturnValueOnce(d);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { holdWrites, scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const REPLY = 'Kira slips through the vent, scraped and late.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const ACTION = 'I slip through the vent before the drones turn.';
const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';
// challenge 4 and 8, action die 3 (+edge 2 = 5): a weak hit a burn of 9 raises.
const WEAK = [0.35, 0.75, 0.4];
// challenge 3 and 4, action die 6 (+edge 2 = 8): a strong hit — no upgrade to wait for.
const STRONG = [0.25, 0.35, 0.9];

let table;
const world = () => table.world.campaignState();
const round = () => table.world.getSetting('batchMode.round');
const roundOneNarrations = () => table.cards(f => f.roundNumber === 1 && f.narratorCard === true);
const roundOnePaused     = () => table.cards(f => f.roundNumber === 1 && f.narrationPaused === true);
const narrations = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL);

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.dice = [];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [] },
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
  await table.settle(); await table.drain();
  return res;
}

async function renPlaysTheXCard() {
  await table.client('pl-2').chat('!x');
  await table.settle(); await table.drain();
  expect(world().xCardActive).toBe(true);
}

async function gmResumes() {
  const gm = table.client('gm-1');
  const safety = await gm.import('../../src/context/safety.js');
  await gm.run(() => safety.resumeNarrationAfterXCard());
  await table.settle(); await table.drain();
  expect(world().xCardActive).toBe(false);
}

/** Kira's weak hit, with momentum 9 to burn: the round waits for her decision. */
async function weakHitWaitingForKira() {
  control.dice = [WEAK];
  await relay('pl-1', 'batch.submit', { roundId: round().id, text: ACTION, submissionId: 'k1' });
  await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'k1', choices: {} });
  await relay('pl-2', 'batch.pass', { roundId: round().id });
  expect(round()).toMatchObject({ number: 1, phase: 'upgrading' });
  expect(round().entries['pl-1'].upgrade).toMatchObject({ burn: { previewOutcome: 'strong_hit' }, decided: null });
}

/** While the X-Card is in play the round waits: still round 1, not closed, no paused notice. */
function expectHeld() {
  expect({ round: round().number, phase: round().phase, pausedNotices: roundOnePaused().length, narrated: roundOneNarrations().length },
    'the X-Card holds the round').toEqual({ round: 1, phase: expect.not.stringMatching(/^closed$/), pausedNotices: 0, narrated: 0 });
}

describe('issue #345 AA43 — the X-Card played while a Batch round resolves holds it before its narration', () => {
  it('control: the X-Card played while the round collects holds it, and the GM\'s resume lets it resolve and be narrated', async () => {
    control.dice = [WEAK];
    await relay('pl-1', 'batch.submit', { roundId: round().id, text: ACTION, submissionId: 'k1' });
    await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'k1', choices: {} });
    await renPlaysTheXCard();
    await relay('pl-2', 'batch.pass', { roundId: round().id });      // everyone is ready …
    expect(round()).toMatchObject({ number: 1, phase: 'collecting' }); // … and the X-Card holds the round
    await gmResumes();
    expect(round()).toMatchObject({ number: 1, phase: 'upgrading' });  // resolved once resumed
    await relay('pl-1', 'batch.keep', { roundId: round().id });
    expect(roundOneNarrations()).toHaveLength(1);
    expect(roundOnePaused()).toHaveLength(0);
  }, 60_000);

  it('played during the upgrade step, the X-Card holds the round after Kira keeps — and the round is narrated once the GM resumes', async () => {
    await weakHitWaitingForKira();
    await renPlaysTheXCard();
    await relay('pl-1', 'batch.keep', { roundId: round().id });         // Kira decides while the X-Card is in play
    expectHeld();
    expect(round().entries['pl-1']?.upgrade?.decided).toBe('keep');
    expect(narrations()).toHaveLength(0);

    await gmResumes();
    expect(roundOneNarrations(), 'the round is narrated once the GM resumes').toHaveLength(1);
    expect(roundOnePaused()).toHaveLength(0);
    expect(narrations().at(-1)?.userText ?? '').toMatch(/Face Danger[^\n]*: weak hit/);
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
  }, 60_000);

  it('a Burn while the X-Card is in play is held too: narrated as the strong hit once the GM resumes', async () => {
    await weakHitWaitingForKira();
    await renPlaysTheXCard();
    const cardId = round().entries['pl-1'].rolled.cardId;
    await relay('pl-1', 'move.burnMomentum', { messageId: cardId });
    expect(table.world.message(cardId).flags[MODULE_ID].burn.consumed).toBe(true);
    expectHeld();
    expect(round().entries['pl-1']?.upgrade?.decided).toBe('burn');

    await gmResumes();
    expect(roundOneNarrations()).toHaveLength(1);
    expect(narrations().at(-1)?.userText ?? '').toMatch(/Face Danger[^\n]*: strong hit/);
  }, 60_000);

  it('Kira leaving while the X-Card is in play keeps for her, and the round still waits for the GM to resume', async () => {
    await weakHitWaitingForKira();
    await renPlaysTheXCard();
    await table.leave('pl-1');
    await table.drain();
    expectHeld();
    expect(round().entries['pl-1']?.upgrade?.decided).toBe('keep');

    await gmResumes();
    expect(roundOneNarrations()).toHaveLength(1);
    expect(roundOnePaused()).toHaveLength(0);
  }, 60_000);

  it('played while the round rolls a move with nothing to upgrade, the X-Card holds it in "narrating" until the GM resumes', async () => {
    control.dice = [STRONG];
    // Hold the round's result card: the round is rolling when Ren plays the X-Card.
    const held = holdWrites(table, w => w.kind === 'message.create' && w.data?.flags?.[MODULE_ID]?.moveResolution === true);
    await relay('pl-1', 'batch.submit', { roundId: round().id, text: ACTION, submissionId: 'k1' });
    await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'k1', choices: {} });
    await relay('pl-2', 'batch.pass', { roundId: round().id });
    await held.arrived;
    expect(round().phase).toBe('rolling');
    await renPlaysTheXCard();
    held.release();
    await table.settle(); await table.drain();
    expectHeld();
    expect(round().phase).toBe('narrating');
    expect(round().entries['pl-1']?.status).toBe('recorded');         // the move stands
    expect(narrations()).toHaveLength(0);

    await gmResumes();
    expect(roundOneNarrations()).toHaveLength(1);
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
    expect(world().pendingMove).toBe(false);
  }, 60_000);
});
