/* global silenceConsoleErrors */
/**
 * Issue #345 AA51 RECOMMIT-FORSAKEN-SAID-FULFILLED.
 *
 * A Fulfill Your Vow miss posts "Vow — recommit?" — "You may Forsake Your
 * Vow, or recommit" (index.js postVowRecommitOfferCard). Kira takes the first
 * option: Forsake Your Vow marks the vow completed and `forsaken`. The offer's
 * 🔁 is still on the table; pressed, performVowRecommit refuses any completed
 * vow as "vow-completed" (issue #335 Y10's rule — kept) and posted "<vow> is
 * already fulfilled — nothing was recommitted." The vow was forsaken, not
 * fulfilled: the card now says so.
 *
 * Driven on a booted table: Kira's player types both moves, the real pipeline
 * runs them, her player presses the offer's button.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [], interpretation: null }));
vi.mock('../../src/pacing/router.js', async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: 'chat' })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../src/moves/resolver.js', async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, 'random');
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

let table, kirasVow;

function vowItem(id, name, current) {
  const item = {
    id, type: 'progress', name, flags: { [MODULE_ID]: { vowId: id } },
    system: { subtype: 'vow', rank: 'dangerous', current, completed: false },
    async update(changes) {
      for (const [k, v] of Object.entries(changes)) {
        const parts = k.split('.'); let t = item;
        for (const p of parts.slice(0, -1)) t = (t[p] ??= {});
        t[parts.at(-1)] = v;
      }
      return item;
    },
    async setFlag(scope, key, value) { (item.flags[scope] ??= {})[key] = value; return item; },
  };
  return item;
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

async function setUp() {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'rf-s1', sessionNumber: 1,
      currentSceneId: 'rf-scene', sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  kirasVow = vowItem('v-kira', 'Find Chen', 8);
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [kirasVow] } });
  scriptClaude(table, { fallback: () => 'The trail goes cold.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  silenceConsoleErrors();
}

async function kiraPlays(moveId, moveName, line, dice) {
  control.interpretation = { moveId, moveName, statUsed: null, adds: 0,
    isProgressMove: moveId === 'fulfill_your_vow', moveTarget: 'Find Chen', rationale: 'test', mischiefApplied: false };
  control.dice = dice;
  await table.client('pl-1').chat(line, { speaker: { actor: 'pc-kira' } });
  await table.settle(); await table.drain();
}

/** Kira's Fulfill Your Vow misses (2 boxes against 9 and 10); returns the recommit offer it posts. */
async function kiraMisses() {
  await kiraPlays('fulfill_your_vow', 'Fulfill Your Vow', 'Kira tries to bring Chen home.', [0.85, 0.95]);
  const [offer] = table.cards(f => f.vowRecommitOfferCard);
  expect(offer?.flags[MODULE_ID], 'the miss offers the recommit (setup)').toMatchObject({ actorId: 'pc-kira' });
  return offer;
}

async function pressRecommit(offer) {
  table.client('pl-1').click(offer._id, '[data-action="sf-vow-recommit"]');
  await table.settle(); await table.drain();
}

describe('issue #345 AA51 — 🔁 Recommit pressed after the vow was forsaken', () => {
  it('control: pressed at once, the vow is recommitted', async () => {
    await setUp();
    const offer = await kiraMisses();
    await pressRecommit(offer);
    expect(kirasVow.system.rank).toBe('formidable');
  }, 30_000);

  it('after Kira forsook it, the card says the vow was forsaken — not fulfilled — and nothing is recommitted', async () => {
    await setUp();
    const offer = await kiraMisses();
    await kiraPlays('forsake_your_vow', 'Forsake Your Vow', 'Kira lets Chen go.', []);
    expect({ completed: kirasVow.system.completed, forsaken: kirasVow.flags[MODULE_ID].forsaken === true }, 'forsaken (setup)')
      .toEqual({ completed: true, forsaken: true });
    const before = { rank: kirasVow.system.rank, current: kirasVow.system.current };
    await pressRecommit(offer);
    const said = table.cards(f => f.vowRecommitFulfilledCard || f.recommitOutcomeNotice)
      .map(m => String(m.content ?? '')).join('\n');
    expect(said, 'the press is answered (setup)').not.toBe('');
    expect(said).not.toMatch(/already fulfilled/);
    expect(said).toContain('<strong>Find Chen</strong> was forsaken — nothing was recommitted.');
    expect({ rank: kirasVow.system.rank, current: kirasVow.system.current }, 'the refusal stands (Y10)').toEqual(before);
  }, 30_000);
});
