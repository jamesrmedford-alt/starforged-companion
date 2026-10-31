/**
 * PROBE — RECOMMIT-REPEAT
 *
 * A Finish an Expedition miss posts a "🔁 Recommit to the Expedition" offer
 * (postRecommitOfferCard, src/index.js ~3461). Its button (registerRecommitHook
 * ~3497) disables only the clicked element on the clicker's client and then
 * runs performRecommit (canonical GM) or emits the raw `expedition.recommit`
 * socket (anyone else). Nothing claims or stamps the card, and performRecommit
 * (~3474) checks only that the track is open: every click — the player's and
 * the GM's on the same card, or one click after a re-render re-arms the button
 * — rolls the challenge dice again, clears boxes again and raises the rank
 * again.
 *
 * Correct behaviour (asserted): one offer card recommits the expedition once.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

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

describe('PROBE RECOMMIT-REPEAT', () => {
  it('the player and the GM both pressing Recommit on one card recommits once', async () => {
    const track = await openExpedition();
    const id = await postOffer(track);

    table.client('pl-1').click(id, '[data-action="sf-recommit"]');
    await table.settle();
    table.client('gm-1').click(id, '[data-action="sf-recommit"]');
    await table.settle();

    // Expected: one recommit — one card, the rank raised one step.
    expect(table.cards(f => f.recommitCard)).toHaveLength(1);
    expect(tracks().find(t => t.id === track.id).rank).toBe('formidable');
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
