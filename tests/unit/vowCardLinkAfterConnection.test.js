/**
 * STARFORGED COMPANION
 * tests/unit/vowCardLinkAfterConnection.test.js
 *
 * known-issues VOW-CARD-LINK-ONLY-AT-POSTING (found while the long haul's
 * charter was written, issue #373 — its beats swear a vow in Begin a
 * Session's dialog, meet the session's first NPC, then link the vow to them).
 *
 * The "🆕 New vow recorded" card's 🤝 Link row lists the table's connections.
 * It was written once, when the card was posted, and only when a connection
 * already existed: a vow recorded before its connection was met got a card
 * with no Link, and no later way to get one — the link is made from that card
 * and nowhere else. The row now follows the table: it appears when the first
 * connection is created, takes a renamed connection's new name, and loses a
 * deleted one. A card already linked, or whose vow is gone, is left alone.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { buildPlayerVowSetupHtml, withVowLinkRow, refreshVowCardLinkRows } from '../../src/session/swearVow.js';
import { createConnection, renameVowLinks } from '../../src/entities/connection.js';

const MODULE_ID = 'starforged-companion';
const LINK = '[data-action="sf-player-vow-link"]';

let table, vow;
const cardOf = (id) => table.world.message(id);
const gm = (fn) => table.client('gm-1').run(fn);

function vowItem() {
  const item = {
    id: 'vow-1', name: 'Find the raiders', type: 'progress',
    system: { subtype: 'vow', rank: 'dangerous', current: 0, completed: false },
    flags: { [MODULE_ID]: { vowId: 'vow-1' } },
  };
  item.setFlag = async (mod, key, val) => { (item.flags[mod] ??= {})[key] = val; };
  // Foundry's Item#update over flag paths — the link writes the name and the id as one update.
  item.update = async (change) => { for (const [path, val] of Object.entries(change)) { const m = /^flags\.([^.]+)\.(.+)$/.exec(path); if (m) await item.setFlag(m[1], m[2], val); } };
  return item;
}

async function postVowCard(extraFlags = {}) {
  const msg = await gm(() => globalThis.ChatMessage.create({
    content: buildPlayerVowSetupHtml({ name: 'Find the raiders', rank: 'dangerous', connections: [] }),
    flags: { [MODULE_ID]: { playerVowCard: true, vowName: 'Find the raiders', vowId: 'vow-1', actorId: 'pc-kira', ...extraFlags } },
  }));
  await table.settle();
  return msg.id;
}

async function meet(name) {
  const record = await gm(() => createConnection({ name, role: 'salvage broker' }, structuredClone(globalThis.game.settings.get(MODULE_ID, 'campaignState'))));
  await table.settle(); await table.drain();
  return record;
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  await table.reset({ world: { settings: { campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', connectionIds: [] } } } });
  vow = vowItem();
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [vow] } });
});

describe('the vow card\'s Link row, as content', () => {
  const bare = buildPlayerVowSetupHtml({ name: 'Find the raiders', rank: 'dangerous', connections: [] });

  it('a card posted with no connections has no Link; given one, it has the row and the hint that names it', () => {
    expect(bare).not.toContain('sf-vow-link');
    const linked = withVowLinkRow(bare, ['Tamsin Vey']);
    expect(linked).toBe(buildPlayerVowSetupHtml({ name: 'Find the raiders', rank: 'dangerous', connections: ['Tamsin Vey'] }));
    expect(linked).toContain('<option value="Tamsin Vey">Tamsin Vey</option>');
    expect(linked).toContain('linking a connection makes fulfilling this vow deepen that bond');
  });

  it('the names are replaced, not added to; with none left the row goes; the rest of the card is untouched', () => {
    const one = withVowLinkRow(bare, ['Tamsin Vey']);
    const renamed = withVowLinkRow(one, ['Tamsin Okoro', 'Vance']);
    expect(renamed).not.toContain('Tamsin Vey');
    expect(renamed.match(/<option /g)).toHaveLength(3);
    expect(withVowLinkRow(renamed, [])).toBe(bare);
    expect(withVowLinkRow(one, ['Tamsin Vey'])).toBe(one);
    expect(withVowLinkRow('<p>Another card.</p>', ['Tamsin Vey']), 'not this card\'s shape').toBe('<p>Another card.</p>');
    expect(withVowLinkRow(bare, ['A "quoted" <name>'])).toContain('&lt;name&gt;');
  });
});

describe('a vow recorded before its connection is met', () => {
  it('its card gains the Link when the connection is created — and the link can then be made from it', async () => {
    const id = await postVowCard();
    expect(cardOf(id).content, 'no connection yet: no Link').not.toContain('sf-vow-link');

    const record = await meet('Tamsin Vey');
    expect(record?.name).toBe('Tamsin Vey');
    expect(cardOf(id).content, 'the card follows the table').toContain('<option value="Tamsin Vey">Tamsin Vey</option>');

    const client = table.client('pl-1');
    client.render(id).querySelector('.sf-vow-connection').value = 'Tamsin Vey';
    client.click(id, LINK);
    await table.settle(); await table.drain();
    expect(vow.flags[MODULE_ID].linkedConnectionName).toBe('Tamsin Vey');
    expect(vow.flags[MODULE_ID].linkedConnectionId, 'by the card\'s id').toBeTruthy();
    expect(cardOf(id).flags[MODULE_ID].linkedConnection).toBe('Tamsin Vey');
  }, 60_000);

  it('a second connection is offered beside the first; a renamed one is offered under its new name', async () => {
    const id = await postVowCard();
    await meet('Tamsin Vey');
    await meet('Vance Oduya');
    expect(cardOf(id).content).toContain('<option value="Vance Oduya">');
    const hostId = table.world.campaignState().connectionIds[0];
    await gm(async () => {
      const actor = globalThis.game.actors.get(hostId);
      await actor.update({ name: 'Tamsin Okoro', [`flags.${MODULE_ID}.connection.name`]: 'Tamsin Okoro' });
      await renameVowLinks(hostId, 'Tamsin Okoro');
    });
    await table.settle(); await table.drain();
    expect(cardOf(id).content).toContain('<option value="Tamsin Okoro">');
    expect(cardOf(id).content).not.toContain('Tamsin Vey');
  }, 60_000);

  it('a card already linked, and one whose vow is gone, are left as they are', async () => {
    const linked = await postVowCard({ linkedConnection: 'Somebody' });
    const gone = await postVowCard({ vowGone: true });
    await meet('Tamsin Vey');
    expect(cardOf(linked).content).not.toContain('sf-vow-link');
    expect(cardOf(gone).content).not.toContain('sf-vow-link');
  }, 60_000);

  it('only the canonical GM writes the shared card: a player\'s client changes nothing', async () => {
    const id = await postVowCard();
    table.addActor({ id: 'conn-1', name: 'Tamsin Vey', type: 'character', flags: { [MODULE_ID]: { entityType: 'connection', connection: { _id: 'r1', name: 'Tamsin Vey', rank: 'dangerous', active: true } } } });
    const state = { ...table.world.campaignState(), connectionIds: ['conn-1'] };
    expect(await table.client('pl-1').run(() => refreshVowCardLinkRows({ campaignState: state }))).toBe(0);
    expect(cardOf(id).content).not.toContain('sf-vow-link');
    expect(await gm(() => refreshVowCardLinkRows({ campaignState: state }))).toBe(1);
    expect(cardOf(id).content).toContain('Tamsin Vey');
  }, 60_000);
});
