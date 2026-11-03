/**
 * PROBE SC — API-LOG-PLAYER-BUFFER (LATENT, unbounded growth)
 *
 * What the user does: a player plays with their own Claude key (the Private
 * Channel, or narration on the player's key when no keyed GM is connected) —
 * every reply runs api-proxy.js → logApiTransaction.
 *
 * What happens: logApiTransaction (logging/apiTransactionLog.js) pushes the
 * entry onto the module-level `pending` buffer whenever the client is not a
 * GM — `if (!game.ready || !game.user.isGM) { pending.push(html); return; }`
 * — even after `ready`. The buffer is drained only once, by
 * flushApiTransactionLogBuffer in the ready hook, so on a player's client
 * every later call is kept for the life of the page and never written or
 * dropped. The header says "Only the GM can write; non-GM calls are silently
 * dropped."
 *
 * What should happen: after ready, a non-GM client drops the entry (or relays
 * it) — nothing accumulates.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { logApiTransaction, flushApiTransactionLogBuffer, pending, _reset } from '../../../src/logging/apiTransactionLog.js';

const CALL = { model: 'claude-haiku-4-5', inputTokens: 900, cacheWriteTokens: 0, cacheReadTokens: 0, outputTokens: 120, durationMs: 800 };

beforeEach(() => { _reset(); });
afterEach(() => { _reset(); vi.unstubAllGlobals(); });

describe('PROBE API-LOG-PLAYER-BUFFER', () => {
  it('control: before ready a GM buffers, and the ready flush drains it', async () => {
    vi.stubGlobal('game', { ready: false, user: { isGM: true }, journal: { get: () => null, getName: () => null } });
    logApiTransaction(CALL);
    expect(pending.length).toBe(1);
  });

  it("a player's calls after ready are not kept in the buffer for the life of the page", async () => {
    vi.stubGlobal('game', { ready: false, user: { isGM: false } });
    await flushApiTransactionLogBuffer();              // the ready hook — the one drain
    game.ready = true;
    for (let i = 0; i < 50; i++) logApiTransaction(CALL);   // a session of Private Channel turns
    // Actual: 50 — and it only grows; nothing writes or clears it again.
    expect(pending.length).toBe(0);
  });
});
