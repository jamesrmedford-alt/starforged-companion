/* global silenceConsoleErrors, structuredClone */
/**
 * STARFORGED COMPANION
 * tests/unit/recommitOutcomeTold.test.js
 *
 * Issue #342 Z58 (RECOMMIT-REFUSED-UNTOLD) — a 🔁 Recommit that changes
 * nothing says so to the presser.
 *
 * Kira's Forge a Bond missed; its card offers "🔁 Recommit to the Bond" (issue
 * #330 D1). Her player presses it (relayed `bond.recommit`,
 * cardActions.applyRollerRecommit → index.js performBondRecommit):
 *   (a) the world refuses the connection record's write: `write-refused`, the
 *       claim released, a console warning on the GM — the player's button
 *       re-armed 15 s later, nothing said;
 *   (b) the bond was forged since (a later Forge a Bond hit): `no-connection`,
 *       the offer closed for good, a console warning on the GM — the button
 *       greyed out, nothing said.
 * The vow's (a refused Item write; a vow deleted since → `no-vow`) and the
 * expedition's (a refused track write; an expedition finished since →
 * `no-track`) were the same. The vow's sibling said why (issue #335 Y10:
 * "is already fulfilled — nothing was recommitted"), and a refused reward
 * pick or link whispers the presser and the GMs (issue #329 X07). Decisions
 * #335–#337: "No silent no-op on a player's action, relayed or not". Now a
 * refused write is whispered to the presser and the GMs, and a target gone,
 * finished or bonded since gets Y10's short card.
 *
 * Also known-issues RECOMMIT-GONE-ROLLER-WORDING: a recommit whose roller was
 * deleted told a player "names no character of yours" and did nothing,
 * silently, for a GM — now refused as gone, to either, as the card-roller
 * buttons are.
 *
 * Driven on a booted table: Kira's player clicks the real offer card.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../src/moves/abilityScanner.js', async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude, failWrites } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

let table, sable, vow, journal;
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

/** The "Starforged Progress Tracks" journal: a document-level flag store; `refuse` refuses the next write. */
function makeTracksJournal() {
  const store = {};
  const j = {
    id: 'tracks-journal', name: 'Starforged Progress Tracks', refuse: false,
    getFlag: (mod, key) => store[`${mod}.${key}`],
    setFlag: async (mod, key, value) => {
      if (j.refuse) { j.refuse = false; throw new Error('The server refused the journal update (test fault)'); }
      store[`${mod}.${key}`] = structuredClone(value);
    },
  };
  return j;
}

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'rc-s1', sessionNumber: 1,
      currentSceneId: 'rc-scene', sceneTruths: [], clocks: [], connectionIds: ['npc-sable'] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  vow = makeVow();
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [vow] } });
  sable = table.addActor({ id: 'npc-sable', name: 'Sable', type: 'character', flags: { [MODULE_ID]: {
    entityType: 'connection', connection: {
      _id: 'conn-sable', name: 'Sable', rank: 'dangerous', relationshipTicks: 12, bonded: false, active: true, history: [],
    } } } });
  journal = makeTracksJournal();
  table.journal._set(journal);
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

/** A Finish an Expedition miss's offer, as postRecommitOfferCard posts it, for a track opened through the real store. */
async function expeditionOffer({ completed = false } = {}) {
  const gm = table.client('gm-1');
  const store = await gm.import('../../src/ui/progressTracks.js');
  const track = await gm.run(async () => {
    const t = await store.addProgressTrack({ label: 'The Drift Run', type: 'expedition', rank: 'dangerous' });
    await store.updateTrackFields(t.id, { ticks: 12, ...(completed ? { completed: true } : {}) });
    return t;
  });
  const card = await gm.run(() => globalThis.ChatMessage.create({
    content: '<div class="sf-ptp-card"><strong>Expedition — recommit?</strong><div class="sf-milestone-suggest-row">'
      + '<button type="button" class="sf-followup-btn" data-action="sf-recommit">🔁 Recommit to the Expedition</button></div></div>',
    flags: { [MODULE_ID]: { recommitOfferCard: true, trackId: track.id, trackLabel: 'The Drift Run' } },
  }));
  await table.settle();
  return { card, track, store };
}

/** `user` presses the offer; the cards posted by the press, other than a "Recommitted" card. */
async function press(card, selector, user = 'pl-1') {
  const before = new Set(table.world.messages().map(m => m.id ?? m._id));
  table.client(user).click(card._id ?? card.id, selector);
  await table.settle(); await table.drain();
  return table.world.messages().filter(m => !before.has(m.id ?? m._id) && !m.flags?.[MODULE_ID]?.recommitCard);
}
const pressAsKira = (card, selector) => press(card, selector, 'pl-1');

