/**
 * STARFORGED COMPANION
 * tests/unit/privateLinesRelay.test.js
 *
 * A player's Private Lines live in their client-scoped settings; the narrator
 * reads campaignState.safety.privateLines, which only a GM can write. Before
 * the 2026-10 audit syncSafetyToCampaignState returned early on player
 * clients, so a player's Private Lines never reached the narrator
 * (SAFETY-PRIVATE-LINES-PLAYER). They now relay to the canonical GM.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { applyPrivateLinesSync } from '../../src/ui/settingsPanel.js';
import { runGmAction } from '../../src/multiplayer/gmRelay.js';

const MODULE_ID = 'starforged-companion';

function state() {
  return game.settings._store.get(`${MODULE_ID}.campaignState`);
}

beforeEach(() => {
  game.settings._store.clear();
  game.settings._store.set(`${MODULE_ID}.campaignState`, {
    safety: { lines: ['global'], veils: [], privateLines: [{ playerId: 'pl-2', lines: ['theirs'] }] },
  });
});

describe('applyPrivateLinesSync (GM_ACTIONS "safety.syncPrivateLines")', () => {
  it('writes the requesting player\'s entry and keeps other players\' entries', async () => {
    expect(await applyPrivateLinesSync({ lines: ['spiders', '  '] }, { requesterId: 'pl-1' })).toBe(true);
    expect(state().safety.privateLines).toEqual([
      { playerId: 'pl-2', lines: ['theirs'] },
      { playerId: 'pl-1', lines: ['spiders'] },
    ]);
    expect(state().safety.lines).toEqual(['global']);
  });

  it('replaces an existing entry and removes it when the list is empty', async () => {
    await applyPrivateLinesSync({ lines: ['a'] }, { requesterId: 'pl-2' });
    expect(state().safety.privateLines).toEqual([{ playerId: 'pl-2', lines: ['a'] }]);
    await applyPrivateLinesSync({ lines: [] }, { requesterId: 'pl-2' });
    expect(state().safety.privateLines).toEqual([]);
  });

  it('keys the entry on the relay requester, never on payload data', async () => {
    await applyPrivateLinesSync({ lines: ['x'], playerId: 'pl-2' }, { requesterId: 'pl-1' });
    const ids = state().safety.privateLines.map(e => e.playerId);
    expect(ids).toEqual(['pl-2', 'pl-1']);
    expect(state().safety.privateLines.find(e => e.playerId === 'pl-2').lines).toEqual(['theirs']);
  });

  it('ignores a request with no requester', async () => {
    silenceConsoleErrors();
    expect(await applyPrivateLinesSync({ lines: ['x'] }, {})).toBe(false);
    expect(state().safety.privateLines).toEqual([{ playerId: 'pl-2', lines: ['theirs'] }]);
  });

  it('is reachable through the GM relay table', async () => {
    global.game.users = Object.assign([{ id: 'pl-1', isGM: false, active: true }], {
      get: (id) => (id === 'pl-1' ? { id: 'pl-1', isGM: false } : null),
    });
    await runGmAction('safety.syncPrivateLines', { lines: ['heights'] }, { requesterId: 'pl-1' });
    expect(state().safety.privateLines.at(-1)).toEqual({ playerId: 'pl-1', lines: ['heights'] });
  });
});
