/**
 * STARFORGED COMPANION
 * tests/unit/cardButtonWiring.test.js
 *
 * src/index.js follow-ups to the 2026-10 audit review:
 *   - wireConnectionPickerButtons / wireFightVowButtons relay through gmRelay
 *     ("connection.pick", "fightVow.*") so the card fires once, credits the
 *     clicker's PC, renders already-applied actions disabled, and re-arms a
 *     click that was not delivered;
 *   - payFulfilledVowNative grants a shared vow's reward to the ROLLER's copy
 *     even after the pipeline already completed every copy;
 *   - resolveVowItemCopies no longer falls back to a DIFFERENT sole open vow
 *     when the name names a vow that is already completed;
 *   - momentumRecalcRunsHere — exactly one client re-derives momentum bounds
 *     after another user edits a PC's debilities (incl. a GM's sheet edit).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  wireConnectionPickerButtons,
  wireFightVowButtons,
  payFulfilledVowNative,
  resolveVowItemCopies,
  momentumRecalcRunsHere,
} from '../../src/index.js';
import { GM_RELAY_SOCKET, _resetGmRelayForTests } from '../../src/multiplayer/gmRelay.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const MODULE_ID = 'starforged-companion';
const GM  = { id: 'gm-1', isGM: true,  active: true };
const GM2 = { id: 'gm-2', isGM: true,  active: true };
const P1  = { id: 'pl-1', isGM: false, active: true };
const P2  = { id: 'pl-2', isGM: false, active: true };

function setUsers(users, currentUserId) {
  global.game.users = Object.assign([...users], {
    get: (id) => users.find(u => u.id === id) ?? null,
  });
  global.game.user = users.find(u => u.id === currentUserId) ?? null;
}

function makeCard(id, flags) {
  const msg = {
    id,
    flags: { [MODULE_ID]: { ...flags } },
    update: vi.fn(async (changes) => {
      for (const [path, val] of Object.entries(changes)) {
        const parts = path.split('.').slice(2);
        let cur = msg.flags[MODULE_ID];
        for (const p of parts.slice(0, -1)) cur = (cur[p] ??= {});
        cur[parts[parts.length - 1]] = val;
      }
    }),
  };
  return msg;
}

// Minimal DOM double: buttons keyed by data-action, with dataset.
function makeRoot(buttons) {
  const root = { buttons: [] };
  const makeBtn = (spec) => {
    const btn = {
      action: spec.action, dataset: { ...(spec.dataset ?? {}) }, disabled: false, listeners: {},
      cloneNode() { return makeBtn({ action: this.action, dataset: this.dataset }); },
      replaceWith(next) { root.buttons[root.buttons.indexOf(btn)] = next; },
      addEventListener(ev, fn) { this.listeners[ev] = fn; },
    };
    return btn;
  };
  root.buttons = buttons.map(makeBtn);
  const matching = (sel) => {
    const m = /data-action="([^"]+)"/.exec(sel);
    return root.buttons.filter(b => b.action === m?.[1]);
  };
  root.querySelectorAll = (sel) => matching(sel);
  root.querySelector    = (sel) => matching(sel)[0] ?? null;
  return root;
}
const click = (btn) => btn.listeners.click({ preventDefault() {}, stopPropagation() {} });
const btnFor = (root, action) => root.buttons.find(b => b.action === action);

function makeVow(id, name, { rank = 'dangerous', completed = false, flags = {} } = {}) {
  const item = {
    id, name, type: 'progress',
    system: { subtype: 'vow', rank, current: 0, completed },
    flags: { [MODULE_ID]: { ...flags } },
    update: async (changes) => {
      if ('system.current' in changes) item.system.current = changes['system.current'];
      if ('system.completed' in changes) item.system.completed = changes['system.completed'];
    },
    setFlag: async (mod, key, val) => { (item.flags[mod] ??= {})[key] = val; },
  };
  return item;
}

let pcA, pcB, messages;

beforeEach(() => {
  ChatMessage._reset();
  game.socket._reset();
  _resetGmRelayForTests();
  game.settings._store.delete(`${MODULE_ID}.keyedGmUserIds`);
  pcA = makeTestActor({ id: 'pc-a', name: 'Ash', items: { contents: [] } });
  pcB = makeTestActor({ id: 'pc-b', name: 'Bex', items: { contents: [] } });
  pcB.ownership = { 'pl-1': 3 };
  game.actors._setAll([pcA, pcB]);
  game.settings._store.set(`${MODULE_ID}.campaignState`, { ...CampaignStateSchema, characterIds: ['pc-a', 'pc-b'] });
  messages = [];
  game.messages = { get: (id) => messages.find(m => m.id === id) ?? null };
});

// ─────────────────────────────────────────────────────────────────────────────
// Connection picker
// ─────────────────────────────────────────────────────────────────────────────

describe('wireConnectionPickerButtons — relays connection.pick', () => {
  const pickerRoot = () => makeRoot([
    { action: 'sf-connection-pick', dataset: { hostId: 'conn-1', pickAction: 'develop', connectionName: 'Kira' } },
    { action: 'sf-connection-pick', dataset: { hostId: 'conn-2', pickAction: 'develop', connectionName: 'Sable' } },
  ]);
  let picker;
  beforeEach(() => {
    picker = makeCard('pick-1', {
      connectionPicker: true, pickAction: 'develop', resolved: false,
      choices: [{ hostId: 'conn-1', name: 'Kira' }, { hostId: 'conn-2', name: 'Sable' }],
    });
    messages.push(picker);
  });

  it('a player click relays the pick with the clicker\'s own PC — no local chat post', async () => {
    setUsers([GM, P1], 'pl-1');
    const root = pickerRoot();
    wireConnectionPickerButtons(picker, root);
    await click(root.buttons[1]);
    expect(ChatMessage._created).toHaveLength(0);
    expect(game.socket._emitted).toEqual([{
      event: GM_RELAY_SOCKET,
      payload: {
        kind: 'gmRelay.connection.pick',
        payload: { messageId: 'pick-1', hostId: 'conn-2', connectionName: 'Sable', actorId: 'pc-b' },
        requesterId: 'pl-1',
      },
    }]);
    expect(root.buttons.every(b => b.disabled)).toBe(true);
  });

  it('a player who owns no PC relays a null actor (never someone else\'s PC)', async () => {
    setUsers([GM, P1, P2], 'pl-2');
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const root = pickerRoot();
    wireConnectionPickerButtons(picker, root);
    await click(root.buttons[0]);
    expect(game.socket._emitted[0].payload.payload.actorId).toBeNull();
    expect(debug.mock.calls.some(c => /owns no player character/.test(String(c[0])))).toBe(true);
  });

  it('on the canonical GM the click posts the forced move once and resolves the card', async () => {
    setUsers([GM, P1], 'gm-1');
    const root = pickerRoot();
    wireConnectionPickerButtons(picker, root);
    await click(root.buttons[0]);
    const forced = ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.forcedMoveId === 'develop_your_relationship');
    expect(forced).toHaveLength(1);
    expect(forced[0].content).toBe('Develop my relationship with Kira.');
    expect(picker.flags[MODULE_ID].resolved).toBe(true);
    // A second click on the stale render posts nothing more.
    await click(root.buttons[1]);
    expect(ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.forcedMoveId)).toHaveLength(1);
  });

  it('a resolved card renders its buttons disabled', () => {
    picker.flags[MODULE_ID].resolved = true;
    const root = pickerRoot();
    wireConnectionPickerButtons(picker, root);
    expect(root.buttons.every(b => b.disabled)).toBe(true);
  });

  it('re-arms the buttons when no GM is connected', async () => {
    setUsers([P1], 'pl-1');
    const root = pickerRoot();
    wireConnectionPickerButtons(picker, root);
    await click(root.buttons[0]);
    expect(root.buttons.every(b => !b.disabled)).toBe(true);
    expect(game.socket._emitted ?? []).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Won-fight card
// ─────────────────────────────────────────────────────────────────────────────

describe('wireFightVowButtons — one-shot Mark milestone / Deepen bond', () => {
  const fightRoot = () => makeRoot([
    { action: 'sf-mark-milestone' }, { action: 'sf-fulfill-vow' }, { action: 'sf-deepen-bond' },
  ]);
  let fight, vow;
  beforeEach(() => {
    vow = makeVow('v-b', 'Find the Archive', { rank: 'formidable' });
    // Seed through the factory so items.find() (markVowProgress) sees it too.
    pcB = makeTestActor({ id: 'pc-b', name: 'Bex', items: { contents: [vow] } });
    pcB.ownership = { 'pl-1': 3 };
    game.actors._setAll([pcA, pcB]);
    fight = makeCard('fight-1', {
      fightVowCard: true, vowName: 'Find the Archive', marks: 1,
      connectionName: 'Kira', vowRank: 'formidable', actorId: 'pc-b',
    });
    messages.push(fight);
  });

  it('a player click relays fightVow.markMilestone with only the card id — no raw socket kinds', async () => {
    setUsers([GM, P1], 'pl-1');
    const root = fightRoot();
    wireFightVowButtons(fight, root);
    await click(btnFor(root, 'sf-mark-milestone'));
    expect(game.socket._emitted).toEqual([{
      event: GM_RELAY_SOCKET,
      payload: { kind: 'gmRelay.fightVow.markMilestone', payload: { messageId: 'fight-1' }, requesterId: 'pl-1' },
    }]);
    expect(vow.system.current).toBe(0);
  });

  it('on the canonical GM a double click marks the vow once and stamps the action', async () => {
    setUsers([GM, P1], 'gm-1');
    const root = fightRoot();
    wireFightVowButtons(fight, root);
    const btn = btnFor(root, 'sf-mark-milestone');
    await click(btn);
    await click(btn);
    expect(vow.system.current).toBe(4);   // formidable milestone = 4 ticks, once
    expect(fight.flags[MODULE_ID].resolvedActions).toEqual({ markMilestone: true });
  });

  it('an already-applied action renders disabled; the other stays live', () => {
    fight.flags[MODULE_ID].resolvedActions = { markMilestone: true };
    const root = fightRoot();
    wireFightVowButtons(fight, root);
    expect(btnFor(root, 'sf-mark-milestone').disabled).toBe(true);
    expect(btnFor(root, 'sf-deepen-bond').disabled).toBe(false);
    expect(btnFor(root, 'sf-deepen-bond').listeners.click).toBeTypeOf('function');
  });

  it('with no GM connected the click re-arms (and the user is warned by the relay)', async () => {
    setUsers([P1], 'pl-1');
    const warn = vi.spyOn(ui.notifications, 'warn');
    const root = fightRoot();
    wireFightVowButtons(fight, root);
    await click(btnFor(root, 'sf-deepen-bond'));
    expect(btnFor(root, 'sf-deepen-bond').disabled).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('Attempt to Fulfill still posts the forced fulfil move on the clicker', async () => {
    setUsers([GM, P1], 'pl-1');
    const root = fightRoot();
    wireFightVowButtons(fight, root);
    await click(btnFor(root, 'sf-fulfill-vow'));
    expect(ChatMessage._created[0].flags[MODULE_ID]).toMatchObject({
      forcedMoveId: 'fulfill_your_vow', forcedMoveTarget: 'Find the Archive',
    });
  });

  it('the legacy raw socket relays are gone (no vow.markMilestone / connection.deepen listener)', async () => {
    const src = await import('node:fs').then(fs =>
      fs.readFileSync(new URL('../../src/index.js', import.meta.url), 'utf8'));
    expect(src).not.toMatch(/kind:\s*"vow\.markMilestone"/);
    expect(src).not.toMatch(/kind:\s*"connection\.deepen"/);
    expect(src).not.toMatch(/registerFightVowSocket/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fulfil — reward to the roller
// ─────────────────────────────────────────────────────────────────────────────

describe('payFulfilledVowNative — the shared vow\'s reward lands on the roller', () => {
  const reward = { status: 'promised', description: 'A cache of fuel cells', form: 'supply' };

  beforeEach(() => setUsers([GM, P1], 'gm-1'));

  it('after the pipeline completed every copy, the roller (PC B) gets the supply — not PC A', async () => {
    const copyA = makeVow('v-a', 'Find the Archive', { completed: true, flags: { vowId: 'shared-1', reward: { ...reward } } });
    const copyB = makeVow('v-b', 'Find the Archive', { completed: true, flags: { vowId: 'shared-1', reward: { ...reward } } });
    pcA.items.contents.push(copyA);
    pcB.items.contents.push(copyB);

    await payFulfilledVowNative('Find the Archive', 'strong_hit', { skipLegacy: true, actorId: 'pc-b' });

    expect(pcB._updateHistory.some(u => u['system.supply.value'] === 5)).toBe(true);
    expect(pcA._updateHistory.some(u => 'system.supply.value' in u)).toBe(false);
    // Bookkeeping stamped on EVERY copy, so a later native roll can't double-pay.
    expect(copyA.flags[MODULE_ID].fulfilPaid).toBe(true);
    expect(copyB.flags[MODULE_ID].fulfilPaid).toBe(true);
  });

  it('does not pay a DIFFERENT sole open vow when the fulfilled one is already completed', async () => {
    const done  = makeVow('v-done', 'Find the Archive', { completed: true, flags: { vowId: 'vid-a' } });
    const other = makeVow('v-other', 'Avenge Kade', { flags: { vowId: 'vid-b', reward: { ...reward } } });
    pcB.items.contents.push(done, other);

    await payFulfilledVowNative('Find the Archive', 'strong_hit', { skipLegacy: true, actorId: 'pc-b' });

    expect(other.flags[MODULE_ID].fulfilPaid).toBeUndefined();
    expect(done.flags[MODULE_ID].fulfilPaid).toBe(true);
    expect(pcB._updateHistory.some(u => 'system.supply.value' in u)).toBe(false);
  });
});

describe('resolveVowItemCopies — sole-open-vow rung', () => {
  it('still resolves a fully renamed vow (name matches nothing anywhere)', () => {
    pcB.items.contents.push(makeVow('v-1', 'Renamed on the sheet'));
    expect(resolveVowItemCopies('Original name').primary?.item.id).toBe('v-1');
  });

  it('does not resolve a different vow when the name names a completed vow (exact or fragment)', () => {
    pcB.items.contents.push(makeVow('v-done', 'Find the Archive', { completed: true }), makeVow('v-open', 'Avenge Kade'));
    expect(resolveVowItemCopies('Find the Archive').primary).toBeNull();
    expect(resolveVowItemCopies('the archive').primary).toBeNull();
    expect(resolveVowItemCopies(null).primary?.item.id).toBe('v-open');
  });

  it('a fragment target (moveTarget) pays the completed vow it names, not the other open vow', async () => {
    setUsers([GM, P1], 'gm-1');
    const reward = { status: 'promised', description: 'Fuel', form: 'supply' };
    const done  = makeVow('v-done', 'Find the Archive', { completed: true, flags: { vowId: 'vid-a' } });
    const other = makeVow('v-other', 'Avenge Kade', { flags: { vowId: 'vid-b', reward } });
    pcB.items.contents.push(done, other);
    await payFulfilledVowNative('archive', 'strong_hit', { skipLegacy: true, actorId: 'pc-b' });
    expect(done.flags[MODULE_ID].fulfilPaid).toBe(true);
    expect(other.flags[MODULE_ID].fulfilPaid).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Momentum-bounds recalc — exactly one runner per update
// ─────────────────────────────────────────────────────────────────────────────

describe('momentumRecalcRunsHere', () => {
  const users = [GM, GM2, P1, P2];
  // Which clients would run the recalc for one update by `updaterId`.
  function runners(updaterId, list = users) {
    return list.filter(u => { setUsers(list, u.id); return momentumRecalcRunsHere(pcB, updaterId); }).map(u => u.id);
  }

  it('a player\'s own sheet edit → the canonical GM only', () => {
    expect(runners('pl-1')).toEqual(['gm-1']);
  });

  it('the canonical GM\'s sheet edit → the PC\'s (non-GM) owner only', () => {
    expect(runners('gm-1')).toEqual(['pl-1']);
  });

  it('a non-canonical GM\'s edit → the owner only (never the canonical GM too)', () => {
    expect(runners('gm-2')).toEqual(['pl-1']);
  });

  it('several connected owners → only the lowest-id one', () => {
    pcB.ownership = { 'pl-1': 3, 'pl-2': 3 };
    expect(runners('gm-1')).toEqual(['pl-1']);
  });

  it('a GM edit with no owner connected → the canonical GM, when it was not the editor', () => {
    const offline = [GM, GM2, { ...P1, active: false }, P2];
    expect(runners('gm-2', offline)).toEqual(['gm-1']);
    expect(runners('gm-1', offline)).toEqual([]);
  });

  it('never runs for the client\'s own write', () => {
    setUsers(users, 'gm-1');
    expect(momentumRecalcRunsHere(pcB, 'gm-1')).toBe(false);
  });
});
