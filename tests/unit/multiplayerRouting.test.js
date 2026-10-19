/**
 * STARFORGED COMPANION
 * tests/unit/multiplayerRouting.test.js
 *
 * The chat-command routing matrix (issue #282 item 2). Foundry fires
 * createChatMessage on every connected client; before the 2026-10 audit every
 * `!command` ran once per client (duplicate cards, independent dice, one
 * Claude call per keyed client, GM-only commands executed by the GM's client
 * for a player). Routing now runs each command exactly where its run-on
 * policy says (the CHAT_COMMAND_ROUTES table in src/index.js, the policy in
 * src/multiplayer/commandRouting.js).
 *
 * Every route × every table shape: the command is posted on a booted
 * four-client table (tests/helpers/multiClient.js) and must execute on
 * exactly the client(s) the policy names — once — and nowhere else. Each
 * client's route `run` is replaced by a recorder, so this pins the routing
 * decision only; what the handlers do is covered by chatCommandRouting and
 * the per-feature tests. A route added to CHAT_COMMAND_ROUTES without a
 * sample here fails the first test.
 *
 * The expected runner is re-derived from the policy below — not by calling
 * the routing module — so the matrix checks the implementation against the
 * decision record (decisions.md → "Chat commands run once").
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';

const { GM, GM2, P1, P2 } = USERS;

/** One message that matches each route FIRST (routes are first-match-wins). */
const SAMPLES = {
  '@scene':            '@scene what does the hangar smell like?',
  '!sector':           '!sector Veil',
  '!x':                '!x',
  '!at':               '!at Bleakhold',
  '!journal':          '!journal lore The forge burns cold',
  '!scene':            '!scene start',
  '!truth / !state':   '!truth strike abc123',
  '!truths':           '!truths',
  '!lore':             '!lore',
  '!sfc encounter':    '!sfc encounter Ember Wisp',
  '!recap':            '!recap',
  '!recap (GM-only)':  '!recap',
  '!pace':             '!pace hot',
  '!migrate-entities': '!migrate-entities',
  '!oracle':           '!oracle yes likely is the hatch sealed',
  '!pay-the-price':    '!ptp',
  '!bond':             '!bond dangerous Kira',
  '!sever':            '!sever Kira',
  '!flag':             '!flag',
  '!fate':             '!fate',
  '!break':            '!break',
  '!begin-session':    '!begin-session',
  '!end-session':      '!end-session',
  '!incite':           '!incite',
  '!reveal-site':      '!reveal-site The Vault',
  '!clear-site':       '!clear-site The Vault',
  '!clock':            '!clock advance Reactor',
  '!repair':           '!repair',
  '!stations':         '!stations',
  '!shipmap':          '!shipmap',
  '!ship envision':    '!ship envision',
  '!ship history':     '!ship history',
  '!oracle-add':       '!oracle-add',
  '!roll':             '!roll',
};

/** World settings a sample needs to reach its route. */
function routeWorld(name) {
  // "Recap GM-only" splits !recap: on → a player's !recap is the denied route.
  return { recapGmOnly: name === '!recap (GM-only)' };
}

/** Table shapes: who typed it, which GMs advertise a Claude key, who is away. */
const SHAPES = [
  { name: 'every client connected, no Claude key anywhere',         author: 'pl-1', keyed: [],       away: [] },
  { name: 'the canonical GM is keyed',                              author: 'pl-1', keyed: ['gm-1'], away: [] },
  { name: 'only the second GM is keyed',                            author: 'pl-1', keyed: ['gm-2'], away: [] },
  { name: 'no GM connected',                                        author: 'pl-1', keyed: [],       away: ['gm-1', 'gm-2'] },
  { name: 'typed by the second GM while the canonical GM is keyed', author: 'gm-2', keyed: ['gm-1'], away: [] },
];

const GM_IDS = ['gm-1', 'gm-2'];

