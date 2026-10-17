/**
 * STARFORGED COMPANION
 * tests/unit/factContinuityChatCommands.test.js
 *
 * `!truth` / `!state` after the 2026-10 multiplayer split
 * (src/factContinuity/chatCommands.js): the authoring client validates and
 * relays the raw text; the canonical GM applies it with a permission context
 * built from the REQUESTER (ctx.requesterIsGM) — never from game.user, which
 * on the relay path is the GM. Before the split a player's command only landed
 * because the GM's client re-ran it with GM authority.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  parseFactContinuityCommand,
  handleFactContinuityCommand,
  applyFactContinuityCommand,
} from '../../src/factContinuity/chatCommands.js';
import { GM_RELAY_SOCKET } from '../../src/multiplayer/gmRelay.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const MODULE_ID = 'starforged-companion';
const GM = { id: 'gm-1', isGM: true,  active: true };
const P1 = { id: 'pl-1', isGM: false, active: true };

function setUsers(users, currentUserId) {
  global.game.users = Object.assign([...users], {
    get: (id) => users.find(u => u.id === id) ?? null,
  });
  global.game.user = users.find(u => u.id === currentUserId) ?? null;
}

function state() {
  return game.settings._store.get(`${MODULE_ID}.campaignState`);
}

beforeEach(() => {
  ChatMessage._reset();
  game.socket._reset();
  game.settings._store.delete(`${MODULE_ID}.factContinuity.enabled`);
  game.settings._store.set(`${MODULE_ID}.campaignState`, {
    ...CampaignStateSchema, sceneTruths: [], sceneState: { bySubject: {} },
    currentSceneId: 'scene-1',
  });
});

describe('parseFactContinuityCommand', () => {
  it.each([
    ['!truth strike abcd1234',                  { domain: 'truth', verb: 'strike', rest: 'abcd1234' }],
    ['!truth set Vance Always lies',            { domain: 'truth', verb: 'set', subject: 'Vance', fact: 'Always lies' }],
    ['!truth set "Covenant officer" Is armed',  { domain: 'truth', verb: 'set', subject: 'Covenant officer', fact: 'Is armed' }],
    ['!state strike scene lighting',            { domain: 'state', verb: 'strike', subject: 'scene', attribute: 'lighting' }],
    ['!state set scene lighting=red emergency', { domain: 'state', verb: 'set', subject: 'scene', attribute: 'lighting', value: 'red emergency' }],
  ])('parses %s', (text, expected) => {
    expect(parseFactContinuityCommand(text)).toMatchObject({ ok: true, ...expected });
  });

  it.each([
    ['!truth',                   /!truth strike <id>/],
    ['!truth set "unterminated', /!truth set <subject> <fact-text>/],
    ['!state strike scene',      /!state strike <subject> <attribute>/],
    ['!state set scene lighting',/!state set <subject> <attribute>=<value>/],
  ])('rejects %s with its usage line', (text, usage) => {
    const parsed = parseFactContinuityCommand(text);
    expect(parsed.ok).toBe(false);
    expect(parsed.usage).toMatch(usage);
  });
});

describe('handleFactContinuityCommand — authoring client', () => {
  it('relays a valid command to the GM as plain text', async () => {
    setUsers([GM, P1], 'pl-1');
    await handleFactContinuityCommand({ content: '!truth set Vance Always lies' });
    expect(game.socket._emitted).toEqual([{
      event: GM_RELAY_SOCKET,
      payload: {
        kind: 'gmRelay.factContinuity.command',
        payload: { text: '!truth set Vance Always lies' },
        requesterId: 'pl-1',
      },
    }]);
    // Nothing applied on the player client.
    expect(state().sceneTruths).toHaveLength(0);
  });

  it('keeps a usage warning local and relays nothing', async () => {
    setUsers([GM, P1], 'pl-1');
    const warn = vi.spyOn(ui.notifications, 'warn');
    await handleFactContinuityCommand({ content: '!state set scene lighting' });
    expect(warn).toHaveBeenCalledWith('Usage: !state set <subject> <attribute>=<value>');
    expect(game.socket._emitted ?? []).toHaveLength(0);
  });

  it('refuses when Fact Continuity is disabled', async () => {
    setUsers([GM, P1], 'pl-1');
    game.settings._store.set(`${MODULE_ID}.factContinuity.enabled`, false);
    const warn = vi.spyOn(ui.notifications, 'warn');
    await handleFactContinuityCommand({ content: '!truth set Vance Always lies' });
    expect(warn.mock.calls[0][0]).toMatch(/disabled/);
    expect(game.socket._emitted ?? []).toHaveLength(0);
  });

  it('applies locally on the canonical GM and posts the result card', async () => {
    setUsers([GM, P1], 'gm-1');
    await handleFactContinuityCommand({ content: '!truth set Vance Always lies' });
    expect(game.socket._emitted ?? []).toHaveLength(0);
    expect(state().sceneTruths).toHaveLength(1);
    const card = ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.factContinuityCommand);
    expect(card.flags[MODULE_ID]).toMatchObject({ domain: 'truth', verb: 'set' });
    expect(card.content).toContain('Truth recorded');
  });
});

describe('applyFactContinuityCommand — canonical GM handler, requester permissions', () => {
  beforeEach(() => setUsers([GM, P1], 'gm-1'));

  it('records a player-asserted truth as the player', async () => {
    await applyFactContinuityCommand({ text: '!truth set Vance Always lies' }, { requesterIsGM: false });
    expect(state().sceneTruths[0].asserter).toBe('player');
  });

  it('a player cannot strike a GM-asserted truth even though the handler runs on the GM client', async () => {
    await applyFactContinuityCommand({ text: '!truth set Vance Is the traitor' }, { requesterIsGM: true });
    const id = state().sceneTruths[0].id;

    const line = await applyFactContinuityCommand({ text: `!truth strike ${id.slice(0, 8)}` }, { requesterIsGM: false });
    expect(line).toMatch(/No matching truth/);
    expect(state().sceneTruths[0].retracted ?? false).toBe(false);
  });

  it('a GM requester can strike it', async () => {
    await applyFactContinuityCommand({ text: '!truth set Vance Is the traitor' }, { requesterIsGM: true });
    const id = state().sceneTruths[0].id;
    const line = await applyFactContinuityCommand({ text: `!truth strike ${id.slice(0, 8)}` }, { requesterIsGM: true });
    expect(line).toMatch(/struck/);
  });

  it('sets and strikes a state value', async () => {
    await applyFactContinuityCommand({ text: '!state set scene lighting=red emergency' }, { requesterIsGM: false });
    const card1 = ChatMessage._created.at(-1);
    expect(card1.content).toContain('State recorded');
    const line = await applyFactContinuityCommand({ text: '!state strike scene lighting' }, { requesterIsGM: false });
    expect(line).toMatch(/struck/);
  });

  it('ignores a malformed relay with a warning and posts nothing', async () => {
    const warn = vi.spyOn(console, 'warn');
    const out = await applyFactContinuityCommand({ text: '!truth bogus' }, { requesterIsGM: true });
    expect(out).toBeNull();
    expect(ChatMessage._created).toHaveLength(0);
    expect(warn.mock.calls.some(c => /malformed relayed command/.test(String(c[0])))).toBe(true);
  });
});
