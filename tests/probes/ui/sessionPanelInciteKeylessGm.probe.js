/**
 * UI-D1 SESSION-PANEL-INCITE-SKIPS-KEYED-GM (twelfth audit, ui area) —
 * A DECISION CANDIDATE, not filed as a defect: decisions.md → "Issue #330
 * decisions" D15 records "a GM's press runs it on the GM's client as before".
 * This probe shows what that leaves for a keyless co-GM.
 *
 * `!incite` is RUN_ON.CLAUDE (src/index.js:651): with a keyed GM connected
 * the canonical (keyed) GM runs it, whoever typed it. The Session panel's
 * ✦ Envision Inciting Incident was given the same routing for players only
 * (issue #330 D15): a player's press posts their `!incite` line
 * (src/ui/sessionPanel.js:228-236), but a GM's press runs
 * runIncitingIncident on the pressing GM's own client (:237-241), keyed or
 * not. A keyless co-GM's press therefore never reaches the keyed GM: the
 * narrator has no key (narrateIncitingIncident returns null,
 * src/narration/narrator.js:3072-3073) and a spark-only fallback card is
 * posted — no opening narration, no suggested vow, no premise canon — while
 * the same GM typing `!incite` gets the keyed GM's narrated incident. The
 * help ("Also on the Session panel as ✦ Envision Inciting Incident") and the
 * First Session walkthrough present the two as the same.
 *
 * Scenario: Gina (gm-1) holds the table's Claude key and is the canonical GM;
 * Gus (gm-2) has none. Gus presses ✦ Envision Inciting Incident.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

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

async function pressEnvisionOn(userId) {
  const c = table.client(userId);
  const { SessionPanelApp } = await c.import('../../src/ui/sessionPanel.js');
  await c.run(() => SessionPanelApp.DEFAULT_OPTIONS.actions.envisionIncite.call({}, {}, {}));
  await table.settle();
  await table.drain();
}

describe('UI-D1: a keyless GM\'s ✦ Envision Inciting Incident', () => {
  it('control: Gus typing !incite gets the keyed GM\'s narrated incident', async () => {
    await table.client('gm-2').chat('!incite');
    await table.settle();
    await table.drain();
    const cards = incitingCards();
    expect(cards).toHaveLength(1);
    expect(cards[0].flags['starforged-companion'].narratorCard).toBe(true);
    expect(table.claude.by('gm-1').length).toBeGreaterThan(0);
  }, 60_000);

  it('Gus pressing the Session panel button should get the same narrated incident', async () => {
    await pressEnvisionOn('gm-2');
    const cards = incitingCards();
    expect(cards).toHaveLength(1);
    const narrated = cards[0].flags['starforged-companion'].narratorCard === true;
    expect({ narrated, claudeCalls: table.claude.calls.length > 0 })
      .toEqual({ narrated: true, claudeCalls: true });
  }, 60_000);
});
