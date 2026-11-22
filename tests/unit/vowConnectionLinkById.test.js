/**
 * STARFORGED COMPANION
 * tests/unit/vowConnectionLinkById.test.js
 *
 * Known-issues VOW-CONNECTION-LINK-BY-NAME — a vow sworn to a connection is
 * linked to that connection's NPC card, by the card's Actor id
 * (`linkedConnectionId`); the name beside it (`linkedConnectionName`) is what
 * the vow's cards say, and follows the card.
 *
 * The vow held the name alone. Renamed, the NPC card was no longer found — a
 * fulfilment's relationship progress went nowhere, with a "Vow payoff
 * incomplete" card whose Retry could not land — and when another NPC card
 * had taken the old name, that connection was marked in its place, with no
 * card at all. The fulfilment and the reload repair are in
 * generatedSequences.test.js; here, every other reader of the link:
 *
 *   - the won-fight card's 🤝 Deepen your bond with …;
 *   - a "Vow payoff incomplete" card's Retry;
 *   - the delete of an NPC card (the vow's link, the cards in chat);
 *   - the rename through the module's own update (updateConnection);
 *   - a connection that is severed;
 * and the other writer of the link — the crew's opening vow, sworn to the
 * person its card names.
 *
 * Kira's vow "Find Kade" is linked to Sable (c2) with the vow card's 🤝 Link;
 * Orrin (c3) is Ash's connection. Then c2 is renamed Vega and c3 is renamed
 * Sable — the name the vow was linked under now names somebody else.
 *
 * On the generated sequences' table: three booted clients, Items and Actors
 * as live documents, no module mocked.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';

import { MODULE_ID } from '../helpers/multiClient.js';
import { failWrites } from '../helpers/faults.js';
import { bootSequenceTable, usableTable, SequenceWorld } from '../helpers/sequence/world.js';

const GM = 'gm-1';
const KIRA = 'pl-1';
const VOW = 'Find Kade';
const CONNECTIONS = [
  { ref: 'c2', name: 'Sable', rank: 'dangerous', ticks: 8, holder: 'pc-kira' },
  { ref: 'c3', name: 'Orrin', rank: 'dangerous', ticks: 0, holder: 'pc-ash' },
];

let table, world;

beforeAll(async () => { table = await bootSequenceTable(); }, 60_000);
afterAll(() => { SequenceWorld.release(); table?.teardown(); });
afterEach(() => SequenceWorld.release());

beforeEach(async () => {
  table = await usableTable(table);
  world = await SequenceWorld.start(table, { connections: CONNECTIONS });
  await world.addVow('v1', { pc: 'pc-kira', name: VOW, rank: 'dangerous' });
  await world.linkVow('v1', 'c2', { pc: 'pc-kira' });
  await world.setVowTicks('v1', { pc: 'pc-kira', ticks: 40 });
}, 60_000);

const link = () => {
  const f = world.vowItem('v1').flags[MODULE_ID] ?? {};
  return { name: f.linkedConnectionName ?? null, id: f.linkedConnectionId ?? null };
};
const ticks = (ref) => world.actor(world.hostId(ref))?.flags[MODULE_ID].connection.relationshipTicks ?? null;
const cards = (flag) => table.cards(f => f[flag]);

/** The name the vow was linked under now names Orrin's card; Sable's is called Vega. */
async function swapTheNames() {
  await world.renameConnection('c2', { name: 'Vega' });
  await world.renameConnection('c3', { name: 'Sable' });
}

/** The pipeline's won-fight branch: Kira won a fight serving the vow. */
async function postVictoryCard() {
  const gm = table.client(GM);
  const { postFightVowMilestoneCard } = await gm.import('../../src/index.js');
  await gm.run(() => postFightVowMilestoneCard(VOW, 1, 'pc-kira'));
  await world.quiet();
  return cards('fightVowCard').at(-1);
}

describe('the won-fight card\'s 🤝 Deepen (VOW-CONNECTION-LINK-BY-NAME)', () => {
  it('carries the connection\'s card id, and deepens that card\'s bond after the names are swapped', async () => {
    const card = await postVictoryCard();
    expect(table.world.message(card._id).flags[MODULE_ID]).toMatchObject({ connectionName: 'Sable', connectionId: world.hostId('c2') });
    await swapTheNames();

    await world.press(KIRA, card._id, '[data-action="sf-deepen-bond"]');

    expect([ticks('c2'), ticks('c3')]).toEqual([16, 0]);
  });

  it('a card posted before links carried an id reads it off the vow', async () => {
    const posted = await table.client(GM).run(() => ChatMessage.create({
      content: '<div class="sf-card sf-fight-vow"><button type="button" class="entity-btn" data-action="sf-deepen-bond">🤝 Deepen your bond with Sable</button></div>',
      flags: { [MODULE_ID]: { fightVowCard: true, vowName: VOW, vowId: world.vowItem('v1').id, vowRank: 1, actorId: 'pc-kira', connectionName: 'Sable', marks: 1 } },
    }));
    await world.quiet();
    await swapTheNames();

    await world.press(KIRA, posted.id, '[data-action="sf-deepen-bond"]');

    expect([ticks('c2'), ticks('c3')]).toEqual([16, 0]);
  });
});

