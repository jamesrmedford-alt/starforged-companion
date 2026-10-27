/**
 * STARFORGED COMPANION
 * tests/unit/gmRelay.test.js
 *
 * Coverage for the canonical-GM action relay (src/multiplayer/gmRelay.js):
 * local execution on the canonical GM, socket relay from a player, the
 * no-GM warning, the listener's stand-down / unknown-kind paths, and the
 * wiring contract — every declared action resolves to a real handler export.
 *
 * The cross-client behaviour — a player's relay reaching exactly one GM, the
 * GM-ready broadcast, a relay sent while the GM's client is still loading,
 * the X-Card played by a player — runs on the multi-client harness
 * (tests/helpers/multiClient.js, issue #282) at the end of this file: real
 * sockets between booted clients instead of a hand-fed listener.
 */

import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import {
  GM_ACTIONS,
  GM_RELAY_SOCKET,
  GM_RELAY_KIND_PREFIX,
  GM_RELAY_READY_KIND,
  GM_ACTION_TIMEOUT_MS,
  GM_CLAUDE_ACTION_TIMEOUT_MS,
  hasActiveGM,
  requestGmAction,
  registerGmRelaySocket,
  runGmAction,
  announceGmRelayReady,
  onGmRelayReady,
  _resetGmRelayForTests,
} from '../../src/multiplayer/gmRelay.js';
import * as safety from '../../src/context/safety.js';
import * as sessionDialogs from '../../src/safety/sessionDialogs.js';
import * as oracleFollowup from '../../src/oracles/oracleFollowup.js';
import { DEFAULT_TIMEOUT_MS } from '../../src/net/fetchWithTimeout.js';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';

function setUsers(users, currentUserId) {
  global.game.users = Object.assign([...users], {
    get: (id) => users.find(u => u.id === id) ?? null,
  });
  global.game.user = users.find(u => u.id === currentUserId) ?? null;
}

const GM     = { id: 'gm-1', isGM: true,  active: true };
const PLAYER = { id: 'pl-1', isGM: false, active: true };

beforeEach(() => {
  game.socket._reset();
  game.settings._store.clear();
  _resetGmRelayForTests();
});

describe('GM_ACTIONS wiring contract', () => {
  // Issue #300 F15: a handler that awaits a Claude call gets the longer queue
  // budget. Pinned, so marking (or unmarking) a kind is a deliberate change.
  it('marks the handlers that await a Claude call, and their budget covers two bounded requests', () => {
    const claudeKinds = Object.keys(GM_ACTIONS).filter(k => GM_ACTIONS[k].claude).sort();
    expect(claudeKinds).toEqual(['move.burnMomentum', 'move.improveResult', 'oracle.narrate', 'session.begin', 'session.end']);
    expect(GM_CLAUDE_ACTION_TIMEOUT_MS).toBeGreaterThan(2 * DEFAULT_TIMEOUT_MS);
    expect(GM_ACTION_TIMEOUT_MS).toBeLessThan(GM_CLAUDE_ACTION_TIMEOUT_MS);
  });

  it('declares the one-shot card-button kinds', () => {
    for (const kind of ['milestone.pick', 'connection.pick', 'fightVow.markMilestone', 'fightVow.deepenBond', 'suffer.pick']) {
      expect(GM_ACTIONS[kind], kind).toBeDefined();
    }
  });

  for (const [kind, entry] of Object.entries(GM_ACTIONS)) {
    it(`"${kind}" resolves to an exported handler "${entry.fn}"`, async () => {
      const mod = await entry.load();
      expect(typeof mod[entry.fn]).toBe('function');
    });
  }
});

describe('hasActiveGM', () => {
  it('is true when an active GM is connected', () => {
    setUsers([GM, PLAYER], 'pl-1');
    expect(hasActiveGM()).toBe(true);
  });

  it('is false when the only GM is inactive', () => {
    setUsers([{ ...GM, active: false }, PLAYER], 'pl-1');
    expect(hasActiveGM()).toBe(false);
  });
});

