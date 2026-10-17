/**
 * STARFORGED COMPANION
 * tests/unit/milestonePicker.test.js
 *
 * Reach a Milestone picker card (several open vows, none named). A click on a
 * player's client used to disable the buttons and silently do nothing (the vow
 * write is GM-gated). It now relays "milestone.pick" to the canonical GM,
 * where applyMilestonePick (src/moves/milestonePicker.js) marks the vow, posts
 * the result card and resolves the picker — idempotently.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { applyMilestonePick, postReachMilestoneCard } from '../../src/moves/milestonePicker.js';
import { wireMilestonePickerButtons } from '../../src/index.js';
import { GM_RELAY_SOCKET } from '../../src/multiplayer/gmRelay.js';

const MODULE_ID = 'starforged-companion';
const GM = { id: 'gm-1', isGM: true,  active: true };
const P1 = { id: 'pl-1', isGM: false, active: true };

function setUsers(users, currentUserId) {
  global.game.users = Object.assign([...users], {
    get: (id) => users.find(u => u.id === id) ?? null,
  });
  global.game.user = users.find(u => u.id === currentUserId) ?? null;
}

function makeVow(id, name, rank, current = 0) {
  const item = {
    id, name, type: 'progress',
    system: { subtype: 'vow', rank, current },
    flags: {},
    update: async (changes) => {
      if ('system.current' in changes) item.system.current = changes['system.current'];
    },
  };
  return item;
}

function makePickerMessage(id = 'msg-1', resolved = false) {
  const msg = {
    id,
    flags: { [MODULE_ID]: { milestonePicker: true, resolved } },
    update: vi.fn(async (changes) => {
      if (changes[`flags.${MODULE_ID}.resolved`]) msg.flags[MODULE_ID].resolved = true;
    }),
  };
  return msg;
}

// Minimal DOM double for the picker card's buttons (node test environment).
function makeRoot(buttonData) {
  const root = { buttons: [] };
  const makeBtn = (dataset) => {
    const btn = {
      dataset: { ...dataset }, disabled: false, listeners: {},
      cloneNode() { return makeBtn(this.dataset); },
      replaceWith(next) { root.buttons[root.buttons.indexOf(btn)] = next; },
      addEventListener(ev, fn) { this.listeners[ev] = fn; },
    };
    return btn;
  };
  root.buttons = buttonData.map(makeBtn);
  root.querySelectorAll = () => [...root.buttons];
  return root;
}
const click = (btn) => btn.listeners.click({ preventDefault() {}, stopPropagation() {} });

let pcA, pcB, vowB1, vowB2, picker;

beforeEach(() => {
  ChatMessage._reset();
  game.socket._reset();
  vowB1 = makeVow('v-b1', 'Find the Archive', 'formidable');   // 4 ticks
  vowB2 = makeVow('v-b2', 'Avenge Kade', 'dangerous');         // 8 ticks
  pcA = makeTestActor({ id: 'pc-a', name: 'Ash' });
  pcB = makeTestActor({ id: 'pc-b', name: 'Bex', items: { contents: [vowB1, vowB2] } });
  game.actors._setAll([pcA, pcB]);
  picker = makePickerMessage();
  game.messages = { get: (id) => (id === picker.id ? picker : null) };
});

describe('applyMilestonePick (canonical GM handler)', () => {
  beforeEach(() => setUsers([GM, P1], 'gm-1'));

  it('marks the picked vow on the card\'s actor, posts the result card, resolves the picker', async () => {
    const res = await applyMilestonePick({ messageId: 'msg-1', actorId: 'pc-b', vowId: 'v-b1' }, {});
    expect(res).toEqual({ marked: true, ticks: 4 });
    expect(vowB1.system.current).toBe(4);
    expect(vowB2.system.current).toBe(0);
    expect(ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.reachMilestoneCard)).toHaveLength(1);
    expect(picker.flags[MODULE_ID].resolved).toBe(true);
  });

  it('is idempotent — a second pick on a resolved card marks nothing', async () => {
    await applyMilestonePick({ messageId: 'msg-1', actorId: 'pc-b', vowId: 'v-b1' }, {});
    const again = await applyMilestonePick({ messageId: 'msg-1', actorId: 'pc-b', vowId: 'v-b2' }, {});
    expect(again).toEqual({ marked: false, reason: 'already-resolved' });
    expect(vowB2.system.current).toBe(0);
  });

  it('two near-simultaneous picks mark only once', async () => {
    const [a, b] = await Promise.all([
      applyMilestonePick({ messageId: 'msg-1', actorId: 'pc-b', vowId: 'v-b1' }, {}),
      applyMilestonePick({ messageId: 'msg-1', actorId: 'pc-b', vowId: 'v-b2' }, {}),
    ]);
    expect([a.marked, b.marked].filter(Boolean)).toHaveLength(1);
    // Exactly one vow advanced (formidable +4 or dangerous +8), never both.
    expect([vowB1.system.current, vowB2.system.current].filter(t => t > 0)).toHaveLength(1);
  });

  it('warns and resolves the card when the vow is gone', async () => {
    const warn = vi.spyOn(console, 'warn');
    const res = await applyMilestonePick({ messageId: 'msg-1', actorId: 'pc-b', vowId: 'v-missing' }, {});
    expect(res.marked).toBe(false);
    expect(warn.mock.calls.some(c => /not found on actor/.test(String(c[0])))).toBe(true);
    expect(picker.flags[MODULE_ID].resolved).toBe(true);
  });

  it('warns when the picker card no longer exists', async () => {
    const warn = vi.spyOn(console, 'warn');
    const res = await applyMilestonePick({ messageId: 'gone', actorId: 'pc-b', vowId: 'v-b1' }, {});
    expect(res).toEqual({ marked: false, reason: 'no-message' });
    expect(warn).toHaveBeenCalled();
    expect(vowB1.system.current).toBe(0);
  });
});

describe('postReachMilestoneCard', () => {
  it('posts the one shared result card', async () => {
    await postReachMilestoneCard({ name: 'Find <the> Archive', rank: 'formidable' }, 2);
    const card = ChatMessage._created[0];
    expect(card.flags[MODULE_ID].reachMilestoneCard).toBe(true);
    expect(card.content).toContain('Find &lt;the&gt; Archive');
    expect(card.content).toContain('+2 ticks (formidable rank)');
  });
});

describe('wireMilestonePickerButtons — clicks relay to the GM', () => {
  it('a player click relays milestone.pick with plain ids (no local write)', async () => {
    setUsers([GM, P1], 'pl-1');
    const root = makeRoot([{ actorId: 'pc-b', vowId: 'v-b1' }, { actorId: 'pc-b', vowId: 'v-b2' }]);
    wireMilestonePickerButtons(picker, root);
    await click(root.buttons[0]);

    expect(game.socket._emitted).toEqual([{
      event:   GM_RELAY_SOCKET,
      payload: {
        kind:        'gmRelay.milestone.pick',
        payload:     { messageId: 'msg-1', actorId: 'pc-b', vowId: 'v-b1' },
        requesterId: 'pl-1',
      },
    }]);
    expect(vowB1.system.current).toBe(0);
    expect(root.buttons.every(b => b.disabled)).toBe(true);
  });

  it('the canonical GM\'s click applies locally', async () => {
    setUsers([GM, P1], 'gm-1');
    const root = makeRoot([{ actorId: 'pc-b', vowId: 'v-b2' }]);
    wireMilestonePickerButtons(picker, root);
    await click(root.buttons[0]);
    expect(vowB2.system.current).toBe(8);
    expect(picker.flags[MODULE_ID].resolved).toBe(true);
  });

  it('re-arms the buttons when no GM is connected', async () => {
    setUsers([P1], 'pl-1');
    silenceConsoleErrors();
    const root = makeRoot([{ actorId: 'pc-b', vowId: 'v-b1' }]);
    wireMilestonePickerButtons(picker, root);
    await click(root.buttons[0]);
    expect(root.buttons[0].disabled).toBe(false);
  });

  it('a resolved card renders disabled', () => {
    const root = makeRoot([{ actorId: 'pc-b', vowId: 'v-b1' }]);
    wireMilestonePickerButtons(makePickerMessage('msg-2', true), root);
    expect(root.buttons[0].disabled).toBe(true);
  });
});
