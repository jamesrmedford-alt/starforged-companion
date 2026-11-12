/**
 * ENTITY-ID-PUSHED-ON-CACHE (known-issues; pre-existing). Entity creators
 * pushed their new id onto the caller's copy — often the cached setting —
 * so a refused registration left the GM's cache listing an id the world did
 * not have. Issue #331 X35 made the creators register in the store first and
 * push only once it landed (tests/unit/createIdCachedMutate.test.js); the
 * last thing set on the caller's object before the write — its id list made
 * an array when it had none — now waits for the write too.
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeEach } from 'vitest';
import { createConnection } from '../../src/entities/connection.js';
import { registerEntityId } from '../../src/entities/registry.js';

const MODULE = 'starforged-companion';
const KEY = `${MODULE}.campaignState`;
const cached = () => global.game.settings.get(MODULE, 'campaignState');

let realSet;
beforeEach(() => {
  global.game.actors._reset();
  global.game.folders._reset?.();
  global.game.user = { isGM: true, id: 'test-user-gm' };
  global.ChatMessage._reset();
  global.game.settings._store.clear();
  // A world whose campaignState has never listed a connection.
  global.game.settings._store.set(KEY, { currentSessionId: 'sess-1', dismissedEntities: [] });
  realSet = global.game.settings.set;
  return () => { global.game.settings.set = realSet; };
});

const refuseCampaignState = () => {
  global.game.settings.set = async (mod, key, val) => {
    if (key === 'campaignState') throw new Error('Setting [campaignState] could not be saved: the server refused the write');
    return realSet(mod, key, val);
  };
};

describe('ENTITY-ID-PUSHED-ON-CACHE — a refused registration leaves the GM\'s cached campaignState as the world has it', () => {
  it('createConnection handed the cached setting: nothing is set on it — no id, no list', async () => {
    silenceConsoleErrors();
    refuseCampaignState();
    const before = cached();
    await expect(createConnection({ name: 'Vex' }, before)).rejects.toThrow(/refused/);
    expect(cached()).toBe(before);
    expect(before.connectionIds).toBeUndefined();
  });

  it('control: a registration that lands lists the id in the store and on the caller\'s copy', async () => {
    const copy = { currentSessionId: 'sess-1' };
    expect(await registerEntityId(copy, 'connectionIds', 'act-1')).toBe(true);
    expect(copy.connectionIds).toEqual([]);              // made an array; the creator pushes
    expect(cached().connectionIds).toEqual(['act-1']);
  });
});
