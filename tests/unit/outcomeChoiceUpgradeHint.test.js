/**
 * STARFORGED COMPANION
 * tests/unit/outcomeChoiceUpgradeHint.test.js
 *
 * OUTCOME-CHOICE-CARD-NO-UPGRADE-HINT (issue #345 AA47's residual). Only a
 * price's cards posted before the move card (issue #336 Y18) said "burn or
 * improve first"; an outcome's own choice card — a weak hit's "make a suffer
 * move" — did not, though a pick on it is the move's consequence and closes
 * its Burn Momentum / Improve Result. And the hint was static: it stayed once
 * the upgrade closed another way. The outcome's choice card now says it while
 * the move still offers an upgrade, and the hint comes off once the roller's
 * later move closes it.
 *
 * The booted table: a GM and a player; Face Danger scripted; the dice
 * scripted — a weak hit a burn of Kira's momentum makes a strong hit.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: null }));
vi.mock('../../src/pacing/router.js', async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({
    moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'iron', adds: 0, rationale: 'test',
    mischiefApplied: false, playerNarration: text, inputMethod: 'chat',
  })),
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
    if (!control.dice) return real.resolveMove(...args);
    const rng = vi.spyOn(Math, 'random');
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const WEAK_HIT   = [0.05, 0.75, 0.35];   // challenge 1, 8; action 4 + iron 3 = 7 — a burn of 9 makes it strong
const STRONG_HIT = [0.05, 0.15, 0.95];   // challenge 1, 2; action 10 + 3

let table;
const HINT = /Burn momentum or improve the result first — choosing here is the move&#39;s consequence|Burn momentum or improve the result first — choosing here is the move's consequence/;
const choiceCards = () => table.cards(f => f.sufferCard && f.sufferPrompt);
const moveCard = () => table.cards(f => f.moveResolution).at(-1);

async function kiraFacesDanger(dice, text = 'Kira braces against the venting hull.') {
  control.dice = dice;
  await table.client('pl-1').chat(text, { speaker: { actor: 'pc-kira' } });
  await table.settle(); await table.drain();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'ocu-s1', sessionNumber: 1,
      currentSceneId: 'ocu-scene', sceneTruths: [], clocks: [], legacyTracks: {} },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, system: { momentum: { value: 9 }, iron: 3 } });
  scriptClaude(table, { fallback: () => 'The hull holds — for now.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
});

describe('OUTCOME-CHOICE-CARD-NO-UPGRADE-HINT', () => {
  it("a weak hit whose card offers a burn: its own choice card says to burn or improve first", async () => {
    await kiraFacesDanger(WEAK_HIT);
    expect(moveCard().flags[MODULE_ID].burn?.canBurn).toBe(true);
    const [card] = choiceCards();
    expect(card.content).toMatch(HINT);
    expect(card.flags[MODULE_ID].sufferPrompt.hint).toBeTruthy();
  }, 30_000);

  it("the roller's later move closes the burn — the hint comes off the open choice card", async () => {
    await kiraFacesDanger(WEAK_HIT);
    const [card] = choiceCards();
    expect(card.content).toMatch(HINT);
    await kiraFacesDanger(STRONG_HIT, 'Kira slams the hatch shut.');
    const now = table.cards(f => f.sufferCard).find(m => m._id === card._id);
    expect(now.flags[MODULE_ID].resolved).toBe(false);
    expect(now.content).not.toMatch(HINT);
    expect(now.flags[MODULE_ID].sufferPrompt.hint ?? null).toBeNull();
  }, 30_000);

  it('control: a weak hit no burn can improve says nothing of one', async () => {
    table.actors.get('pc-kira').system.momentum.value = 2;
    await kiraFacesDanger(WEAK_HIT);
    expect(moveCard().flags[MODULE_ID].burn?.canBurn ?? false).toBe(false);
    const [card] = choiceCards();
    expect(card.content).not.toMatch(HINT);
  }, 30_000);
});
