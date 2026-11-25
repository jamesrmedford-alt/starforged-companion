/**
 * STARFORGED COMPANION
 * tests/unit/heldUpgradeWaitNotClosedSettles.test.js
 *
 * Issue #364 HELD-CARD-WAIT-NOT-CLOSED-STAYS-OPEN (found while fixing
 * SOJOURN-HELD-SWEAR-CLOSEWAIT-REFUSED).
 *
 * A free-flow result held for Burn Momentum / Improve Result / Keep
 * (src/moves/heldResult.js) is settled by its upgrade: the upgraded result is
 * the move's one narration, and pays the price the card held when it pays one
 * too (a Battle or Clash burned to a weak hit). The upgrade first closes the
 * card's wait. When the world refused that write the card stayed open — it
 * went on reporting a result waiting for Burn / Improve / Keep, and its Keep
 * answered "upgraded" — and the held price was never paid: it was paid only
 * once the wait closed.
 *
 * Now the upgraded result pays the held price either way, once, and the
 * refused close goes to the GMs' "Retry these steps" card as a step whose
 * Retry closes the wait — and only closes it.
 *
 * End to end on a booted table, as tests/unit/statedMissWeakHit.test.js runs
 * a held Battle miss: the interpretation, the abilities, the dice and the
 * d100 scripted at their boundaries; the refused write is a fault at the
 * world's boundary (table.interceptWrites); every press goes through the real
 * cards and relays.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [], interpretation: null, ptp: [85], ptpRolls: 0 }));
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
// Challenge dice first (two d10), then the action die (d6), inside the REAL resolveMove.
vi.mock('../../src/moves/resolver.js', async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, 'random');
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});
vi.mock('../../src/oracles/roller.js', async (original) => {
  const real = await original();
  return { ...real, rollOracle: (...args) => {
    if (args[0] !== 'pay_the_price') return real.rollOracle(...args);
    control.ptpRolls += 1;
    const rng = vi.spyOn(Math, 'random');
    for (const value of control.ptp) rng.mockReturnValueOnce((value - 0.5) / 100);
    try { return real.rollOracle(...args); } finally { rng.mockRestore(); }
  } };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const LINE = 'Kira throws herself into the fight.';
const STAKES = { hit: 'You hold the docking bay.', miss: 'The raiders overrun the bay and take the ship.',
  missSuffer: { move: 'endure_harm', amount: 2 }, priceStated: true };
// Battle: iron 1, challenge 4 and 8, die 1 — a miss; momentum 6 beats one die: Burn makes a weak hit, which pays the price too.
const HELD_MISS = [0.35, 0.75, 0.0];
const BURN  = '[data-action="sf-burn-momentum"]';
const KEEP  = '[data-action="sf-keep-result"]';
const RETRY = '[data-action="sf-payoff-retry"]';
// The write that closes a held card's wait (heldResult.js closeWait).
const WAIT_OPEN = `flags.${MODULE_ID}.awaitingUpgrade.open`;

let table, pc;
const flags      = (id) => table.world.message(id).flags[MODULE_ID];
const priceCards = () => table.cards(f => f.payThePriceCard);
const tellings   = () => table.claude.calls.filter(c => /\[stakes\] The player saw these before rolling:/.test(c.userText ?? ''));
const notices    = () => table.cards(f => f.payoffFailureCard && f.steps?.some(s => s.step === 'heldWait'));
const settled    = async () => { await table.settle(); await table.drain(); };

/** Kira's Battle misses and is held for Burn / Keep: nothing paid, nothing narrated. */
async function heldBattleMiss() {
  pc.system.momentum.value = 6;
  pc.system.iron = 1;
  control.interpretation = { moveId: 'battle', moveName: 'battle', statUsed: 'iron', adds: 0, rationale: 'test', mischiefApplied: false, stakes: { ...STAKES } };
  control.dice = HELD_MISS;
  await table.client('pl-1').chat(LINE, { speaker: { actor: pc.id } });
  await settled();
  const card = table.cards(f => f.moveResolution).at(-1);
  expect(flags(card._id).awaitingUpgrade, 'setup: the miss is held').toMatchObject({ open: true });
  expect(priceCards()).toEqual([]);
  expect(tellings()).toHaveLength(0);
  return card;
}
/** The world refuses every write that closes `card`'s wait, until off(). */
function refuseWaitClose(card) {
  const refused = [];
  const off = table.interceptWrites((w) => {
    if (w.kind !== 'message.update' || w.id !== card._id || !(WAIT_OPEN in (w.changes ?? {}))) return undefined;
    refused.push(w);
    return new Error("The server refused the card's write (test fault)");
  });
  return { refused, off };
}
/** Burned while the wait cannot be closed: the weak hit is paid and narrated; the GMs have the close to retry. */
async function burnedWaitRefused() {
  const card = await heldBattleMiss();
  const fault = refuseWaitClose(card);
  await table.client('pl-1').click(card._id, BURN);
  await settled();
  expect(fault.refused.length, "setup: the wait's close was refused").toBeGreaterThan(0);
  expect(flags(card._id).burn, 'setup: the burn itself landed').toMatchObject({ consumed: true });
  return { card, fault };
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  control.ptp = [85];   // were the table rolled: 85, You are stressed (Endure Stress -1)
  control.ptpRolls = 0;
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'hwc-s1', sessionNumber: 1,
      currentSceneId: 'hwc-scene', sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  pc = table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, system: { momentum: { value: 2 } } });
  scriptClaude(table, { fallback: () => 'The moment turns.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  globalThis.silenceConsoleErrors?.();
});