describe('requestGmAction', () => {
  it('runs the action locally on the canonical GM without emitting', async () => {
    setUsers([GM, PLAYER], 'gm-1');
    const spy = vi.spyOn(safety, 'suppressScene').mockResolvedValue(undefined);
    const res = await requestGmAction('xcard.activate', {});
    expect(res).toEqual({ ok: true, relayed: false });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][1]).toMatchObject({ requesterId: 'gm-1', requesterIsGM: true, local: true });
    expect(game.socket._emitted ?? []).toHaveLength(0);
    spy.mockRestore();
  });

  it('emits a prefixed relay from a player client', async () => {
    setUsers([GM, PLAYER], 'pl-1');
    const res = await requestGmAction('xcard.activate', { a: 1 });
    expect(res).toEqual({ ok: true, relayed: true });
    expect(game.socket._emitted).toEqual([{
      event:   GM_RELAY_SOCKET,
      payload: { kind: `${GM_RELAY_KIND_PREFIX}xcard.activate`, payload: { a: 1 }, requesterId: 'pl-1' },
    }]);
  });

  it('warns and returns no-gm when no GM is connected', async () => {
    setUsers([PLAYER], 'pl-1');
    const warn = vi.fn();
    global.ui = { notifications: { warn } };
    silenceConsoleErrors();
    const res = await requestGmAction('xcard.activate', {});
    expect(res).toEqual({ ok: false, reason: 'no-gm' });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(game.socket._emitted ?? []).toHaveLength(0);
  });

  it('throws on an unknown kind', async () => {
    setUsers([GM], 'gm-1');
    await expect(requestGmAction('nope.nothing', {})).rejects.toThrow(/unknown action kind/);
  });
});

describe('runGmAction', () => {
  it('passes the requester context to the handler', async () => {
    setUsers([GM, PLAYER], 'gm-1');
    const spy = vi.spyOn(safety, 'suppressScene').mockResolvedValue('done');
    const out = await runGmAction('xcard.activate', { x: 1 }, { requesterId: 'pl-1' });
    expect(out).toBe('done');
    expect(spy).toHaveBeenCalledWith({ x: 1 }, {
      requesterId: 'pl-1', requester: PLAYER, requesterIsGM: false, local: false,
    });
    spy.mockRestore();
  });
});

