// tests/unit/apiLogPlayerBuffer.test.js
// A player's API transactions after ready are not buffered (issue #326
// W77). logApiTransaction pushed every entry onto the pre-ready buffer when
// the client was not ready OR not a GM, and only the ready flush drained it:
// a player on their own key (the Private Channel) accumulated every call for
// the life of the page. After ready a player's entry is now dropped; only a
// GM writes the log.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { logApiTransaction, flushApiTransactionLogBuffer, pending, _reset } from '../../src/logging/apiTransactionLog.js';

const CALL = { model: 'claude-haiku-4-5', inputTokens: 900, cacheWriteTokens: 0, cacheReadTokens: 0, outputTokens: 120, durationMs: 800 };

beforeEach(() => { _reset(); });
afterEach(() => { _reset(); vi.unstubAllGlobals(); });

describe('a player\'s API calls after ready are not buffered (issue #326 W77)', () => {
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
    // It held 50 — and only grew; nothing wrote or cleared it again.
    expect(pending.length).toBe(0);
  });
  it('control: a GM after ready writes, not buffers', async () => {
    vi.stubGlobal('game', { ready: true, user: { isGM: true }, journal: { get: () => null, getName: () => null } });
    logApiTransaction(CALL);
    expect(pending.length).toBe(0);
  });
});
