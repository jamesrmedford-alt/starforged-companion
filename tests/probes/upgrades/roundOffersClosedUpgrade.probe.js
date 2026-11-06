/**
 * Eleventh audit — UPG-4 ROUND-OFFERS-CLOSED-UPGRADE (Batch Mode, issue #340).
 *
 * Batch Mode on a simulated table (tests/helpers/multiClient.js — the
 * batchModeTable.test.js harness). Kira's Face Danger rolls a weak hit; its
 * record posts the move card (🔥 Burn Momentum, momentum 9 → strong hit) and
 * the weak hit's choice card ("Make a suffer move (-1)"). The round enters
 * its upgrade step and waits for Kira: her Round window asks "Decide before
 * the round is narrated" — Burn / Keep.
 *
 * Kira resolves the consequence first (the card is right there in chat): she
 * picks Lose Momentum on the choice card. A chosen consequence closes both
 * upgrades (issue #311 P03 — the card's 🔥 now reads "the consequence was
 * already chosen"). But the round's upgrade offer was built from the card's
 * `burn.canBurn` alone (driver.js upgradeOffers) and is never revisited: the
 * round keeps waiting on Kira's decision, her window keeps offering Burn, and
 * the Burn it relays is refused on the GM with a console line only
 * (burnMomentum.js applyBurnFromRelay — "choice-made") — the button re-arms
 * after 15 s and nothing tells Kira why, or that only Keep (or a GM's Send
 * now) moves the round on. The same holds for an upgrade closed by the
 * resist roll a price owes (its card says "burn or improve first", issue
 * #336 Y18) and for one the card offers but a choice closed before the
 * upgrade step began.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/upgrades/roundOffersClosedUpgrade.probe.js
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [] }));
vi.mock('../../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => ({ moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 'risky', mischiefApplied: false })),
}));
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

const ROUND_REPLY = 'Kira slips through the vent as the drones turn.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
// challenge 4 and 8, action die 3 (+edge 2 = 5): a weak hit a burn of 9 raises.
const WEAK = [0.35, 0.75, 0.4];

let table, kira;
const round = () => table.world.getSetting('batchMode.round');
const flags = (id) => table.world.message(id).flags[MODULE_ID];

async function relay(userId, kind, payload) {
  const c = table.client(userId);
  const gmRelay = await c.import('../../src/multiplayer/gmRelay.js');
  const res = await c.run(() => gmRelay.requestGmAction(kind, payload));
  await table.settle();
  return res;
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  control.dice = [];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  kira = table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] }, system: { momentum: { value: 9 } } });
  scriptClaude(table, { fallback: () => ROUND_REPLY });
  silenceConsoleErrors();
});

/** Kira's weak hit: the round waits on her upgrade; returns the move card and its choice card. */
async function weakHitRound() {
  await table.client('gm-1').setSetting('batchMode.enabled', true);
  await table.settle();
  control.dice = [WEAK];
  await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I slip through the vent before the drones turn.', submissionId: 'sub-1' });
  const r = round();
  await relay('pl-1', 'batch.confirm', { roundId: r.id, submissionId: r.entries['pl-1'].submissionId, choices: {} });
  await table.drain();
  expect(round()).toMatchObject({ phase: 'upgrading' });
  expect(round().entries['pl-1'].upgrade).toMatchObject({ burn: { previewOutcome: 'strong_hit' }, decided: null });
  const rolled = round().entries['pl-1'].rolled;
  const choice = table.cards(f => f.sufferCard && f.resolutionId === rolled.resolutionId).at(-1);
  expect(choice?.flags?.[MODULE_ID]?.sufferPrompt).toMatchObject({ kind: 'any', amount: 1 });
  return { cardId: rolled.cardId, choice };
}

/** Kira resolves the weak hit's cost on its card: Lose Momentum (-1). */
async function chooseConsequence(choice) {
  await relay('pl-1', 'suffer.pick', { messageId: choice._id, pickKind: 'any', sufferId: 'lose_momentum' });
  await table.drain();
}

describe('UPG-4 — the round keeps offering an upgrade its card has closed', () => {
  it('control: the chosen consequence closes the card\'s Burn, and the card says so', async () => {
    const { cardId, choice } = await weakHitRound();
    await chooseConsequence(choice);
    expect(kira.system.momentum.value).toBe(8);
    expect(flags(cardId).burn.choiceMade).toBe(true);
  }, 30_000);

  it('control: a Burn from the window before any choice applies, and the round narrates the strong hit', async () => {
    const { cardId } = await weakHitRound();
    await relay('pl-1', 'move.burnMomentum', { messageId: cardId });
    await table.drain();
    expect(flags(cardId).burn.consumed).toBe(true);
    expect(round()).toMatchObject({ number: 2 });
  }, 30_000);

  it('once the choice closed the upgrade, the round no longer waits on it', async () => {
    const { choice } = await weakHitRound();
    await chooseConsequence(choice);

    const r = round();
    const stillAsked = r.phase === 'upgrading' && !!r.entries['pl-1']?.upgrade && !r.entries['pl-1'].upgrade.decided;
    expect(stillAsked).toBe(false);
  }, 30_000);

  it('the window\'s Burn, refused for the closed upgrade, is not refused in silence', async () => {
    const { cardId, choice } = await weakHitRound();
    await chooseConsequence(choice);
    const whispersBefore = table.cards(f => f).filter(c => (c.whisper ?? []).includes('pl-1')).length;
    const notesBefore = table.client('pl-1').notifications.length;

    await relay('pl-1', 'move.burnMomentum', { messageId: cardId });   // the window's Burn: the card's own relay
    await table.drain();

    expect(flags(cardId).burn.consumed).not.toBe(true);              // refused — right: the consequence was chosen
    const told = table.cards(f => f).filter(c => (c.whisper ?? []).includes('pl-1')).length > whispersBefore
      || table.client('pl-1').notifications.length > notesBefore;
    expect(told).toBe(true);
  }, 30_000);
});
