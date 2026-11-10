/**
 * UI-8 CLOCKS-PANEL-ODDS-DEFAULT-SMALL-CHANCE (twelfth audit, ui area).
 *
 * A campaign clock advances at Begin a Session by an Ask the Oracle roll at
 * its `advanceOdds`. The documented default is "likely": createClock falls
 * back to it (src/clocks/clocks.js:258-259), `!clock new … campaign` uses it,
 * and the help says so ("Default type tension; default odds likely (campaign
 * only)"). The Clocks panel's add form builds its odds <select> with no
 * option marked selected (src/clocks/clocks.js:78-79), so a browser shows —
 * and submits — the first one, "small chance" (yes on ≤ 10, against ≤ 75 for
 * likely). A GM who picks Campaign and presses Add without touching the odds
 * gets a clock that almost never advances.
 *
 * Scenario: the GM types "The Covenant's purge", picks Campaign, presses Add.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { StubElement } from '../../helpers/cardDom.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

let table;
let savedDocument;

beforeAll(async () => {
  savedDocument = globalThis.document;
  globalThis.document = { createElement: (tag) => new StubElement(tag), activeElement: null };
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 60_000);
afterAll(() => { table?.teardown(); globalThis.document = savedDocument; });

beforeEach(async () => {
  await table.reset({ world: { settings: {
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', clocks: [] },
  } } });
});

const clockNamed = (name) => (table.world.campaignState()?.clocks ?? []).find(c => c.name === name);

describe('UI-8: a campaign clock added from the Clocks panel', () => {
  it('control: `!clock new` makes a campaign clock at the documented default odds, likely', async () => {
    await table.client('gm-1').chat('!clock new "The Covenant\'s purge" 6 campaign');
    await table.settle();
    expect(clockNamed('The Covenant\'s purge')).toMatchObject({ type: 'campaign', segments: 6, advanceOdds: 'likely' });
  }, 60_000);

  it('the panel\'s Add with the odds left alone should make it at the same default, likely', async () => {
    const c = table.client('gm-1');
    const clocks = await c.import('../../src/clocks/clocks.js');
    await c.run(async () => {
      const app = clocks.openClocksPanel();               // the toolbar's Clocks button
      app.element = await app._renderHTML(await app._prepareContext({}), {});
      app.element.querySelector('[name="newClockName"]').value = 'The Covenant\'s purge';
      app.element.querySelector('[name="newClockSegments"]').value = '6';
      app.element.querySelector('[name="newClockType"]').value = 'campaign';
      // The odds select is left as the panel drew it.
      const addButton = app.element.querySelector('[data-action="addClock"]');
      await app.constructor.DEFAULT_OPTIONS.actions.addClock.call(app, {}, addButton);
    });
    await table.settle();
    expect(clockNamed('The Covenant\'s purge')).toMatchObject({ type: 'campaign', segments: 6, advanceOdds: 'likely' });
  }, 60_000);
});
