/**
 * STARFORGED COMPANION
 * tests/unit/ptpPclessNarrativePriceNotNarrated.test.js
 *
 * Issue #342 Z49 PTP-PCLESS-NARRATIVE-PRICE-NARRATED (the upgrades auditor's
 * UPG-5 probe; PTP-PCLESS-NARRATED-AS-FIRST-PC, incomplete fix).
 *
 * The tests/unit/ptpPclessPlayerNotice.test.js table: Quinn (pl-2) has joined
 * but owns no character; the crew's two PCs are Pat's (pl-1). The fix for
 * PTP-PCLESS-NARRATED-AS-FIRST-PC decided "a price nobody pays is not part of
 * the story: no follow-up narration, no oracle memory" — but its `noPayer`
 * test (index.js handlePayThePriceCommand) required the roll to carry a
 * suffer route. Two thirds of the d100 are narrative rows (1–50, 57–62,
 * 89–95): Quinn's `!ptp` landing on one was narrated with no speaker — the
 * narrator's character falling back to the campaign's first PC — and
 * remembered in RECENT ORACLE RESULTS as "the dice established" it. The payer
 * alone now decides: no follow-up, no memory, and Quinn and the GMs are told.
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
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  scriptClaude(table);
});

/** `userId` types !ptp with the d100 scripted into "Something of value is lost or destroyed" (33–38): no route. */
async function narrativePrice(userId) {
  const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.355);   // d100 = 36
  try {
    await table.client(userId).chat('!ptp');
    await table.settle();
  } finally {
    dice.mockRestore();
  }
  await table.drain();
  const card = table.cards(f => f.payThePriceCard).at(-1);
  expect(card.content).toMatch(/Something of value is lost or destroyed/);
  expect(card.flags[MODULE_ID].sufferRoutes ?? []).toEqual([]);   // a narrative row: nothing to route
  return card;
}

const followUps = () => table.cards(f => f.oracleNarrationCard);
const remembered = () => (table.world.campaignState()?.recentOracles ?? []).filter(o => o.name === 'Pay the Price');
const narrationCalls = () => table.claude.calls.filter(c => /Pay the Price/.test(c.userText ?? ''));

describe('Z49 — a PC-less player\'s narrative price', () => {
  it('control: a player with a character of their own has their price narrated and remembered', async () => {
    await narrativePrice('pl-1');
    expect(followUps()).toHaveLength(1);
    expect(remembered()).toHaveLength(1);
  }, 30_000);

  it('is not narrated for the first PC, and not remembered as established', async () => {
    await narrativePrice('pl-2');

    // The narration was asked for with no speaker: its CHARACTER is the first
    // PC, "speaking this turn" (narrator.js getActiveCharacter's fallback).
    const asKira = (c) => /## CHARACTER\nName: Kira\b/.test(c.system ?? '') || /Kira \(speaking this turn\)/.test(c.system ?? '');
    expect(narrationCalls().filter(asKira)).toEqual([]);
    expect(followUps()).toHaveLength(0);
    expect(remembered()).toEqual([]);
    // Quinn (and the GMs) are told why, as for a routed price (issue #337 Y43).
    const notice = table.cards(f => f.noCharacterNotice).at(-1);
    expect(notice?.content ?? '').toMatch(/No character to pay the price/);
    expect(notice?.whisper ?? []).toContain('pl-2');
  }, 30_000);
});
