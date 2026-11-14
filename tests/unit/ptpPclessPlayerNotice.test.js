/**
 * STARFORGED COMPANION
 * tests/unit/ptpPclessPlayerNotice.test.js
 *
 * Issue #337 Y43 (PTP-PCLESS-REFUSED-SILENT) — a player with no character of
 * their own who types `!ptp` is told the price was not applied.
 *
 * Quinn (pl-2) has joined but owns no character; the crew's two PCs are
 * Pat's. Quinn types `!ptp` and the d100 lands on "You are harmed". The card
 * posted with "Routes to endure_harm (-1)" and the route was relayed to the
 * canonical GM with no PC (Quinn resolves to none at a table of several —
 * issue #321 U23), where `applyPayThePriceSufferFromRelay` refused it, right
 * (another player's PC must not pay Quinn's price — #326 D8), but with a
 * console warning only: nobody harmed and nobody told. Now the price is
 * refused on Quinn's own client before the card posts: the card says it was
 * not applied, and Quinn (and the GMs) are whispered why, as a move Quinn
 * narrates is ("No character to roll for").
 *
 * (Converted from the tenth audit's probe
 * tests/probes/multiplayer/ptpPclessPlayerSilent.probe.js.)
 *
 * PTP-PCLESS-NARRATED-AS-FIRST-PC (found while fixing Y43): the refused price
 * still asked for its oracle narration, with no speaker, and the narrator's
 * character fell back to the first PC — "You are harmed" narrated for Kira,
 * whose meters never moved, while the card said the price was not applied.
 * A price nobody pays is not part of the story: no follow-up narration, and
 * no oracle memory telling the narrator "the dice established" it.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

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
  await table.drain();
  const card = table.cards(f => f.payThePriceCard).at(-1);
  // The roll landed on the harm route.
  expect(card?.flags?.[MODULE_ID]?.sufferRoutes).toEqual([{ move: 'endure_harm', amount: 1 }]);
  return card;
}

const health = (id) => table.actors.get(id)?.system?.health?.value;
const notices = () => table.cards(f => f.noCharacterNotice);
const sufferRelays = (userId) => table.client(userId).socketEmits.filter(e => e.payload?.kind === 'gmRelay.payThePrice.suffer');

describe('issue #337 Y43 — a PC-less player types !ptp', () => {
  it('control: a player who owns a PC pays the price on their own character', async () => {
    const card = await payThePrice('pl-1');
    expect(health('pc-kira')).toBe(4);
    expect(health('pc-ren')).toBe(5);
    expect(card.content).toMatch(/Routes to Endure Harm \(-1\)\./);
    expect(notices()).toHaveLength(0);
  }, 30_000);

  it("the player is whispered that the price was not applied, and the card says so — nobody else's character pays it", async () => {
    const card = await payThePrice('pl-2');

    expect(health('pc-kira')).toBe(5);                     // the refusal itself is right
    expect(health('pc-ren')).toBe(5);
    expect(sufferRelays('pl-2')).toHaveLength(0);          // refused before any relay

    expect(card.content).toMatch(/Endure Harm \(-1\) &mdash; not applied: .* has no character of their own/);
    const [notice] = notices();
    expect(notice.content).toMatch(/No character to pay the price/);
    expect(notice.content).toMatch(/this price was not applied/);
    expect([...notice.whisper].sort()).toEqual(['gm-1', 'pl-2']);
  }, 30_000);

  it("control: the GM's !ptp at the same table still lands on the first character, with no notice", async () => {
    await payThePrice('gm-1');
    expect(health('pc-kira')).toBe(4);
    expect(notices()).toHaveLength(0);
  }, 30_000);
});

describe('PTP-PCLESS-NARRATED-AS-FIRST-PC — a price nobody pays is not narrated', () => {
  const followUps = () => table.cards(f => f.oracleNarrationCard);
  const recentOracles = () => table.world.campaignState()?.recentOracles ?? [];

  beforeEach(async () => {
    // A keyed GM: every !ptp follow-up is narrated on the GM's key.
    await table.setClaudeKey('gm-1', 'sk-ant-gina');
    scriptClaude(table);
  });

  it("the PC-less player's refused price gets no narration, and the narrator is not told it was established", async () => {
    const card = await payThePrice('pl-2');

    expect(health('pc-kira')).toBe(5);                     // nobody paid it …
    expect(followUps()).toHaveLength(0);                   // … and nobody is narrated paying it
    expect(table.claude.calls.filter(c => /Pay the Price/.test(c.userText))).toEqual([]);
    expect(card.flags[MODULE_ID].oracleNarration).toBeUndefined();   // nothing a relay could ask the GM to narrate
    expect(recentOracles().filter(o => o.name === 'Pay the Price')).toEqual([]);
    expect(card.content).toMatch(/not applied/);           // Y43's card and notice stand
    expect(notices()).toHaveLength(1);
  }, 30_000);

  it('control: a price its payer pays is narrated, and remembered', async () => {
    await payThePrice('pl-1');

    expect(health('pc-kira')).toBe(4);
    expect(followUps()).toHaveLength(1);
    expect(recentOracles().filter(o => o.name === 'Pay the Price')).toHaveLength(1);
  }, 30_000);
});
