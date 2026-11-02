/**
 * PROBE (lead audit) — CACHED-STATE-MUTATED-BEFORE-WRITE.
 *
 * rules/foundry-api.md: `game.settings.get` returns an object setting's cached
 * value by reference; set nothing on it before a write that can fail, or a
 * refused write leaves this client's cache disagreeing with the world (the
 * issue #321 U58 / #309 N09 shape, fixed in a dozen handlers). Three writers
 * still mutate the cached value first:
 *
 *   - src/moves/nextMoveAdd.js clearPersistedNextMoveAdd (~:66): `delete
 *     latest.nextMoveAdd` on the cached state, then the write. Refused, the
 *     canonical GM's cache has no Take a Break +1 while the world still holds
 *     it — the roll already took it, and a later client (or this one after a
 *     reload) takes it again.
 *   - src/oracles/customOracles.js saveCustomOracle (~:264): `state.customOracles
 *     ??= {}; state.customOracles[id] = …` on the cached state, then the write.
 *   - src/oracles/customOracles.js removeCustomOracle (~:374): `delete
 *     state.customOracles[id]` on the cached state, then the write.
 *
 * Each test refuses the one world write and asserts this client's cache still
 * equals the world (what a copy gives) — so each FAILS today.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { clearPersistedNextMoveAdd } from '../../../src/moves/nextMoveAdd.js';
import { saveCustomOracle, removeCustomOracle, _resetCustomOracleSyncHookForTests } from '../../../src/oracles/customOracles.js';
import { ORACLE_TABLES, unregisterOracleTable } from '../../../src/oracles/roller.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;

function refuseNextWrite() {
  const original = game.settings.set;
  const spy = vi.spyOn(game.settings, 'set').mockImplementationOnce(async () => {
    throw new Error('Setting [campaignState] could not be saved: the server refused the write');
  });
  return () => { spy.mockRestore(); game.settings.set = original; };
}

describe('CACHED-STATE-MUTATED-BEFORE-WRITE', () => {
  let restore = null;
  beforeEach(() => { silenceConsoleErrors(); });
  afterEach(() => { restore?.(); restore = null; _resetCustomOracleSyncHookForTests?.(); ChatMessage._reset(); });

  it('Take a Break +1: a refused clear leaves the cached state equal to the world (the grant still pending)', async () => {
    game.settings._store.set(KEY, { currentSessionId: 's1', nextMoveAdd: { value: 1, source: 'take_a_break' } });
    restore = refuseNextWrite();
    await clearPersistedNextMoveAdd();
    expect(game.settings.get(MODULE_ID, 'campaignState').nextMoveAdd).toEqual({ value: 1, source: 'take_a_break' });
  });

  it('custom oracle save: a refused write leaves the cached state without the table (the world has none)', async () => {
    game.settings._store.set(KEY, { currentSessionId: 's1' });
    restore = refuseNextWrite();
    try {
      await saveCustomOracle('probe_table', 'Probe', [{ min: 1, max: 3, text: 'A' }, { min: 4, max: 6, text: 'B' }]);
    } catch { /* the refused write rejects out of the save */ }
    expect(game.settings.get(MODULE_ID, 'campaignState').customOracles?.probe_table).toBeUndefined();
    unregisterOracleTable('probe_table');
  });

  it('custom oracle remove: a refused write leaves the cached table in place (the world still has it)', async () => {
    const entries = [{ min: 1, max: 6, text: 'X' }];
    game.settings._store.set(KEY, { currentSessionId: 's1', customOracles: { probe_keep: { name: 'Keep', entries } } });
    restore = refuseNextWrite();
    try { await removeCustomOracle('probe_keep'); } catch { /* refused */ }
    expect(game.settings.get(MODULE_ID, 'campaignState').customOracles?.probe_keep).toEqual({ name: 'Keep', entries });
    delete ORACLE_TABLES.probe_keep;
  });
});
