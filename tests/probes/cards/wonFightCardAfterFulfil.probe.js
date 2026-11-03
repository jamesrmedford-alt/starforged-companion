/**
 * PROBE — IC WON-FIGHT-BUTTONS-AFTER-FULFIL
 *
 * What the user does: wins a fight that served "Rescue Vex"; the victory card
 * (postFightVowMilestoneCard) offers "⚑ Mark milestone (×N)" and "🏁 Attempt
 * to Fulfill". The vow is fulfilled first — through the card's own 🏁, typed
 * narration, the move card's 🏁 or the sheet — and later someone presses one
 * of the victory card's buttons (the 🏁 is never retired: wireFightVowButtons
 * re-arms it on every render, and every other client's copy is live).
 *
 * What happens:
 *   - "⚑ Mark milestone": markLinkedVowMilestone → applyReachMilestone(holder,
 *     "Rescue Vex", N) → planReachMilestone → selectMilestoneVow over the OPEN
 *     vows only: the completed name matches nothing, and the sole-open rung
 *     returns the PC's OTHER vow — the background vow takes N milestones, and
 *     the card is stamped applied (`ok: true`).
 *   - "🏁 Attempt to Fulfill": the forced fulfill_your_vow names "Rescue Vex";
 *     selectFulfilVow (src/moves/milestone.js ~113) matches only open vows, so
 *     the name falls through to "one vow per vowId — the roller's own" and
 *     scores, completes and pays the PC's background vow.
 *   decisions.md ("Vow payoffs resolve vowId-first", 2026-10 refinement) says
 *   the sole-open rung "never fires when the name matches a vow that is
 *   already completed" — resolveVowItemCopies honours it; these two ladders
 *   do not.
 *
 * What should happen: a name that matches a completed vow resolves nothing —
 * no milestone, nothing rolled ("no open vow by that name") — and the other
 * vow is untouched.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

// Challenge dice 3 and 4: a progress score of 6 (24 ticks) is a strong hit.
const control = vi.hoisted(() => ({ dice: [0.25, 0.35] }));
vi.mock('../../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../../src/moves/resolver.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random');
      for (const d of control.dice) dice.mockReturnValueOnce(d);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const REPLY = 'The dust settles.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
let table, rescue, background;

function vowItem(id, name, { ticks = 0, completed = false, rank = 'dangerous' } = {}) {
  const item = {
    id, name, type: 'progress',
    system: { subtype: 'vow', rank, current: ticks, completed },
    flags: { [MODULE_ID]: { vowId: `vid-${id}` } },
    update: async (changes) => {
      if ('system.completed' in changes) item.system.completed = changes['system.completed'];
      if ('system.current' in changes) item.system.current = changes['system.current'];
    },
    setFlag: async (mod, key, val) => { (item.flags[mod] ??= {})[key] = val; },
  };
  return item;
}

async function postVictoryCard() {
  const msg = await table.client('gm-1').run(() => globalThis.ChatMessage.create({
    content: `<div class="sf-card sf-fight-vow"><div class="sf-card-body"><p>You won the fight serving “Rescue Vex”.</p>`
      + `<p><button type="button" class="entity-btn" data-action="sf-mark-milestone">⚑ Mark milestone (×2)</button> `
      + `<button type="button" class="entity-btn" data-action="sf-fulfill-vow">🏁 Attempt to Fulfill</button></p></div></div>`,
    flags: { [MODULE_ID]: { fightVowCard: true, vowName: 'Rescue Vex', marks: 2, connectionName: null, vowRank: 2, actorId: 'pc-kira' } },
  }));
  await table.settle();
  return msg.id;
}

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.dice = [0.25, 0.35];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 2, currentSceneId: 'sc-1', sceneTruths: [] },
  } } });
  // "Rescue Vex" has been fulfilled; the background vow is still open.
  rescue     = vowItem('v-vex', 'Rescue Vex', { ticks: 40, completed: true });
  background = vowItem('v-bg', 'Find my sister', { ticks: 24 });
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [rescue, background] } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  scriptClaude(table, { fallback: () => REPLY });
  silenceConsoleErrors();
});

describe('PROBE IC WON-FIGHT-BUTTONS-AFTER-FULFIL', () => {
  it('"⚑ Mark milestone" on the fulfilled vow\'s victory card marks no other vow', async () => {
    const id = await postVictoryCard();

    table.client('pl-1').click(id, '[data-action="sf-mark-milestone"]');
    await table.settle(); await table.drain();

    // Expected: the background vow keeps its 24 ticks. Today it takes 2 milestones (+16).
    expect(background.system.current).toBe(24);
  }, 30_000);

  it('"🏁 Attempt to Fulfill" on the fulfilled vow\'s victory card neither rolls nor fulfils another vow', async () => {
    const id = await postVictoryCard();

    table.client('pl-1').click(id, '[data-action="sf-fulfill-vow"]');
    await table.settle(); await table.drain();

    // Expected: the background vow stays open. Today it is scored (24 ticks),
    // hit, completed and paid.
    expect(background.system.completed).toBe(false);
  }, 30_000);

  it('control: with "Rescue Vex" still open, the same two presses mark and fulfil "Rescue Vex" only', async () => {
    rescue.system.completed = false;
    rescue.system.current = 24;
    const id = await postVictoryCard();

    table.client('pl-1').click(id, '[data-action="sf-mark-milestone"]');
    await table.settle(); await table.drain();
    expect(rescue.system.current).toBe(40);          // +2 Dangerous milestones
    expect(background.system.current).toBe(24);

    table.client('pl-1').click(id, '[data-action="sf-fulfill-vow"]');
    await table.settle(); await table.drain();
    expect(rescue.system.completed).toBe(true);
    expect(background.system.completed).toBe(false);
  }, 30_000);

  it('the victory card\'s 🏁 is live again after any re-render, on every client', async () => {
    // Before the fix both copies were live; the button is meant to be used once.
    rescue.system.completed = false;
    const id = await postVictoryCard();
    const btn = table.client('pl-1').click(id, '[data-action="sf-fulfill-vow"]');
    await table.settle(); await table.drain();
    expect(btn.disabled).toBe(true);                       // the clicker's own button
    const again = table.client('pl-1').render(id);         // a re-render (any update to the card)
    expect(again.querySelector('[data-action="sf-fulfill-vow"]').disabled).toBe(true);
  }, 30_000);
});
