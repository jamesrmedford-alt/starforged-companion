/**
 * STARFORGED COMPANION
 * tests/unit/recommitOnce.test.js
 *
 * One recommit offer recommits the expedition once (issue #321 U20). A Finish
 * an Expedition miss posts a "🔁 Recommit to the Expedition" offer; its button
 * disabled only the clicked element on the clicker's client and then ran the
 * recommit (canonical GM) or emitted the raw `expedition.recommit` socket
 * message (anyone else). Nothing claimed the card: every click — the player's
 * and the GM's on the same card, or one after a re-render re-armed the button
 * — rolled the challenge dice again, cleared boxes again and raised the rank
 * again. The click now relays through gmRelay "expedition.recommit" (the
 * legacy relay folded in, RELAY-LEGACY-KINDS), whose handler claims the
 * GM-authored card (`recommitted`) before recommitting.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';

let table, journal;
const tracks = () => journal.getFlag(MODULE_ID, 'tracks') ?? [];

function makeTracksJournal() {
  const flags = {};
  return {
    id: 'tracks-journal', name: 'Starforged Progress Tracks',
    getFlag: (mod, key) => flags[`${mod}.${key}`],
    setFlag: async (mod, key, value) => { flags[`${mod}.${key}`] = structuredClone(value); },
  };
}

async function openExpedition() {
  const gm = table.client('gm-1');
  const store = await gm.import('../../src/ui/progressTracks.js');
  return gm.run(async () => {
    const t = await store.addProgressTrack({ label: 'The Drift', type: 'expedition', rank: 'dangerous' });
    await store.updateTrackFields(t.id, { ticks: 24 });
    return t;
  });
}

// The offer card exactly as postRecommitOfferCard posts it (GM-authored).
async function postOffer(track) {
  const gm = table.client('gm-1');
  const msg = await gm.run(() => globalThis.ChatMessage.create({
    content: `<div class="sf-ptp-card"><strong>Expedition — recommit?</strong><p>…</p>`
      + `<div class="sf-milestone-suggest-row"><button type="button" class="sf-followup-btn" data-action="sf-recommit" `
      + `title="Roll challenge dice, clear the lowest die's boxes, raise the rank">🔁 Recommit to the Expedition</button></div></div>`,
    flags: { [MODULE_ID]: { recommitOfferCard: true, trackId: track.id, trackLabel: track.label } },
  }));
  await table.settle();
  return msg.id;
}

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: { campaignState: { ...CampaignStateSchema, sessionActive: true } } } });
  journal = makeTracksJournal();
  table.journal._set(journal);
});

describe('one recommit offer recommits once (issue #321 U20)', () => {
  it('the player and the GM both pressing Recommit on one card recommits once', async () => {
    const track = await openExpedition();
    const id = await postOffer(track);

    table.client('pl-1').click(id, '[data-action="sf-recommit"]');
    await table.settle();
    table.client('gm-1').click(id, '[data-action="sf-recommit"]');
    await table.settle();

    // One recommit — one card, the rank raised one step — claimed on the offer card.
    expect(table.cards(f => f.recommitCard)).toHaveLength(1);
    expect(tracks().find(t => t.id === track.id).rank).toBe('formidable');
    expect(table.world.message(id).flags[MODULE_ID].recommitted).toBe(true);
  }, 30_000);

  it('a player\'s press is applied on the canonical GM and shows used everywhere', async () => {
    const track = await openExpedition();
    const id = await postOffer(track);

    table.client('pl-1').click(id, '[data-action="sf-recommit"]');
    await table.settle();

    expect(table.cards(f => f.recommitCard)).toHaveLength(1);
    expect(tracks().find(t => t.id === track.id).ticks).toBeLessThan(24);
    expect(table.client('gm-1').render(id).querySelector('[data-action="sf-recommit"]').disabled).toBe(true);
  }, 30_000);

  it('a re-rendered offer card does not recommit a second time', async () => {
    const track = await openExpedition();
    const id = await postOffer(track);

    table.client('gm-1').click(id, '[data-action="sf-recommit"]');
    await table.settle();
    table.client('gm-1').render(id);                       // a chat re-render (scroll-back, reload)
    table.client('gm-1').click(id, '[data-action="sf-recommit"]');
    await table.settle();

    expect(table.cards(f => f.recommitCard)).toHaveLength(1);
    expect(tracks().find(t => t.id === track.id).rank).toBe('formidable');
  }, 30_000);
});
