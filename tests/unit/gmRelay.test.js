/**
 * STARFORGED COMPANION
 * tests/unit/gmRelay.test.js
 *
 * Coverage for the canonical-GM action relay (src/multiplayer/gmRelay.js):
 * local execution on the canonical GM, socket relay from a player, the
 * no-GM warning, the listener's stand-down / unknown-kind paths, and the
 * wiring contract — every declared action resolves to a real handler export.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  GM_ACTIONS,
  GM_RELAY_SOCKET,
  GM_RELAY_KIND_PREFIX,
  GM_RELAY_READY_KIND,
  GM_ACTION_TIMEOUT_MS,
  hasActiveGM,
  requestGmAction,
  registerGmRelaySocket,
  runGmAction,
  announceGmRelayReady,
  onGmRelayReady,
  _resetGmRelayForTests,
} from '../../src/multiplayer/gmRelay.js';
import * as safety from '../../src/context/safety.js';

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
  it('declares the one-shot card-button kinds', () => {
    for (const kind of ['milestone.pick', 'connection.pick', 'fightVow.markMilestone', 'fightVow.deepenBond']) {
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

  it('runs a relayed action on the canonical GM', async () => {
    setUsers([GM, PLAYER], 'gm-1');
    const spy = vi.spyOn(safety, 'suppressScene').mockResolvedValue(undefined);
    registerGmRelaySocket();
    await handler()({ kind: `${GM_RELAY_KIND_PREFIX}xcard.activate`, payload: {}, requesterId: 'pl-1' });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][1]).toMatchObject({ requesterId: 'pl-1', requesterIsGM: false, local: false });
    spy.mockRestore();
  });

  it('stands down on a non-canonical client', async () => {
    setUsers([GM, PLAYER], 'pl-1');
    const spy = vi.spyOn(safety, 'suppressScene').mockResolvedValue(undefined);
    registerGmRelaySocket();
    await handler()({ kind: `${GM_RELAY_KIND_PREFIX}xcard.activate`, payload: {}, requesterId: 'pl-1' });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
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
    const spy = vi.spyOn(safety, 'suppressScene')
      .mockImplementationOnce(async () => { order.push('a:start'); await first.promise; order.push('a:end'); })
      .mockImplementationOnce(async () => { order.push('b:start'); order.push('b:end'); });

    const a = runGmAction('xcard.activate', {}, { requesterId: 'pl-1' });
    const b = runGmAction('xcard.activate', {}, { requesterId: 'pl-1' });
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
    const spy = vi.spyOn(safety, 'suppressScene')
      .mockImplementationOnce(async () => { order.push('relay:start'); await first.promise; order.push('relay:end'); })
      .mockImplementationOnce(async () => { order.push('local'); });
    registerGmRelaySocket();
    const list = game.socket._handlers.get(GM_RELAY_SOCKET);
    const relayed = list[list.length - 1]({ kind: `${GM_RELAY_KIND_PREFIX}xcard.activate`, payload: {}, requesterId: 'pl-1' });
    const local = requestGmAction('xcard.activate', {});
    await vi.waitFor(() => expect(order).toEqual(['relay:start']));
    first.resolve();
    await Promise.all([relayed, local]);
    expect(order).toEqual(['relay:start', 'relay:end', 'local']);
    spy.mockRestore();
  });

  it('a rejecting action does not wedge the queue — the next one still runs', async () => {
    setUsers([GM, PLAYER], 'gm-1');
    const spy = vi.spyOn(safety, 'suppressScene')
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('second');
    const a = runGmAction('xcard.activate', {});
    const b = runGmAction('xcard.activate', {});
    await expect(a).rejects.toThrow('boom');
    await expect(b).resolves.toBe('second');
    spy.mockRestore();
  });

  it('an action that never settles is released (warned) after the timeout', async () => {
    vi.useFakeTimers();
    try {
      setUsers([GM, PLAYER], 'gm-1');
      const spy = vi.spyOn(safety, 'suppressScene')
        .mockImplementationOnce(() => new Promise(() => {}))   // hangs forever
        .mockResolvedValueOnce('after');
      void runGmAction('xcard.activate', {});
      const b = runGmAction('xcard.activate', {});
      let bDone = false;
      void b.then(() => { bDone = true; });
      await vi.advanceTimersByTimeAsync(GM_ACTION_TIMEOUT_MS - 1);
      expect(bDone).toBe(false);
      await vi.advanceTimersByTimeAsync(2);
      await expect(b).resolves.toBe('after');
      expect(getCapturedWarns().some(w => /still running after .* running "xcard.activate" anyway/.test(w))).toBe(true);
      spy.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });

  it('an action on an idle queue arms no timer', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    try {
      setUsers([GM, PLAYER], 'gm-1');
      const spy = vi.spyOn(safety, 'suppressScene').mockResolvedValue(undefined);
      await runGmAction('xcard.activate', {});
      expect(vi.getTimerCount()).toBe(0);
      spy.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns the handler result on the local (canonical GM) path', async () => {
    setUsers([GM, PLAYER], 'gm-1');
    const spy = vi.spyOn(safety, 'suppressScene').mockResolvedValue({ paused: true });
    const res = await requestGmAction('xcard.activate', {});
    expect(res).toEqual({ ok: true, relayed: false, result: { paused: true } });
    spy.mockRestore();
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

  it('a player or non-canonical GM does not broadcast', () => {
    setUsers([GM, { id: 'gm-2', isGM: true, active: true }, PLAYER], 'pl-1');
    expect(announceGmRelayReady()).toBe(false);
    setUsers([GM, { id: 'gm-2', isGM: true, active: true }, PLAYER], 'gm-2');
    expect(announceGmRelayReady()).toBe(false);
    expect(game.socket._emitted ?? []).toHaveLength(0);
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
