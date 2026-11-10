/* global silenceConsoleErrors -- tests/setup.js */
/**
 * PROBE R2C — XCARD-DURING-UPGRADE-STEP-ROUND-CLOSED-UNNARRATED (LOSE-PLOT / RULES)
 * Twelfth audit, round 2, cross-feature compositions (Batch Mode × the X-Card
 * × Burn / Keep).
 *
 * The decision (decisions.md "Batch Mode … the X-Card stops a round
 * resolving") and the help (Batch Mode → "Sessions, the X-Card and turning it
 * off": "The X-Card stops a round resolving: Send now is disabled, the windows
 * say why … Played while the round is narrated, it discards the reply").
 * While the X-Card is in play every Round window shows "The X-Card is in play
 * — the round can't be resolved until a GM resumes." (src/batch/roundView.js
 * :40, :83 — in every phase), and the GM's Send now is disabled (:239).
 *
 * The driver honours that only for a COLLECTING round (src/batch/driver.js
 * advanceOnce :643 `if (isXCardActive(null)) return false;`). An X-Card
 * played during the UPGRADE step (the moves are rolled, a roller is still
 * choosing Burn / Keep) does not hold the round: the roller's Keep
 * (keepUpgrade :1170 — no X-Card check) or a roller leaving
 * (keepUndecidable) settles the upgrades, advanceOnce's UPGRADING case
 * (:648-651) begins the narration at once, narrateTheRound (:1216) →
 * narrateRound (narrator.js:951) finds the X-Card active and posts the
 * narration-paused notice, and finishRound (:1286) closes the round and
 * opens the next — all while the windows still say the round "can't be
 * resolved until a GM resumes". When the GM resumes, the lift wakes the
 * advance pass (onCampaignStateChanged :1720 `if (lifted) advanceRound`),
 * but the round is gone: its rolled moves stand and are never narrated, and
 * the narrator of the next round has no word of them (the paused notice is
 * not a narrator card, so it is not in the ring).
 *
 * Scenario (booted GM + two players, Batch Mode on, real driver / relays /
 * X-Card; pacing, interpreter, ability scan and detection mocked, dice
 * scripted, Claude answered by the harness):
 *   1. Round 1: Kira's Face Danger is a weak hit she may burn (momentum 9);
 *      Ren passes. The round waits on Kira's Burn / Keep.
 *   2. Ren plays the X-Card (`!x`).
 *   3. Kira keeps.
 *   Expected: the round waits for the GM to resume (as a collecting round
 *   does) and is narrated once the GM resumes.
 *   Actual: the round closes at once with the paused notice; the GM's resume
 *   narrates nothing of it.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (narration) => ({
    moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 'probe',
    mischiefApplied: false, playerNarration: narration, inputMethod: 'chat',
  })),
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
    // challenge 4 and 8, action 3 (+edge 2 = 5): a weak hit a burn of 9 raises.
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.35).mockReturnValueOnce(0.75).mockReturnValueOnce(0.4);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const REPLY = 'Kira slips through the vent, scraped and late.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const ACTION = 'I slip through the vent before the drones turn.';

let table;
const world = () => table.world.campaignState();
const round = () => table.world.getSetting('batchMode.round');
const roundOneNarrations = () => table.cards(f => f.roundNumber === 1 && f.narratorCard === true);
const roundOnePaused     = () => table.cards(f => f.roundNumber === 1 && f.narrationPaused === true);

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
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

describe('R2C — the X-Card played while a Batch round waits on a Burn / Keep decision', () => {
  it('control: the X-Card played while the round collects holds it, and the GM\'s resume lets it resolve and be narrated', async () => {
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

  it('played during the upgrade step, the X-Card holds the round until a GM resumes — and the round is narrated then', async () => {
    await relay('pl-1', 'batch.submit', { roundId: round().id, text: ACTION, submissionId: 'k1' });
    await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'k1', choices: {} });
    await relay('pl-2', 'batch.pass', { roundId: round().id });
    expect(round()).toMatchObject({ number: 1, phase: 'upgrading' });
    expect(round().entries['pl-1'].upgrade).toMatchObject({ burn: { previewOutcome: 'strong_hit' }, decided: null });

    await renPlaysTheXCard();
    await relay('pl-1', 'batch.keep', { roundId: round().id });         // Kira decides while the X-Card is in play

    // The windows say "the round can't be resolved until a GM resumes".
    expect.soft({ round: round().number, phase: round().phase, pausedNotices: roundOnePaused().length },
      'the X-Card holds the round').toEqual({ round: 1, phase: expect.not.stringMatching(/^closed$/), pausedNotices: 0 });

    await gmResumes();
    expect(roundOneNarrations(), 'the round is narrated once the GM resumes').toHaveLength(1);
  }, 60_000);
});
