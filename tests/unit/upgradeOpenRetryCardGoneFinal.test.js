/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/upgradeOpenRetryCardGoneFinal.test.js
 *
 * Issue #364 UPGRADE-OPEN-RETRY-CARD-GONE-LOOP (found while fixing
 * FIGHT-MILESTONE-CARD-GONE-UNPRESSED-RETRY-LOOP, in the same Retry and of
 * the same kind).
 *
 * A move card whose Burn Momentum / Improve Result the world would not open
 * goes to the GMs with a Retry that opens it (issue #344 A02, the
 * `upgradeOpen` step). With the move card deleted before the Retry there is
 * no card to open and never will be: the step answered "card-gone", and a
 * Retry puts every step that fails again on a fresh card with its own Retry —
 * so each press posted another card whose Retry found the card gone again.
 *
 * Now that outcome is final: the Retry resolves the card, posts no fresh
 * Retry, and tells the GMs once, on a card with no Retry, that the move card
 * is no longer in chat. A stamp refused again with the card still there
 * still gets its fresh Retry.
 *
 * On a booted table, as tests/unit/upgradeOpenStampRefused.test.js: the real
 * move pipeline, the refused stamp, the GM's press of "Retry these steps".
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
vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
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
    // A weak hit that a burn of 9 raises to a strong hit.
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.35).mockReturnValueOnce(0.75).mockReturnValueOnce(0.4);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude, failWrites } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const REPLY = 'Kira slips through the vent.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const SESSION = { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [] };
const RETRY = '[data-action="sf-payoff-retry"]';

let table;
const live = (card) => table.world.message(card._id);
const kirasCards = () => table.cards(f => f.moveResolution && f.actorId === 'pc-kira');
const notices = () => table.cards(f => f.payoffFailureCard && f.steps?.some(s => s.step === 'upgradeOpen'));
const retryCards = () => notices().filter(c => c.flags[MODULE_ID].retryable !== false);
const finalCards = () => notices().filter(c => c.flags[MODULE_ID].retryable === false);
// The write that opens the card's Burn Momentum — recordMove's, a Retry's.
const openStamp = (w) => w.kind === 'message.update' && w.changes?.[`flags.${MODULE_ID}.burn.originalApplied`] === true;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false, campaignState: SESSION,
  } } });
  await table.setClaudeKey('gm-1', 'test-fixture-key');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  table.actors.get('pc-kira').system.momentum.value = 9;
  scriptClaude(table, { fallback: () => REPLY });
  silenceConsoleErrors();
});

/** Kira's move, its card's opening stamp refused: the GMs' card, its one step the stamp. */
async function cardTheWorldWouldNotOpen() {
  const fault = failWrites(table, openStamp, { times: 1_000 });
  await table.client('pl-1').chat('I slip through the vent before the drones turn.', { speaker: { actor: 'pc-kira' } });
  await table.settle(); await table.drain();
  const card = kirasCards().at(-1);
  expect(notices(), 'setup: the GMs are told, with a Retry').toHaveLength(1);
  expect(notices()[0].flags[MODULE_ID]).toMatchObject({ retryable: true, steps: [{ step: 'upgradeOpen', messageId: card._id }] });
  return { card, notice: notices()[0], fault };
}

async function retry(notice) {
  await table.client('gm-1').click(notice._id, RETRY);
  await table.settle(); await table.drain();
}

describe('issue #364 UPGRADE-OPEN-RETRY-CARD-GONE-LOOP — the move card deleted before the GMs\' Retry opens it', () => {
  it('the Retry resolves the card: no fresh Retry card, and the GMs are told once that the move card is gone', async () => {
    const { card, notice, fault } = await cardTheWorldWouldNotOpen();
    fault.off();
    await table.client('gm-1').run(() => globalThis.game.messages.get(card._id).delete());
    await table.settle(); await table.drain();

    await retry(notice);

    expect(live(notice).flags[MODULE_ID].resolved).toBe(true);
    expect(retryCards().map(c => c._id), 'no fresh card with a Retry').toEqual([notice._id]);
    expect(finalCards(), 'one card saying why').toHaveLength(1);
    expect(String(finalCards()[0].content)).toContain('the move card is no longer in chat');
    expect(String(finalCards()[0].content)).toContain('no longer owed');
    expect(table.client('gm-1').render(finalCards()[0]._id).querySelector(RETRY)).toBeNull();
    expect(finalCards()[0].whisper).toEqual(['gm-1']);
  }, 30_000);

  it('control: the stamp refused again with the card still in chat — a fresh card with its own Retry, which opens it', async () => {
    const { card, notice, fault } = await cardTheWorldWouldNotOpen();

    await retry(notice);
    expect(finalCards()).toEqual([]);
    expect(retryCards(), 'a fresh Retry').toHaveLength(2);

    fault.off();
    await retry(retryCards()[1]);
    expect(live(card).flags[MODULE_ID].burn.originalApplied).toBe(true);
    expect(notices()).toHaveLength(2);
  }, 30_000);
});
