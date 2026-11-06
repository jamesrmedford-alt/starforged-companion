/**
 * CARD-5 — a 🔁 Recommit that changes nothing says nothing to the presser
 * (eleventh audit, cards).
 *
 * Kira's Forge a Bond missed; its card offers "🔁 Recommit to the Bond" (issue
 * #330 D1). Her player presses it (relayed `bond.recommit`,
 * cardActions.applyRollerRecommit → index.js performBondRecommit):
 *   (a) the world refuses the connection record's write: `write-refused`, the
 *       claim released, a console warning on the GM — the player's button
 *       re-arms 15 s later, nothing said;
 *   (b) the bond was forged since (a later Forge a Bond hit): `no-connection`,
 *       the offer closed for good, a console warning on the GM — the button
 *       greys out, nothing said.
 * The vow's sibling says why (issue #335 Y10: "is already fulfilled — nothing
 * was recommitted"), and a refused reward pick or link whispers the presser
 * and the GMs (issue #329 X07). Brief / decisions #335–#337: "No silent no-op
 * on a player's action, relayed or not" — a refused write is said where it
 * was asked.
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../../src/moves/abilityScanner.js', async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude, failWrites } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

let table, sable;
const flags = (id) => table.world.message(id).flags[MODULE_ID];

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

function makeVow(over = {}) {
  const item = {
    id: 'vow-kira', type: 'progress', name: 'Find Chen', flags: { [MODULE_ID]: { vowId: 'vow-kira' } },
    system: { subtype: 'vow', rank: 'dangerous', current: 12, completed: false, ...over },
    async update(changes) {
      for (const [k, v] of Object.entries(changes)) {
        const parts = k.split('.'); let t = item;
        for (const p of parts.slice(0, -1)) t = (t[p] ??= {});
        t[parts.at(-1)] = v;
      }
      return item;
    },
    async setFlag(scope, key, value) { (item.flags[scope] ??= {})[key] = value; return item; },
  };
  return item;
}

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'rc-s1', sessionNumber: 1,
      currentSceneId: 'rc-scene', sceneTruths: [], clocks: [], connectionIds: ['npc-sable'] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [makeVow({ completed: true })] } });
  sable = table.addActor({ id: 'npc-sable', name: 'Sable', type: 'character', flags: { [MODULE_ID]: {
    entityType: 'connection', connection: {
      _id: 'conn-sable', name: 'Sable', rank: 'dangerous', relationshipTicks: 12, bonded: false, active: true, history: [],
    } } } });
  scriptClaude(table);
  silenceConsoleErrors();
});

/** Kira's Forge a Bond miss's offer, as postBondRecommitOfferCard posts it. */
async function bondOffer() {
  const card = await table.client('gm-1').run(() => globalThis.ChatMessage.create({
    content: '<div class="sf-ptp-card"><strong>Bond — recommit?</strong><div class="sf-milestone-suggest-row">'
      + '<button type="button" class="sf-followup-btn" data-action="sf-bond-recommit">🔁 Recommit to the Bond</button></div></div>',
    flags: { [MODULE_ID]: { bondRecommitOfferCard: true, hostId: 'npc-sable', connectionName: 'Sable', actorId: 'pc-kira' } },
  }));
  await table.settle();
  return card;
}

/** Kira's Fulfill Your Vow miss's offer, as postVowRecommitOfferCard posts it. */
async function vowOffer() {
  const card = await table.client('gm-1').run(() => globalThis.ChatMessage.create({
    content: '<div class="sf-ptp-card"><strong>Vow — recommit?</strong><div class="sf-milestone-suggest-row">'
      + '<button type="button" class="sf-followup-btn" data-action="sf-vow-recommit">🔁 Recommit to the Vow</button></div></div>',
    flags: { [MODULE_ID]: { vowRecommitOfferCard: true, vowName: 'Find Chen', itemId: 'vow-kira', actorId: 'pc-kira' } },
  }));
  await table.settle();
  return card;
}

/** Kira's player presses the offer; the cards posted by the press, other than a "Recommitted" card. */
async function pressAsKira(card, selector) {
  const before = new Set(table.world.messages().map(m => m.id ?? m._id));
  table.client('pl-1').click(card._id ?? card.id, selector);
  await table.settle(); await table.drain();
  return table.world.messages().filter(m => !before.has(m.id ?? m._id) && !m.flags?.[MODULE_ID]?.recommitCard);
}

/** A card the presser can see that names the connection — public, or whispered to them. */
const toldKira = (cards) => cards.filter(m => (!m.whisper?.length || m.whisper.includes('pl-1')) && /Sable/.test(m.content ?? ''));

describe('a 🔁 Recommit that changes nothing', () => {
  it('control: the vow\'s — a vow fulfilled since — says so (issue #335 Y10)', async () => {
    const card = await vowOffer();
    const posted = await pressAsKira(card, '[data-action="sf-vow-recommit"]');
    expect(posted.some(m => /already fulfilled/.test(m.content ?? ''))).toBe(true);
  }, 30_000);

  it('a bond forged since: the press says so, not only the GM\'s console', async () => {
    sable.flags[MODULE_ID].connection.bonded = true;
    const card = await bondOffer();
    const posted = await pressAsKira(card, '[data-action="sf-bond-recommit"]');
    expect(flags(card._id ?? card.id).recommitted, 'the offer is closed (setup)').toBe(true);
    expect(toldKira(posted).length, `what Kira's player was shown: ${JSON.stringify(posted.map(m => m.content))}`).toBeGreaterThan(0);
  }, 30_000);

  it('a record write the world refused: the press says so, not only the GM\'s console', async () => {
    const card = await bondOffer();
    const refused = failWrites(table, (w) => w.kind === 'actor.update' && w.id === 'npc-sable');
    const posted = await pressAsKira(card, '[data-action="sf-bond-recommit"]');
    expect(refused.refused, 'the record write was refused (setup)').toBe(1);
    expect(flags(card._id ?? card.id).recommitted, 'the claim is released (setup)').toBe(false);
    expect(sable.flags[MODULE_ID].connection.relationshipTicks).toBe(12);
    expect(toldKira(posted).length, `what Kira's player was shown: ${JSON.stringify(posted.map(m => m.content))}`).toBeGreaterThan(0);
  }, 30_000);
});
