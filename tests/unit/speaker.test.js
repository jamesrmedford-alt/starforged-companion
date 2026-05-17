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
