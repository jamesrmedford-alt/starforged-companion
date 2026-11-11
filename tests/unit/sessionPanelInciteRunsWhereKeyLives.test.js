/**
 * STARFORGED COMPANION
 * tests/unit/sessionPanelInciteRunsWhereKeyLives.test.js
 *
 * Issue #345 D6 SESSION-PANEL-INCITE-SKIPS-KEYED-GM (the twelfth audit's
 * UI-D1) — the maintainer chose option A.
 *
 * `!incite` is RUN_ON.CLAUDE (src/index.js CHAT_COMMAND_ROUTES): with a keyed
 * GM connected the canonical (keyed) GM runs it, whoever typed it. The
 * Session panel's ✦ Envision Inciting Incident was given the same routing for
 * players only (issue #330 D15): a player's press posted their `!incite`
 * line, but a GM's press ran runIncitingIncident on the pressing GM's own
 * client, keyed or not. A keyless co-GM's press therefore never reached the
 * keyed GM: the narrator had no key and a spark-only card was posted — no
 * opening narration, no suggested vow, no premise canon — while the same GM
 * typing `!incite` got the keyed GM's narrated incident. Every press now
 * posts the presser's `!incite` line, routed exactly as typing it is.
 *
 * Production entry points: the panel's action handler on each client, the
 * chat-command router, the real inciting-incident flow; Claude is answered
 * by the harness.
 *
 * Scenario: Gina (gm-1) holds the table's Claude key and is the canonical GM;
 * Gus (gm-2) has none.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';

let table;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.GM2, USERS.P1] });
}, 60_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    'factContinuity.consistencyCheck': false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1 },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  await table.setClaudeKey('gm-2', '');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
});

const incitingCards = () => table.cards(f => f.incitingIncidentCard === true);
const narrated = (card) => card.flags['starforged-companion'].narratorCard === true;

async function pressEnvisionOn(userId) {
  const c = table.client(userId);
  const { SessionPanelApp } = await c.import('../../src/ui/sessionPanel.js');
  await c.run(() => SessionPanelApp.DEFAULT_OPTIONS.actions.envisionIncite.call({}, {}, {}));
  await table.settle();
  await table.drain();
}

describe('issue #345 D6 — a GM\'s ✦ Envision Inciting Incident runs where a Claude key lives', () => {
  it('control: Gus typing !incite gets the keyed GM\'s narrated incident', async () => {
    await table.client('gm-2').chat('!incite');
    await table.settle();
    await table.drain();
    const cards = incitingCards();
    expect(cards).toHaveLength(1);
    expect(narrated(cards[0])).toBe(true);
    expect(table.claude.by('gm-1').length).toBeGreaterThan(0);
  }, 60_000);

  it('Gus (keyless) pressing the Session panel button gets the same narrated incident, from the keyed GM', async () => {
    await pressEnvisionOn('gm-2');
    const cards = incitingCards();
    expect(cards).toHaveLength(1);
    expect({ narrated: narrated(cards[0]), claudeCalls: table.claude.calls.length > 0 })
      .toEqual({ narrated: true, claudeCalls: true });
    expect(table.claude.by('gm-1').length, 'on Gina\'s key').toBeGreaterThan(0);
    expect(table.claude.by('gm-2'), 'nothing on Gus\'s client').toHaveLength(0);
  }, 60_000);

  it('Gina (keyed, canonical) pressing it gets the narrated incident once', async () => {
    await pressEnvisionOn('gm-1');
    const cards = incitingCards();
    expect(cards).toHaveLength(1);
    expect(narrated(cards[0])).toBe(true);
  }, 60_000);

  it('control: no keyed GM connected — the presser\'s own client runs it, as their typed !incite would (the spark-only card)', async () => {
    await table.setClaudeKey('gm-1', '');
    await table.settle();
    await pressEnvisionOn('gm-2');
    const cards = incitingCards();
    expect(cards).toHaveLength(1);
    expect(narrated(cards[0])).toBe(false);
    expect(table.claude.calls).toHaveLength(0);
  }, 60_000);
});
