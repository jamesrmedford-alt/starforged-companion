/**
 * STARFORGED COMPANION
 * tests/unit/stalePageResiduals.test.js
 *
 * The residuals of issue #347 AB19-STALE-CACHE-WRITES — a page whose
 * connection to the server dropped, and which has not reloaded, may lack what
 * changed meanwhile:
 *
 *   - STALE-PAGE-ACTOR-WRITES: the stand-down refused campaignState, round and
 *     Lines / Veils writes, but a move in flight on the page still wrote its
 *     roller's sheet from the stale cache. actorBridge.js now refuses an actor
 *     write from a stale page; the move's meter failure reaches the GMs' card.
 *   - STALE-PAGE-CLAUDE-COMMANDS: with a sole keyed GM whose page stood down,
 *     a `RUN_ON.CLAUDE` command ran on no client (the routing counted that GM
 *     as keyed). hasKeyedActiveGM now counts only GMs whose page can act, so
 *     the author's client runs it.
 *   - STALE-PLAYER-PAGE: a player's page back from a drop was not asked to
 *     reload, and a narration it started later on the player's own key read
 *     the X-Card from a cache that could lack a card played meanwhile. It is
 *     now asked to reload, the Private Channel refuses a turn on it, and the
 *     narrator's X-Card watch discards any narration started on it.
 *   - STALE-BANNER-WORDING: the Round window said "No GM is connected" while
 *     the only GM's page waited to be reloaded.
 */

/* global silenceConsoleErrors */
import { describe, it, expect, afterEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ confirm: null, dice: [] }));

vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => ({
    moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'iron', adds: 0, rationale: 'test', mischiefApplied: false,
  })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(() => (control.confirm ? control.confirm.promise : Promise.resolve(true))),
}));
vi.mock('../../src/moves/resolver.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random');
      for (const d of control.dice) dice.mockReturnValueOnce(d);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude, deferred } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { buildRoundView, ROUND_NOTICES } from '../../src/batch/roundView.js';

const REPLY = 'The hull groans and holds.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

let table;
afterEach(() => {
  table?.teardown();
  control.confirm = null;
  control.dice = [];
});

async function seat(users, { keyed = users.filter(u => u.isGM).map(u => u.id) } = {}) {
  table = await simulateTable({
    users,
    world: { settings: {
      chronicleAutoEntry: false, narratorSessionSummary: false,
      campaignState: {
        ...CampaignStateSchema,
        sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [],
        lastSessionTimestamp: new Date().toISOString(),
      },
    } },
  });
  for (const id of keyed) await table.setClaudeKey(id, `sk-ant-${id}`);
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  silenceConsoleErrors();
}

/** A drop and a reconnect on the same page: the page is stale until it reloads. */
async function dropAndReconnect(userId) {
  await table.leave(userId);
  await table.join(userId);
}

describe('STALE-PAGE-ACTOR-WRITES — a stale page writes no actor', () => {
  it("a move whose page dropped during its narration does not write its roller's meters from the stale cache", async () => {
    await seat([USERS.GM, USERS.GM2, USERS.P1]);
    const narration = scriptClaude(table, { fallback: () => REPLY }).hold(call => call.model === 'claude-sonnet-5-5');
    control.dice = [0.0, 0.0, 0.99];          // challenge 1, 1; action 6: a strong hit, +1 momentum
    const kira = table.actors.get('pc-kira');
    expect(kira.system.momentum.value).toBe(2);

    await table.client('pl-1').chat('I brace against the hull and push through the breach.', { speaker: { actor: 'pc-kira' } });
    await table.settle();
    await narration.arrived;
    await dropAndReconnect('gm-1');           // gm-1's page drops while the move is narrated

    narration.release(REPLY);
    await table.settle();
    await table.drain(5_000).catch(() => {});
    await table.settle();

    expect(table.cards(f => f.moveResolution).length, 'the move was rolled (setup)').toBeGreaterThan(0);
    expect(kira.system.momentum.value, 'the stale page wrote no meter').toBe(2);
  }, 30_000);

  it('each actorBridge writer refuses on a stale page and writes on a fresh one', async () => {
    await seat([USERS.GM, USERS.P1]);
    const kira = table.actors.get('pc-kira');
    const gm = table.client('gm-1');
    const bridge = await gm.import('../../src/character/actorBridge.js');

    await dropAndReconnect('gm-1');
    const refused = await gm.run(() => bridge.applyMeterChanges(table.actors.get('pc-kira'), { momentum: 1 })
      .then(() => 'written', err => String(err?.message ?? err)));
    expect(refused).toMatch(/not written — this page lost its connection to the server/);
    expect(kira.system.momentum.value).toBe(2);
    const debility = await gm.run(() => bridge.setDebility(table.actors.get('pc-kira'), 'shaken', true)
      .then(() => 'written', err => String(err?.message ?? err)));
    expect(debility).toMatch(/not written/);

    const fresh = await table.reload('gm-1');
    const freshBridge = await fresh.import('../../src/character/actorBridge.js');
    await fresh.run(() => freshBridge.applyMeterChanges(table.actors.get('pc-kira'), { momentum: 1 }));
    expect(kira.system.momentum.value).toBe(3);
  }, 30_000);
});