describe('a held result burned while its card\'s wait cannot be closed (issue #364 HELD-CARD-WAIT-NOT-CLOSED-STAYS-OPEN)', () => {
  it('the weak hit pays the held price — the table\'s — once, and is narrated once, with the player\'s line', async () => {
    const { card } = await burnedWaitRefused();

    expect(flags(card._id).awaitingUpgrade, 'the close was refused: the card still says it waits').toMatchObject({ open: true });
    expect(priceCards(), 'the price is paid').toHaveLength(1);
    expect(control.ptpRolls).toBe(1);
    expect(priceCards()[0].content).toContain('d100 = <strong>85</strong> · You are stressed');
    expect(pc.system.spirit.value).toBe(4);
    expect(pc.system.health.value).toBe(5);
    expect(tellings(), 'narrated once').toHaveLength(1);
    expect(tellings()[0].userText).toContain('This is a weak hit: deliver the hit as stated');
    expect(`${tellings()[0].system ?? ''}\n${tellings()[0].userText}`, 'its narration depicts the price').toContain('Pay the Price: You are stressed');
    expect(tellings()[0].userText, "the player's own line").toContain(LINE);

    // Keep pressed while the card still says it waits: nothing is paid or narrated again.
    await table.client('pl-1').click(card._id, KEEP);
    await settled();
    expect(priceCards()).toHaveLength(1);
    expect(control.ptpRolls).toBe(1);
    expect(pc.system.spirit.value).toBe(4);
    expect(tellings()).toHaveLength(1);
  });

  it('the GMs are told, with a Retry that closes the wait — and only closes it: the card stops reporting a wait', async () => {
    const { card, fault } = await burnedWaitRefused();

    expect(notices(), 'the GMs are told').toHaveLength(1);
    const [notice] = notices();
    expect(notice.flags[MODULE_ID]).toMatchObject({ retryable: true, resolved: false,
      steps: [{ step: 'heldWait', messageId: card._id, by: 'burn' }] });
    expect(notice.whisper, 'only GMs see it').toEqual(['gm-1']);
    expect(String(notice.content)).toContain('Burn Momentum');
    expect(table.client('pl-1').render(card._id).querySelector(KEEP), 'setup: Keep is still offered').toBeTruthy();

    fault.off();
    await table.client('gm-1').click(notice._id, RETRY);
    await settled();

    expect(flags(card._id).awaitingUpgrade, 'the wait is closed').toMatchObject({ open: false, resolvedBy: 'burn' });
    expect(flags(notice._id).resolved).toBe(true);
    expect(notices(), 'no fresh Retry').toHaveLength(1);
    expect(table.client('pl-1').render(card._id).querySelector(KEEP), 'Keep is no longer offered').toBeNull();
    const held = await table.client('gm-1').import('../../src/moves/heldResult.js');
    expect(table.client('gm-1').run(() => held.heldCardsOf('pc-kira')), 'no held result is reported').toEqual([]);
    // Closed, and nothing paid or narrated again.
    expect(priceCards()).toHaveLength(1);
    expect(control.ptpRolls).toBe(1);
    expect(pc.system.spirit.value).toBe(4);
    expect(tellings()).toHaveLength(1);
  });

  it('the move card deleted before the Retry: nothing to close, told once with no fresh Retry', async () => {
    const { card, fault } = await burnedWaitRefused();
    fault.off();
    await table.client('gm-1').run(() => game.messages.get(card._id).delete());
    await settled();

    await table.client('gm-1').click(notices()[0]._id, RETRY);
    await settled();

    const retryable = notices().filter(c => c.flags[MODULE_ID].retryable !== false);
    expect(retryable, 'no fresh card with a Retry').toHaveLength(1);
    expect(notices().filter(c => c.flags[MODULE_ID].retryable === false)).toHaveLength(1);
    expect(priceCards()).toHaveLength(1);
    expect(control.ptpRolls).toBe(1);
  });

  it('control: the close lands — the GMs are told nothing, and the price is paid once', async () => {
    const card = await heldBattleMiss();
    await table.client('pl-1').click(card._id, BURN);
    await settled();

    expect(flags(card._id).awaitingUpgrade).toMatchObject({ open: false, resolvedBy: 'burn' });
    expect(notices()).toHaveLength(0);
    expect(priceCards()).toHaveLength(1);
    expect(control.ptpRolls).toBe(1);
    expect(tellings()).toHaveLength(1);
  });
});