/** Lowest-id active GM, keyed GMs first (gmGate.js isCanonicalGM). */
function canonicalGm(shape) {
  const active = GM_IDS.filter(id => !shape.away.includes(id));
  if (!active.length) return null;
  const keyed = active.filter(id => shape.keyed.includes(id));
  return [...(keyed.length ? keyed : active)].sort()[0];
}

/** decisions.md → "Chat commands run once": who executes a route. */
function expectedRunners(runOn, shape) {
  if (runOn === 'author') return [shape.author];
  if (runOn === 'canonical-gm') {
    const gm = canonicalGm(shape);
    return gm ? [gm] : [];
  }
  if (runOn === 'claude') {
    const keyedGmActive = GM_IDS.some(id => !shape.away.includes(id) && shape.keyed.includes(id));
    return keyedGmActive ? [canonicalGm(shape)] : [shape.author];
  }
  throw new Error(`unknown run-on policy ${runOn}`);
}

let table;
let ran;

beforeAll(async () => {
  table = await simulateTable({ users: [GM, GM2, P1, P2] });
  ran = [];
  // Record instead of executing — on every client's own module copy.
  for (const client of table.clients) {
    for (const route of client.index.CHAT_COMMAND_ROUTES) {
      route.run = (message) => { ran.push({ client: client.id, route: route.name, id: message.id }); };
    }
  }
}, 30_000);

afterAll(() => table?.teardown());

async function post(shape, name) {
  await table.reset({ world: { settings: { ...routeWorld(name), keyedGmUserIds: shape.keyed } } });
  for (const id of shape.away) await table.leave(id);
  ran.length = 0;
  const author = table.client(shape.author);
  // Created directly (not typed) so the routing table sees it: a typed `!x`
  // is cancelled before creation by the chatMessage hook (multiplayerRelay).
  const message = await author.run(() => ChatMessage.create({ content: SAMPLES[name] }));
  await table.settle();
  return message;
}

describe('CHAT_COMMAND_ROUTES coverage', () => {
  it('every route has a sample, and each sample matches its own route first', async () => {
    const p1 = table.client('pl-1');
    const routes = p1.index.CHAT_COMMAND_ROUTES;
    expect(Object.keys(SAMPLES).sort()).toEqual(routes.map(r => r.name).sort());

    for (const [name, content] of Object.entries(SAMPLES)) {
      await table.reset({ world: { settings: routeWorld(name) } });
      const first = p1.run(() => routes.find(r => r.match({ content, flags: {}, author: p1.user })));
      expect(first?.name, content).toBe(name);
    }
  });

  it('every route declares a known policy', async () => {
    const gm = table.client('gm-1');
    const { RUN_ON } = await gm.import('../../src/multiplayer/commandRouting.js');
    const { CHAT_COMMAND_ROUTES } = gm.index;
    for (const route of CHAT_COMMAND_ROUTES) {
      expect(Object.values(RUN_ON), route.name).toContain(route.runOn);
    }
  });
});

describe.each(SHAPES)('routing matrix — $name', (shape) => {
  const authorIsGm = GM_IDS.includes(shape.author);
  // A GM's !recap is never the GM-only-denied route.
  const names = Object.keys(SAMPLES).filter(n => !(authorIsGm && n === '!recap (GM-only)'));

  it.each(names)('%s executes exactly where its policy says, once', async (name) => {
    const route = table.client('gm-1').index.CHAT_COMMAND_ROUTES.find(r => r.name === name);
    const message = await post(shape, name);

    const runs = ran.filter(r => r.id === message.id).map(r => [r.client, r.route]);
    expect(runs).toEqual(expectedRunners(route.runOn, shape).map(client => [client, name]));
  });
});

describe('a canonical-GM command with no GM connected', () => {
  it('warns the author only — and nobody runs it', async () => {
    const shape = SHAPES.find(s => s.away.length);
    const message = await post(shape, '!x');
    expect(ran.filter(r => r.id === message.id)).toEqual([]);
    expect(table.client('pl-1').notifications.filter(n => n.level === 'warn' && /no GM is connected/.test(n.message)))
      .toHaveLength(1);
    expect(table.client('pl-2').notifications).toEqual([]);
  });
});
