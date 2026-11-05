/**
 * PROBE — SECTORS-02 AT-CARD-UNESCAPED-NAME (tenth audit, area sectors)
 *
 * What the user does: the GM types `!at Hollow` to set the current location
 * to a settlement whose name holds markup — a name the narrator proposed on
 * a draft card and the GM confirmed, or one the GM typed on the Actor sheet
 * ("Hollow <b>Bride</b> & Co").
 *
 * What happens: handleAtCommand (src/index.js) posts
 * `<p>Current location set to <strong>${match.entity.name}</strong> …` with
 * the name raw: the markup renders in every client's chat, and a name
 * carrying a tag is rendered as that tag (the issue #322 V18 / #331 X45
 * class — the ◈ Site Discovered card, the !clear-site card, the Set a Course
 * feedback card and the Entities panel's cards all escape theirs).
 *
 * What should happen: the name is shown as text — escapeChatHtml at the
 * sink, as the sibling cards do (rules: "HTML sinks — model text, user
 * text, entity names reaching innerHTML / card content unescaped").
 *
 * Control: a plain name is set and shown.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/sectors/atCardUnescapedName.probe.js
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const NAME = 'Hollow <b>Bride</b> & Co';
let table;

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: { campaignState: {
    ...CampaignStateSchema, sessionActive: true,
    settlementIds: ['actor-hollow', 'actor-bleak'], currentLocationId: null, currentLocationType: null,
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

describe('SECTORS-02 the !at card', () => {
  it("shows the place's name as text", async () => {
    await table.client('gm-1').chat('!at Hollow');
    await table.settle();

    expect(table.world.campaignState().currentLocationId).toBe('actor-hollow');
    const card = table.cards(f => f.atCommandCard)[0];
    expect(card).toBeTruthy();
    // Expected: the name escaped. Actual: "<strong>Hollow <b>Bride</b> & Co</strong>".
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
