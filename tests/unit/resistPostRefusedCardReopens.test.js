/**
 * STARFORGED COMPANION
 * tests/unit/resistPostRefusedCardReopens.test.js
 *
 * Issue #362 AC60 RESIST-POST-REFUSED-CARD-DEAD (the remainder of issue #347
 * AB06). A harm step at 0 owes the resist roll — the "🛡 Resist the harm —
 * roll Endure Harm" card (issue #330 D3). The PC's player presses it, and the
 * world refuses the forced move's chat message (sufferDialog.js "resist":
 * ChatMessage.create throws). Every other card button releases its claim when
 * its post fails (cardActions.js), and AB06 re-opens this card when the posted
 * roll is then not made — but here the pick was claimed first (`resolved`, the
 * move's Burn / Improve closed), the call came back `post-failed`, and the
 * card stayed resolved reading "Not applied: Endure Harm rolled to resist —
 * post-failed". With no message for releaseSourceCard to act on and no Retry
 * (the reason is not "refused"), the mandatory roll could be made from no
 * card. The card is now handed back — open, saying the roll could not be
 * posted — and its move's Burn Momentum / Improve Result are open again.
 *
 * Booted GM + player tables (tests/helpers/multiClient.js): the probe's two
 * cases (tests/probes/movb/resistPostRefusedCardDead.probe.js), and a weak
 * hit's harm step whose move card offers a burn.
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [], interpretation: null }));
vi.mock('../../src/pacing/router.js', async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: 'chat' })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../src/moves/resolver.js', async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, 'random');
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { failWrites, scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { applyPayThePriceSufferFromRelay } from '../../src/index.js';

let table, kira;
const gm = () => table.client('gm-1');
const resistCards = () => table.cards(f => f.sufferCard && f.sufferPrompt?.resist === 'health');
const forcedRolls = () => table.cards(f => f.forcedMoveId === 'endure_harm');
const live = (card) => table.world.message(card._id);
const refuseTheRoll = () => failWrites(table, w => w.kind === 'message.create' && w.data?.flags?.[MODULE_ID]?.forcedMoveId === 'endure_harm');

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

async function pressResist(card) {
  await table.client('pl-1').click(card._id, '[data-action="sf-suffer-pick"]', { index: 0 });
  await table.settle(); await table.drain();
}

describe('issue #362 AC60 — a resist roll whose post the world refused hands its card back', () => {
  beforeEach(async () => {
    // No session begun: a forced move that is posted is held, not rolled.
    await table.reset({ world: { settings: { campaignState: { ...CampaignStateSchema, sessionActive: false } } } });
    kira = table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 },
      system: { health: { value: 1, max: 5 }, momentum: { value: 3 } } });
  });

  async function harmToZero() {
    const ctx = () => ({ requesterId: 'pl-1', requester: globalThis.game.users.get('pl-1'), requesterIsGM: false });
    await gm().run(() => applyPayThePriceSufferFromRelay({ routes: [{ move: 'endure_harm', amount: 1 }], actorId: 'pc-kira' }, ctx()));
    await table.settle(); await table.drain();
    expect(kira.system.health.value).toBe(0);
    return resistCards().at(-1);
  }

  it('control: the press posts Endure Harm as the PC, naming the card that owes it', async () => {
    const card = await harmToZero();
    expect(card, 'the resist card was posted at 0 health').toBeTruthy();
    await pressResist(card);
    expect(forcedRolls()).toHaveLength(1);
    expect(forcedRolls()[0].flags[MODULE_ID]).toMatchObject({ owedMove: true, sourceCard: { messageId: card._id, kind: 'suffer' } });
    expect(live(card).flags[MODULE_ID].resolved).toBe(true);
  }, 30_000);

  it('a refused post leaves the resist card open to press again, saying why', async () => {
    const card = await harmToZero();
    const refused = refuseTheRoll();
    await pressResist(card);
    expect(refused.refused).toBe(1);
    expect(forcedRolls(), 'no roll was posted').toHaveLength(0);
    expect(live(card).flags[MODULE_ID].resolved, 'the owed roll can still be pressed').toBe(false);
    expect(live(card).content).toMatch(/could not be posted — the world did not save it\. Press it again\./);
    expect(live(card).content).not.toMatch(/post-failed/);
    expect(live(card).content).toMatch(/data-action="sf-suffer-pick"/);
  }, 30_000);

  it('…and the press after it posts the roll', async () => {
    const card = await harmToZero();
    const refused = refuseTheRoll();
    await pressResist(card);
    refused.off();   // it refused one write; the next press goes through
    await pressResist(card);
    expect(forcedRolls()).toHaveLength(1);
    expect(live(card).flags[MODULE_ID].resolved).toBe(true);
    expect(live(card).content).not.toMatch(/could not be posted/);
  }, 30_000);
});

describe('issue #362 AC60 — the move whose price owed it offers its Burn again', () => {
  const WEAK = [0.25, 0.65, 0.5];   // challenge 3, 7; die 4 — edge 2 → 6: a weak hit; momentum 8 burns it

  beforeEach(async () => {
    await table.reset({ world: { settings: {
      holdResultForUpgrade: false, chronicleAutoEntry: false, narratorSessionSummary: false,
      campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'rp-s1', sessionNumber: 1,
        currentSceneId: 'rp-scene', sceneTruths: [], clocks: [] },
    } } });
    await table.setClaudeKey('gm-1', 'sk-ant-test');
    kira = table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 },
      system: { momentum: { value: 8 }, health: { value: 1 }, iron: 1, edge: 2 } });
    scriptClaude(table, { fallback: () => 'The moment passes.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
    silenceConsoleErrors();
  });

  it('the resist card of a weak hit\'s harm, its roll refused: the card is open and the Face Danger\'s burn too', async () => {
    control.interpretation = { moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 'test', mischiefApplied: false };
    control.dice = WEAK;
    await table.client('pl-1').chat('Kira forces the hatch and dives through.', { speaker: { actor: kira.id } });
    await table.settle(); await table.drain();
    const moveCard = table.cards(f => f.moveResolution).at(-1);
    expect(live(moveCard).flags[MODULE_ID].burn?.canBurn, 'setup: the card offers a burn').toBe(true);

    // The weak hit's price harms Kira 1 → 0: the resist card, bound to the Face Danger.
    const { endureHarm } = await gm().import('../../src/moves/sufferExecutor.js');
    const resolutionId = moveCard.flags[MODULE_ID].resolutionId;
    await gm().run(() => endureHarm(kira, 1, { resolutionId }));
    await table.settle(); await table.drain();
    const resist = resistCards().at(-1);
    expect(resist.flags[MODULE_ID].resolutionId).toBe(resolutionId);

    refuseTheRoll();
    await pressResist(resist);
    expect(forcedRolls()).toHaveLength(0);
    expect(live(resist).flags[MODULE_ID].resolved).toBe(false);
    // No consequence chosen now: the burn its press closed is open again.
    expect(live(moveCard).flags[MODULE_ID].burn?.choiceMade ?? false).toBe(false);
  }, 30_000);
});
