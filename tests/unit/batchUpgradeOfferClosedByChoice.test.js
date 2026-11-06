/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/batchUpgradeOfferClosedByChoice.test.js
 *
 * Issue #342 Z27 UPGRADE-OFFER-IGNORES-CHOICE (the eleventh audit's
 * BATCH-14).
 *
 * A move's Burn Momentum / Improve Result close once its consequence is
 * chosen on its suffer card (issue #311 P03: closeUpgradesForChoice stamps
 * the move card `choiceMade`; the GM handlers refuse "choice-made"). In a
 * round the result card and its suffer card are up while later entries still
 * roll, and the roller can pick there at once. The round's upgrade step
 * offered only from `canBurn` / `canImprove`, skipping a card that was
 * consumed but not one whose upgrades were closed — so it waited on Kira for
 * a Burn the card would refuse, until she pressed Keep or a GM pressed Send
 * now. A card whose upgrades are closed now offers nothing, and a pick made
 * during the step is that roller's Keep.
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
    // every roll a weak hit (a "suffer -1" card); Kira's momentum of 9 can burn it
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.35).mockReturnValueOnce(0.75).mockReturnValueOnce(0.4);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { holdWrites, scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const REPLY = 'Kira slips through, scraped.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

let table;
const round = () => table.world.getSetting('batchMode.round');
const roundCards = () => table.cards(f => f.narratorCard && f.roundId);
const idOf = (m) => m?._id ?? m?.id;

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
  await table.settle();
  return res;
}

/** Kira confirms first, then Ren; Ren's result card is held so the round is still rolling. */
async function kiraRecordedRenRolling() {
  const held = holdWrites(table, (w) => w.kind === 'message.create'
    && w.data?.flags?.[MODULE_ID]?.moveResolution === true && w.data?.flags?.[MODULE_ID]?.roundUserId === 'pl-2');
  await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I slip through the vent before the drones turn.', submissionId: 'k1' });
  await relay('pl-2', 'batch.submit', { roundId: round().id, text: 'I vault the barricade.', submissionId: 'r1' });
  await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'k1', choices: {} });
  await relay('pl-2', 'batch.confirm', { roundId: round().id, submissionId: 'r1', choices: {} });
  await held.arrived;
  expect(round()).toMatchObject({ phase: 'rolling' });
  expect(round().entries['pl-1'].status).toBe('recorded');
  return held;
}

describe('Z27 — Kira picks her weak hit\'s cost on its card', () => {
  it('control: she does not pick — the round waits on her Burn / Keep (the offer is real)', async () => {
    const held = await kiraRecordedRenRolling();
    held.release();
    await table.drain();
    expect(round()).toMatchObject({ number: 1, phase: 'upgrading' });
    expect(round().entries['pl-1'].upgrade).toMatchObject({ burn: { previewOutcome: 'strong_hit' }, decided: null });
  }, 30_000);

  it('she picks on her suffer card first — the round does not wait on a Burn the card has closed', async () => {
    const held = await kiraRecordedRenRolling();
    const kiraResolution = round().entries['pl-1'].rolled.resolutionId;
    const suffer = table.cards(f => f.sufferCard && f.resolutionId === kiraResolution)[0];
    expect(suffer).toBeTruthy();
    table.client('pl-1').click(idOf(suffer), '[data-action="sf-suffer-pick"]');
    await table.settle();
    const moveCard = table.world.message(round().entries['pl-1'].rolled.cardId);
    expect(moveCard.flags[MODULE_ID].burn.choiceMade).toBe(true);     // the card's Burn is closed
    held.release();
    await table.drain();
    expect(roundCards(), `round ${round()?.number} ${round()?.phase}; Kira's offer: ${JSON.stringify(round()?.entries?.['pl-1']?.upgrade ?? null)}`).toHaveLength(1);
  }, 30_000);

  it('she picks on her suffer card during the upgrade step — the closed upgrade is not still awaited', async () => {
    const held = await kiraRecordedRenRolling();
    held.release();
    await table.drain();
    expect(round()).toMatchObject({ phase: 'upgrading' });
    const { resolutionId: kiraResolution, cardId } = round().entries['pl-1'].rolled;
    const suffer = table.cards(f => f.sufferCard && f.resolutionId === kiraResolution)[0];
    table.client('pl-1').click(idOf(suffer), '[data-action="sf-suffer-pick"]');
    await table.settle();
    await table.drain();
    expect(table.world.message(cardId).flags[MODULE_ID].burn.choiceMade).toBe(true);
    // The pick is her Keep: the round is narrated, not left waiting on a Burn the card refuses.
    expect(roundCards(), `round ${round()?.number} ${round()?.phase}; Kira's offer decided: ${round()?.entries?.['pl-1']?.upgrade?.decided ?? null}`).toHaveLength(1);
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
  }, 30_000);
});
