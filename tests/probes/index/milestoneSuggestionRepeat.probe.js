/**
 * PROBE — MILESTONE-MARKED-NEVER-WRITTEN
 *
 * A quest-advancing hit's move card carries "⚑ Mark Progress on Vow"
 * (renderMilestoneSuggestionHtml). wireMilestoneSuggestionButton
 * (src/index.js ~6644) promises "Disabled after one use (flag
 * `milestoneMarked`) so a card can't double-mark on re-render" — but nothing
 * in src/ ever writes `milestoneMarked` (grep: its only occurrence is the
 * read at ~6650). A click disables the button on the clicker's screen only
 * and posts a forced reach_a_milestone move; another client's button, or the
 * same client's after a re-render, posts it again — and the canonical GM's
 * pipeline marks the vow again each time.
 *
 * Correct behaviour (asserted): one move card's suggestion marks one
 * milestone, however many times its button is pressed.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const REPLY = 'The beacon answers.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
let table, vow;

function makeVow() {
  const item = {
    id: 'vow-1', type: 'progress', name: 'Find Chen', flags: {},
    system: { subtype: 'vow', rank: 'dangerous', current: 0, completed: false },
    async update(changes) { for (const [k, v] of Object.entries(changes)) if (k === 'system.current') item.system.current = v; return item; },
    async setFlag(scope, key, value) { (item.flags[scope] ??= {})[key] = value; return item; },
  };
  return item;
}

async function postMoveCardWithSuggestion() {
  const gm = table.client('gm-1');
  const msg = await gm.run(() => globalThis.ChatMessage.create({
    content: `<div class="sf-move-result sf-strong-hit"><div class="sf-move-name">Gather Information</div>`
      + `<div class="sf-milestone-suggest-row"><button type="button" class="sf-followup-btn" data-action="sf-reach-milestone">⚑ Mark Progress on Vow</button>`
      + `<button type="button" class="sf-followup-btn" data-action="sf-attempt-fulfill-vow">🏁 Attempt to Fulfill Vow</button></div></div>`,
    flags: { [MODULE_ID]: { moveResolution: true, resolutionId: 'res-1', milestoneSuggestion: { eligible: true } } },
  }));
  await table.settle();
  return msg.id;
}

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1' },
  } } });
  vow = makeVow();
  table.addActor({ id: 'pc-1', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [vow] } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  scriptClaude(table, { fallback: () => REPLY });
  silenceConsoleErrors();
});

describe('PROBE MILESTONE-MARKED-NEVER-WRITTEN', () => {
  it('the player and the GM both pressing "Mark Progress on Vow" mark one milestone', async () => {
    const id = await postMoveCardWithSuggestion();

    table.client('pl-1').click(id, '[data-action="sf-reach-milestone"]');
    await table.settle(); await table.drain();
    table.client('gm-1').click(id, '[data-action="sf-reach-milestone"]');
    await table.settle(); await table.drain();

    // Expected: one milestone on a dangerous vow — 8 ticks (2 boxes) — and one forced move.
    expect(vow.system.current).toBe(8);
    expect(table.cards(f => f.forcedMoveId === 'reach_a_milestone')).toHaveLength(1);
  }, 30_000);

  it('after a re-render the used button stays used', async () => {
    const id = await postMoveCardWithSuggestion();

    table.client('pl-1').click(id, '[data-action="sf-reach-milestone"]');
    await table.settle(); await table.drain();
    const root = table.client('pl-1').render(id);   // a fresh render of the same card
    expect(root.querySelector('[data-action="sf-reach-milestone"]').disabled).toBe(true);
  }, 30_000);

  // Sibling with no guard at all: an Explore a Waypoint match's "🔭 Make a
  // Discovery" (wireWaypointOracleButton ~5914) — each press is another Make a
  // Discovery and another 2 ticks on the discoveries legacy.
  it('sibling: the player and the GM both pressing "Make a Discovery" mark the legacy once', async () => {
    const gm = table.client('gm-1');
    const msg = await gm.run(() => globalThis.ChatMessage.create({
      content: `<div class="sf-move-result sf-strong-hit"><div class="sf-move-name">Explore a Waypoint</div>`
        + `<div class="sf-combat-followup"><button type="button" class="sf-followup-btn" data-action="sf-waypoint-oracle">🔭 Make a Discovery</button></div></div>`,
      flags: { [MODULE_ID]: { moveResolution: true, resolutionId: 'res-2', waypointOracleCard: 'make_a_discovery' } },
    }));
    await table.settle();

    table.client('pl-1').click(msg.id, '[data-action="sf-waypoint-oracle"]');
    await table.settle(); await table.drain();
    table.client('gm-1').click(msg.id, '[data-action="sf-waypoint-oracle"]');
    await table.settle(); await table.drain();

    expect(table.world.campaignState().legacyTracks?.discoveries?.ticks ?? 0).toBe(2);
  }, 30_000);
});
