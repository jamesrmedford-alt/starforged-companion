/**
 * STARFORGED COMPANION
 * tests/unit/multiClientHarness.test.js
 *
 * The multi-client harness itself (tests/helpers/multiClient.js, issue #282
 * item 2): one module copy per client, Foundry's fan-out of document hooks to
 * every client, socket delivery to everyone but the sender, per-client
 * settings / dialogs / Claude calls, and the permission-faithful rules
 * applied per client. The module-behaviour tests built on it live in
 * multiplayerRouting / multiplayerRelay / multiplayerConcurrency. Its fault
 * boundaries (issue #302 slice B: refused and held writes, Claude faults, the
 * event order — tests/helpers/faults.js) are checked last; faultMatrix.test.js
 * uses them.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { simulateTable, USERS, MODULE_ID, currentClient } from '../helpers/multiClient.js';
import {
  campaignStateWrite, claudeFault, expectKnownIssue, failWrites, holdWrites, scriptClaude, traceTable,
} from '../helpers/faults.js';

const { GM, GM2, P1, P2 } = USERS;

let table;
beforeAll(async () => {
  table = await simulateTable({ users: [GM, GM2, P1, P2] });
}, 30_000);
afterAll(() => table?.teardown());
beforeEach(() => table.reset());

describe('boot', () => {
  it('evaluates a separate copy of every module per client', async () => {
    const [gm, gm2, p1, p2] = table.clients;
    expect(new Set([gm.index, gm2.index, p1.index, p2.index]).size).toBe(4);
    const relays = await Promise.all(table.clients.map(c => c.import('../../src/multiplayer/gmRelay.js')));
    expect(new Set(relays).size).toBe(4);
    // A module loaded lazily (gmRelay's GM_ACTIONS import()) resolves inside
    // the importing client's own graph.
    const viaRelay = await p1.run(() => relays[2].GM_ACTIONS['xcard.activate'].load());
    expect(viaRelay).toBe(await p1.import('../../src/context/safety.js'));
    expect(viaRelay).not.toBe(await gm.import('../../src/context/safety.js'));
  });

  it('runs every client\'s ready hook — the production listeners are installed on each', () => {
    for (const c of table.clients) {
      expect(c.hooks.count('createChatMessage'), c.id).toBeGreaterThan(0);
      expect(c.hooks.count('renderChatMessageHTML'), c.id).toBeGreaterThan(0);
      expect(c.hooks.count('chatMessage'), c.id).toBe(1);
    }
    // Same module-socket listeners everywhere, plus the GM-ready pull
    // (onGmRelayReady — Private Lines) on players only.
    const count = (id) => (table.client(id).socketHandlers.get(`module.${MODULE_ID}`) ?? []).length;
    expect(count('gm-1')).toBeGreaterThan(0);
    expect(count('gm-2')).toBe(count('gm-1'));
    expect(count('pl-1')).toBe(count('gm-1') + 1);
    expect(count('pl-2')).toBe(count('pl-1'));
  });

  it('keeps boot chatter out of the test output', () => {
    expect(table.bootLog.some(l => /Ready/.test(l.message))).toBe(true);
  });
});

describe('documents fan out to every client', () => {
  it('a created message fires createChatMessage on every connected client — synchronously on the creator', async () => {
    const seen = [];
    table.listen('createChatMessage', (c, msg) => seen.push([c.id, msg.id, currentClient()?.id]));
    const p1 = table.client('pl-1');
    const msg = await p1.run(() => ChatMessage.create({ content: 'hello', flags: { [MODULE_ID]: { probe: true } } }));
    expect(seen).toEqual([['pl-1', msg.id, 'pl-1']]);   // creator before create() resolves
    await table.settle();
    expect(seen.map(s => s[0]).sort()).toEqual(['gm-1', 'gm-2', 'pl-1', 'pl-2']);
    expect(seen.every(([client, , ctx]) => client === ctx)).toBe(true);
    expect(table.world.message(msg.id).author).toBe('pl-1');
  });

  it('a disconnected client receives nothing', async () => {
    await table.leave('pl-2');
    const p1 = table.client('pl-1');
    const msg = await p1.run(() => ChatMessage.create({ content: 'x', flags: { [MODULE_ID]: { probe: true } } }));
    await table.settle();
    expect(table.client('pl-2').message(msg.id)).toBeNull();
    expect(table.client('gm-1').message(msg.id)).not.toBeNull();
  });

  it('each client holds its own replica — a local mutation without update() reaches no one', async () => {
    const gm = table.client('gm-1');
    const card = await gm.run(() => ChatMessage.create({ content: 'card', flags: { [MODULE_ID]: { n: 1 } } }));
    await table.settle();
    card.flags[MODULE_ID].n = 99;
    expect(table.client('pl-1').message(card.id).flags[MODULE_ID].n).toBe(1);
    expect(table.world.message(card.id).flags[MODULE_ID].n).toBe(1);
  });

  it('a player cannot update a GM-authored card; a GM update reaches every replica', async () => {
    const gm = table.client('gm-1');
    const p1 = table.client('pl-1');
    const card = await gm.run(() => ChatMessage.create({ content: 'card', flags: { [MODULE_ID]: { burn: { consumed: false } } } }));
    await table.settle();
    const mine = p1.message(card.id);
    await expect(p1.run(() => mine.update({ [`flags.${MODULE_ID}.burn.consumed`]: true })))
      .rejects.toThrow(/User Pat lacks permission to update ChatMessage/);
    await gm.run(() => card.update({ [`flags.${MODULE_ID}.burn.consumed`]: true }));
    await table.settle();
    for (const c of table.clients) expect(c.message(card.id).flags[MODULE_ID].burn.consumed, c.id).toBe(true);
  });

  it('a player may not post a message as someone else', async () => {
    const p1 = table.client('pl-1');
    await expect(p1.run(() => ChatMessage.create({ content: 'x', author: 'gm-1' })))
      .rejects.toThrow(/may only post as themselves/);
  });
});

describe('socket', () => {
  it('an emit reaches every OTHER connected client, JSON-cloned', async () => {
    const got = [];
    for (const c of table.clients) {
      c.listenSocket('module.probe', (payload) => got.push([c.id, payload, currentClient()?.id]));
    }
    const payload = { a: 1, skip: undefined };
    table.client('pl-1').run(() => game.socket.emit('module.probe', payload));
    expect(got).toEqual([]);   // never synchronous
    await table.settle();
    expect(got.map(g => g[0]).sort()).toEqual(['gm-1', 'gm-2', 'pl-2']);
    expect(got.every(([client, p, ctx]) => client === ctx && p.a === 1 && !('skip' in p) && p !== payload)).toBe(true);
  });
});

describe('settings', () => {
  it('a player\'s world-setting write rejects; a GM\'s reaches every client with updateSetting', async () => {
    const p1 = table.client('pl-1');
    await expect(p1.setSetting('campaignState', { xCardActive: true }))
      .rejects.toThrow(/User Pat lacks permission to update Setting \[starforged-companion\.campaignState\]/);
    expect(table.world.campaignState()).toBeUndefined();

    const changed = [];
    table.listen('createSetting', (c, s) => changed.push([c.id, s.key, s.value.xCardActive]));
    await table.client('gm-1').setSetting('campaignState', { xCardActive: true });
    await table.settle();
    expect(changed.map(c => c[0]).sort()).toEqual(['gm-1', 'gm-2', 'pl-1', 'pl-2']);
    expect(changed.every(c => c[1] === `${MODULE_ID}.campaignState` && c[2] === true)).toBe(true);
    expect(p1.getSetting('campaignState').xCardActive).toBe(true);
  });

  it('world get returns one cached object until the next update; a local mutation is not shared', async () => {
    const gm = table.client('gm-1');
    const p1 = table.client('pl-1');
    await gm.setSetting('campaignState', { n: 1 });
    await table.settle();
    const a = p1.getSetting('campaignState');
    expect(p1.getSetting('campaignState')).toBe(a);
    a.n = 42;
    expect(gm.getSetting('campaignState').n).toBe(1);
    await gm.setSetting('campaignState', { n: 2 });
    await table.settle();
    expect(p1.getSetting('campaignState')).not.toBe(a);
    expect(p1.getSetting('campaignState').n).toBe(2);
  });

  it('client settings are per client', async () => {
    await table.client('pl-1').setSetting('claudeApiKey', 'sk-ant-pat');
    expect(table.client('pl-1').getSetting('claudeApiKey')).toBe('sk-ant-pat');
    expect(table.client('pl-2').getSetting('claudeApiKey')).toBe('');
    expect(table.client('gm-1').getSetting('claudeApiKey')).toBe('');
  });

  it('a keyed GM advertises itself into the world registry (claudeApiKey onChange)', async () => {
    await table.setClaudeKey('gm-2', 'sk-ant-gus');
    expect(table.world.getSetting('keyedGmUserIds')).toEqual(['gm-2']);
  });
});

describe('dialogs, Claude, errors', () => {
  it('a dialog opens on the calling client only', async () => {
    await table.client('pl-1').chat('!flag');
    await table.settle();
    expect(table.dialogs.map(d => d.client)).toEqual(['pl-1']);
    expect(table.dialogs[0].api).toBe('DialogV2.prompt');
  });

  it('Claude calls record the calling client and the key it used', async () => {
    await table.client('pl-1').setSetting('claudeApiKey', 'sk-ant-pat');
    const p1 = table.client('pl-1');
    const { apiPost } = await p1.import('../../src/api-proxy.js');
    table.claude.respond(() => 'Reply.');
    const out = await p1.run(() => apiPost('https://api.anthropic.com/v1/messages', { 'x-api-key': 'sk-ant-pat' }, { model: 'm', messages: [] }));
    expect(out.content[0].text).toBe('Reply.');
    expect(table.claude.calls).toMatchObject([{ client: 'pl-1', apiKey: 'sk-ant-pat', model: 'm' }]);
  });

  it('a rejected async hook handler is reported with console.error', async () => {
    expectConsoleError(/hook probeHook rejected/);
    const gm = table.client('gm-1');
    gm.listen('probeHook', async () => { throw new Error('boom'); });
    gm.run(() => Hooks.callAll('probeHook'));
    await table.settle();
    expect(table.errors).toHaveLength(1);
    expect(table.errors[0].error.message).toBe('boom');
  });
});

describe('timers', () => {
  it('a timer a client schedules fires in that client\'s context — under fake timers too', async () => {
    const fired = [];
    const p2 = table.client('pl-2');
    p2.run(() => setTimeout(() => fired.push(['real', currentClient()?.id, game.user.id]), 0));
    await table.settle();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      p2.run(() => setTimeout(() => fired.push(['fake', currentClient()?.id, game.user.id]), 1000));
      await vi.advanceTimersByTimeAsync(1000);
    } finally {
      vi.useRealTimers();
    }
    expect(fired).toEqual([['real', 'pl-2', 'pl-2'], ['fake', 'pl-2', 'pl-2']]);
    // Outside any client a timer is untouched.
    await new Promise(r => setTimeout(r, 0));
  });
});

describe('render and click', () => {
  it('renders a card on one client, runs its wiring, and clicks a button', async () => {
    const gm = table.client('gm-1');
    const card = await gm.run(() => ChatMessage.create({
      content: '<button type="button" data-action="probe-click">Go</button>',
      flags: { [MODULE_ID]: { probe: true } },
    }));
    await table.settle();
    const clicks = [];
    const p1 = table.client('pl-1');
    p1.listen('renderChatMessageHTML', (msg, root) => {
      root.querySelector('[data-action="probe-click"]')?.addEventListener('click', () => clicks.push(currentClient()?.id));
    });
    p1.click(card, '[data-action="probe-click"]');
    expect(clicks).toEqual(['pl-1']);
    expect(() => p1.click(card, '[data-action="nope"]')).toThrow(/data-actions: probe-click/);
  });
});

describe('fault boundaries (issue #302)', () => {
  const API = 'https://api.anthropic.com/v1/messages';
  const ask = (client) => client.run(async () => {
    const { apiPost } = await import('../../src/api-proxy.js');
    return apiPost(API, { 'x-api-key': 'sk-ant-test' }, { model: 'claude-test', messages: [{ role: 'user', content: 'Hi' }] });
  });

  it('a refused write rejects its caller and reaches no client; the next one applies', async () => {
    const gm = table.client('gm-1');
    const refused = failWrites(table, campaignStateWrite('gm-1'));
    await expect(gm.setSetting('campaignState', { sessionActive: true })).rejects.toThrow(/refused/);
    expect(refused.refused).toBe(1);
    expect(table.world.campaignState()).toBeUndefined();
    await gm.setSetting('campaignState', { sessionActive: true });
    expect(table.world.campaignState()).toEqual({ sessionActive: true });
  });

  it('a held write applies only when released — another write can land first', async () => {
    const gm = table.client('gm-1');
    const held = holdWrites(table, (w) => w.kind === 'setting' && w.value?.n === 1);
    const first = gm.setSetting('campaignState', { n: 1 });
    expect((await held.arrived).client).toBe('gm-1');
    await gm.setSetting('campaignState', { n: 2 });
    expect(table.world.campaignState()).toEqual({ n: 2 });
    held.release();
    await first;
    expect(table.world.campaignState()).toEqual({ n: 1 });   // the late write wins, as on a real server
  });

  it('Actor and ChatMessage writes can be refused too; reset() removes every interceptor', async () => {
    const gm = table.client('gm-1');
    const actor = table.addActor({ id: 'a-1', name: 'Kira', ownership: {} });
    failWrites(table, (w) => w.kind === 'actor.update' && w.id === 'a-1');
    failWrites(table, (w) => w.kind === 'message.create');
    await expect(gm.run(() => actor.update({ name: 'Kira Vale' }))).rejects.toThrow(/refused/);
    expect(actor.name).toBe('Kira');
    await expect(gm.run(() => ChatMessage.create({ content: 'x' }))).rejects.toThrow(/refused/);
    expect(table.world.messages()).toEqual([]);
    await table.reset();
    await gm.run(() => ChatMessage.create({ content: 'x' }));
    expect(table.world.messages()).toHaveLength(1);
  });

  it('a Claude fault is what the caller gets: an HTTP error, a malformed body, a network error', async () => {
    const gm = table.client('gm-1');
    const claude = scriptClaude(table);
    claude.when(() => true, claudeFault.overloaded());
    await expect(ask(gm)).rejects.toThrow(/Anthropic API error 529/);
    claude.when(() => true, claudeFault.malformed());
    await expect(ask(gm)).rejects.toThrow(SyntaxError);
    claude.when(() => true, claudeFault.networkError());
    await expect(ask(gm)).rejects.toThrow(/Failed to fetch/);
    await expect(ask(gm)).resolves.toMatchObject({ content: [{ text: '{}' }] });   // the fallback reply
  });

  it('a held Claude call is answered when the test releases it', async () => {
    const gm = table.client('gm-1');
    const held = scriptClaude(table).hold(() => true);
    const answer = ask(gm);
    expect((await held.arrived).client).toBe('gm-1');
    held.release('Released.');
    await expect(answer).resolves.toMatchObject({ content: [{ text: 'Released.' }] });
  });

  it('the event order records calls, replies, writes, cards, notifications and test marks in sequence', async () => {
    const trace = traceTable(table);
    const gm = table.client('gm-1');
    scriptClaude(table).when(() => true, claudeFault.serverError());
    trace.mark('start');
    await gm.setSetting('campaignState', { a: 1 });
    await expect(ask(gm)).rejects.toThrow(/500/);
    await gm.run(() => ChatMessage.create({ content: 'x', flags: { [MODULE_ID]: { probe: true } } }));
    gm.run(() => ui.notifications.warn('Careful.'));
    expect(trace.entries.map(e => e.replace(/ smsg\w+/, ''))).toEqual([
      '── start',
      'setting campaignState by gm-1',
      'claude #1 → gm-1 claude-test "Hi"',
      'claude #1 ← HTTP 500 api_error',
      'card [probe] by gm-1',
      'notify gm-1 warn: "Careful."',
    ]);
  });

  it('expectKnownIssue passes while its check fails as described, and fails otherwise', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    await expectKnownIssue('ISSUE-X', /expected 1 to be 2/, async () => { expect(1).toBe(2); });
    expect(info).toHaveBeenCalledWith(expect.stringMatching(/^KNOWN ISSUE ISSUE-X: /));
    await expect(expectKnownIssue('ISSUE-X', /expected 1 to be 2/, async () => { throw new Error('something else'); }))
      .rejects.toThrow('something else');
    await expect(expectKnownIssue('ISSUE-X', /expected 1 to be 2/, async () => {}))
      .rejects.toThrow(/no longer reproduces/);
  });
});

