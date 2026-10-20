/**
 * STARFORGED COMPANION
 * tests/unit/chatCommandRouting.test.js
 *
 * Run-on policy for chat commands (src/index.js CHAT_COMMAND_ROUTES), end to
 * end on a simulated four-client table (tests/helpers/multiClient.js — issue
 * #282). Foundry fires createChatMessage on EVERY connected client; before
 * the 2026-10 audit every `!command` ran once per client — independent dice
 * and duplicate cards for `!oracle` / `!stations`, one Claude call per keyed
 * client for `@scene` / `!recap`, dialogs on every screen, and GM-only
 * commands that warned the player and then executed anyway on the GM's
 * client.
 *
 * Each test types the command on one client and asserts on the whole table:
 * the cards posted (and by whom), the Claude calls made (by which client,
 * with whose key), the dialogs opened, the world state written. The real
 * handlers run; Claude is answered at the network boundary (table.claude).
 * Only the pacing router is mocked, to see whether a message reached the
 * move pipeline (and on which client) without running it.
 *
 * Every route under every table shape: multiplayerRouting.test.js. The
 * author-less / bare-id-author message shapes: speaker.test.js.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const pacing = vi.hoisted(() => ({ ranOn: [] }));
vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => {
    pacing.ranOn.push(globalThis.game.user.id);
    return { runMove: false, decision: 'NARRATIVE', suggestedMove: null };
  }),
}));

import { simulateTable, USERS } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const { GM, GM2, P1, P2 } = USERS;
const MODULE_ID = 'starforged-companion';

let table;
const client = (id) => table.client(id);
const state = () => table.world.campaignState();
const keys = { 'gm-1': 'sk-ant-gina', 'gm-2': 'sk-ant-gus', 'pl-1': 'sk-ant-pat', 'pl-2': 'sk-ant-quinn' };

async function type(userId, content) {
  await client(userId).chat(content);
  await table.settle();
}

async function setKeys(...userIds) {
  for (const id of userIds) await table.setClaudeKey(id, keys[id]);
}

beforeAll(async () => {
  table = await simulateTable({ users: [GM, GM2, P1, P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({
    world: {
      settings: {
        campaignState: {
          ...CampaignStateSchema, sessionActive: true, xCardActive: false, currentSceneId: 'sc-old',
          sectors: [{ id: 's1', name: 'Veil', regionLabel: 'Terminus' }], activeSectorId: null,
        },
        recapGmOnly: false,
      },
    },
  });
  pacing.ranOn.length = 0;
});

// ─────────────────────────────────────────────────────────────────────────────
// AUTHOR policy
// ─────────────────────────────────────────────────────────────────────────────

describe('AUTHOR policy — runs once, on the client that typed it', () => {
  it('!stations typed by a player posts one card — the player\'s', async () => {
    await type('pl-1', '!stations');
    const cards = table.cards(f => f.battleStationsCard);
    expect(cards.map(c => c.author)).toEqual(['pl-1']);
  });

  it('!oracle yes: one card and one oracle memory, narrated once — by the keyed GM, on its key', async () => {
    await setKeys('gm-1', 'pl-1');
    await type('pl-1', '!oracle yes likely is the hatch sealed');

    expect(table.cards(f => f.oracleCommandCard).map(c => c.author)).toEqual(['pl-1']);
    expect(state().recentOracles).toHaveLength(1);
    expect(state().recentOracles[0]).toMatchObject({ name: 'Ask the Oracle (likely)', question: 'is the hatch sealed' });
    expect(table.claude.calls.map(c => [c.client, c.apiKey])).toEqual([['gm-1', 'sk-ant-gina']]);
    expect(table.cards(f => f.oracleNarrationCard).map(c => c.author)).toEqual(['gm-1']);
  });

  it('!oracle yes with no Claude key anywhere: the card, and no narration', async () => {
    await type('pl-1', '!oracle yes is it a trap');
    expect(table.cards(f => f.oracleCommandCard)).toHaveLength(1);
    expect(table.claude.calls).toEqual([]);
    expect(table.cards(f => f.oracleNarrationCard)).toEqual([]);
  });

  it('a GM-only command typed by a player warns that player — and no GM client runs it', async () => {
    await type('pl-1', '!sector Veil');
    expect(client('pl-1').notifications.some(n => n.level === 'warn' && /GM-only/.test(n.message))).toBe(true);
    expect(state().activeSectorId).toBeNull();
    expect(table.cards(f => f.sectorSwitch)).toEqual([]);
    for (const id of ['gm-1', 'gm-2', 'pl-2']) expect(client(id).notifications, id).toEqual([]);
  });

  it('!sector <name> typed by the GM switches the active sector once', async () => {
    await type('gm-1', '!sector Veil');
    expect(state().activeSectorId).toBe('s1');
    expect(table.cards(f => f.sectorSwitch).map(c => c.author)).toEqual(['gm-1']);
  });

  it('bare !sector posts one usage card, whispered to the typist', async () => {
    await type('pl-1', '!sector');
    const usage = table.cards(f => f.sectorUsage);
    expect(usage).toHaveLength(1);
    expect(usage[0].whisper).toEqual(['pl-1']);
  });

  it('a dialog command opens its dialog on the typist\'s screen only', async () => {
    await type('pl-2', '!break');
    expect(table.dialogs.map(d => d.client)).toEqual(['pl-2']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CANONICAL_GM policy
// ─────────────────────────────────────────────────────────────────────────────

describe('CANONICAL_GM policy — a programmatic !x runs on the canonical GM', () => {
  async function postBangX(userId) {
    // A macro's ChatMessage.create — not typed, so the chatMessage
    // interception (playXCard) does not apply.
    await client(userId).run(() => ChatMessage.create({ content: '!x' }));
    await table.settle();
  }

  it('the canonical GM records the pause and posts one X-Card card', async () => {
    await postBangX('pl-1');
    expect(state().xCardActive).toBe(true);
    const cards = table.cards(f => f.xcardCard);
    expect(cards.map(c => c.author)).toEqual(['gm-1']);
    expect(cards[0].flags[MODULE_ID].type).toBe('xcard');
  });

  it('with no GM connected the author is warned and nothing is recorded', async () => {
    await table.leave('gm-1');
    await table.leave('gm-2');
    await postBangX('pl-1');
    expect(state().xCardActive).toBe(false);
    expect(client('pl-1').notifications.some(n => n.level === 'warn' && /no GM is connected/.test(n.message))).toBe(true);
    expect(client('pl-2').notifications).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CLAUDE policy
// ─────────────────────────────────────────────────────────────────────────────

describe('CLAUDE policy — the keyed canonical GM when one is connected, else the author', () => {
  const sceneCards = () => table.cards(f => f.sceneResponse);
  const callers = () => [...new Set(table.claude.calls.map(c => `${c.client}:${c.apiKey}`))];

  it('keyed GM connected: a keyed player\'s @scene runs once — on the GM, on the GM\'s key — and continues the scene in progress', async () => {
    await setKeys('gm-1', 'pl-1');
    await type('pl-1', '@scene what does the hangar smell like?');
    expect(callers()).toEqual(['gm-1:sk-ant-gina']);
    expect(sceneCards().map(c => c.author)).toEqual(['gm-1']);
    expect(state().currentSceneId).toBe('sc-old');
  });

  it('keyed GM connected, no scene in progress: the GM starts one for the @scene', async () => {
    table.world.setSetting('campaignState', { ...state(), currentSceneId: null });
    await setKeys('gm-1', 'pl-1');
    await type('pl-1', '@scene what does the hangar smell like?');
    expect(callers()).toEqual(['gm-1:sk-ant-gina']);
    expect(state().currentSceneId).toMatch(/^sc-/);
  });

  it('only the keyed second GM runs it when the lowest-id GM is keyless', async () => {
    await setKeys('gm-2');
    await type('pl-1', '@scene who is on watch?');
    expect(callers()).toEqual(['gm-2:sk-ant-gus']);
    expect(sceneCards().map(c => c.author)).toEqual(['gm-2']);
  });

  it('no keyed GM: the keyed author runs it on their own key — and leaves the scene start (a world write) to the GM', async () => {
    table.world.setSetting('campaignState', { ...state(), currentSceneId: null });
    await setKeys('pl-1');
    await type('pl-1', '@scene what is behind the hatch?');
    expect(callers()).toEqual(['pl-1:sk-ant-pat']);
    expect(sceneCards().map(c => c.author)).toEqual(['pl-1']);
    expect(state().currentSceneId).toBeNull();
    expect(table.errors).toEqual([]);
  });

  it('no keyed GM, keyless author: the author\'s client posts the key-not-configured fallback', async () => {
    await type('pl-1', '@scene anything?');
    expect(table.claude.calls).toEqual([]);
    const cards = sceneCards();
    expect(cards.map(c => c.author)).toEqual(['pl-1']);
    expect(cards[0].content).toMatch(/API key not configured/);
  });

  it('a keyed GM that is not connected does not count — the author runs it', async () => {
    await setKeys('gm-1', 'pl-1');
    await table.leave('gm-1');
    await type('pl-1', '@scene is anyone there?');
    expect(callers()).toEqual(['pl-1:sk-ant-pat']);
  });

  it('no GM at all: the author runs it and nobody is warned', async () => {
    await setKeys('pl-1');
    await table.leave('gm-1');
    await table.leave('gm-2');
    await type('pl-1', '@scene where are we?');
    expect(callers()).toEqual(['pl-1:sk-ant-pat']);
    for (const c of table.clients) expect(c.notifications.filter(n => n.level === 'warn'), c.id).toEqual([]);
  });

  it('a command typed by the second GM runs on the keyed canonical GM only', async () => {
    await setKeys('gm-1', 'gm-2');
    await type('gm-2', '@scene what hums below deck?');
    expect(callers()).toEqual(['gm-1:sk-ant-gina']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Commands are consumed everywhere
// ─────────────────────────────────────────────────────────────────────────────

describe('commands never reach the plain-narration pipeline', () => {
  it('a command is consumed on every client — no client runs the pipeline for it', async () => {
    await type('pl-1', '!oracle yes is it a trap and are we sure');
    expect(pacing.ranOn).toEqual([]);
  });

  it('plain narration reaches the pipeline once — on the canonical GM', async () => {
    await type('pl-1', 'I vault the barricade and run for the lift.');
    expect(pacing.ranOn).toEqual(['gm-1']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// !oracle <tableId>
// ─────────────────────────────────────────────────────────────────────────────

describe('!oracle <tableId> — roll any registered oracle table', () => {
  const card = () => table.cards(f => f.oracleCommandCard)[0];

  it('rolls a built-in table and posts one card with oracle-memory flags, narrated by the keyed GM', async () => {
    await setKeys('gm-1');
    await type('pl-1', '!oracle action what drives them');
    expect(table.cards(f => f.oracleCommandCard)).toHaveLength(1);
    const f = card().flags[MODULE_ID];
    expect(f.oracleTableId).toBe('action');
    expect(f.oracleMemory).toMatchObject({ name: expect.any(String), question: 'what drives them' });
    expect(typeof f.oracleMemory.answer).toBe('string');
    expect(card().content).toMatch(/d100 = <strong>\d+<\/strong>/);
    expect(table.claude.calls.map(c => c.client)).toEqual(['gm-1']);
    expect(table.claude.calls[0].userText).toContain('what drives them');
  });

  it('matches the table id case-insensitively', async () => {
    await type('pl-1', '!oracle ACTION');
    expect(card().flags[MODULE_ID].oracleTableId).toBe('action');
  });

  it('a custom table the GM adds with !oracle-add reaches every client (campaignState mirror) and rolls on a player\'s', async () => {
    client('gm-1').answerDialogs(d => d.submit({
      'input[name="tableId"]':      'ship_quirk_test',
      'input[name="name"]':         'Ship Quirks',
      'textarea[name="entries"]':   '1-6 Hums in the dark',
    }));
    await type('gm-1', '!oracle-add');
    expect(table.dialogs.map(d => [d.client, d.title])).toEqual([['gm-1', 'Add Custom Oracle Table']]);
    expect(table.cards(f => f.customOracleCard).map(c => c.author)).toEqual(['gm-1']);

    await type('pl-1', '!oracle ship_quirk_test');
    expect(table.cards(f => f.oracleCommandCard).map(c => c.author)).toEqual(['pl-1']);
    expect(card().content).toContain('Ship Quirks');
    expect(card().content).toContain('Hums in the dark');
    expect(card().content).toMatch(/d6 = /);
    expect(card().flags[MODULE_ID].oracleMemory.answer).toBe('Hums in the dark');
  });

  it('an unknown table id posts the usage card naming it — no narration', async () => {
    await setKeys('gm-1');
    await type('pl-1', '!oracle nosuchtable');
    expect(card().content).toContain('Usage');
    expect(card().content).toContain('nosuchtable');
    expect(table.claude.calls).toEqual([]);
  });

  it('"!oracle yes" keeps its yes/no behaviour', async () => {
    await type('pl-1', '!oracle yes likely does it hold');
    expect(card().content).toContain('Ask the Oracle (likely)');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// !recap while "Recap GM-only" is on
// ─────────────────────────────────────────────────────────────────────────────

describe('!recap with the Recap GM-only setting on', () => {
  beforeEach(async () => {
    await client('gm-1').setSetting('recapGmOnly', true);
    await table.settle();
  });

  it('tells the typing player it is GM-only — and nothing else happens anywhere', async () => {
    await type('pl-1', '!recap');
    expect(client('pl-1').notifications.some(n => /!recap is GM-only/.test(n.message))).toBe(true);
    for (const id of ['gm-1', 'gm-2', 'pl-2']) expect(client(id).notifications, id).toEqual([]);
    expect(table.cards(f => f.recapCard)).toEqual([]);
    expect(pacing.ranOn).toEqual([]);
  });

  it('a GM-typed !recap still runs — once, on the keyed canonical GM', async () => {
    await setKeys('gm-1');
    await type('gm-2', '!recap');
    expect(table.cards(f => f.recapCard).map(c => c.author)).toEqual(['gm-1']);
  });

  it('with no keyed GM a GM-typed !recap runs on its author', async () => {
    await type('gm-2', '!recap');
    expect(table.cards(f => f.recapCard).map(c => c.author)).toEqual(['gm-2']);
  });
});