/** A card the presser can see that names `name` — public, or whispered to them. */
const toldTo = (cards, user, name) => cards.filter(m => (!m.whisper?.length || m.whisper.includes(user)) && m.content?.includes(name));
const toldKira = (cards, name = 'Sable') => toldTo(cards, 'pl-1', name);

describe('a 🔁 Recommit that changes nothing', () => {
  it('control: the vow\'s — a vow fulfilled since — says so (issue #335 Y10)', async () => {
    vow.system.completed = true;
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
    expect(toldKira(posted)[0].content).toContain('is already bonded');
  }, 30_000);

  it('a record write the world refused: the press says so, not only the GM\'s console', async () => {
    const card = await bondOffer();
    const refused = failWrites(table, (w) => w.kind === 'actor.update' && w.id === 'npc-sable');
    const posted = await pressAsKira(card, '[data-action="sf-bond-recommit"]');
    expect(refused.refused, 'the record write was refused (setup)').toBe(1);
    expect(flags(card._id ?? card.id).recommitted, 'the claim is released (setup)').toBe(false);
    expect(sable.flags[MODULE_ID].connection.relationshipTicks).toBe(12);
    const [told] = toldKira(posted);
    expect(told, `what Kira's player was shown: ${JSON.stringify(posted.map(m => m.content))}`).toBeTruthy();
    // Said to the presser and the GMs, as a refused reward pick is (X07); the press can be made again.
    expect(told.whisper).toEqual(expect.arrayContaining(['pl-1', 'gm-1']));
    expect(told.content).toContain('could not be saved');

    const again = await pressAsKira(card, '[data-action="sf-bond-recommit"]');
    expect(again.filter(m => m.flags?.[MODULE_ID]?.recommitOutcomeNotice)).toHaveLength(0);
    expect(sable.flags[MODULE_ID].connection.relationshipTicks).toBeLessThan(12);
  }, 30_000);

  it('a vow deleted since: the press says so', async () => {
    const card = await vowOffer();
    const sheet = table.actors.get('pc-kira').items.contents;
    sheet.splice(sheet.indexOf(vow), 1);
    const posted = await pressAsKira(card, '[data-action="sf-vow-recommit"]');
    expect(toldKira(posted, 'Find Chen').map(m => m.content).join(' ')).toContain('nothing was recommitted');
  }, 30_000);

  it('a vow Item write the world refused: whispered to the presser and the GMs, and the offer is pressable again', async () => {
    const card = await vowOffer();
    const realUpdate = vow.update;
    vow.update = async () => { vow.update = realUpdate; throw new Error('The server refused the Item update (test fault)'); };
    const posted = await pressAsKira(card, '[data-action="sf-vow-recommit"]');
    const [told] = toldKira(posted, 'Find Chen');
    expect(told?.whisper).toEqual(expect.arrayContaining(['pl-1', 'gm-1']));
    expect(told?.content).toContain('could not be saved');
    expect({ ticks: vow.system.current, recommitted: flags(card._id ?? card.id).recommitted }).toEqual({ ticks: 12, recommitted: false });
  }, 30_000);

  it('an expedition finished since: the press says so', async () => {
    const { card } = await expeditionOffer({ completed: true });
    const posted = await pressAsKira(card, '[data-action="sf-recommit"]');
    expect(toldKira(posted, 'The Drift Run').map(m => m.content).join(' ')).toContain('is finished');
  }, 30_000);

  it('an expedition track write the world refused: the press says so', async () => {
    const { card, track, store } = await expeditionOffer();
    journal.refuse = true;
    const posted = await pressAsKira(card, '[data-action="sf-recommit"]');
    expect(toldKira(posted, 'The Drift Run').map(m => m.content).join(' ')).toContain('could not be saved');
    const tracks = await table.client('gm-1').run(() => store.listProgressTracks());
    expect(tracks.find(t => t.id === track.id).ticks).toBe(12);
  }, 30_000);
});

describe('a 🔁 Recommit whose roller is gone (known-issues RECOMMIT-GONE-ROLLER-WORDING)', () => {
  it('is refused as gone, to the player and to a GM — told, not silent', async () => {
    const card = await vowOffer();
    table.actors.delete('pc-kira');
    for (const user of ['pl-1', 'gm-1']) {
      const posted = await press(card, '[data-action="sf-vow-recommit"]', user);
      const notice = posted.find(m => m.flags?.[MODULE_ID]?.pressRefusedNotice);
      expect(notice?.content, `${user}'s press`).toContain('Character gone');
      expect(notice?.whisper).toEqual(expect.arrayContaining([user]));
    }
    expect(flags(card._id ?? card.id).recommitted ?? false).toBe(false);
  }, 30_000);
});
