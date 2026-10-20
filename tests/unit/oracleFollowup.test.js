/**
 * STARFORGED COMPANION
 * tests/unit/oracleFollowup.test.js
 *
 * The oracle narration follow-up runs exactly once, where a Claude key lives
 * (src/oracles/oracleFollowup.js): the keyed canonical GM via the
 * "oracle.narrate" relay whenever a keyed GM is connected (its narrator
 * side-data applies only there), else the authoring client when it holds a
 * key, else nowhere (debug-logged).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/narration/narrator.js', async (importOriginal) => ({
  ...(await importOriginal()),
  narrateOracleFollowup: vi.fn(async () => 'The airlock groans.'),
}));

import { requestOracleNarration, narrateOracleFollowupOnGm } from '../../src/oracles/oracleFollowup.js';
import { narrateOracleFollowup } from '../../src/narration/narrator.js';
import { GM_RELAY_SOCKET, _resetGmRelayForTests } from '../../src/multiplayer/gmRelay.js';

const MODULE_ID = 'starforged-companion';
const GM  = { id: 'gm-1', isGM: true,  active: true };
const GM2 = { id: 'gm-2', isGM: true,  active: true };
const P1  = { id: 'pl-1', isGM: false, active: true };

const ARGS = {
  kind: 'oracle_yes_no', oracleName: 'Ask the Oracle (50/50)', question: 'does it hold',
  rolledLine: 'd100 = 12 ≤ 50 → YES', speakerActorId: 'pc-b',
};

function setUsers(users, currentUserId) {
  global.game.users = Object.assign([...users], {
    get: (id) => users.find(u => u.id === id) ?? null,
  });
  global.game.user = users.find(u => u.id === currentUserId) ?? null;
}

beforeEach(() => {
  vi.useFakeTimers();
  narrateOracleFollowup.mockClear();
  game.socket._reset();
  game.settings._store.delete(`${MODULE_ID}.claudeApiKey`);
  game.settings._store.delete(`${MODULE_ID}.keyedGmUserIds`);
  game.settings._store.set(`${MODULE_ID}.campaignState`, { currentSessionId: 's1' });
  _resetGmRelayForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('requestOracleNarration', () => {
  const keyGms = (...ids) => game.settings._store.set(`${MODULE_ID}.keyedGmUserIds`, ids);
  const relayed = () => (game.socket._emitted ?? []).filter(e => e.payload?.kind === 'gmRelay.oracle.narrate');

  it('keyed GM connected: a KEYED player relays to the GM (side-data applies there) — no local narration', async () => {
    keyGms('gm-1');
    setUsers([GM, P1], 'pl-1');
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-player');
    requestOracleNarration(ARGS);
    expect(game.socket._emitted ?? []).toHaveLength(0);     // deferred a macrotask
    await vi.runAllTimersAsync();
    expect(narrateOracleFollowup).not.toHaveBeenCalled();
    expect(game.socket._emitted).toEqual([{
      event:   GM_RELAY_SOCKET,
      payload: { kind: 'gmRelay.oracle.narrate', payload: { ...ARGS }, requesterId: 'pl-1' },
    }]);
  });

  it('keyed GM connected: a keyless player relays to the GM', async () => {
    keyGms('gm-1');
    setUsers([GM, P1], 'pl-1');
    requestOracleNarration(ARGS);
    await vi.runAllTimersAsync();
    expect(relayed()).toHaveLength(1);
    expect(narrateOracleFollowup).not.toHaveBeenCalled();
  });

  it('on the keyed canonical GM itself the narration runs locally through the relay queue', async () => {
    keyGms('gm-1');
    setUsers([GM, P1], 'gm-1');
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-gm');
    requestOracleNarration(ARGS);
    await vi.runAllTimersAsync();
    expect(narrateOracleFollowup).toHaveBeenCalledTimes(1);
    expect(narrateOracleFollowup.mock.calls[0][0]).toMatchObject({
      kind: 'oracle_yes_no', speakerActorId: 'pc-b', campaignState: { currentSessionId: 's1' },
    });
    expect(game.socket._emitted ?? []).toHaveLength(0);
  });

  it('a keyed non-canonical GM relays to the keyed canonical GM instead of narrating', async () => {
    keyGms('gm-1', 'gm-2');
    setUsers([GM, GM2, P1], 'gm-2');
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-gm2');
    requestOracleNarration(ARGS);
    await vi.runAllTimersAsync();
    expect(narrateOracleFollowup).not.toHaveBeenCalled();
    expect(relayed()).toHaveLength(1);
  });

  it('no keyed GM, keyed author: narrates locally (after the raw card) and logs that its side-data goes to the GM', async () => {
    setUsers([GM, P1], 'pl-1');
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    requestOracleNarration(ARGS);
    expect(narrateOracleFollowup).not.toHaveBeenCalled();   // deferred a macrotask
    await vi.runAllTimersAsync();
    expect(narrateOracleFollowup).toHaveBeenCalledTimes(1);
    expect(game.socket._emitted ?? []).toHaveLength(0);
    expect(debug.mock.calls.some(c => /side-data .* is relayed to the canonical GM/.test(String(c[0])))).toBe(true);
  });

  it('no keyed GM, keyless author: skips quietly (debug, no toast, no relay)', async () => {
    setUsers([GM, P1], 'pl-1');
    const warn  = vi.spyOn(ui.notifications, 'warn');
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    requestOracleNarration(ARGS);
    await vi.runAllTimersAsync();
    expect(narrateOracleFollowup).not.toHaveBeenCalled();
    expect(game.socket._emitted ?? []).toHaveLength(0);
    expect(warn).not.toHaveBeenCalled();
    expect(debug.mock.calls.some(c => /narration skipped/.test(String(c[0])))).toBe(true);
  });

  it('skips quietly (no toast) when there is no key and no GM', async () => {
    setUsers([P1], 'pl-1');
    const warn = vi.spyOn(ui.notifications, 'warn');
    requestOracleNarration(ARGS);
    await vi.runAllTimersAsync();
    expect(narrateOracleFollowup).not.toHaveBeenCalled();
    expect(game.socket._emitted ?? []).toHaveLength(0);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('narrateOracleFollowupOnGm (relay handler)', () => {
  it('narrates with the GM-side campaignState and the relayed speaker', async () => {
    setUsers([GM, P1], 'gm-1');
    const text = await narrateOracleFollowupOnGm(ARGS, { requesterId: 'pl-1' });
    expect(text).toBe('The airlock groans.');
    expect(narrateOracleFollowup.mock.calls[0][0]).toMatchObject({
      oracleName: 'Ask the Oracle (50/50)', speakerActorId: 'pc-b', campaignState: { currentSessionId: 's1' },
    });
  });

  it('logs and returns null when narration throws', async () => {
    setUsers([GM, P1], 'gm-1');
    narrateOracleFollowup.mockRejectedValueOnce(new Error('boom'));
    const warn = vi.spyOn(console, 'warn');
    expect(await narrateOracleFollowupOnGm(ARGS, {})).toBeNull();
    expect(warn.mock.calls.some(c => /narration failed/.test(String(c[0])))).toBe(true);
  });
});