describe('a "Vow payoff incomplete" card\'s Retry (VOW-CONNECTION-LINK-BY-NAME)', () => {
  it('its deepen step carries the card id: retried after the names are swapped, it lands on the vow\'s connection', async () => {
    const refusal = failWrites(table, w => w.kind === 'actor.update' && w.id === world.hostId('c2'));
    await world.fulfilVow('v1', { pc: 'pc-kira', name: VOW, challenge: [1, 2] });
    refusal.off();
    expect(refusal.refused, 'the relationship write was refused (setup)').toBe(1);
    const failed = cards('payoffFailureCard').at(-1);
    expect(table.world.message(failed._id).flags[MODULE_ID].steps.find(s => s.step === 'deepen')).toMatchObject({ connectionName: 'Sable', connectionId: world.hostId('c2') });
    expect([ticks('c2'), ticks('c3')]).toEqual([8, 0]);
    await swapTheNames();

    await world.press(GM, failed._id, '[data-action="sf-payoff-retry"]');

    expect([ticks('c2'), ticks('c3')]).toEqual([16, 0]);
  });
});

describe('deleting the NPC card (VOW-CONNECTION-LINK-BY-NAME)', () => {
  it('clears the vow\'s link though another card has the name it was linked under — that card is somebody else', async () => {
    const victory = await postVictoryCard();
    await swapTheNames();

    await table.client(GM).run(() => world.actor(world.hostId('c2')).delete());
    await world.quiet();

    expect(link()).toEqual({ name: null, id: null });
    expect(cards('vowLinkClearedNotice')).toHaveLength(1);
    expect(table.world.message(victory._id).flags[MODULE_ID].deepenRetired, 'its 🤝 is retired').toBe(true);
    await world.fulfilVow('v1', { pc: 'pc-kira', name: VOW, challenge: [1, 2] });
    expect(ticks('c3'), 'the namesake is not developed in her place').toBe(0);
    expect(cards('payoffFailureCard')).toEqual([]);
  });

  it('deleting the namesake leaves the vow\'s link, and its victory card, as they are', async () => {
    const victory = await postVictoryCard();
    await swapTheNames();

    await table.client(GM).run(() => world.actor(world.hostId('c3')).delete());
    await world.quiet();

    expect(link()).toEqual({ name: 'Vega', id: world.hostId('c2') });
    expect(cards('vowLinkClearedNotice')).toEqual([]);
    expect(table.world.message(victory._id).flags[MODULE_ID].deepenRetired ?? false).toBe(false);
  });
});

describe('the crew\'s opening vow, sworn to the person it names (VOW-CONNECTION-LINK-BY-NAME)', () => {
  it('every PC\'s copy is linked to the NPC card the swearing makes for them, by its id', async () => {
    const gm = table.client(GM);
    const posted = await gm.run(() => ChatMessage.create({
      content: '<div class="sf-incite-card"><div class="sf-incite-actions"><button>⚔</button></div></div>',
      flags: { [MODULE_ID]: { incitingIncidentCard: true, incitingMeta: {
        vow: { statement: 'Bring Vance home', rank: 'dangerous' }, clock: null, immediateCrisis: null,
        target: { name: 'Vance', pronouns: 'he/him', description: 'An old mentor, adrift.' },
      } } },
    }));
    await world.quiet();
    const { swearSharedVowForAll } = await gm.import('../../src/session/swearVow.js');

    await gm.run(() => swearSharedVowForAll(gm.message(posted.id)));
    await world.quiet();

    const vance = table.actors.filter(a => a.flags?.[MODULE_ID]?.entityType === 'connection' && a.name === 'Vance');
    expect(vance, 'the swearing made Vance a card').toHaveLength(1);
    for (const pc of ['pc-kira', 'pc-ash']) {
      const copy = world.actor(pc).items.contents.find(i => i.flags?.[MODULE_ID]?.sharedVow);
      expect(copy.flags[MODULE_ID], `${pc}'s copy`).toMatchObject({ linkedConnectionName: 'Vance', linkedConnectionId: vance[0].id });
    }
  });
});

describe('the other ways a connection changes (VOW-CONNECTION-LINK-BY-NAME)', () => {
  it('renamed through the module\'s own update, the vow takes the new name', async () => {
    const gm = table.client(GM);
    const { updateConnection } = await gm.import('../../src/entities/connection.js');
    await gm.run(() => updateConnection(world.hostId('c2'), { name: 'Vega' }));
    await world.quiet();

    expect(link()).toEqual({ name: 'Vega', id: world.hostId('c2') });
  });

  it('severed, she is not found — and a namesake is not developed in her place; the GMs\' card says she is gone, not renamed', async () => {
    const gm = table.client(GM);
    const { updateConnection } = await gm.import('../../src/entities/connection.js');
    await gm.run(() => updateConnection(world.hostId('c2'), { active: false }));
    await world.renameConnection('c3', { name: 'Sable' });

    await world.fulfilVow('v1', { pc: 'pc-kira', name: VOW, challenge: [1, 2] });

    expect([ticks('c2'), ticks('c3')]).toEqual([8, 0]);
    const failed = cards('payoffFailureCard').at(-1);
    expect(table.world.message(failed._id).content).toContain('severed or deleted');
  });
});
