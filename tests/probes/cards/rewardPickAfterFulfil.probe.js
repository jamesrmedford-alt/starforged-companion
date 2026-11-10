/* global silenceConsoleErrors */
/**
 * Twelfth audit — CARD area probe.
 *
 * CARD-6 REWARD-PROMISED-ON-FINISHED-VOW (LOSE-STATE / UX)
 *
 * A sworn vow's "🎁 Choose your reward" card (swearVow.js postRewardChoiceCard
 * ~311, the inciting swear's and a sheet vow's alike) stays pickable until
 * someone picks. Kira's vow is fulfilled before anyone does: the fulfilment
 * posts "ℹ No concrete reward was chosen when this vow was sworn … none is
 * granted with its fulfilment" (index.js grantLinkedVowReward ~4930,
 * `noteIfAbsent`). Her player then picks a reward on the old card.
 *
 * applyRewardPickFromRelay (swearVow.js ~576) refuses a vow whose reward is
 * already "granted" or "lost" (issue #325 W11) — it never checks whether the
 * vow is still open. A fulfilled (or forsaken) vow carries no reward status,
 * so the pick is accepted: the reward is written "promised" on the completed
 * vow and the card posts "🎁 Reward set: …". Nothing will ever grant it — a
 * vow pays out at its fulfilment (once, `fulfilPaid`) or a linked fight's win
 * (the ladders skip a completed vow) — and the table has been told it is set
 * (issue #329 X07's rule: "the vow must hold the reward before the card says
 * so" — here it holds a reward that can never land).
 *
 * Driven on a booted table: the real fulfilment through the pipeline, the
 * real reward card's button.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [], interpretation: null }));
vi.mock('../../../src/pacing/router.js', async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: 'chat' })),
}));
vi.mock('../../../src/moves/abilityScanner.js', async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../../src/moves/resolver.js', async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, 'random');
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';
import { buildRewardChoiceHtml } from '../../../src/moves/rewards.js';

let table, kirasVow;

function vowItem(id, name, current) {
  const item = {
    id, type: 'progress', name, flags: { [MODULE_ID]: { vowId: id } },
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

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

const OPTIONS = [{ description: 'A berth on the Kestrel', form: 'gear' }, { description: 'A favour owed', form: 'contact' }];

async function setUp() {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'rp-s1', sessionNumber: 1,
      currentSceneId: 'rp-scene', sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  kirasVow = vowItem('v-kira', 'Find Chen', 40);
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [kirasVow] } });
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

/** Kira's Fulfill Your Vow on a full track against 1 and 2: a strong hit. */
async function kiraFulfils() {
  control.interpretation = { moveId: 'fulfill_your_vow', moveName: 'Fulfill Your Vow', statUsed: null, adds: 0,
    isProgressMove: true, moveTarget: 'Find Chen', rationale: 'test', mischiefApplied: false };
  control.dice = [0.0, 0.15];
  await table.client('pl-1').chat('Kira brings Chen home at last.', { speaker: { actor: 'pc-kira' } });
  await table.settle(); await table.drain();
}

async function pickFirstReward(cardId) {
  table.client('pl-1').click(cardId, '[data-action="sf-reward-pick"][data-idx="0"]');
  await table.settle(); await table.drain();
}

describe('CARD-6 — a reward picked on a vow that is already fulfilled', () => {
  it('control: picked while the vow is open, the reward is promised and the card says so', async () => {
    const cardId = await setUp();
    await pickFirstReward(cardId);
    expect(kirasVow.flags[MODULE_ID].reward?.status).toBe('promised');
    expect(table.cards(f => f.rewardSetCard)).toHaveLength(1);
  }, 30_000);

  it('picked after the fulfilment, it is not "set" — a reward nothing will ever grant', async () => {
    const cardId = await setUp();
    await kiraFulfils();
    expect(kirasVow.system.completed, 'Kira fulfilled her vow (setup)').toBe(true);
    expect(table.cards(f => f.rewardAbsentNote), 'the fulfilment said no reward was chosen (setup)').toHaveLength(1);
    await pickFirstReward(cardId);
    expect({
      setCards: table.cards(f => f.rewardSetCard).length,
      status:   kirasVow.flags[MODULE_ID].reward?.status ?? null,
    }).toEqual({ setCards: 0, status: null });
  }, 30_000);
});
