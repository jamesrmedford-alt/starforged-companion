/* global makeTestActor */
/**
 * PROBE — CARDS-05 MILESTONE-PICK-COMPLETED-VOW (ninth audit, area cards)
 *
 * What the user does: a Reach a Milestone (or a won fight's milestone) with
 * several vows open posts the "⚑ Reach a Milestone — which vow advances?"
 * picker. Before anyone picks, one of the listed vows is fulfilled (a sheet
 * roll, a crewmate's Fulfill Your Vow, the fight's own 🏁). Then the picker
 * is answered with that vow.
 *
 * What happens: applyMilestonePick (src/moves/milestonePicker.js:85-120)
 * checks the pick against the card's choices and the requester's ownership,
 * then reads the vow with `readVows(actor).find(v => v.id === vowId)` —
 * completed vows included — and marks it (markVowProgress, which has no
 * completed guard either: src/character/actorBridge.js:569-588). A fulfilled
 * vow's track moves on the sheet (and, shared, on every crewmate's copy
 * through the sync hook), the "⚑ Reach a Milestone — marked progress" card
 * posts, and the picker is resolved — the milestone the player meant for
 * their quest is spent on a finished one.
 *
 * What should happen: a pick on a vow completed meanwhile marks nothing, as
 * the sibling "Which vow?" pick (a copy fulfilled before the roll resolves
 * gets the "not rolled" card, issue #321 U02) and the direct
 * planReachMilestone (open vows only) already do. The picker should say so
 * and stay open for the other vows (or be resolved with nothing marked —
 * either way no ticks on a fulfilled vow).
 *
 * Control: a pick on an open listed vow marks it by its rank.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/cards/milestonePickCompletedVow.probe.js
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { applyMilestonePick } from '../../../src/moves/milestonePicker.js';

const MODULE_ID = 'starforged-companion';
const GM = { id: 'gm-1', isGM: true, active: true };
const GM_CTX = { requesterId: 'gm-1', requester: GM, requesterIsGM: true };

function makeVow(id, name, { completed = false } = {}) {
  const item = {
    id, name, type: 'progress',
    system: { subtype: 'vow', rank: 'dangerous', current: 8, completed },
    flags: { [MODULE_ID]: { vowId: id } },
    update: vi.fn(async (changes) => {
      if ('system.current' in changes) item.system.current = changes['system.current'];
    }),
  };
  return item;
}

function makePicker(choices) {
  const msg = {
    id: 'picker-1',
    flags: { [MODULE_ID]: { milestonePicker: true, resolved: false, choices } },
    update: vi.fn(async (changes) => {
      for (const [path, val] of Object.entries(changes)) msg.flags[MODULE_ID][path.split('.').at(-1)] = val;
    }),
  };
  return msg;
}

let done, open, picker;

beforeEach(() => {
  ChatMessage._reset();
  game.user = GM;
  game.users = Object.assign([GM], { get: (id) => (id === 'gm-1' ? GM : null) });
  done = makeVow('v-done', 'Find the archive', { completed: true });   // fulfilled after the picker posted
  open = makeVow('v-open', 'Break the Covenant');
  const pc = makeTestActor({ id: 'pc-b', name: 'Bex', items: { contents: [done, open] } });
  game.actors._setAll([pc]);
  picker = makePicker([{ vowId: 'v-done', actorId: 'pc-b', marks: 1 }, { vowId: 'v-open', actorId: 'pc-b', marks: 1 }]);
  game.messages = { get: (id) => (id === picker.id ? picker : null) };
});

describe('CARDS-05 a milestone pick on a vow fulfilled since the picker posted', () => {
  it('marks nothing on the fulfilled vow', async () => {
    const res = await applyMilestonePick({ messageId: 'picker-1', actorId: 'pc-b', vowId: 'v-done' }, GM_CTX);

    // Today: marked — 8 → 16 ticks on a completed vow, and the "marked progress" card posts.
    expect.soft(done.system.current).toBe(8);
    expect.soft(res.marked).toBe(false);
    expect.soft(ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.reachMilestoneCard)).toHaveLength(0);
  });

  it('control: a pick on an open vow marks it by its rank', async () => {
    const res = await applyMilestonePick({ messageId: 'picker-1', actorId: 'pc-b', vowId: 'v-open' }, GM_CTX);
    expect(res).toMatchObject({ marked: true, ticks: 8 });
    expect(open.system.current).toBe(16);
    expect(picker.flags[MODULE_ID].resolved).toBe(true);
  });
});
