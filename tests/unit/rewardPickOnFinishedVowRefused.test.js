/* global silenceConsoleErrors */
/**
 * Issue #345 AA52 REWARD-PROMISED-ON-FINISHED-VOW.
 *
 * A sworn vow's "🎁 Choose your reward" card (swearVow.js postRewardChoiceCard)
 * stays pickable until someone picks. Kira's vow is fulfilled before anyone
 * does: the fulfilment posts "ℹ No concrete reward was chosen when this vow
 * was sworn … none is granted with its fulfilment". Her player then picks a
 * reward on the old card.
 *
 * applyRewardPickFromRelay refused only a vow whose reward was already
 * "granted" or "lost" (issue #325 W11) — never one already closed. A
 * fulfilled (or forsaken) vow with no reward chosen carries no status, so the
 * pick was accepted: "promised" on the completed vow, "🎁 Reward set" posted —
 * a reward nothing will ever grant (a vow pays out once, at its fulfilment or
 * a linked fight's win, and the ladders skip a completed vow). Now a vow
 * closed on every copy refuses the pick: nothing is promised, the card is
 * closed, and the presser (and the GMs) are told why.
 *
 * Driven on a booted table: the real fulfilment / forsake through the
 * pipeline, the real reward card's button.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

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
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { buildRewardChoiceHtml } from '../../src/moves/rewards.js';

let table, kirasVow, rensCopy;

function vowItem(id, name, current, vowId = id) {
  const item = {
    id, type: 'progress', name, flags: { [MODULE_ID]: { vowId } },
    system: { subtype: 'vow', rank: 'dangerous', current, completed: false },
    async update(changes) {
      for (const [k, v] of Object.entries(changes)) {
        const parts = k.split('.'); let t = item;
        for (const p of parts.slice(0, -1)) t = (t[p] ??= {});
        t[parts.at(-1)] = v;
      }
      return item;
    },
    async setFlag(scope, key, value) { (item.flags[scope] ??= {})[key] = value; return item; },
  };
  return item;
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());

const OPTIONS = [{ description: 'A berth on the Kestrel', form: 'gear' }, { description: 'A favour owed', form: 'contact' }];

async function setUp({ rensCopyToo = false } = {}) {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'rp-s1', sessionNumber: 1,
      currentSceneId: 'rp-scene', sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  kirasVow = vowItem('v-kira', 'Find Chen', 40);
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [kirasVow] } });
  if (rensCopyToo) {
    // Ren's copy of the same (shared) vow, by its vowId.
    rensCopy = vowItem('v-ren-copy', 'Find Chen', 40, 'v-kira');
    table.addActor({ id: 'pc-ren', name: 'Ren', ownership: { 'pl-2': 3 }, items: { contents: [rensCopy] } });
  }
  scriptClaude(table, { fallback: () => 'Chen is home.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  silenceConsoleErrors();
  // The vow's reward card, as postRewardChoiceCard posts it when the vow is sworn.
  const card = await table.client('gm-1').run(() => ChatMessage.create({
    content: buildRewardChoiceHtml(OPTIONS),
    flags: { [MODULE_ID]: { rewardChoiceCard: true, vowId: 'v-kira', rewardOptions: OPTIONS } },
  }));
  await table.settle();
  return card.id;
}

async function kiraPlays(moveId, moveName, line, dice) {
  control.interpretation = { moveId, moveName, statUsed: null, adds: 0,
    isProgressMove: moveId === 'fulfill_your_vow', moveTarget: 'Find Chen', rationale: 'test', mischiefApplied: false };
  control.dice = dice;
  await table.client('pl-1').chat(line, { speaker: { actor: 'pc-kira' } });
  await table.settle(); await table.drain();
}

/** Kira's Fulfill Your Vow on a full track against 1 and 2: a strong hit. */
const kiraFulfils = () => kiraPlays('fulfill_your_vow', 'Fulfill Your Vow', 'Kira brings Chen home at last.', [0.0, 0.15]);
const kiraForsakes = () => kiraPlays('forsake_your_vow', 'Forsake Your Vow', 'Kira lets Chen go.', []);

async function pickFirstReward(cardId) {
  table.client('pl-1').click(cardId, '[data-action="sf-reward-pick"][data-idx="0"]');
  await table.settle(); await table.drain();
}

const rewardStatus = (item) => item.flags[MODULE_ID].reward?.status ?? null;
const notices = () => table.cards(f => f.vowWriteRefusedNotice);
const cardFlags = (cardId) => table.world.messages().find(m => m._id === cardId)?.flags?.[MODULE_ID] ?? {};

describe('issue #345 AA52 — a reward picked on a vow that is already fulfilled or forsaken', () => {
  it('control: picked while the vow is open, the reward is promised and the card says so', async () => {
    const cardId = await setUp();
    await pickFirstReward(cardId);
    expect(rewardStatus(kirasVow)).toBe('promised');
    expect(table.cards(f => f.rewardSetCard)).toHaveLength(1);
    expect(notices()).toHaveLength(0);
  }, 30_000);

  it('picked after the fulfilment, it is not "set" — the card is closed and the presser told why', async () => {
    const cardId = await setUp();
    await kiraFulfils();
    expect(kirasVow.system.completed, 'Kira fulfilled her vow (setup)').toBe(true);
    expect(table.cards(f => f.rewardAbsentNote), 'the fulfilment said no reward was chosen (setup)').toHaveLength(1);
    await pickFirstReward(cardId);
    expect({
      setCards: table.cards(f => f.rewardSetCard).length,
      status:   rewardStatus(kirasVow),
    }).toEqual({ setCards: 0, status: null });
    expect(cardFlags(cardId).rewardChosen, 'the card is closed').toBe('vow-fulfilled');
    expect(notices()).toHaveLength(1);
    expect(String(notices()[0].content)).toContain('This vow is already fulfilled');
    expect(notices()[0].whisper, 'whispered to the presser and the GM').toEqual(expect.arrayContaining(['pl-1', 'gm-1']));
  }, 30_000);

  it('picked after a forsake, it is not "set" either — the presser told the vow was forsaken', async () => {
    const cardId = await setUp();
    await kiraForsakes();
    expect({ completed: kirasVow.system.completed, forsaken: kirasVow.flags[MODULE_ID].forsaken === true }, 'forsaken (setup)')
      .toEqual({ completed: true, forsaken: true });
    await pickFirstReward(cardId);
    expect({ setCards: table.cards(f => f.rewardSetCard).length, status: rewardStatus(kirasVow) })
      .toEqual({ setCards: 0, status: null });
    expect(cardFlags(cardId).rewardChosen).toBe('vow-forsaken');
    expect(String(notices()[0]?.content ?? '')).toContain('This vow was forsaken');
  }, 30_000);

  it('control: a shared vow fulfilled on one sheet while another copy is open still takes the pick', async () => {
    const cardId = await setUp({ rensCopyToo: true });
    kirasVow.system.completed = true;   // Kira's copy closed by hand on her sheet; Ren's stays open
    await pickFirstReward(cardId);
    expect(rewardStatus(rensCopy)).toBe('promised');
    expect(table.cards(f => f.rewardSetCard)).toHaveLength(1);
  }, 30_000);
});