describe('registerGmRelaySocket', () => {
  function handler() {
    const list = game.socket._handlers.get(GM_RELAY_SOCKET) ?? [];
    return list[list.length - 1];
  }

  it('installs exactly one listener even when called twice', () => {
    setUsers([GM], 'gm-1');
    registerGmRelaySocket();
    registerGmRelaySocket();
    expect(game.socket._handlers.get(GM_RELAY_SOCKET)).toHaveLength(1);
  });

  it('ignores other module relays sharing the channel', async () => {
    setUsers([GM], 'gm-1');
    const spy = vi.spyOn(safety, 'suppressScene').mockResolvedValue(undefined);
    registerGmRelaySocket();
    await handler()({ kind: 'expedition.recommit', trackId: 't1' });
    await handler()(null);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('warns on an unknown relayed kind', async () => {
    setUsers([GM], 'gm-1');
    silenceConsoleErrors();
    const warn = vi.spyOn(console, 'warn');
    registerGmRelaySocket();
    await handler()({ kind: `${GM_RELAY_KIND_PREFIX}bogus.kind`, payload: {} });
    expect(warn.mock.calls.some(c => String(c[0]).includes('unknown action'))).toBe(true);
  });

  it('ignores the relay-ready broadcast (not an action) without warning', async () => {
    setUsers([GM], 'gm-1');
    const spy = vi.spyOn(safety, 'suppressScene').mockResolvedValue(undefined);
    registerGmRelaySocket();
    await handler()({ kind: GM_RELAY_READY_KIND });
    expect(spy).not.toHaveBeenCalled();
    expect(getCapturedWarns()).toHaveLength(0);
    spy.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Serialisation — one GM-side queue for every action
// ─────────────────────────────────────────────────────────────────────────────

describe('runGmAction — serialised on the GM', () => {
  function deferred() {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  }

  it('runs a second action only after the first settles (no interleaved read-modify-writes)', async () => {
    setUsers([GM, PLAYER], 'gm-1');
    const order = [];
    const first = deferred();
    const spy = vi.spyOn(sessionDialogs, 'applySafetyFlag')
      .mockImplementationOnce(async () => { order.push('a:start'); await first.promise; order.push('a:end'); })
      .mockImplementationOnce(async () => { order.push('b:start'); order.push('b:end'); });

    const a = runGmAction('safety.setFlag', {}, { requesterId: 'pl-1' });
    const b = runGmAction('safety.setFlag', {}, { requesterId: 'pl-1' });
    await vi.waitFor(() => expect(order).toEqual(['a:start']));
    first.resolve();
    await Promise.all([a, b]);
    expect(order).toEqual(['a:start', 'a:end', 'b:start', 'b:end']);
    spy.mockRestore();
  });

  it('serialises the socket path and the local path through the same queue', async () => {
    setUsers([GM, PLAYER], 'gm-1');
    const order = [];
    const first = deferred();
    const spy = vi.spyOn(sessionDialogs, 'applySafetyFlag')
      .mockImplementationOnce(async () => { order.push('relay:start'); await first.promise; order.push('relay:end'); })
      .mockImplementationOnce(async () => { order.push('local'); });
    registerGmRelaySocket();
    const list = game.socket._handlers.get(GM_RELAY_SOCKET);
    const relayed = list[list.length - 1]({ kind: `${GM_RELAY_KIND_PREFIX}safety.setFlag`, payload: {}, requesterId: 'pl-1' });
    const local = requestGmAction('safety.setFlag', {});
    await vi.waitFor(() => expect(order).toEqual(['relay:start']));
    first.resolve();
    await Promise.all([relayed, local]);
    expect(order).toEqual(['relay:start', 'relay:end', 'local']);
    spy.mockRestore();
  });

  it('a rejecting action does not wedge the queue — the next one still runs', async () => {
    setUsers([GM, PLAYER], 'gm-1');
    const spy = vi.spyOn(sessionDialogs, 'applySafetyFlag')
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('second');
    const a = runGmAction('safety.setFlag', {});
    const b = runGmAction('safety.setFlag', {});
    await expect(a).rejects.toThrow('boom');
    await expect(b).resolves.toBe('second');
    spy.mockRestore();
  });

  it('an action that never settles is released (warned) after the timeout', async () => {
    vi.useFakeTimers();
    try {
      setUsers([GM, PLAYER], 'gm-1');
      const spy = vi.spyOn(sessionDialogs, 'applySafetyFlag')
        .mockImplementationOnce(() => new Promise(() => {}))   // hangs forever
        .mockResolvedValueOnce('after');
      void runGmAction('safety.setFlag', {});
      const b = runGmAction('safety.setFlag', {});
      let bDone = false;
      void b.then(() => { bDone = true; });
      await vi.advanceTimersByTimeAsync(GM_ACTION_TIMEOUT_MS - 1);
      expect(bDone).toBe(false);
      await vi.advanceTimersByTimeAsync(2);
      await expect(b).resolves.toBe('after');
      expect(getCapturedWarns().some(w => /still running after .* running "safety.setFlag" anyway/.test(w))).toBe(true);
      spy.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });

  // Issue #300 F15: the cap was a flat 60 s — shorter than one Claude request
  // (DEFAULT_TIMEOUT_MS, 120 s) — so an ordinary slow narration let the action
  // behind it run alongside it, and every action queued behind one slow action
  // timed out together.
  it('a Claude-calling action ahead is waited on for its own, longer budget', async () => {
    vi.useFakeTimers();
    try {
      setUsers([GM, PLAYER], 'gm-1');
      const narration = deferred();
      const followup = vi.spyOn(oracleFollowup, 'narrateOracleFollowupOnGm').mockImplementationOnce(() => narration.promise);
      const flag = vi.spyOn(sessionDialogs, 'applySafetyFlag').mockResolvedValueOnce('flag');
      const a = runGmAction('oracle.narrate', {});
      const b = runGmAction('safety.setFlag', {});
      await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS + 1);   // past the old cap and one request's deadline
      expect(flag).not.toHaveBeenCalled();
      narration.resolve('text');
      await expect(a).resolves.toBe('text');
      await expect(b).resolves.toBe('flag');
      expect(getCapturedWarns().some(w => /still running after/.test(w))).toBe(false);
      followup.mockRestore();
      flag.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a Claude-calling action that never settles is still passed, after GM_CLAUDE_ACTION_TIMEOUT_MS', async () => {
    vi.useFakeTimers();
    try {
      setUsers([GM, PLAYER], 'gm-1');
      const followup = vi.spyOn(oracleFollowup, 'narrateOracleFollowupOnGm').mockImplementationOnce(() => new Promise(() => {}));
      const flag = vi.spyOn(sessionDialogs, 'applySafetyFlag').mockResolvedValueOnce('after');
      void runGmAction('oracle.narrate', {});
      const b = runGmAction('safety.setFlag', {});
      await vi.advanceTimersByTimeAsync(GM_CLAUDE_ACTION_TIMEOUT_MS - 1);
      expect(flag).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(2);
      await expect(b).resolves.toBe('after');
      expect(getCapturedWarns().some(w => w.includes(
        `("oracle.narrate") is still running after ${GM_CLAUDE_ACTION_TIMEOUT_MS}ms — running "safety.setFlag" anyway`,
      ))).toBe(true);
      followup.mockRestore();
      flag.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a backlog behind a hung action still runs one at a time — each budget counts from when that action starts', async () => {
    vi.useFakeTimers();
    try {
      setUsers([GM, PLAYER], 'gm-1');
      const order = [];
      const second = deferred();
      const spy = vi.spyOn(sessionDialogs, 'applySafetyFlag')
        .mockImplementationOnce(() => new Promise(() => {}))   // hangs forever
        .mockImplementationOnce(async () => { order.push('b:start'); await second.promise; order.push('b:end'); })
        .mockImplementationOnce(async () => { order.push('c'); });
      void runGmAction('safety.setFlag', {});
      const b = runGmAction('safety.setFlag', {});
      const c = runGmAction('safety.setFlag', {});
      await vi.advanceTimersByTimeAsync(GM_ACTION_TIMEOUT_MS + 1);
      expect(order).toEqual(['b:start']);   // b passed the hung action; c waits for b, not alongside it
      await vi.advanceTimersByTimeAsync(GM_ACTION_TIMEOUT_MS / 2);
      expect(order).toEqual(['b:start']);
      second.resolve();
      await Promise.all([b, c]);
      expect(order).toEqual(['b:start', 'b:end', 'c']);
      spy.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });

  it('an action on an idle queue arms no timer', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    try {
      setUsers([GM, PLAYER], 'gm-1');
      const spy = vi.spyOn(sessionDialogs, 'applySafetyFlag').mockResolvedValue(undefined);
      await runGmAction('safety.setFlag', {});
      expect(vi.getTimerCount()).toBe(0);
      spy.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns the handler result on the local (canonical GM) path', async () => {
    setUsers([GM, PLAYER], 'gm-1');
    const spy = vi.spyOn(sessionDialogs, 'applySafetyFlag').mockResolvedValue({ paused: true });
    const res = await requestGmAction('safety.setFlag', {});
    expect(res).toEqual({ ok: true, relayed: false, result: { paused: true } });
    spy.mockRestore();
  });
  // Second review round: queued behind a Claude-calling handler (an oracle
  // follow-up, a burn re-narration, End a Session's summary) the X-Card waited
  // up to the timeout while the unqueued move pipeline narrated through it.
  it('the X-Card is not queued — it is recorded while a long action is still in flight', async () => {
    setUsers([GM, PLAYER], 'gm-1');
    const order = [];
    const first = deferred();
    const flag = vi.spyOn(sessionDialogs, 'applySafetyFlag')
      .mockImplementationOnce(async () => { order.push('flag:start'); await first.promise; order.push('flag:end'); });
    const xcard = vi.spyOn(safety, 'suppressScene')
      .mockImplementationOnce(async () => { order.push('xcard'); return true; });

    const a = runGmAction('safety.setFlag', {}, { requesterId: 'pl-1' });
    await vi.waitFor(() => expect(order).toEqual(['flag:start']));
    await expect(runGmAction('xcard.activate', {}, { requesterId: 'pl-1' })).resolves.toBe(true);
    expect(order).toEqual(['flag:start', 'xcard']);
    first.resolve();
    await a;
    expect(order).toEqual(['flag:start', 'xcard', 'flag:end']);
    flag.mockRestore();
    xcard.mockRestore();
  });

  it('an X-Card relayed over the socket during a long action lands at once', async () => {
    setUsers([GM, PLAYER], 'gm-1');
    const first = deferred();
    const flag = vi.spyOn(sessionDialogs, 'applySafetyFlag')
      .mockImplementationOnce(async () => { await first.promise; });
    game.settings._store.set('starforged-companion.campaignState', { xCardActive: false });
    registerGmRelaySocket();
    const list = game.socket._handlers.get(GM_RELAY_SOCKET);
    const deliver = list[list.length - 1];
    const a = deliver({ kind: `${GM_RELAY_KIND_PREFIX}safety.setFlag`, payload: {}, requesterId: 'pl-1' });
    await deliver({ kind: `${GM_RELAY_KIND_PREFIX}xcard.activate`, payload: {}, requesterId: 'pl-1' });
    expect(game.settings._store.get('starforged-companion.campaignState').xCardActive).toBe(true);
    first.resolve();
    await a;
    flag.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GM-ready broadcast
// ─────────────────────────────────────────────────────────────────────────────

describe('announceGmRelayReady / onGmRelayReady', () => {
  const readyListeners = () => game.socket._handlers.get(GM_RELAY_SOCKET) ?? [];
  const deliver = (msg) => { for (const fn of readyListeners()) fn(msg); };

  it('the canonical GM broadcasts the ready kind', () => {
    setUsers([GM, PLAYER], 'gm-1');
    expect(announceGmRelayReady()).toBe(true);
    expect(game.socket._emitted).toEqual([{ event: GM_RELAY_SOCKET, payload: { kind: GM_RELAY_READY_KIND } }]);
  });

  it('runs every registered callback on a player client, through one listener', () => {
    setUsers([GM, PLAYER], 'pl-1');
    const a = vi.fn(), b = vi.fn();
    onGmRelayReady(a);
    onGmRelayReady(b);
    expect(readyListeners()).toHaveLength(1);
    deliver({ kind: GM_RELAY_READY_KIND });
    deliver({ kind: GM_RELAY_READY_KIND });
    expect(a).toHaveBeenCalledTimes(2);
    expect(b).toHaveBeenCalledTimes(2);
  });

  it('ignores other kinds, and the broadcast on GM clients', () => {
    setUsers([GM, PLAYER], 'pl-1');
    const cb = vi.fn();
    onGmRelayReady(cb);
    deliver({ kind: `${GM_RELAY_KIND_PREFIX}xcard.activate`, payload: {} });
    deliver({ kind: 'expedition.recommit' });
    setUsers([GM, PLAYER], 'gm-1');
    deliver({ kind: GM_RELAY_READY_KIND });
    expect(cb).not.toHaveBeenCalled();
  });

  it('a throwing or rejecting callback is logged and does not stop the others', async () => {
    setUsers([GM, PLAYER], 'pl-1');
    const ok = vi.fn();
    onGmRelayReady(() => { throw new Error('sync boom'); });
    onGmRelayReady(() => Promise.reject(new Error('async boom')));
    onGmRelayReady(ok);
    deliver({ kind: GM_RELAY_READY_KIND });
    expect(ok).toHaveBeenCalledTimes(1);
    await vi.waitFor(() =>
      expect(getCapturedWarns().filter(w => /relay-ready callback failed/.test(w))).toHaveLength(2));
  });

  it('rejects a non-function callback', () => {
    expect(() => onGmRelayReady('nope')).toThrow(TypeError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Across a table — the multi-client harness (issue #282)
// ─────────────────────────────────────────────────────────────────────────────

describe('across a booted table', () => {
  const MODULE_ID = 'starforged-companion';
  let table;

  beforeAll(async () => {
    table = await simulateTable({ users: [USERS.GM, USERS.GM2, USERS.P1, USERS.P2] });
  }, 30_000);
  afterAll(() => table?.teardown());
  beforeEach(() => table.reset({ world: { settings: { campaignState: { ...CampaignStateSchema } } } }));

  /** requestGmAction on a client's own copy of gmRelay.js. */
  async function request(userId, kind, payload) {
    const c = table.client(userId);
    const relay = await c.import('../../src/multiplayer/gmRelay.js');
    const res = await c.run(() => relay.requestGmAction(kind, payload));
    await table.settle();
    return res;
  }

  /** Which client wrote campaignState (the updateSetting hook's userId). */
  function campaignStateWriters() {
    const writers = [];
    table.client('pl-2').listen('updateSetting', (setting, _changes, _options, userId) => {
      if (setting.key === `${MODULE_ID}.campaignState`) writers.push(userId);
    });
    return writers;
  }

  it('a player\'s relay runs once — on the canonical GM, credited to the requester', async () => {
    const writers = campaignStateWriters();
    const res = await request('pl-1', 'safety.setFlag', { text: 'spiders', visibility: 'public' });
    expect(res).toEqual({ ok: true, relayed: true });
    expect(table.world.campaignState().safetyFlags).toMatchObject([{ text: 'spiders', createdBy: 'Pat' }]);
    expect(writers).toEqual(['gm-1']);   // the second GM stood down
    expect(table.socketLog.filter(e => e.payload?.kind === 'gmRelay.safety.setFlag').map(e => e.from)).toEqual(['pl-1']);
  });

  it('the keyed second GM is canonical when the lowest-id GM is keyless — the relay runs there', async () => {
    await table.reset({ world: { settings: { campaignState: { ...CampaignStateSchema }, keyedGmUserIds: ['gm-2'] } } });
    const writers = campaignStateWriters();
    await request('pl-1', 'session.takeBreak', {});
    expect(table.world.campaignState().nextMoveAdd).toMatchObject({ value: 1, source: 'take_a_break' });
    expect(writers).toEqual(['gm-2']);
  });

  it('on the canonical GM the action runs locally — no socket round trip', async () => {
    const res = await request('gm-1', 'safety.setFlag', { text: 'heights' });
    expect(res).toMatchObject({ ok: true, relayed: false });
    expect(table.socketLog.filter(e => e.payload?.kind?.startsWith('gmRelay.safety'))).toEqual([]);
    expect(table.world.campaignState().safetyFlags[0]).toMatchObject({ text: 'heights', createdBy: 'Gina' });
  });

  it('with no GM connected the requester is warned, gets no-gm, and nothing is written', async () => {
    silenceConsoleErrors();
    await table.leave('gm-1');
    await table.leave('gm-2');
    const res = await request('pl-1', 'safety.setFlag', { text: 'spiders' });
    expect(res).toEqual({ ok: false, reason: 'no-gm' });
    expect(table.client('pl-1').notifications.some(n => n.level === 'warn' && /no GM is connected/.test(n.message))).toBe(true);
    expect(table.world.campaignState().safetyFlags).toBeUndefined();
  });

  it('only the canonical GM announces its relay is ready', () => {
    // Boot traffic was cleared by reset(); boot again is not possible, so read
    // the announcement off a fresh broadcast from each GM client's own copy.
    return Promise.all(['gm-1', 'gm-2', 'pl-1'].map(async (id) => {
      const c = table.client(id);
      const relay = await c.import('../../src/multiplayer/gmRelay.js');
      return [id, c.run(() => relay.announceGmRelayReady())];
    })).then(results => {
      expect(Object.fromEntries(results)).toEqual({ 'gm-1': true, 'gm-2': false, 'pl-1': false });
      expect(table.socketLog.filter(e => e.payload?.kind === GM_RELAY_READY_KIND).map(e => e.from)).toEqual(['gm-1']);
    });
  });

  // RELAY-LOAD-WINDOW: a player's Private Lines relayed while the GM's client
  // was still loading reached no listener and were lost. Players now answer
  // the canonical GM's relay-ready broadcast (onGmRelayReady), a pull.
  it('players\' Private Lines reach campaignState when the GM joins after them', async () => {
    const late = await simulateTable({
      users: [{ ...USERS.GM, active: false }, USERS.P1, USERS.P2],
      clientSettings: { 'pl-1': { privateLines: ['spiders'] }, 'pl-2': { privateLines: ['drowning'] } },
    });
    try {
      expect(late.world.campaignState()).toBeUndefined();   // nobody could write it yet
      await late.join('gm-1');
      await late.settle();
      const lines = late.world.campaignState().safety.privateLines;
      expect(lines).toEqual(expect.arrayContaining([
        { playerId: 'pl-1', lines: ['spiders'] },
        { playerId: 'pl-2', lines: ['drowning'] },
      ]));
      expect(lines).toHaveLength(2);
    } finally {
      await late.teardown();
    }
  }, 30_000);

  // XCARD-PLAYER-NOOP: a player's X-Card wrote campaignState on their own
  // client, which Foundry refuses — the card claimed a pause that never
  // happened. Now: relayed to the canonical GM; only a GM resumes.
  describe('the X-Card', () => {
    const xcardCards = () => table.cards(f => f.xcardCard);

    it('a player plays it: the pause is recorded on the GM and one card says so', async () => {
      await table.client('pl-1').chat('!x');
      await table.settle();
      expect(table.world.messages().filter(m => m.content === '!x')).toEqual([]);   // intercepted before creation
      expect(table.world.campaignState().xCardActive).toBe(true);
      expect(xcardCards().map(c => [c.author, c.flags[MODULE_ID].xcardRecorded])).toEqual([['pl-1', true]]);
    });

    it('the resume button is the GM\'s alone — a GM click resumes and resolves the card everywhere', async () => {
      await table.client('pl-2').chat('!x');
      await table.settle();
      const card = xcardCards()[0];
      expect(table.client('pl-2').render(card._id).querySelector('[data-action="sf-xcard-resume"]')).toBeNull();
      expect(table.client('gm-2').render(card._id).querySelector('[data-action="sf-xcard-resume"]')).not.toBeNull();

      table.client('gm-1').click(card._id, '[data-action="sf-xcard-resume"]');
      await table.settle();
      expect(table.world.campaignState().xCardActive).toBe(false);
      for (const c of table.clients) expect(c.message(card._id).flags[MODULE_ID].xcardResolved, c.id).toBe(true);
      expect(table.cards(f => f.xcardClearedCard).map(c => c.author)).toEqual(['gm-1']);
    });

    it('a player\'s "!x clear" is refused — the pause holds', async () => {
      await table.client('pl-1').chat('!x');
      await table.settle();
      await table.client('pl-2').chat('!x clear');
      await table.settle();
      expect(table.world.campaignState().xCardActive).toBe(true);
      expect(table.client('pl-2').notifications.some(n => /Only a GM can clear the X-Card/.test(n.message))).toBe(true);
    });

    it('with no GM connected the card says the pause could not be recorded', async () => {
      silenceConsoleErrors();
      await table.leave('gm-1');
      await table.leave('gm-2');
      await table.client('pl-1').chat('!x');
      await table.settle();
      expect(table.world.campaignState().xCardActive).toBeFalsy();
      expect(xcardCards().map(c => c.flags[MODULE_ID].xcardRecorded)).toEqual([false]);
      expect(xcardCards()[0].content).toMatch(/could not be recorded — no GM is connected/);
    });
  });
});
