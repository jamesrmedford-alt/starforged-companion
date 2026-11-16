/**
 * ENT-05 · SITE-TYPE-FROM-PASSING-WORDS
 *
 * Scenario: the detector queues a place whose description mentions a vault,
 * a precursor thing or a wreck in passing — "The Vault", a cantina in a
 * converted bank vault; "Kessan Exchange", a market where salvagers trade
 * precursor trinkets; "Tether Nine", a dock built beside the wreck of the
 * Exodus ship Anwen. The GM confirms the row.
 *
 * Correct: detectedSiteType's own contract — "the site type a detected
 * place's own words give it … Never guessed from anything else: a blank type
 * is honest." A cantina, a market and a dock are not precursor vaults or
 * derelicts: their Location type stays blank ("other" on the sheet).
 *
 * Today: any whole word vault / precursor → "vault", derelict / wreck /
 * wreckage / hulk → "derelict", anywhere in the name or the description. The
 * location is created as a precursor vault or a derelict (record `type`,
 * sheet `system.subtype`), which getCurrentSiteKind then reads when the crew
 * is there: Explore a Waypoint rolls the vault's / derelict's interior tables
 * ("Inside the vault — Interior Feature: …") for a bar.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

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

/** The detector queued `place`; the GM confirms its row. Returns the location Actor made. */
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

describe('ENT-05 — a confirmed place is a vault or a derelict only when it is called one', () => {
  it('control: a place the narration calls a derelict is created as one', async () => {
    expect(await confirmPlace({ name: 'The Anwen', description: 'A derelict Exodus ship, dark and tumbling.' }))
      .toEqual({ type: 'derelict', subtype: 'derelict' });
  }, 30_000);

  it('control: a place with none of the words keeps a blank type', async () => {
    expect(await confirmPlace({ name: 'Tether Nine', description: 'A crowded docking spar.' }))
      .toEqual({ type: '', subtype: 'other' });
  }, 30_000);

  it('a market that trades precursor trinkets is not a precursor vault', async () => {
    expect(await confirmPlace({ name: 'Kessan Exchange', description: 'A market where salvagers trade precursor trinkets.' }))
      .toEqual({ type: '', subtype: 'other' });
  }, 30_000);

  it('a cantina named "The Vault" is not a precursor vault', async () => {
    expect(await confirmPlace({ name: 'The Vault', description: 'A cantina in a converted bank strongroom on the lower ring.' }))
      .toEqual({ type: '', subtype: 'other' });
  }, 30_000);

  it('a dock beside a wreck is not a derelict', async () => {
    expect(await confirmPlace({ name: 'Tether Nine', description: 'A docking spar built beside the wreck of the Anwen.' }))
      .toEqual({ type: '', subtype: 'other' });
  }, 30_000);
});
