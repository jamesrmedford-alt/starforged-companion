/**
 * The `!at` and `!sector` cards show a place's name as text
 * (issue #336 Y28, CARD-NAME-UNESCAPED).
 *
 * `!at Hollow` posted `<p>Current location set to <strong>${name}</strong> …`
 * with the place's name raw — a name the narrator proposed on a draft card and
 * the GM confirmed, or one the GM typed on the Actor sheet. Markup in it
 * rendered in every client's chat; a name carrying a tag was rendered as that
 * tag (the issue #322 V18 / #331 X45 class — the ◈ Site Discovered card, the
 * `!clear-site` card, the Set a Course feedback card and the Entities panel's
 * cards all escape theirs). The `!sector list` and `!sector <name>` cards
 * printed the sector's name (and region label) raw the same way.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const NAME = 'Hollow <b>Bride</b> & Co';
const SECTOR = 'Vega <i>Reach</i>';
let table;

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: { campaignState: {
    ...CampaignStateSchema, sessionActive: true,
    settlementIds: ['actor-hollow', 'actor-bleak'], currentLocationId: null, currentLocationType: null,
    sectors: [
      { id: 'sec-1', name: SECTOR, regionLabel: 'The <u>Outlands</u>' },
      { id: 'sec-2', name: 'Plain Mark', regionLabel: 'Terminus' },
    ],
    activeSectorId: 'sec-2',
  } } } });
  table.addActor({
    id: 'actor-hollow', type: 'location', name: NAME,
    flags: { [MODULE_ID]: { entityType: 'settlement', settlement: { _id: 'rec-hollow', name: NAME } } },
  });
  table.addActor({
    id: 'actor-bleak', type: 'location', name: 'Bleakhold',
    flags: { [MODULE_ID]: { entityType: 'settlement', settlement: { _id: 'rec-bleak', name: 'Bleakhold' } } },
  });
});

describe('the !at card', () => {
  it("shows the place's name as text", async () => {
    await table.client('gm-1').chat('!at Hollow');
    await table.settle();

    expect(table.world.campaignState().currentLocationId).toBe('actor-hollow');
    const card = table.cards(f => f.atCommandCard)[0];
    expect(card).toBeTruthy();
    // It was "<strong>Hollow <b>Bride</b> & Co</strong>".
    expect(card.content).toContain('Hollow &lt;b&gt;Bride&lt;/b&gt; &amp; Co');
    expect(card.content).not.toContain('<b>Bride</b>');
  }, 30_000);

  it('control: a plain name is set and shown', async () => {
    await table.client('gm-1').chat('!at Bleakhold');
    await table.settle();
    expect(table.world.campaignState().currentLocationId).toBe('actor-bleak');
    expect(table.cards(f => f.atCommandCard)[0]?.content).toContain('<strong>Bleakhold</strong>');
  }, 30_000);
});

describe('the !sector cards', () => {
  it("!sector list shows each sector's name and region as text", async () => {
    await table.client('gm-1').chat('!sector list');
    await table.settle();
    const card = table.cards(f => f.sectorList)[0];
    expect(card).toBeTruthy();
    expect(card.content).toContain('Vega &lt;i&gt;Reach&lt;/i&gt; (The &lt;u&gt;Outlands&lt;/u&gt;)');
    expect(card.content).not.toContain('<i>Reach</i>');
    expect(card.content).not.toContain('<u>Outlands</u>');
    expect(card.content).toContain('Plain Mark (Terminus) <em>[active]</em>');
  }, 30_000);

  it("!sector <name> shows the sector it switched to as text", async () => {
    await table.client('gm-1').chat(`!sector ${SECTOR}`);
    await table.settle();
    expect(table.world.campaignState().activeSectorId).toBe('sec-1');
    const card = table.cards(f => f.sectorSwitch)[0];
    expect(card).toBeTruthy();
    expect(card.content).toContain('<strong>Vega &lt;i&gt;Reach&lt;/i&gt;</strong>');
    expect(card.content).not.toContain('<i>Reach</i>');
  }, 30_000);
});
