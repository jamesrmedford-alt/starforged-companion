/**
 * STARFORGED COMPANION
 * tests/unit/permissionStubs.test.js
 *
 * The permission-faithful Foundry stubs (tests/setup.js +
 * tests/helpers/foundryPermissions.js, issue #282 item 1). Before them every
 * stubbed write succeeded, so a player-side write Foundry refuses passed in
 * tests: the player X-Card's world-setting write (XCARD-PLAYER-NOOP), a
 * player's click updating a GM-authored move card (the Burn / Improve
 * double-apply). These tests pin the rules themselves and the opt-out.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { scanSettingScopes, staticSettingScope } from '../helpers/settingScopes.js';

const MODULE_ID = 'starforged-companion';

let restoreUser;
beforeEach(() => {
  restoreUser = withUser({ isGM: true, id: 'test-user-gm', name: 'Gina' });
  game.settings._store.clear();
  game.settings._registry.clear();
  ChatMessage._reset();
});
afterEach(() => restoreUser());

// ─────────────────────────────────────────────────────────────────────────────
// Settings
// ─────────────────────────────────────────────────────────────────────────────

describe('game.settings.set — world settings are GM-write only', () => {
  it('a GM writes a world-scoped setting', async () => {
    await game.settings.set(MODULE_ID, 'campaignState', { xCardActive: true });
    expect(game.settings.get(MODULE_ID, 'campaignState')).toEqual({ xCardActive: true });
  });

  it('a player\'s world-scoped write rejects with Foundry\'s wording and stores nothing', async () => {
    withUser({ isGM: false, id: 'pl-1', name: 'Pat' });
    await expect(game.settings.set(MODULE_ID, 'campaignState', { xCardActive: true }))
      .rejects.toThrow(/User Pat lacks permission to update Setting \[starforged-companion\.campaignState\]/);
    expect(game.settings._store.has(`${MODULE_ID}.campaignState`)).toBe(false);
  });

  it('a player writes their own client-scoped setting', async () => {
    withUser({ isGM: false, id: 'pl-1' });
    await game.settings.set(MODULE_ID, 'claudeApiKey', 'sk-ant-player');
    await game.settings.set(MODULE_ID, 'privateLines', ['spiders']);
    expect(game.settings.get(MODULE_ID, 'claudeApiKey')).toBe('sk-ant-player');
    expect(game.settings.get(MODULE_ID, 'privateLines')).toEqual(['spiders']);
  });

  it('a scope registered by the test wins over the static scan', async () => {
    game.settings.register(MODULE_ID, 'campaignState', { scope: 'client' });
    withUser({ isGM: false, id: 'pl-1' });
    await expect(game.settings.set(MODULE_ID, 'campaignState', {})).resolves.toEqual({});
  });

  it('an unregistered key is refused to a player (its scope is unknown) but allowed to a GM', async () => {
    await game.settings.set(MODULE_ID, 'noSuchSetting', 1);
    withUser({ isGM: false, id: 'pl-1' });
    await expect(game.settings.set(MODULE_ID, 'noSuchSetting', 2))
      .rejects.toThrow(/not a registered game setting/);
    expect(game.settings.get(MODULE_ID, 'noSuchSetting')).toBe(1);
  });
});

describe('static setting-scope scan', () => {
  function registerCallCount() {
    const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap(e =>
      e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.js') ? [join(dir, e.name)] : []);
    return walk('src')
      .filter(f => !f.split('\\').join('/').includes('src/integration/'))
      .map(f => readFileSync(f, 'utf8').split('\n')
        .filter(l => /settings\.register\(\s*MODULE_ID/.test(l) && !/^\s*(\*|\/\/)/.test(l)).length)
      .reduce((a, b) => a + b, 0);
  }

  it('resolves the key and scope of every register() call in src/', () => {
    const { scopes, unresolved } = scanSettingScopes();
    expect(unresolved).toEqual([]);
    expect(scopes.size).toBe(registerCallCount());
  });

  it('knows the world / client split of representative settings', () => {
    expect(staticSettingScope(MODULE_ID, 'campaignState')).toBe('world');
    expect(staticSettingScope(MODULE_ID, 'keyedGmUserIds')).toBe('world');
    expect(staticSettingScope(MODULE_ID, 'mischiefDial')).toBe('world');            // SETTING.DIAL constant
    expect(staticSettingScope(MODULE_ID, 'combatTrackerEnabled')).toBe('world');    // bare constant
    expect(staticSettingScope(MODULE_ID, 'claudeApiKey')).toBe('client');
    expect(staticSettingScope(MODULE_ID, 'privateLines')).toBe('client');
    expect(staticSettingScope(MODULE_ID, 'companionToolbarPosition')).toBe('client');
    expect(staticSettingScope(MODULE_ID, 'noSuchSetting')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ChatMessage
// ─────────────────────────────────────────────────────────────────────────────

describe('ChatMessage — update / delete need a GM or the author', () => {
  it('create returns the data as a document authored by the creating user', async () => {
    withUser({ isGM: false, id: 'pl-1' });
    const data = { content: 'hi', flags: { [MODULE_ID]: { card: true } } };
    const msg = await ChatMessage.create(data);
    expect(msg).toBe(data);
    expect(ChatMessage._created[0]).toBe(msg);
    expect(msg.id).toMatch(/^tmsg\d{12}$/);
    expect(msg._source.author).toBe('pl-1');
    expect(msg.author.id).toBe('pl-1');
    expect(Object.keys(msg)).toEqual(['content', 'flags']);   // id, methods: non-enumerable
  });

  it('the author updates their own message', async () => {
    withUser({ isGM: false, id: 'pl-1' });
    const msg = await ChatMessage.create({ content: 'x', flags: {} });
    await msg.update({ [`flags.${MODULE_ID}.burn.consumed`]: true });
    expect(msg.flags[MODULE_ID].burn.consumed).toBe(true);
    await msg.setFlag(MODULE_ID, 'resolved', true);
    expect(msg.getFlag(MODULE_ID, 'resolved')).toBe(true);
    await msg.unsetFlag(MODULE_ID, 'resolved');
    expect(msg.getFlag(MODULE_ID, 'resolved')).toBeUndefined();
  });

  it('a player cannot update or delete a GM-authored card — the Burn double-apply shape', async () => {
    const card = await ChatMessage.create({ content: 'move', flags: { [MODULE_ID]: { burn: { consumed: false } } } });
    withUser({ isGM: false, id: 'pl-1', name: 'Pat' });
    await expect(card.update({ [`flags.${MODULE_ID}.burn.consumed`]: true }))
      .rejects.toThrow(/User Pat lacks permission to update ChatMessage/);
    await expect(card.setFlag(MODULE_ID, 'x', 1)).rejects.toThrow(/lacks permission/);
    await expect(card.delete()).rejects.toThrow(/lacks permission to delete ChatMessage/);
    expect(card.flags[MODULE_ID].burn.consumed).toBe(false);
  });

  it('a GM updates anyone\'s message', async () => {
    withUser({ isGM: false, id: 'pl-1' });
    const msg = await ChatMessage.create({ content: 'x', flags: {} });
    withUser({ isGM: true, id: 'gm-1' });
    await msg.update({ content: 'edited' });
    expect(msg.content).toBe('edited');
  });

  it('makeTestMessage sets an explicit author', async () => {
    const card = makeTestMessage({ flags: { [MODULE_ID]: { a: 1 } } }, { author: 'gm-1' });
    withUser({ isGM: false, id: 'pl-1' });
    await expect(card.update({ content: 'y' })).rejects.toThrow(/author \(gm-1\)/);
  });

  it('id generation never consumes Math.random (dice-scripted tests stay aligned)', async () => {
    const rnd = vi.spyOn(Math, 'random');
    await ChatMessage.create({ content: 'x' });
    makeTestMessage({});
    expect(rnd).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Actor ownership
// ─────────────────────────────────────────────────────────────────────────────

describe('Actor#update / #setFlag — need OWNER or a GM', () => {
  it('a GM updates any actor', async () => {
    const pc = makeTestActor({ id: 'pc-1' });
    await pc.update({ 'system.momentum.value': 5 });
    expect(pc.system.momentum.value).toBe(5);
  });

  it('a player without OWNER is refused, and nothing is written', async () => {
    const pc = makeTestActor({ id: 'pc-1', name: 'Kira' });
    withUser({ isGM: false, id: 'pl-2', name: 'Quinn' });
    await expect(pc.update({ 'system.momentum.value': 5 }))
      .rejects.toThrow(/User Quinn lacks permission to update Actor \[pc-1\] — needs OWNER permission on "Kira"/);
    await expect(pc.setFlag(MODULE_ID, 'x', 1)).rejects.toThrow(/lacks permission/);
    expect(pc.system.momentum.value).toBe(2);
    expect(pc._updateHistory).toHaveLength(0);
  });

  it('a player with OWNER (own level or default level) may write', async () => {
    const own = makeTestActor({ id: 'pc-1', ownership: { 'pl-1': 3 } });
    const shared = makeTestActor({ id: 'pc-2', ownership: { default: 3 } });
    const observer = makeTestActor({ id: 'pc-3', ownership: { 'pl-1': 2 } });
    withUser({ isGM: false, id: 'pl-1' });
    await own.update({ 'system.health.value': 3 });
    await shared.setFlag(MODULE_ID, 'seen', true);
    await expect(observer.update({ 'system.health.value': 3 })).rejects.toThrow(/lacks permission/);
    expect(own.system.health.value).toBe(3);
    expect(shared.flags[MODULE_ID].seen).toBe(true);
  });

  it('ownership is read live — a test may grant it after creation', async () => {
    const pc = makeTestActor({ id: 'pc-1' });
    pc.ownership = { 'pl-1': 3 };
    withUser({ isGM: false, id: 'pl-1' });
    await expect(pc.update({ 'system.spirit.value': 4 })).resolves.toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Opt-out
// ─────────────────────────────────────────────────────────────────────────────

describe('opt-out helpers', () => {
  it('withoutPermissionChecks runs a sync or async block with the rules off', async () => {
    withUser({ isGM: false, id: 'pl-1' });
    withoutPermissionChecks(() => { void game.settings.set(MODULE_ID, 'campaignState', { a: 1 }); });
    await withoutPermissionChecks(async () => {
      await game.settings.set(MODULE_ID, 'campaignState', { a: 2 });
    });
    expect(game.settings.get(MODULE_ID, 'campaignState')).toEqual({ a: 2 });
    await expect(game.settings.set(MODULE_ID, 'campaignState', { a: 3 })).rejects.toThrow(/lacks permission/);
  });

  it('a throwing block still restores the rules', () => {
    expect(() => withoutPermissionChecks(() => { throw new Error('boom'); })).toThrow('boom');
    withUser({ isGM: false, id: 'pl-1' });
    return expect(game.settings.set(MODULE_ID, 'campaignState', {})).rejects.toThrow(/lacks permission/);
  });

  it('disablePermissionChecks turns them off for the rest of this test…', async () => {
    disablePermissionChecks();
    withUser({ isGM: false, id: 'pl-1' });
    await expect(game.settings.set(MODULE_ID, 'campaignState', {})).resolves.toEqual({});
  });

  it('…and they are back on for the next test', async () => {
    withUser({ isGM: false, id: 'pl-1' });
    await expect(game.settings.set(MODULE_ID, 'campaignState', {})).rejects.toThrow(/lacks permission/);
  });
});
