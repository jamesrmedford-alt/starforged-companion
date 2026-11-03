/**
 * PROBE — MC-09 NEXT-MOVE-ADD-CACHED-CLEAR (eighth bug audit, moves-core)
 *
 * What the user does: takes Take a Break → "Move on" (+1 on the next action
 * roll, campaignState.nextMoveAdd); the next move's pipeline takes the +1 and
 * then clears the grant from the store — and that world write is refused (a
 * server error, a dropped connection: rules/foundry-api.md).
 *
 * What happens: nextMoveAdd.js clearPersistedNextMoveAdd deletes nextMoveAdd
 * from the object game.settings.get returned — the GM client's CACHED value —
 * before the write, and only warns when the write is refused. The GM's cache
 * now says the +1 was used while the world still holds it: client and world
 * disagree (the U58 shape issue #321 fixed for applyTakeBreak itself, which
 * writes a copy — not for this clear). After a reload the +1 is back and is
 * added to another roll: it was already added to this one before the clear
 * (takeNextMoveAdd runs first), so a refused clear double-spends it, unlike
 * the roller's +1 (consumeNextMoveBonus), which is claimed on the store first
 * and adds nothing when the claim is refused.
 *
 * What should happen: write a copy; a refused clear leaves the cache as the
 * world is (and, like consumeNextMoveBonus, the add should only be taken once
 * its claim has landed).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { clearPersistedNextMoveAdd } from '../../../src/moves/nextMoveAdd.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;

afterEach(() => { vi.restoreAllMocks(); });

describe('clearing the used Take a Break +1', () => {
  it('control: a landed clear removes it from the store', async () => {
    game.settings._store.set(KEY, { ...CampaignStateSchema, nextMoveAdd: { value: 1, source: 'take_a_break' } });
    await clearPersistedNextMoveAdd();
    expect(game.settings._store.get(KEY).nextMoveAdd).toBeUndefined();
  });

  it('a refused clear leaves this client\'s cached campaignState as the world holds it', async () => {
    const world = { ...CampaignStateSchema, nextMoveAdd: { value: 1, source: 'take_a_break' } };
    game.settings._store.set(KEY, world);
    vi.spyOn(game.settings, 'set').mockRejectedValueOnce(new Error('The server refused the write'));
    await clearPersistedNextMoveAdd();
    // The world never saw the delete; get() must not say otherwise.
    expect(game.settings.get(MODULE_ID, 'campaignState').nextMoveAdd).toEqual({ value: 1, source: 'take_a_break' });
  });
});
