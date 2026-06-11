/**
 * STARFORGED COMPANION
 * tests/unit/speaker.test.js
 *
 * Coverage for resolveSpeakerActorId — the helper that ties a chat
 * message to the speaking player's character. Pre-fix the pipeline
 * always picked campaignState.characterIds[0] regardless of who typed.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { resolveSpeakerActorId } from '../../src/multiplayer/speaker.js';

beforeEach(() => {
  global.game.actors?._reset?.();
});

function makeMessage(authorOverrides) {
  return { author: { id: 'u1', ...authorOverrides } };
}
function makeActor({ id, type = 'character', ownership = {}, testUserPermission }) {
  return { id, type, name: `Actor-${id}`, ownership, testUserPermission };
}

describe('resolveSpeakerActorId', () => {
  it('returns User.character.id when the user has a bound PC', () => {
    const msg = { author: { id: 'u1', character: { id: 'actor-bound' } } };
    expect(resolveSpeakerActorId(msg, {})).toBe('actor-bound');
  });

  it('falls back to ownership scan when User.character is not set', () => {
    const owned = makeActor({
      id: 'actor-owned',
      testUserPermission: (user, level) => user?.id === 'u1' && level === 'OWNER',
    });
    global.game.actors._set('actor-owned', owned);

    const msg = makeMessage({});
    expect(resolveSpeakerActorId(msg, {})).toBe('actor-owned');
  });

  it('falls back to ownership-map inspection when testUserPermission is absent', () => {
    // Test environment: no testUserPermission method. Helper inspects
    // the raw ownership map (Foundry's storage format) directly.
    const owned = makeActor({
      id: 'actor-map',
      ownership: { u1: 3 },  // 3 === OWNER
    });
    global.game.actors._set('actor-map', owned);

    const msg = makeMessage({});
    expect(resolveSpeakerActorId(msg, {})).toBe('actor-map');
  });

  it('skips non-character actors during ownership scan', () => {
    const ship = makeActor({ id: 'ship-1', type: 'starship', ownership: { u1: 3 } });
    global.game.actors._set('ship-1', ship);

    const msg = makeMessage({});
    expect(resolveSpeakerActorId(msg, {})).toBeNull();
  });

  it('falls through to campaignState.characterIds[0] when neither User.character nor ownership matches', () => {
    const msg = makeMessage({});
    const state = { characterIds: ['fallback-1', 'fallback-2'] };
    expect(resolveSpeakerActorId(msg, state)).toBe('fallback-1');
  });

  it('returns null when there is no speaker info anywhere', () => {
    expect(resolveSpeakerActorId(null, null)).toBeNull();
    expect(resolveSpeakerActorId({}, {})).toBeNull();
  });

  it('returns the FIRST owned PC when a user owns multiple — deterministic for 2-PC players', () => {
    const a = makeActor({ id: 'actor-A', ownership: { u1: 3 } });
    const b = makeActor({ id: 'actor-B', ownership: { u1: 3 } });
    global.game.actors._setAll([a, b]);

    const msg = makeMessage({});
    expect(resolveSpeakerActorId(msg, {})).toBe('actor-A');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Token-selection priority — message.speaker.actor (multiplayer prep)
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveSpeakerActorId — token selection (message.speaker)', () => {
  it('prefers the selected token PC over the author\'s bound character', () => {
    const pc = makeActor({ id: 'actor-token-pc' });
    global.game.actors._set('actor-token-pc', pc);

    const msg = {
      speaker: { scene: 's1', token: 't1', actor: 'actor-token-pc', alias: 'Kira Chen' },
      author:  { id: 'u1', character: { id: 'actor-bound' } },
    };
    expect(resolveSpeakerActorId(msg, {})).toBe('actor-token-pc');
  });

  it('skips a non-character speaker (ship token) and falls back to the bound PC', () => {
    const ship = makeActor({ id: 'actor-ship', type: 'starship' });
    global.game.actors._set('actor-ship', ship);

    const msg = {
      speaker: { scene: 's1', token: 't1', actor: 'actor-ship', alias: 'Ship' },
      author:  { id: 'u1', character: { id: 'actor-bound' } },
    };
    expect(resolveSpeakerActorId(msg, {})).toBe('actor-bound');
  });

  it('skips an NPC card speaker (character actor with entityType flag — FOLDER-002)', () => {
    const npc = makeActor({ id: 'actor-npc' });
    npc.flags = { 'starforged-companion': { entityType: 'connection' } };
    global.game.actors._set('actor-npc', npc);

    const msg = {
      speaker: { actor: 'actor-npc', alias: 'Vance' },
      author:  { id: 'u1', character: { id: 'actor-bound' } },
    };
    expect(resolveSpeakerActorId(msg, {})).toBe('actor-bound');
  });

  it('skips a speaker id whose actor no longer exists', () => {
    const msg = {
      speaker: { actor: 'actor-deleted' },
      author:  { id: 'u1', character: { id: 'actor-bound' } },
    };
    expect(resolveSpeakerActorId(msg, {})).toBe('actor-bound');
  });

  it('still reaches the campaignState fallback when speaker and author both resolve nothing', () => {
    const msg = { speaker: { actor: null, alias: 'Gamemaster' }, author: { id: 'u1' } };
    expect(resolveSpeakerActorId(msg, { characterIds: ['actor-fallback'] })).toBe('actor-fallback');
  });
});
