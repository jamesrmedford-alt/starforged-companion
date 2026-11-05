/**
 * PROBE — MP-04 PTP-PCLESS-REFUSED-SILENT (tenth audit, area multiplayer)
 *
 * What the user does: Quinn (pl-2) has joined the table but has no character
 * of their own yet — the crew's two PCs are Pat's. Quinn types `!ptp` (or
 * `!pay-the-price`), and the d100 lands on "You are harmed" (75–81).
 *
 * What happens: the Pay the Price card posts on Quinn's client with its
 * footer "Routes to endure_harm (-1)" (src/index.js:3995-4000), and the
 * suffer route is relayed to the canonical GM with `actorId: null` — Quinn
 * resolves to no PC at a table of several (speaker.js:139-141, the issue
 * #321 U23 rule). `applyPayThePriceSufferFromRelay` (src/index.js:6422-6445)
 * refuses it: `actor ? !requesterOwnsActor(actor, ctx) : !ctx?.requesterIsGM`
 * → "may not pay a price with no PC of their own — refused", a console.warn
 * on the GM's client and `{ applied: false }` to a relay with no ack. Nothing
 * reaches Quinn or the GMs' chat: the card says the price routes to Endure
 * Harm, and nobody is harmed, with no word.
 *
 * What should happen: the player is told — as the pipeline tells a PC-less
 * player that their move was not rolled ("No character to roll for",
 * src/index.js:4642-4650, whispered to the author and the GMs; decisions.md
 * "A PC-less player is not rolled as another player's character" [#326 D8])
 * and as the session gate tells the author why nothing ran (issue #329 X14:
 * "No silent no-op on a player's action"). The refusal itself is right
 * (another player's PC must not pay Quinn's price); its silence is the gap.
 *
 * Control: Pat (who owns a PC) typing the same `!ptp` has the harm applied
 * to Pat's own character.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/multiplayer/ptpPclessPlayerSilent.probe.js
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

let table;

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    narratorSessionSummary: false, chronicleAutoEntry: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'ptp-s1', currentSceneId: 'ptp-scene', sceneTruths: [], clocks: [] },
  } } });
  // Two PCs, both Pat's: Quinn (pl-2) owns none, so at a table of several they resolve to no PC.
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, system: { health: { value: 5, max: 5 } } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-1': 3 }, system: { health: { value: 5, max: 5 } } });
});

/** `userId` types !ptp with the d100 scripted into "You are harmed" (75–81). */
async function payThePrice(userId) {
  const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.77);   // d100 = 78
  try {
    await table.client(userId).chat('!ptp');
    await table.settle();
  } finally {
    dice.mockRestore();
  }
  const card = table.cards(f => f.payThePriceCard).at(-1);
  // Sanity: the roll landed on the harm route.
  expect(card?.flags?.[MODULE_ID]?.sufferRoutes).toEqual([{ move: 'endure_harm', amount: 1 }]);
  return card;
}

const health = (id) => table.actors.get(id)?.system?.health?.value;

describe('MP-04 a PC-less player types !ptp and the price is refused', () => {
  it('control: a player who owns a PC pays the price on their own character', async () => {
    await payThePrice('pl-1');
    await table.drain();
    expect(health('pc-kira')).toBe(4);
    expect(health('pc-ren')).toBe(5);
  }, 30_000);

  it('the player (or the GMs) is told the price was not applied', async () => {
    await payThePrice('pl-2');
    await table.drain();

    // Sanity: the refusal is right — nobody else's character paid Quinn's price.
    expect(health('pc-kira')).toBe(5);
    expect(health('pc-ren')).toBe(5);

    // Expected: a word to Quinn — a whispered notice (as the pipeline's "No character to
    // roll for") or a notification — or to the GMs. Actual: a console.warn on the GM only.
    const whisperedToQuinn = table.world.messages().some(m =>
      (m.whisper ?? []).includes('pl-2') && /character|not applied|price/i.test(m.content ?? ''));
    const notified = ['pl-2', 'gm-1'].some(id =>
      table.client(id).notifications.some(n => /character|not applied|price/i.test(n.message)));
    expect(whisperedToQuinn || notified).toBe(true);
  }, 30_000);
});
