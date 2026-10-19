/**
 * STARFORGED COMPANION
 * tests/unit/commandRouting.test.js
 *
 * The chat-command run-on policy (src/multiplayer/commandRouting.js), one
 * client at a time: for each policy, which client's dispatch runs a matched
 * command and which stand down. The same decisions across a whole table —
 * every real route × every table shape — are pinned by
 * tests/unit/multiplayerRouting.test.js on the multi-client harness.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RUN_ON, dispatchChatCommand } from '../../src/multiplayer/commandRouting.js';

const MODULE_ID = 'starforged-companion';
const GM  = { id: 'gm-1', isGM: true,  active: true };
const GM2 = { id: 'gm-2', isGM: true,  active: true };
const P1  = { id: 'pl-1', isGM: false, active: true };
const P2  = { id: 'pl-2', isGM: false, active: true };

let restoreUser;
let warn;

function table(users, { keyed = [] } = {}) {
  game.users._set(users);
  game.settings._store.set(`${MODULE_ID}.keyedGmUserIds`, keyed);
}

/** Dispatch `content` (authored by `authorId`) as `asUser` would; returns what ran. */
async function dispatchAs(asUser, runOn, authorId = 'pl-1') {
  restoreUser?.();
  restoreUser = withUser({ id: asUser.id, isGM: asUser.isGM });
  const run = vi.fn();
  const routes = [
    { name: '!other', match: (m) => m.content === '!other', runOn: RUN_ON.AUTHOR, run: vi.fn() },
    { name: '!cmd',   match: (m) => m.content.startsWith('!cmd'), runOn, run },
  ];
  const consumed = await dispatchChatCommand({ content: '!cmd go', author: { id: authorId } }, routes);
  return { consumed, ran: run.mock.calls.length };
}

beforeEach(() => {
  warn = vi.spyOn(ui.notifications, 'warn');
});
afterEach(() => {
  restoreUser?.();
  restoreUser = null;
  warn.mockRestore();
  table([{ id: 'test-user-gm', isGM: true, active: true }]);
});

describe('dispatchChatCommand', () => {
  it('a message no route matches is not consumed', async () => {
    table([GM, P1]);
    const consumed = await dispatchChatCommand({ content: 'I run for the lift.', author: { id: 'pl-1' } }, [
      { name: '!cmd', match: () => false, runOn: RUN_ON.AUTHOR, run: vi.fn() },
    ]);
    expect(consumed).toBe(false);
  });

  it('the first matching route wins', async () => {
    table([GM, P1]);
    restoreUser = withUser({ id: 'pl-1', isGM: false });
    const first = vi.fn();
    const second = vi.fn();
    await dispatchChatCommand({ content: '!cmd', author: { id: 'pl-1' } }, [
      { name: 'a', match: () => true, runOn: RUN_ON.AUTHOR, run: first },
      { name: 'b', match: () => true, runOn: RUN_ON.AUTHOR, run: second },
    ]);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it('a command is consumed on a client that stands down, too — it never reaches the narration pipeline', async () => {
    table([GM, P1, P2]);
    expect(await dispatchAs(P2, RUN_ON.AUTHOR)).toEqual({ consumed: true, ran: 0 });
  });

  it('a handler that throws is logged, and the command still counts as consumed', async () => {
    table([GM, P1]);
    restoreUser = withUser({ id: 'pl-1', isGM: false });
    expectConsoleError(/!boom command failed/);
    const consumed = await dispatchChatCommand({ content: '!boom', author: { id: 'pl-1' } }, [
      { name: '!boom', match: () => true, runOn: RUN_ON.AUTHOR, run: () => { throw new Error('kaput'); } },
    ]);
    expect(consumed).toBe(true);
  });
});

describe('RUN_ON.AUTHOR — the typist\'s client only', () => {
  it('runs on the author; every other client stands down', async () => {
    table([GM, GM2, P1, P2]);
    expect((await dispatchAs(P1, RUN_ON.AUTHOR)).ran).toBe(1);
    for (const other of [GM, GM2, P2]) expect((await dispatchAs(other, RUN_ON.AUTHOR)).ran, other.id).toBe(0);
  });

  it('a message with no resolvable author runs where it is seen (programmatic / legacy shapes)', async () => {
    table([GM, P1]);
    restoreUser = withUser({ id: 'pl-1', isGM: false });
    const run = vi.fn();
    await dispatchChatCommand({ content: '!cmd' }, [{ name: '!cmd', match: () => true, runOn: RUN_ON.AUTHOR, run }]);
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe('RUN_ON.CANONICAL_GM — the canonical GM only', () => {
  it('runs on the lowest-id active GM, whoever typed it', async () => {
    table([GM, GM2, P1]);
    expect((await dispatchAs(GM, RUN_ON.CANONICAL_GM)).ran).toBe(1);
    expect((await dispatchAs(GM2, RUN_ON.CANONICAL_GM)).ran).toBe(0);
    expect((await dispatchAs(P1, RUN_ON.CANONICAL_GM)).ran).toBe(0);
    expect(warn).not.toHaveBeenCalled();
  });

  it('a keyed second GM is canonical when the lowest-id GM is keyless', async () => {
    table([GM, GM2, P1], { keyed: ['gm-2'] });
    expect((await dispatchAs(GM2, RUN_ON.CANONICAL_GM)).ran).toBe(1);
    expect((await dispatchAs(GM, RUN_ON.CANONICAL_GM)).ran).toBe(0);
  });

  it('with no GM connected the author is warned — and only the author', async () => {
    table([{ ...GM, active: false }, P1, P2]);
    expect((await dispatchAs(P1, RUN_ON.CANONICAL_GM)).ran).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/!cmd runs on the GM's client, and no GM is connected/);
    warn.mockClear();
    expect((await dispatchAs(P2, RUN_ON.CANONICAL_GM)).ran).toBe(0);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('RUN_ON.CLAUDE — the keyed canonical GM, else the author', () => {
  it('with a keyed GM connected, the canonical GM runs it and the author stands down', async () => {
    table([GM, GM2, P1], { keyed: ['gm-1'] });
    expect((await dispatchAs(GM, RUN_ON.CLAUDE)).ran).toBe(1);
    expect((await dispatchAs(P1, RUN_ON.CLAUDE)).ran).toBe(0);
    expect((await dispatchAs(GM2, RUN_ON.CLAUDE)).ran).toBe(0);
  });

  it('with no keyed GM, the author runs it on their own key — even a player', async () => {
    table([GM, P1, P2]);
    expect((await dispatchAs(P1, RUN_ON.CLAUDE)).ran).toBe(1);
    expect((await dispatchAs(GM, RUN_ON.CLAUDE)).ran).toBe(0);
    expect((await dispatchAs(P2, RUN_ON.CLAUDE)).ran).toBe(0);
  });

  it('a keyed GM who is not connected does not count', async () => {
    table([{ ...GM, active: false }, P1], { keyed: ['gm-1'] });
    expect((await dispatchAs(P1, RUN_ON.CLAUDE)).ran).toBe(1);
  });
});
