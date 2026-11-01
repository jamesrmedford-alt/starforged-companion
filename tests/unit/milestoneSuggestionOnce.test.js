/**
 * STARFORGED COMPANION
 * tests/unit/milestoneSuggestionOnce.test.js
 *
 * One move card's "⚑ Mark Progress on Vow" marks one milestone, however many
 * times it is pressed (issue #321 U20). wireMilestoneSuggestionButton read a
 * `milestoneMarked` flag that nothing ever wrote: a click disabled the button
 * on the clicker's screen only and posted a forced reach_a_milestone, so
 * another client's button — or the same client's after a re-render — posted it
 * again, and the canonical GM's pipeline marked the vow again each time. The
 * click now relays to the canonical GM ("milestone.suggestion"), which claims
 * the GM-authored card before posting the move once.
 *
 * On a booted table (tests/helpers/multiClient.js): the player and the GM
 * press the button on their own clients; the GM's real pipeline marks the vow.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

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

// The move card a quest-advancing hit posts; `extra` adds its flags (actorId — the roller).
async function postMoveCardWithSuggestion(extra = {}) {
  const gm = table.client('gm-1');
  const msg = await gm.run(() => globalThis.ChatMessage.create({
    content: `<div class="sf-move-result sf-strong-hit"><div class="sf-move-name">Gather Information</div>`
      + `<div class="sf-milestone-suggest-row"><button type="button" class="sf-followup-btn" data-action="sf-reach-milestone">⚑ Mark Progress on Vow</button>`
      + `<button type="button" class="sf-followup-btn" data-action="sf-attempt-fulfill-vow">🏁 Attempt to Fulfill Vow</button></div></div>`,
    flags: { [MODULE_ID]: { moveResolution: true, resolutionId: 'res-1', milestoneSuggestion: { eligible: true }, ...extra } },
  }));
  await table.settle();
  return msg.id;
}

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
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

describe('"⚑ Mark Progress on Vow" marks one milestone per card (issue #321 U20)', () => {
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
    expect(table.world.message(id).flags[MODULE_ID].milestoneMarked).toBe(true);
  }, 30_000);

  it('the card\'s roller is the one marked: another player may not press it for them; the GM may, as the roller', async () => {
    const otherVow = makeVow();
    table.addActor({ id: 'pc-2', name: 'Ash', ownership: { 'pl-2': 3 }, items: { contents: [otherVow] } });
    const id = await postMoveCardWithSuggestion({ actorId: 'pc-1' });

    table.client('pl-2').click(id, '[data-action="sf-reach-milestone"]');
    await table.settle(); await table.drain();
    expect(table.cards(f => f.forcedMoveId === 'reach_a_milestone')).toHaveLength(0);
    expect(table.world.message(id).flags[MODULE_ID].milestoneMarked ?? false).toBe(false);

    table.client('gm-1').click(id, '[data-action="sf-reach-milestone"]');
    await table.settle(); await table.drain();
    const forced = table.cards(f => f.forcedMoveId === 'reach_a_milestone');
    expect(forced).toHaveLength(1);
    expect(forced[0].speaker?.actor).toBe('pc-1');
    expect(vow.system.current).toBe(8);
    expect(otherVow.system.current).toBe(0);
  }, 30_000);

  // The sibling the waypoint fix covered (issue #316 T06): an Explore a
  // Waypoint match's "🔭 Make a Discovery" — each press used to be another
  // Make a Discovery and another 2 ticks on the discoveries legacy.
  it('control: the player and the GM both pressing "Make a Discovery" mark the legacy once', async () => {
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
