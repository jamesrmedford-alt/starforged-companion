/**
 * STARFORGED COMPANION
 * tests/unit/speaker.test.js
 *
 * Coverage for resolveSpeakerActorId — the helper that ties a chat
 * message to the speaking player's character. Pre-fix the pipeline
 * always picked campaignState.characterIds[0] regardless of who typed.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { resolveSpeakerActorId, isAuthoringClient, messageAuthorId } from '../../src/multiplayer/speaker.js';

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
    const msg = { author: { id: 'u1', character: { id: 'actor-bound', type: 'character' } } };
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
      author:  { id: 'u1', character: { id: 'actor-bound', type: 'character' } },
    };
    expect(resolveSpeakerActorId(msg, {})).toBe('actor-token-pc');
  });

  it('skips a non-character speaker (ship token) and falls back to the bound PC', () => {
    const ship = makeActor({ id: 'actor-ship', type: 'starship' });
    global.game.actors._set('actor-ship', ship);

    const msg = {
      speaker: { scene: 's1', token: 't1', actor: 'actor-ship', alias: 'Ship' },
      author:  { id: 'u1', character: { id: 'actor-bound', type: 'character' } },
    };
    expect(resolveSpeakerActorId(msg, {})).toBe('actor-bound');
  });

  it('skips an NPC card speaker (character actor with entityType flag — FOLDER-002)', () => {
    const npc = makeActor({ id: 'actor-npc' });
    npc.flags = { 'starforged-companion': { entityType: 'connection' } };
    global.game.actors._set('actor-npc', npc);

    const msg = {
      speaker: { actor: 'actor-npc', alias: 'Vance' },
      author:  { id: 'u1', character: { id: 'actor-bound', type: 'character' } },
    };
    expect(resolveSpeakerActorId(msg, {})).toBe('actor-bound');
  });

  it('skips a speaker id whose actor no longer exists', () => {
    const msg = {
      speaker: { actor: 'actor-deleted' },
      author:  { id: 'u1', character: { id: 'actor-bound', type: 'character' } },
    };
    expect(resolveSpeakerActorId(msg, {})).toBe('actor-bound');
  });

  it('still reaches the campaignState fallback when speaker and author both resolve nothing', () => {
    const msg = { speaker: { actor: null, alias: 'Gamemaster' }, author: { id: 'u1' } };
    expect(resolveSpeakerActorId(msg, { characterIds: ['actor-fallback'] })).toBe('actor-fallback');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The bound User#character is PC-validated like the token (issue #321 U24)
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveSpeakerActorId — a user whose assigned character is not a PC', () => {
  const MODULE_ID = 'starforged-companion';

  function setup() {
    const pc   = { id: 'pc-pat', type: 'character', name: 'Kira', flags: {},
      testUserPermission: (user, level) => user?.id === 'pl-1' && level === 'OWNER' };
    const ship = { id: 'ship-1', type: 'starship', name: 'ISV Vesta', flags: {},
      testUserPermission: () => true };   // the crew's ship: every player owns it
    const npc  = { id: 'npc-1', type: 'character', name: 'Vance', flags: { [MODULE_ID]: { entityType: 'connection' } },
      testUserPermission: () => true };
    for (const a of [pc, ship, npc]) global.game.actors._set(a.id, a);
    return { pc, ship, npc };
  }

  it('is attributed to their PC, not the starship assigned as their character', () => {
    const { ship } = setup();
    const msg = { speaker: { actor: null, alias: 'Pat' }, author: { id: 'pl-1', character: ship } };
    expect(resolveSpeakerActorId(msg, {})).toBe('pc-pat');
  });

  it('is attributed to their PC, not the NPC card assigned as their character', () => {
    const { npc } = setup();
    const msg = { speaker: { actor: null, alias: 'Pat' }, author: { id: 'pl-1', character: npc } };
    expect(resolveSpeakerActorId(msg, {})).toBe('pc-pat');
  });

  it('control: the same ship as a SELECTED token (speaker.actor) falls through to the PC', () => {
    setup();
    const msg = { speaker: { actor: 'ship-1', alias: 'ISV Vesta' }, author: { id: 'pl-1', character: null } };
    expect(resolveSpeakerActorId(msg, {})).toBe('pc-pat');
  });

  it('a bound PC is still honoured before the ownership scan', () => {
    const { pc } = setup();
    const other = { id: 'pc-other', type: 'character', name: 'Ren', flags: {}, testUserPermission: () => true };
    global.game.actors._setAll([other, pc]);   // the ownership scan would find Ren first
    const msg = { speaker: { actor: null }, author: { id: 'pl-1', character: pc } };
    expect(resolveSpeakerActorId(msg, {})).toBe('pc-pat');
  });
});


describe('messageAuthorId', () => {
  it.each([
    [{ author: { id: 'u1' } },          'u1'],
    [{ author: 'u2' },                  'u2'],
    [{ user: { id: 'u3' } },            'u3'],
    [{ user: 'u4' },                    'u4'],
    [{ _source: { author: 'u5' } },     'u5'],
  ])('reads %j', (message, expected) => {
    expect(messageAuthorId(message)).toBe(expected);
  });

  it('ignores an author object without a string id', () => {
    expect(messageAuthorId({ author: { name: 'Nobody' } })).toBeNull();
    expect(messageAuthorId({ author: { id: 7 } })).toBeNull();
  });

  it('returns null for author-less / null messages', () => {
    expect(messageAuthorId({ content: '!x' })).toBeNull();
    expect(messageAuthorId(null)).toBeNull();
  });
});

describe('isAuthoringClient', () => {
  it('is true on the client whose user wrote the message', () => {
    const restore = withUser({ id: 'u1' });
    try {
      expect(isAuthoringClient({ author: { id: 'u1' } })).toBe(true);
    } finally { restore(); }
  });

  it('is false on every other client', () => {
    const restore = withUser({ id: 'u2' });
    try {
      expect(isAuthoringClient({ author: { id: 'u1' } })).toBe(false);
      expect(isAuthoringClient({ user: 'u1' })).toBe(false);
    } finally { restore(); }
  });

  it('treats an author-less (programmatic / legacy) message as authored here', () => {
    expect(isAuthoringClient({ content: '!x' })).toBe(true);
  });
});
