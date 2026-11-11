/* global makeTestActor */
/**
 * STARFORGED COMPANION
 * tests/unit/milestonePickCompletedVow.test.js
 *
 * Issue #331 X20 (MILESTONE-PICK-COMPLETED-VOW). A "⚑ Reach a Milestone —
 * which vow advances?" picker answered after one of its vows was fulfilled
 * (a sheet roll, a crewmate's fulfilment) marked the fulfilled vow:
 * applyMilestonePick read it with completed vows included and markVowProgress
 * had no completed guard, so its track moved, "marked progress" was posted
 * and the picker was spent. As the "Which vow?" pick and planReachMilestone
 * do, a fulfilled vow is now refused — the presser told, the picker left open
 * for its other vows — and markVowProgress itself never marks one.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { applyMilestonePick } from '../../src/moves/milestonePicker.js';
import { markVowProgress } from '../../src/character/actorBridge.js';

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

describe('X20 — a milestone pick on a vow fulfilled since the picker posted', () => {
  it('marks nothing on the fulfilled vow', async () => {
    const res = await applyMilestonePick({ messageId: 'picker-1', actorId: 'pc-b', vowId: 'v-done' }, GM_CTX);

    // It was marked — 8 → 16 ticks on a completed vow, and the "marked progress" card posted.
    expect(done.system.current).toBe(8);
    expect(res).toEqual({ marked: false, reason: 'vow-completed' });
    expect(ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.reachMilestoneCard)).toHaveLength(0);
    // The presser is told, and the picker stays open for the vow still open.
    const told = ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.milestoneVowFulfilledCard);
    expect(told).toHaveLength(1);
    expect(told[0].content).toContain('<strong>Find the archive</strong> is already fulfilled — no milestone was marked');
    expect(picker.flags[MODULE_ID].resolved).toBe(false);

    const next = await applyMilestonePick({ messageId: 'picker-1', actorId: 'pc-b', vowId: 'v-open' }, GM_CTX);
    expect(next).toMatchObject({ marked: true, ticks: 8 });
    expect(open.system.current).toBe(16);
    expect(picker.flags[MODULE_ID].resolved).toBe(true);
  });

  // Issue #345 AA51: a vow forsaken since (Forsake Your Vow marks it
  // completed + `forsaken`) is refused the same way, and the card says it was
  // forsaken — it called the forsaken vow fulfilled.
  it('a vow forsaken since is refused, and the card says it was forsaken — not fulfilled', async () => {
    done.flags[MODULE_ID].forsaken = true;
    const res = await applyMilestonePick({ messageId: 'picker-1', actorId: 'pc-b', vowId: 'v-done' }, GM_CTX);
    expect(res).toEqual({ marked: false, reason: 'vow-completed' });
    const told = ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.milestoneVowFulfilledCard);
    expect(told).toHaveLength(1);
    expect(told[0].content).not.toContain('already fulfilled');
    expect(told[0].content).toContain('<strong>Find the archive</strong> was forsaken — no milestone was marked');
    expect(picker.flags[MODULE_ID].resolved).toBe(false);
  });

  it('a picker whose every vow is fulfilled is resolved with nothing marked', async () => {
    open.system.completed = true;
    const res = await applyMilestonePick({ messageId: 'picker-1', actorId: 'pc-b', vowId: 'v-done' }, GM_CTX);
    expect(res.reason).toBe('vow-completed');
    expect(done.system.current).toBe(8);
    expect(open.system.current).toBe(8);
    expect(picker.flags[MODULE_ID].resolved).toBe(true);
  });

  it('markVowProgress never marks a fulfilled vow', async () => {
    const pc = game.actors.get('pc-b');
    await markVowProgress(pc, 'v-done', 8);
    expect(done.system.current).toBe(8);
    expect(done.update).not.toHaveBeenCalled();
    await markVowProgress(pc, 'v-open', 8);
    expect(open.system.current).toBe(16);
  });

  it('control: a pick on an open vow marks it by its rank', async () => {
    const res = await applyMilestonePick({ messageId: 'picker-1', actorId: 'pc-b', vowId: 'v-open' }, GM_CTX);
    expect(res).toMatchObject({ marked: true, ticks: 8 });
    expect(open.system.current).toBe(16);
    expect(picker.flags[MODULE_ID].resolved).toBe(true);
  });
});
