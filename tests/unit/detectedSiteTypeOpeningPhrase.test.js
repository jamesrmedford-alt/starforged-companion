/**
 * STARFORGED COMPANION
 * tests/unit/detectedSiteTypeOpeningPhrase.test.js
 *
 * Issue #362 AC44 SITE-TYPE-FROM-PASSING-WORDS. A confirmed place is made a
 * precursor vault or a derelict (record `type`, sheet `system.subtype`) from
 * its own words (issue #354 P2-18) — but any of the words anywhere in its name
 * or description decided it, and "precursor" alone made a vault: "Kessan
 * Exchange — a market where salvagers trade precursor trinkets" became a
 * vault, "Tether Nine — a docking spar built beside the wreck of the Anwen" a
 * derelict, and Explore a Waypoint there rolled the site's interior tables.
 *
 * Only the words that say what the place is count now: its name, and the
 * opening phrase of its description, up to the first comma or the first word
 * that says where it is or what it holds. "Precursor" alone is no vault.
 *
 * From the audit probe tests/probes/ent/detectedSiteTypeFromPassingWords.probe.js.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';

let table;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, autoSeedConnection: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 3, locationIds: [] },
  } } });
  table.addActor({ id: 'pc-pat', name: 'Kira', ownership: { 'pl-1': 3 } });
});

/** The detector queued `place`; the GM confirms its row. Returns the location Actor's type and subtype. */
async function confirmPlace(place) {
  const gm = table.client('gm-1');
  const { routeEntityDrafts } = await gm.import('../../src/entities/entityExtractor.js');
  await gm.run(() => routeEntityDrafts([{ type: 'location', confidence: 'high', ...place }],
    game.settings.get(MODULE_ID, 'campaignState'), { autoCreateConnection: false, actorId: 'pc-pat' }));
  await table.settle();
  const card = table.cards(f => f.draftEntityCard).at(-1);
  gm.click(card._id, '[data-action="sf-draft-confirm"]');
  await table.drain();
  const actor = table.actors.find(a => a.flags?.[MODULE_ID]?.entityType === 'location' && a.name === place.name);
  expect(actor, `${place.name} was created (setup)`).toBeTruthy();
  return { type: actor.flags[MODULE_ID].location.type || '', subtype: actor.system?.subtype ?? null };
}

const BLANK    = { type: '', subtype: 'other' };
const DERELICT = { type: 'derelict', subtype: 'derelict' };
const VAULT    = { type: 'vault', subtype: 'vault' };

describe('issue #362 AC44 — a confirmed place is a vault or a derelict only when it is called one', () => {
  it('control: a place the narration calls a derelict is created as one', async () => {
    expect(await confirmPlace({ name: 'The Anwen', description: 'A derelict Exodus ship, dark and tumbling.' })).toEqual(DERELICT);
  }, 30_000);

  it('control: a place with none of the words keeps a blank type', async () => {
    expect(await confirmPlace({ name: 'Tether Nine', description: 'A crowded docking spar.' })).toEqual(BLANK);
  }, 30_000);

  it('control: the name says it — "The Wreck of the Anwen", "Precursor Vault — Incomprehensible"', async () => {
    expect(await confirmPlace({ name: 'The Wreck of the Anwen', description: 'Dark and tumbling.' })).toEqual(DERELICT);
    expect(await confirmPlace({ name: 'Precursor Vault — Incomprehensible', description: 'Its walls hum.' })).toEqual(VAULT);
  }, 30_000);

  it('control: the opening phrase says it — "the wreck of …", "… is a precursor vault"', async () => {
    expect(await confirmPlace({ name: 'Kovash Drift', description: 'The wreck of an Exodus ark, gutted by salvagers.' })).toEqual(DERELICT);
    expect(await confirmPlace({ name: 'Kessan Dig', description: "Kessan's dig site is a precursor vault." })).toEqual(VAULT);
  }, 30_000);

  it('a market that trades precursor trinkets is not a precursor vault', async () => {
    expect(await confirmPlace({ name: 'Kessan Exchange', description: 'A market where salvagers trade precursor trinkets.' })).toEqual(BLANK);
  }, 30_000);

  it('a dock beside a wreck is not a derelict', async () => {
    expect(await confirmPlace({ name: 'Tether Nine', description: 'A docking spar built beside the wreck of the Anwen.' })).toEqual(BLANK);
  }, 30_000);

  it('"precursor" alone is no vault, and a name\'s possessive is no type word', async () => {
    expect(await confirmPlace({ name: 'Spire of Ash', description: 'An ancient precursor structure, humming.' })).toEqual(BLANK);
    expect(await confirmPlace({ name: "Hulk's Tavern", description: 'A loud bar on the lower ring.' })).toEqual(BLANK);
  }, 30_000);
});
