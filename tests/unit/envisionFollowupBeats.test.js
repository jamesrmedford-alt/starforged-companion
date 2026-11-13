/**
 * STARFORGED COMPANION
 * tests/unit/envisionFollowupBeats.test.js
 *
 * Issue #353 Phase 0 — the two "envision" outcomes narrated as their own beat,
 * on a simulated table (GM with a Claude key, Pat playing Kira):
 *
 *  1. A complication the player chose as a weak hit's cost ("Peril at the
 *     waypoint"). Its card said "Narrator will surface this complication on
 *     the next scene transition or appropriate beat", and nothing read it: the
 *     playtest's chosen peril never arrived. The pick now rolls the waypoint's
 *     peril on Spaceborne Peril, posts it, and the narrator plays it at once
 *     (the oracle follow-up, narrated once on the keyed GM).
 *  2. `!ptp` landing on "A new enemy is revealed": its follow-up is told what
 *     the enemy is and wants (Character Role + Goal + Disposition), rolled
 *     where it is narrated — never on the raw card the table can read.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ ptpRoll: null }));
vi.mock('../../src/oracles/roller.js', async (orig) => {
  const original = await orig();
  return {
    ...original,
    rollOracle: vi.fn((id, opts = {}) => original.rollOracle(id,
      id === 'pay_the_price' && control.ptpRoll ? { ...opts, roll: control.ptpRoll } : opts)),
  };
});

import { simulateTable, USERS } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { SPACEBORNE_PERIL } from '../../src/oracles/tables/space.js';

const NARRATION_MODEL = 'claude-sonnet-5-5';
const PROSE = 'Something moves in the dark between the hulls.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

let table;

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.ptpRoll = null;
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 's-1', sessionNumber: 1,
      currentSceneId: 'sc-1', sceneTruths: [], recentOracles: [], clocks: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  scriptClaude(table, { fallback: (call) => (call.model === NARRATION_MODEL ? PROSE : '{}') });
});

const narrationCalls = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL);

/** Let the follow-up's relay hop, its narration and its capture (2 s after its card) run. */
async function settleBeat(work) {
  vi.useFakeTimers({ toFake: ['setTimeout'] });
  try {
    await work();
    for (let i = 0; i < 3; i += 1) {
      await table.settle();
      await vi.advanceTimersByTimeAsync(2_100);
    }
    await table.settle();
  } finally {
    vi.useRealTimers();
  }
  await table.drain();
}

describe('issue #353 Phase 0 — a chosen complication is played as its own beat', () => {
  it('"Peril at the waypoint": the peril is rolled on Spaceborne Peril, carded, and narrated at once', async () => {
    const gm = table.client('gm-1');
    const { runSufferResolution } = await gm.import('../../src/moves/sufferDialog.js');
    await settleBeat(() => gm.run(() => runSufferResolution(
      [{ kind: 'complication', scope: 'waypoint', label: 'Peril at the waypoint' }],
      gm.game.actors.get('pc-kira'),
    )));

    const card = table.cards(f => f.complication === true).at(-1);
    expect(card, 'the complication card').toBeTruthy();
    const f = card.flags['starforged-companion'];
    const peril = f.oracleMemory?.answer;
    expect(f.oracleMemory?.name).toBe('Spaceborne Peril');
    // The roller resolves a chained row into its leaves; each is a row of the table.
    expect(String(peril).split(' / ').every(p => SPACEBORNE_PERIL.some(r => r.result === p))).toBe(true);
    expect(card.content).toContain('Spaceborne Peril');
    expect(card.content).not.toMatch(/Narrator will surface/);

    const call = narrationCalls().find(c => /The player chose a complication/.test(c.userText ?? ''));
    expect(call, 'the follow-up beat').toBeTruthy();
    expect(call.userText).toContain('Complication: Peril at the waypoint');
    expect(call.userText).toContain(`Spaceborne Peril: ${peril}`);
    const beat = table.cards(f2 => f2.oracleNarrationCard === true).at(-1);
    expect(beat.flags['starforged-companion']).toMatchObject({ narratorCard: true, narrationKind: 'complication', oracleCardId: card._id ?? card.id });
  }, 30_000);

  it('a complication with no table ("Complication at destination") is narrated unrolled', async () => {
    const gm = table.client('gm-1');
    const { runSufferResolution } = await gm.import('../../src/moves/sufferDialog.js');
    await settleBeat(() => gm.run(() => runSufferResolution(
      [{ kind: 'complication', scope: 'destination', label: 'Complication at destination' }],
      gm.game.actors.get('pc-kira'),
    )));

    const card = table.cards(f => f.complication === true).at(-1);
    expect(card.flags['starforged-companion'].oracleMemory).toBeUndefined();
    const call = narrationCalls().find(c => /The player chose a complication/.test(c.userText ?? ''));
    expect(call.userText).toContain('Complication: Complication at destination');
    expect(call.userText).not.toMatch(/Oracle:/);
  }, 30_000);
});

describe('issue #353 Phase 0 — !ptp reveals a new enemy', () => {
  it('the follow-up is told what the enemy is and wants; the raw card carries none of it', async () => {
    control.ptpRoll = 47;   // "A new enemy is revealed" (45–50)
    await settleBeat(() => table.client('pl-1').chat('!ptp'));

    const ptpCard = table.cards(f => f.payThePriceCard === true).at(-1);
    expect(ptpCard.content).toContain('A new enemy is revealed');
    expect(ptpCard.content).not.toMatch(/Character (Role|Goal|Disposition)/);
    expect(JSON.stringify(ptpCard.flags)).not.toMatch(/Character (Role|Goal|Disposition)/);

    const call = narrationCalls().find(c => /The player invoked the oracle/.test(c.userText ?? ''));
    expect(call, 'the follow-up narration').toBeTruthy();
    expect(call.userText).toMatch(/The new enemy — Character Role: \S/);
    expect(call.userText).toMatch(/The new enemy — Character Goal: \S/);
    expect(call.userText).toMatch(/The new enemy — Character Disposition: \S/);
  }, 30_000);

  it('control: any other price is narrated with no enemy rolls', async () => {
    control.ptpRoll = 20;   // "A surprising development complicates your quest"
    await settleBeat(() => table.client('pl-1').chat('!ptp'));
    const call = narrationCalls().find(c => /The player invoked the oracle/.test(c.userText ?? ''));
    expect(call).toBeTruthy();
    expect(call.userText).not.toMatch(/The new enemy/);
  }, 30_000);
});
