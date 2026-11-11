/**
 * STARFORGED COMPANION
 * tests/unit/clocksPanelOddsDefaultLikely.test.js
 *
 * Issue #345 AA67 (CLOCKS-PANEL-ODDS-DEFAULT-SMALL-CHANCE) — a campaign clock
 * advances at Begin a Session by an Ask the Oracle roll at its `advanceOdds`.
 * The documented default is "likely": createClock falls back to it,
 * `!clock new … campaign` uses it, and the help's `!clock new` row says
 * "default odds likely (campaign only)". The Clocks panel's add form built
 * its odds <select> with no option marked selected, so a browser showed — and
 * submitted — the first one, "small chance" (yes on ≤ 10, against ≤ 75 for
 * likely): a GM who picked Campaign and pressed Add without touching the odds
 * got a clock that almost never advanced. The select now starts on the
 * default, the one createClock and `!clock new` use.
 *
 * Driven on a booted GM / player table through the panel's real render and
 * Add action; the DOM stub's <select> submits its `selected` option, else the
 * first, as a browser does.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { StubElement } from '../helpers/cardDom.js';
import { CampaignStateSchema } from '../../src/schemas.js';

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

/** The GM opens the Clocks panel, fills the add form (`odds` left alone when null) and presses Add. */
async function addFromPanel({ name, segments, type, odds = null }) {
  const c = table.client('gm-1');
  const clocks = await c.import('../../src/clocks/clocks.js');
  const drawn = await c.run(async () => {
    const app = clocks.openClocksPanel();               // the toolbar's Clocks button
    app.element = await app._renderHTML(await app._prepareContext({}), {});
    const select = app.element.querySelector('[name="newClockOdds"]');
    const shown = {
      value:    select.value,
      selected: select.querySelectorAll('option').filter(o => o.hasAttribute('selected')).map(o => o.value),
    };
    app.element.querySelector('[name="newClockName"]').value = name;
    app.element.querySelector('[name="newClockSegments"]').value = String(segments);
    app.element.querySelector('[name="newClockType"]').value = type;
    if (odds) select.value = odds;
    const addButton = app.element.querySelector('[data-action="addClock"]');
    await app.constructor.DEFAULT_OPTIONS.actions.addClock.call(app, {}, addButton);
    return shown;
  });
  await table.settle();
  return drawn;
}

describe('issue #345 AA67 — a campaign clock added from the Clocks panel', () => {
  it('control: `!clock new` makes a campaign clock at the documented default odds, likely', async () => {
    await table.client('gm-1').chat('!clock new "The Covenant\'s purge" 6 campaign');
    await table.settle();
    expect(clockNamed('The Covenant\'s purge')).toMatchObject({ type: 'campaign', segments: 6, advanceOdds: 'likely' });
  }, 60_000);

  it('the panel\'s Add with the odds left alone makes it at the same default, likely', async () => {
    await addFromPanel({ name: 'The Covenant\'s purge', segments: 6, type: 'campaign' });
    expect(clockNamed('The Covenant\'s purge')).toMatchObject({ type: 'campaign', segments: 6, advanceOdds: 'likely' });
  }, 60_000);

  it('the odds select is drawn on "likely" — the one option marked selected', async () => {
    const drawn = await addFromPanel({ name: 'The Iron Fleet musters', segments: 8, type: 'campaign' });
    expect(drawn).toEqual({ value: 'likely', selected: ['likely'] });
  }, 60_000);

  it('control: odds the GM picks are the clock\'s', async () => {
    await addFromPanel({ name: 'A rival claims the derelict', segments: 4, type: 'campaign', odds: 'unlikely' });
    expect(clockNamed('A rival claims the derelict')).toMatchObject({ type: 'campaign', advanceOdds: 'unlikely' });
  }, 60_000);
});
