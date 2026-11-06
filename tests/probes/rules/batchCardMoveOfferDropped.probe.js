/**
 * Probe — RULE-1 BATCH-CARD-MOVE-OFFER-DROPPED (eleventh audit, rules).
 *
 * Batch Mode (issue #340): a card button's move for a participant who has
 * already submitted becomes an `offer` beside their entry — "the window asks
 * which to keep" (src/batch/round.js offerForcedMove; the help's Batch Mode
 * page). But readyToResolve (round.js:523-530) counts an entry READY with an
 * offer still undecided as ready, so the round resolves without the player
 * ever choosing; the round closes and the next one is created fresh — the
 * offer, and the card's move with it, is gone. The card was claimed by its
 * press (its button reads taken), so the move is never made.
 *
 * The card here is the resist roll a harm step at 0 health owes ("Then, if
 * your health is 0 … roll +health or +iron" — vendored Endure_Harm): the
 * "🛡 Resist the harm" choice card posts it as the PC's forced Endure Harm
 * (sufferDialog.js runSufferCall "resist" — `forcedMoveId: "endure_harm"`,
 * `bypassPacing`, `deferWhileBusy`), the same message shape this probe posts.
 *
 * Harness: batchModeTable.test.js's (simulateTable, the pacing / interpreter
 * / ability-scan mocks, scripted dice inside the real resolveMove).
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ pace: null, interpret: null, dice: [] }));
vi.mock('../../../src/pacing/router.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
    decidePacing: vi.fn(async ({ playerText }) => control.pace(playerText)),
  };
});
vi.mock('../../../src/moves/interpreter.js', async (importOriginal) => {
  const original = await importOriginal();
  return { ...original, interpretMove: vi.fn(async (text) => control.interpret(text)) };
});
vi.mock('../../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
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
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random');
      for (const d of control.dice.shift() ?? []) dice.mockReturnValueOnce(d);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const P3 = Object.freeze({ id: 'pl-3', name: 'Rook', isGM: false });
const ROUND_REPLY = 'Kira slips through the vent.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
// challenge 3 and 4, action die 6: a strong hit for any stat ≥ 0.
const STRONG = [0.25, 0.35, 0.9];
const FACE_DANGER = { moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 'risky', mischiefApplied: false };
const MOVE = { runMove: true, decision: 'MOVE', suggestedMove: null };

let table;
const round = () => table.world.getSetting('batchMode.round');
let seq = 0;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2, P3] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.pace = () => ({ ...MOVE });
  control.interpret = () => ({ ...FACE_DANGER });
  control.dice = [];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    narratorSessionSummary: false,
    combatTrackerEnabled: false,
    campaignState: {
      ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1,
      currentSceneId: 'sc-1', sceneTruths: [],
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [] } });
  table.addActor({ id: 'pc-ash',  name: 'Ash',  ownership: { 'pl-3': 3 }, items: { contents: [] } });
  // Kira at 0 health: the resist roll is owed.
  table.actors.get('pc-kira').system.health.value = 0;
  scriptClaude(table, { fallback: () => ROUND_REPLY });
  silenceConsoleErrors();
});

async function relay(userId, kind, payload) {
  const c = table.client(userId);
  const gmRelay = await c.import('../../src/multiplayer/gmRelay.js');
  const res = await c.run(() => gmRelay.requestGmAction(kind, payload));
  await table.settle();
  return res;
}
async function batchModeOn() {
  await table.client('gm-1').setSetting('batchMode.enabled', true);
  await table.settle();
}
async function submit(userId, text) {
  const submissionId = `sub-${userId}-${++seq}`;
  await relay(userId, 'batch.submit', { roundId: round().id, text, submissionId });
  return submissionId;
}
async function confirm(userId, choices = {}) {
  const r = round();
  return relay(userId, 'batch.confirm', { roundId: r.id, submissionId: r.entries[userId].submissionId, choices });
}
const pass = (userId) => relay(userId, 'batch.pass', { roundId: round().id });

/** The resist card's forced move, as sufferDialog posts it (speaker = the card's PC). */
async function resistRollPressed() {
  await table.client('gm-1').run(() => globalThis.ChatMessage.create({
    content: 'Kira resists the harm.',
    speaker: { actor: 'pc-kira', alias: 'Kira' },
    flags: { [MODULE_ID]: { bypassPacing: true, forcedMoveId: 'endure_harm', deferWhileBusy: true } },
  }));
  await table.settle();
}

/** Kira's round result cards' contents. */
const kiraRolls = () => table.cards(f => f.moveResolution && f.roundUserId === 'pl-1').map(c => c.content ?? '');

describe('RULE-1 a card move offered beside a confirmed entry is dropped when the round resolves', () => {
  it('control: pressed before Kira writes her own action, the resist roll is her entry and is rolled as Endure Harm', async () => {
    await batchModeOn();
    await resistRollPressed();
    expect(round().entries['pl-1']).toMatchObject({ status: 'read', reading: { moveId: 'endure_harm' } });
    control.dice = [STRONG];
    await confirm('pl-1');
    await pass('pl-2');
    await pass('pl-3');
    await table.drain();
    expect(round()).toMatchObject({ number: 2 });
    expect(kiraRolls()).toHaveLength(1);
    expect(kiraRolls()[0]).toMatch(/Endure Harm/);
  }, 30_000);

  it('pressed after Kira confirmed her own action, the resist roll is offered — then lost when the others are ready', async () => {
    await batchModeOn();
    await submit('pl-1', 'I crawl toward the airlock.');
    await confirm('pl-1');
    expect(round().entries['pl-1'].status).toBe('ready');

    await resistRollPressed();
    // The window shows the offer ("Use the card's move" / "Keep mine").
    expect(round().entries['pl-1'].offer).toMatchObject({ text: 'Kira resists the harm.', forced: { moveId: 'endure_harm' } });

    control.dice = [STRONG];
    await pass('pl-2');
    await pass('pl-3');
    await table.drain();

    // The round resolved with Kira's own action only.
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });
    expect(kiraRolls()).toHaveLength(1);
    expect(kiraRolls()[0]).toMatch(/Face Danger/);

    // The owed resist roll must not vanish: rolled in round 1, or still
    // Kira's to make in round 2 (her entry or an offer beside it).
    const e2 = round().entries['pl-1'];
    const stillOwed = e2?.offer?.forced?.moveId === 'endure_harm'
      || e2?.readAs?.forced?.moveId === 'endure_harm'
      || e2?.reading?.moveId === 'endure_harm';
    const rolledInRound1 = kiraRolls().some(c => /Endure Harm/.test(c));
    expect(stillOwed || rolledInRound1,
      `the resist roll was neither rolled (round 1: ${kiraRolls().length} roll) nor kept for round 2 (Kira's round-2 entry: ${JSON.stringify({ status: e2?.status, offer: e2?.offer ?? null })})`).toBe(true);
  }, 30_000);
});
