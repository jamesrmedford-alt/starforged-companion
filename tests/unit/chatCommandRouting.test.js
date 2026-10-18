/**
 * STARFORGED COMPANION
 * tests/unit/chatCommandRouting.test.js
 *
 * Run-on policy for chat commands (src/index.js CHAT_COMMAND_ROUTES).
 * Foundry fires createChatMessage on EVERY connected client; before the
 * 2026-10 audit every `!command` ran once per client — independent dice and
 * duplicate cards for `!oracle` / `!stations`, one Claude call per keyed
 * client for `@scene` / `!recap`, and GM-only commands that warned the player
 * and then executed anyway on the GM's client.
 *
 * Each test simulates the hook on one client (author player, non-author
 * player, canonical GM, non-canonical GM) with game.users stubs like
 * chatHookGmGate.test.js.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/narration/narrator.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interrogateScene:  vi.fn(async () => {}),
  postSessionRecap:  vi.fn(async () => {}),
  postCampaignRecap: vi.fn(async () => {}),
}));
vi.mock('../../src/oracles/oracleFollowup.js', () => ({
  requestOracleNarration:    vi.fn(),
  narrateOracleFollowupOnGm: vi.fn(async () => null),
}));
vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: false, decision: 'NARRATIVE', suggestedMove: null })),
}));
vi.mock('../../src/session/incitingIncident.js', async (importOriginal) => ({
  ...(await importOriginal()),
  runIncitingIncident: vi.fn(async () => ({ spark: null, text: null })),
}));
vi.mock('../../src/entities/shipEnvision.js', async (importOriginal) => ({
  ...(await importOriginal()),
  handleShipEnvisionCommand: vi.fn(async () => {}),
  handleShipHistoryCommand:  vi.fn(async () => {}),
}));

import { registerChatHook } from '../../src/index.js';
import { runIncitingIncident } from '../../src/session/incitingIncident.js';
import { handleShipEnvisionCommand, handleShipHistoryCommand } from '../../src/entities/shipEnvision.js';
import { interrogateScene, postCampaignRecap } from '../../src/narration/narrator.js';
import { requestOracleNarration } from '../../src/oracles/oracleFollowup.js';
import { routePacedInput } from '../../src/pacing/router.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const MODULE_ID = 'starforged-companion';

const GM   = { id: 'gm-1', isGM: true,  active: true };
const GM2  = { id: 'gm-2', isGM: true,  active: true };   // assistant GM, higher id
const P1   = { id: 'pl-1', isGM: false, active: true };
const P2   = { id: 'pl-2', isGM: false, active: true };

function setUsers(users, currentUserId) {
  global.game.users = Object.assign([...users], {
    get: (id) => users.find(u => u.id === id) ?? null,
  });
  global.game.user = users.find(u => u.id === currentUserId) ?? null;
}

function cmd(content, authorId, extra = {}) {
  return { content, author: { id: authorId }, flags: {}, ...extra };
}

async function fire(message) {
  const handler = Hooks._handlers.get('createChatMessage').slice(-1)[0];
  await handler(message);
}

function state() {
  return game.settings._store.get(`${MODULE_ID}.campaignState`);
}

beforeEach(() => {
  Hooks._handlers.clear();
  ChatMessage._reset();
  interrogateScene.mockClear();
  postCampaignRecap.mockClear();
  requestOracleNarration.mockClear();
  routePacedInput.mockClear();
  runIncitingIncident.mockClear();
  handleShipEnvisionCommand.mockClear();
  handleShipHistoryCommand.mockClear();
  game.settings._store.delete(`${MODULE_ID}.keyedGmUserIds`);
  game.settings._store.delete(`${MODULE_ID}.claudeApiKey`);
  game.socket._reset();
  game.settings._store.set(`${MODULE_ID}.campaignState`, {
    ...CampaignStateSchema, sessionActive: true, xCardActive: false,
    sectors: [{ id: 's1', name: 'Veil', regionLabel: 'Terminus' }], activeSectorId: null,
  });
  // Players may run !recap (the GM-only gate lives in the predicate).
  game.settings._store.set(`${MODULE_ID}.recapGmOnly`, false);
  registerChatHook();
});

// ─────────────────────────────────────────────────────────────────────────────
// AUTHOR policy
// ─────────────────────────────────────────────────────────────────────────────

describe('AUTHOR policy — runs only on the client that typed it', () => {
  it('!stations posts its card on the authoring player client', async () => {
    setUsers([GM, P1], 'pl-1');
    await fire(cmd('!stations', 'pl-1'));
    expect(ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.battleStationsCard)).toHaveLength(1);
  });

  it('!stations stands down (debug breadcrumb) on the canonical GM when a player typed it', async () => {
    setUsers([GM, P1], 'gm-1');
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    await fire(cmd('!stations', 'pl-1'));
    expect(ChatMessage._created).toHaveLength(0);
    expect(debug.mock.calls.some(c => /!stations: authored on another client/.test(String(c[0])))).toBe(true);
  });

  it('!stations stands down on another player client', async () => {
    setUsers([GM, P1, P2], 'pl-2');
    await fire(cmd('!stations', 'pl-1'));
    expect(ChatMessage._created).toHaveLength(0);
  });

  it('!oracle yes rolls exactly once — on the author — and never on the GM', async () => {
    setUsers([GM, P1], 'pl-1');
    await fire(cmd('!oracle yes likely is the hatch sealed', 'pl-1'));
    setUsers([GM, P1], 'gm-1');
    await fire(cmd('!oracle yes likely is the hatch sealed', 'pl-1'));

    const cards = ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.oracleCommandCard);
    expect(cards).toHaveLength(1);
    expect(requestOracleNarration).toHaveBeenCalledTimes(1);
  });

  it('a GM-only command typed by a player warns the player and is NOT executed by the GM client', async () => {
    const warn = vi.spyOn(ui.notifications, 'warn');
    setUsers([GM, P1], 'pl-1');
    await fire(cmd('!sector Veil', 'pl-1'));
    expect(warn.mock.calls.some(c => /GM-only/.test(String(c[0])))).toBe(true);

    setUsers([GM, P1], 'gm-1');
    await fire(cmd('!sector Veil', 'pl-1'));
    expect(state().activeSectorId).toBeNull();
    expect(ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.sectorSwitch)).toHaveLength(0);
  });

  it('!sector <name> by the GM switches the active sector once', async () => {
    setUsers([GM, P1], 'gm-1');
    await fire(cmd('!sector Veil', 'gm-1'));
    expect(state().activeSectorId).toBe('s1');
    expect(ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.sectorSwitch)).toHaveLength(1);
  });

  it('bare !sector posts a usage card to the typist (SECTOR-SWITCH-001)', async () => {
    setUsers([GM, P1], 'pl-1');
    await fire(cmd('!sector', 'pl-1'));
    const usage = ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.sectorUsage);
    expect(usage).toHaveLength(1);
    expect(usage[0].whisper).toEqual(['pl-1']);
  });

  it('an author-less (programmatic) command runs on the receiving client', async () => {
    setUsers([GM, P1], 'pl-1');
    await fire({ content: '!stations', flags: {} });
    expect(ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.battleStationsCard)).toHaveLength(1);
  });

  it('a bare-id author (legacy shape) is honoured', async () => {
    setUsers([GM, P1], 'gm-1');
    await fire({ content: '!stations', user: 'pl-1', flags: {} });
    expect(ChatMessage._created).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CANONICAL_GM policy
// ─────────────────────────────────────────────────────────────────────────────

describe('CANONICAL_GM policy — runs only on the canonical GM', () => {
  it('warns the author when no GM is connected', async () => {
    const warn = vi.spyOn(ui.notifications, 'warn');
    setUsers([{ ...GM, active: false }, P1], 'pl-1');
    await fire(cmd('!x', 'pl-1'));
    expect(state().xCardActive).toBe(false);
    expect(warn.mock.calls.some(c => /no GM is connected/.test(String(c[0])))).toBe(true);
  });

  it('a non-author client does not warn when no GM is connected', async () => {
    const warn = vi.spyOn(ui.notifications, 'warn');
    setUsers([{ ...GM, active: false }, P1, P2], 'pl-2');
    await fire(cmd('!x', 'pl-1'));
    expect(warn).not.toHaveBeenCalled();
  });

  it('programmatic !x: the canonical GM records the pause and posts one X-Card card', async () => {
    setUsers([GM, P1], 'pl-1');
    await fire(cmd('!x', 'pl-1'));
    expect(state().xCardActive).toBe(false);
    expect(ChatMessage._created).toHaveLength(0);

    setUsers([GM, P1], 'gm-1');
    await fire(cmd('!x', 'pl-1'));
    expect(state().xCardActive).toBe(true);
    const cards = ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.xcardCard);
    expect(cards).toHaveLength(1);
    expect(cards[0].flags[MODULE_ID].type).toBe('xcard');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CLAUDE policy
// ─────────────────────────────────────────────────────────────────────────────

describe('CLAUDE policy — keyed canonical GM when one is connected, else the author', () => {
  // Fire one message on every listed client; return the ids that ran it.
  async function runOn(clients, users, message, spy) {
    const ran = [];
    for (const id of clients) {
      setUsers(users, id);
      const before = spy.mock.calls.length;
      await fire(message);
      if (spy.mock.calls.length > before) ran.push(id);
    }
    return ran;
  }
  const keyGms = (...ids) => game.settings._store.set(`${MODULE_ID}.keyedGmUserIds`, ids);

  it('keyed GM connected: a player\'s !recap runs once, on the canonical (keyed) GM', async () => {
    keyGms('gm-1');
    const ran = await runOn(['pl-1', 'gm-2', 'gm-1'], [GM, GM2, P1], cmd('!recap', 'pl-1'), postCampaignRecap);
    expect(ran).toEqual(['gm-1']);
  });

  it('keyed GM connected: a keyed player\'s command still runs on the GM (sidecar + world writes apply there)', async () => {
    keyGms('gm-1');
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-player');
    const ran = await runOn(['pl-1', 'gm-1'], [GM, P1], cmd('!incite', 'pl-1'), runIncitingIncident);
    expect(ran).toEqual(['gm-1']);
  });

  it('only the keyed assistant GM runs it when the lowest-id GM is keyless', async () => {
    keyGms('gm-2');
    const ran = await runOn(['gm-1', 'gm-2', 'pl-1'], [GM, GM2, P1], cmd('!ship envision', 'pl-1'), handleShipEnvisionCommand);
    expect(ran).toEqual(['gm-2']);
  });

  it('no keyed GM: the author runs it (keyed author uses their own key) — the keyless GM stands down', async () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const pc = makeTestActor({ id: 'pc-b', name: 'Bex' });
    game.actors._setAll([pc]);
    const msg = cmd('@scene what does the hangar smell like?', 'pl-1', { speaker: { actor: 'pc-b' } });
    const ran = await runOn(['gm-1', 'pl-2', 'pl-1'], [GM, P1, P2], msg, interrogateScene);
    expect(ran).toEqual(['pl-1']);
    expect(interrogateScene.mock.calls[0][2]).toEqual({ speakerActorId: 'pc-b' });
    expect(debug.mock.calls.some(c => /no keyed GM — runs on the author's client/.test(String(c[0])))).toBe(true);
    game.actors._reset();
  });

  // Second review round: on the author fallback a player's client ran
  // startScene — campaignState / WJ Lore / entity-tier writes a player cannot
  // make (permission errors, and the scene never started).
  it('no keyed GM: a player-run @scene narrates but leaves the scene boundary to the GM (no world write)', async () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    game.settings._store.set(`${MODULE_ID}.campaignState`, {
      ...state(), currentSceneId: 'sc-old', sceneTruths: [{ id: 't1', fact: 'The hatch is sealed.' }],
    });
    setUsers([GM, P1], 'pl-1');
    const set = vi.spyOn(game.settings, 'set');
    await fire(cmd('@scene what is behind the hatch?', 'pl-1'));
    expect(interrogateScene).toHaveBeenCalledTimes(1);
    expect(set.mock.calls.filter(c => c[1] === 'campaignState')).toHaveLength(0);
    expect(state().currentSceneId).toBe('sc-old');
    expect(state().sceneTruths).toHaveLength(1);
    expect(debug.mock.calls.some(c => /@scene: not the canonical GM — the scene boundary is left to the GM/.test(String(c[0])))).toBe(true);
    set.mockRestore();
  });

  it('a keyed canonical GM running @scene starts the new scene', async () => {
    keyGms('gm-1');
    game.settings._store.set(`${MODULE_ID}.campaignState`, { ...state(), currentSceneId: 'sc-old', sceneTruths: [] });
    setUsers([GM, P1], 'gm-1');
    await fire(cmd('@scene what is behind the hatch?', 'pl-1'));
    expect(interrogateScene).toHaveBeenCalledTimes(1);
    expect(state().currentSceneId).toMatch(/^sc-/);
    expect(state().currentSceneId).not.toBe('sc-old');
  });

  it('no keyed GM: a keyless author still runs it (the handler posts its own key-not-configured fallback)', async () => {
    const ran = await runOn(['gm-1', 'pl-1'], [GM, P1], cmd('!ship history', 'pl-1'), handleShipHistoryCommand);
    expect(ran).toEqual(['pl-1']);
  });

  it('a keyed GM that is NOT active does not count — the author runs it', async () => {
    keyGms('gm-1');
    const ran = await runOn(['pl-1'], [{ ...GM, active: false }, P1], cmd('!recap', 'pl-1'), postCampaignRecap);
    expect(ran).toEqual(['pl-1']);
  });

  it('no GM at all: the author runs it and nobody is warned', async () => {
    const warn = vi.spyOn(ui.notifications, 'warn');
    const ran = await runOn(['pl-1', 'pl-2'], [P1, P2], cmd('!incite', 'pl-1'), runIncitingIncident);
    expect(ran).toEqual(['pl-1']);
    expect(warn).not.toHaveBeenCalled();
  });

  it('a GM-typed command with a keyed GM runs on the canonical GM only', async () => {
    keyGms('gm-1');
    const ran = await runOn(['gm-2', 'gm-1'], [GM, GM2], cmd('!recap', 'gm-2', { author: { id: 'gm-2', isGM: true } }), postCampaignRecap);
    expect(ran).toEqual(['gm-1']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Commands are consumed everywhere
// ─────────────────────────────────────────────────────────────────────────────

describe('commands never reach the plain-narration pipeline', () => {
  it('a non-executing canonical GM consumes a player command without running the pipeline', async () => {
    setUsers([GM, P1], 'gm-1');
    await fire(cmd('!oracle yes is it a trap and are we sure', 'pl-1'));
    expect(routePacedInput).not.toHaveBeenCalled();
  });

  it('plain narration still reaches the pipeline on the canonical GM', async () => {
    setUsers([GM, P1], 'gm-1');
    await fire({ type: 'ic', content: 'I vault the barricade and run for the lift.', author: { id: 'pl-1' }, flags: {} });
    expect(routePacedInput).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// !oracle <tableId>
// ─────────────────────────────────────────────────────────────────────────────

describe('!oracle <tableId> — roll any registered oracle table', () => {
  beforeEach(() => setUsers([GM, P1], 'pl-1'));

  it('rolls a built-in table and posts a card with oracle-memory flags', async () => {
    await fire(cmd('!oracle action what drives them', 'pl-1'));
    const cards = ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.oracleCommandCard);
    expect(cards).toHaveLength(1);
    const f = cards[0].flags[MODULE_ID];
    expect(f.oracleTableId).toBe('action');
    expect(f.oracleMemory).toMatchObject({ name: expect.any(String), question: 'what drives them' });
    expect(typeof f.oracleMemory.answer).toBe('string');
    expect(cards[0].content).toMatch(/d100 = <strong>\d+<\/strong>/);
    expect(requestOracleNarration).toHaveBeenCalledTimes(1);
    expect(requestOracleNarration.mock.calls[0][0]).toMatchObject({ kind: 'oracle_table', question: 'what drives them' });
  });

  it('matches the table id case-insensitively', async () => {
    await fire(cmd('!oracle ACTION', 'pl-1'));
    const card = ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.oracleCommandCard);
    expect(card.flags[MODULE_ID].oracleTableId).toBe('action');
  });

  it('rolls a custom (!oracle-add) table', async () => {
    const { registerOracleTable, unregisterOracleTable } = await import('../../src/oracles/roller.js');
    registerOracleTable('ship_quirk_test', {
      name: 'Ship Quirks', table: [{ min: 1, max: 100, result: 'Hums in the dark' }],
    });
    try {
      await fire(cmd('!oracle ship_quirk_test', 'pl-1'));
      const card = ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.oracleCommandCard);
      expect(card.content).toContain('Ship Quirks');
      expect(card.content).toContain('Hums in the dark');
      expect(card.flags[MODULE_ID].oracleMemory.answer).toBe('Hums in the dark');
    } finally {
      unregisterOracleTable('ship_quirk_test');
    }
  });

  it('an unknown table id posts the usage card naming it', async () => {
    await fire(cmd('!oracle nosuchtable', 'pl-1'));
    const card = ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.oracleCommandCard);
    expect(card.content).toContain('Usage');
    expect(card.content).toContain('nosuchtable');
    expect(requestOracleNarration).not.toHaveBeenCalled();
  });

  it('"!oracle yes" keeps its yes/no behaviour', async () => {
    await fire(cmd('!oracle yes likely does it hold', 'pl-1'));
    const card = ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.oracleCommandCard);
    expect(card.content).toContain('Ask the Oracle (likely)');
    expect(requestOracleNarration.mock.calls[0][0].kind).toBe('oracle_yes_no');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// !recap while "Recap GM-only" is on
// ─────────────────────────────────────────────────────────────────────────────

describe('!recap with the Recap GM-only setting on', () => {
  beforeEach(() => {
    game.settings._store.set(`${MODULE_ID}.recapGmOnly`, true);
  });

  it('tells the typing player it is GM-only instead of vanishing silently', async () => {
    setUsers([GM, P1], 'pl-1');
    const warn = vi.spyOn(ui.notifications, 'warn');
    await fire(cmd('!recap', 'pl-1', { author: { id: 'pl-1', isGM: false } }));
    expect(warn.mock.calls.some(c => /!recap is GM-only/.test(String(c[0])))).toBe(true);
    expect(postCampaignRecap).not.toHaveBeenCalled();
    expect(routePacedInput).not.toHaveBeenCalled();
  });

  it('the canonical GM neither runs the recap nor warns for a player-typed !recap', async () => {
    setUsers([GM, P1], 'gm-1');
    const warn = vi.spyOn(ui.notifications, 'warn');
    await fire(cmd('!recap', 'pl-1', { author: { id: 'pl-1', isGM: false } }));
    expect(postCampaignRecap).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('a GM-typed !recap still runs on the canonical GM', async () => {
    setUsers([GM, P1], 'gm-1');
    await fire(cmd('!recap', 'gm-1', { author: { id: 'gm-1', isGM: true } }));
    expect(postCampaignRecap).toHaveBeenCalledTimes(1);
  });
});
