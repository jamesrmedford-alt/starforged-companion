/**
 * A forced move a claimed card button posts while another move holds the
 * move lock is held and rolled when the lock frees (issue #325 W02).
 *
 * "⚑ Mark Progress on Vow" (milestone.suggestion), a "Which vow?" pick
 * (fulfilVow.pick), a connection pick (connection.pick) and a waypoint
 * match's 🔭 / 🌀 (waypoint.oracle) each claim their GM-authored card, then
 * post a forced move. The pipeline dropped that message at the lock ("A move
 * is already being resolved") and nothing re-posted it: the claim stood, the
 * button read taken everywhere, and the milestone, fulfil roll, development
 * or discovery was lost. The commonest case was the button's OWN move: its
 * card is posted before the narration's Claude call and the lock released
 * after the persist, so the buttons are live for the whole narration.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

// gather_information strong hit: challenge dice 1 and 2, action die 6 (+wits 2).
const control = vi.hoisted(() => ({ dice: [0.0, 0.15, 0.99] }));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../src/moves/resolver.js', async (importOriginal) => {
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

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

let table, claude, vow;

function makeVow() {
  const item = {
    id: 'vow-1', type: 'progress', name: 'Find Chen', flags: { [MODULE_ID]: { vowId: 'vid-chen' } },
    system: { subtype: 'vow', rank: 'dangerous', current: 0, completed: false },
    async update(changes) { for (const [k, v] of Object.entries(changes)) if (k === 'system.current') item.system.current = v; return item; },
    async setFlag(scope, key, value) { (item.flags[scope] ??= {})[key] = value; return item; },
  };
  return item;
}

const isNarration = (call) => /SIDECAR|NARRATOR ROLE/.test(call?.system ?? '');

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.dice = [0.0, 0.15, 0.99];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [] },
  } } });
  vow = makeVow();
  table.addActor({ id: 'pc-1', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [vow] } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  claude = scriptClaude(table);
  silenceConsoleErrors();
});

describe('a claimed card\'s forced move meets the move lock', () => {
  it('"⚑ Mark Progress on Vow" pressed while its own move is still being narrated marks the vow', async () => {
    const held = claude.hold(isNarration);
    // The player's Gather Information (forced, as the card buttons post it).
    table.client('pl-1').chat('I comb the archive for word of Chen.', {
      speaker: { actor: 'pc-1', alias: 'Kira' },
      flags: { [MODULE_ID]: { bypassPacing: true, forcedMoveId: 'gather_information' } },
    });
    await held.arrived;            // the move card is posted; its narration is in flight
    await table.settle();
    const [card] = table.cards(f => f.moveResolution && f.milestoneSuggestion?.eligible);
    expect(card, 'the strong hit posted a move card with the milestone suggestion').toBeTruthy();

    table.client('pl-1').click(card._id, '[data-action="sf-reach-milestone"]');
    await table.settle();

    held.release();                // the narration lands; the move persists and releases its lock
    await table.settle(); await table.drain();

    // The forced Reach a Milestone met the move lock: held, the GM told.
    const busy = table.client('gm-1').notifications.filter(n => /already being resolved/.test(n.message));
    expect(table.cards(f => f.forcedMoveId === 'reach_a_milestone')).toHaveLength(1);
    expect(busy.length, 'the GM was told a move is already being resolved').toBeGreaterThan(0);

    // One Dangerous milestone — 8 ticks — marked once the move released the lock.
    const claimed = table.world.message(card._id).flags[MODULE_ID].milestoneMarked === true;
    expect({ ticks: vow.system.current, claimed }).toEqual({ ticks: 8, claimed: true });
    expect(table.cards(f => f.moveResolution), 'the move\'s card and the milestone\'s').toHaveLength(2);
  }, 30_000);

  it('control: the same press after the narration has landed marks 8 ticks', async () => {
    table.client('pl-1').chat('I comb the archive for word of Chen.', {
      speaker: { actor: 'pc-1', alias: 'Kira' },
      flags: { [MODULE_ID]: { bypassPacing: true, forcedMoveId: 'gather_information' } },
    });
    await table.settle(); await table.drain();
    const [card] = table.cards(f => f.moveResolution && f.milestoneSuggestion?.eligible);
    table.client('pl-1').click(card._id, '[data-action="sf-reach-milestone"]');
    await table.settle(); await table.drain();
    expect(vow.system.current).toBe(8);
  }, 30_000);

  it('a "Which vow?" pick made while another player\'s move holds the lock still rolls the fulfil', async () => {
    // Another move is being resolved (its pipeline holds the lock).
    await table.reset({ world: { settings: {
      chronicleAutoEntry: false,
      campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [], pendingMove: true },
    } } });
    table.addActor({ id: 'pc-1', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [makeVow()] } });
    await table.setClaudeKey('gm-1', 'sk-ant-gina');
    scriptClaude(table);
    const gm = table.client('gm-1');
    const msg = await gm.run(() => globalThis.ChatMessage.create({
      content: `<div class="sf-ptp-card"><button type="button" data-action="sf-which-vow" data-item-id="vow-1">🏁 Find Chen</button>`
        + `<button type="button" data-action="sf-which-vow" data-item-id="vow-2">🏁 Repay the Syndicate</button></div>`,
      flags: { [MODULE_ID]: { whichVowCard: true, actorId: 'pc-1', narration: 'I end this.', resolved: false,
        choices: [{ itemId: 'vow-1', name: 'Find Chen' }, { itemId: 'vow-2', name: 'Repay the Syndicate' }] } },
    }));
    await table.settle();

    table.client('pl-1').click(msg.id, '[data-action="sf-which-vow"]');
    await table.settle(); await table.drain();
    // The other move finishes and releases its lock.
    await gm.run(async () => {
      const cs = { ...globalThis.game.settings.get(MODULE_ID, 'campaignState'), pendingMove: false };
      await globalThis.game.settings.set(MODULE_ID, 'campaignState', cs);
    });
    await table.settle(); await table.drain();

    // The pick's forced fulfil is rolled once the lock is free.
    const resolved = table.world.message(msg.id).flags[MODULE_ID].resolved === true;
    const rolled = table.cards(f => f.moveResolution).length;
    expect({ resolved, rolled }).toEqual({ resolved: true, rolled: 1 });
  }, 30_000);

  it('control: a typed line that meets the lock is still dropped, not held', async () => {
    await table.reset({ world: { settings: {
      chronicleAutoEntry: false,
      campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [], pendingMove: true },
    } } });
    table.addActor({ id: 'pc-1', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [makeVow()] } });
    await table.setClaudeKey('gm-1', 'sk-ant-gina');
    scriptClaude(table);
    table.client('pl-1').chat('I comb the archive for word of Chen.', {
      speaker: { actor: 'pc-1', alias: 'Kira' },
      flags: { [MODULE_ID]: { bypassPacing: true, forcedMoveId: 'gather_information' } },
    });
    await table.settle(); await table.drain();
    const gm = table.client('gm-1');
    await gm.run(async () => {
      const cs = { ...globalThis.game.settings.get(MODULE_ID, 'campaignState'), pendingMove: false };
      await globalThis.game.settings.set(MODULE_ID, 'campaignState', cs);
    });
    await table.settle(); await table.drain();
    expect(table.cards(f => f.moveResolution)).toHaveLength(0);
  }, 30_000);
});
