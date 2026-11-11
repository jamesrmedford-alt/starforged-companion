/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION — bug-audit probe (thirteenth audit, 2026-11-11)
 * tests/probes/batch/rolledWithoutCardRolledAgain.probe.js
 *
 * BATCH: a round entry's roll is known to the round only from its result card
 * on (driver.js rollEntry: `entry.rolled?.cardId`, roundResultCard, or status
 * "rolled"). rollMove applies the roll's effects first — the dice, the
 * outcome's effects, a miss's Pay the Price card (its clock advances and
 * suffer routes) — then awaits the relevance pass (a Claude call for a hybrid
 * move) and only then posts the result card. A resolver whose page dies in
 * that span leaves an entry the recovery (recoveryPlan: "toRoll") and
 * rollEntry see as never rolled: the GM who resumes the round rolls it a
 * second time — new dice, a second Pay the Price. The recovery's promise is
 * "no entry rolled twice" (issue #340 test 17); it holds only once the card is
 * up.
 *
 * The probe asserts the correct behaviour (Ren's move is rolled once), so it
 * fails until the finding is fixed.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => ({ moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 't', mischiefApplied: false })),
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
    // challenge 9 and 10, action die 1: every roll a miss (it pays the price).
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.85).mockReturnValueOnce(0.95).mockReturnValueOnce(0.0);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude, holdWrites, failWrites } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';
import { resolveMove } from '../../../src/moves/resolver.js';

const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';
let table;
const round = () => table.world.getSetting('batchMode.round');
const roundNarrations = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL && /THIS ROUND/.test(c.userText ?? ''));
const priceCards = () => table.cards(f => f.payThePriceCard);

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.GM2, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  resolveMove.mockClear();
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  await table.setClaudeKey('gm-2', 'sk-ant-gus');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [] } });
  scriptClaude(table, { fallback: () => 'The round turns.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
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

async function bothConfirm() {
  await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I slip through the vent.', submissionId: 'k1' });
  await relay('pl-2', 'batch.submit', { roundId: round().id, text: 'I vault the barricade.', submissionId: 'r1' });
  await relay('pl-1', 'batch.confirm', { roundId: round().id, submissionId: 'k1', choices: {} });
  await relay('pl-2', 'batch.confirm', { roundId: round().id, submissionId: 'r1', choices: {} });
}

describe('BATCH — the GM resolving a round goes away while a move is being rolled', () => {
  it('control: gm-1 leaves once Ren\'s result card is up — gm-2 does not roll Ren again', async () => {
    // gm-1 stalls on the round's "rolled" stamp for Ren: the card is up.
    const held = holdWrites(table, w => w.kind === 'setting' && w.key === `${MODULE_ID}.batchMode.round`
      && w.client === 'gm-1' && w.value?.entries?.['pl-2']?.status === 'rolled');
    await bothConfirm();
    await held.arrived;
    expect(resolveMove).toHaveBeenCalledTimes(2);          // Kira's, Ren's
    const paid = priceCards().length;
    await table.leave('gm-1');
    await table.settle();
    await table.drain();
    expect(resolveMove).toHaveBeenCalledTimes(2);          // never again
    expect(priceCards()).toHaveLength(paid);
    expect(roundNarrations().map(c => c.client)).toEqual(['gm-2']);
    held.release();
    await table.settle();
    await table.join('gm-1');
  }, 30_000);

  it('the world refuses Ren\'s result card: the round stops, and the Send now its notice asks for must not roll Ren again', async () => {
    const refused = failWrites(table, w => w.kind === 'message.create' && w.client === 'gm-1'
      && w.data?.flags?.[MODULE_ID]?.moveResolution === true && w.data?.flags?.[MODULE_ID]?.roundUserId === 'pl-2', { times: 1 });
    await bothConfirm();
    await table.drain();
    expect(refused.refused).toBe(1);
    expect(round()).toMatchObject({ phase: 'rolling' });
    // The GMs are told the round stopped, and to press Send now.
    expect(table.cards(f => f.batchRoundStoppedNotice)).toHaveLength(1);
    const paidBefore = priceCards().length;
    expect(resolveMove).toHaveBeenCalledTimes(2);

    await relay('gm-1', 'batch.sendNow', { roundId: round().id });
    await table.drain();

    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });   // the round went on
    expect({ rolls: resolveMove.mock.calls.length, pricesPaid: priceCards().length })
      .toEqual({ rolls: 2, pricesPaid: paidBefore });
  }, 30_000);

  it('gm-1 leaves after Ren\'s roll paid its price, before its result card — gm-2 must not roll Ren a second time', async () => {
    // gm-1's page dies with Ren's result card on its way (the card is the last
    // thing rollMove does: the dice, the outcome's effects and the miss's Pay
    // the Price are already applied).
    const held = holdWrites(table, w => w.kind === 'message.create' && w.client === 'gm-1'
      && w.data?.flags?.[MODULE_ID]?.moveResolution === true && w.data?.flags?.[MODULE_ID]?.roundUserId === 'pl-2');
    await bothConfirm();
    await held.arrived;
    expect(round()).toMatchObject({ phase: 'rolling', resolverId: 'gm-1' });
    expect(round().entries['pl-2'].status).toBe('ready');   // the round knows nothing of Ren's roll yet
    expect(resolveMove).toHaveBeenCalledTimes(2);           // Kira's, Ren's
    const paidBefore = priceCards().length;                 // Kira's miss and Ren's miss each paid a price
    expect(paidBefore).toBe(2);

    await table.leave('gm-1');
    await table.settle();
    await table.drain();

    // gm-2 resumed and finished the round.
    expect(roundNarrations().map(c => c.client)).toEqual(['gm-2']);
    // Ren's move was rolled once, and paid its price once.
    expect({ rolls: resolveMove.mock.calls.length, pricesPaid: priceCards().length })
      .toEqual({ rolls: 2, pricesPaid: paidBefore });
    held.fail();                                            // the dead page's card never posts
    await table.settle();
    await table.join('gm-1');
  }, 30_000);
});