describe('STALE-PAGE-CLAUDE-COMMANDS — a stood-down keyed GM is not counted as keyed', () => {
  it("with the sole keyed GM's page stood down, a player's @scene runs on the player's client", async () => {
    await seat([USERS.GM, USERS.P1]);
    const ran = [];
    for (const client of table.clients) {
      for (const route of client.index.CHAT_COMMAND_ROUTES) {
        route.run = () => { ran.push({ client: client.id, route: route.name }); };
      }
    }
    await dropAndReconnect('gm-1');

    const gate = await table.client('pl-1').import('../../src/multiplayer/gmGate.js');
    expect(table.client('pl-1').run(() => gate.hasKeyedActiveGM())).toBe(false);

    await table.client('pl-1').run(() => ChatMessage.create({ content: '@scene what does the hangar smell like?' }));
    await table.settle();
    expect(ran.filter(r => r.route === '@scene')).toEqual([{ client: 'pl-1', route: '@scene' }]);
  }, 30_000);

  it('control: a keyed GM whose page can act still runs it', async () => {
    await seat([USERS.GM, USERS.P1]);
    const ran = [];
    for (const client of table.clients) {
      for (const route of client.index.CHAT_COMMAND_ROUTES) {
        route.run = () => { ran.push({ client: client.id, route: route.name }); };
      }
    }
    await table.client('pl-1').run(() => ChatMessage.create({ content: '@scene what does the hangar smell like?' }));
    await table.settle();
    expect(ran.filter(r => r.route === '@scene')).toEqual([{ client: 'gm-1', route: '@scene' }]);
  }, 30_000);
});

describe("STALE-PLAYER-PAGE — a player's stale page is asked to reload and narrates nothing on its own key", () => {
  it('the player is asked to reload; the Private Channel refuses a turn and Publish; a narration started on it is discarded', async () => {
    await seat([USERS.GM, USERS.P1]);
    await table.setClaudeKey('pl-1', 'sk-ant-player');
    const replies = scriptClaude(table, { fallback: () => 'The stars wheel overhead.' });
    void replies;
    const pl = table.client('pl-1');

    await table.leave('pl-1');
    // The GM records an X-Card while the player's socket is down: their page never hears of it.
    await table.client('gm-1').run(() => game.settings.set(MODULE_ID, 'campaignState', {
      ...game.settings.get(MODULE_ID, 'campaignState'), xCardActive: true,
    }));
    await table.settle();
    await table.join('pl-1');
    const narrator = await pl.import('../../src/narration/narrator.js');
    expect(pl.run(() => narrator.isXCardActive(null)), "the player's cache lacks the pause (setup)").toBe(false);

    expect(pl.notifications.some(n => /connection to the server dropped/.test(n.message) && n.options?.permanent)).toBe(true);
    expect(pl.dialogs.find(d => d.title === 'Reload this page')?.options?.ok?.label).toBe('Reload');

    const narrate = await pl.import('../../src/private-channel/narrate.js');
    const callsBefore = table.claude.calls.length;
    const result = await pl.run(() => narrate.requestPrivateNarration({
      campaignState: { ...CampaignStateSchema }, userId: 'pl-1', actorId: 'pc-kira', transcriptTurns: [], playerMessage: 'I look out.',
    }));
    expect(result).toMatchObject({ ok: false, reason: 'stale' });
    expect(table.claude.calls.length, 'no Claude call is made').toBe(callsBefore);

    const publish = await pl.import('../../src/private-channel/publish.js');
    const posted = await pl.run(() => publish.publishToMainChat({ userId: 'pl-1', content: 'A quiet thought.' }));
    expect(posted).toBeNull();
    expect(pl.notifications.some(n => n.message === publish.STALE_PAGE_REFUSED)).toBe(true);

    const discarded = pl.run(() => narrator.watchXCard({ xCardActive: false }).interrupted('test'));
    expect(discarded, "a narration on the stale page is discarded — its cache can't vouch for the X-Card").toBe(true);
  }, 30_000);

  it('control: a player page whose connection never dropped narrates and is not asked to reload', async () => {
    await seat([USERS.GM, USERS.P1]);
    const pl = table.client('pl-1');
    const narrator = await pl.import('../../src/narration/narrator.js');
    expect(pl.run(() => narrator.watchXCard({ xCardActive: false }).interrupted('test'))).toBe(false);
    expect(pl.dialogs.find(d => d.title === 'Reload this page')).toBeUndefined();
  }, 30_000);
});

describe('STALE-BANNER-WORDING — the Round window says the GM must reload, not that none is connected', () => {
  it('the banner names the reload when every connected GM stood down', () => {
    const ctx = { enabled: true, sessionActive: true, gmConnected: false };
    const viewer = { userId: 'pl-1', isGM: false };
    expect(buildRoundView(null, viewer, { ...ctx, gmReload: true }).banners[0].text).toBe(ROUND_NOTICES.gmReload);
    expect(ROUND_NOTICES.gmReload).toMatch(/must be reloaded/);
    expect(buildRoundView(null, viewer, { ...ctx, gmReload: false }).banners[0].text).toBe(ROUND_NOTICES.noGm);
  });

  it("the window's own context reads the stood-down GM as waiting to reload", async () => {
    await seat([USERS.GM, USERS.P1]);
    await dropAndReconnect('gm-1');
    const relay = await table.client('pl-1').import('../../src/multiplayer/gmRelay.js');
    expect(table.client('pl-1').run(() => relay.hasActiveGM())).toBe(false);
    expect(table.client('pl-1').run(() => relay.onlyStoodDownGMs())).toBe(true);
  }, 30_000);
});
