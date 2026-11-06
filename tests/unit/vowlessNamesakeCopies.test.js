/* global silenceConsoleErrors */
/**
 * STARFORGED COMPANION
 * tests/unit/vowlessNamesakeCopies.test.js
 *
 * Issue #342 Z59 (VOWLESS-NAMESAKE-COPIES) — a vow with no `vowId` flag is
 * only itself, never a crewmate's same-named vow.
 *
 * Kira and Ren each wrote a vow named "Background Vow" on their own sheet
 * while no GM was connected (or imported a character with it): the createItem
 * hook that stamps a sheet vow's `vowId` runs on the canonical GM only
 * (registerPlayerVowHook), so neither Item carries one. Issue #301 B02 decided
 * these are two vows — "two PCs' INDEPENDENT vows can share a name" — and made
 * every resolver start from the roller's own Item; but the copies were then
 * collected "by its vowId, else by the item's exact name" (index.js
 * collectVowCopies), across every PC. Kira fulfilled hers: the pipeline
 * completed Ren's too and the payoff stamped it `fulfilPaid` (so Ren's own
 * fulfilment would pay nothing). The same copy list fed the recommit
 * (performVowRecommit) and Forsake. Copies are now the ones the vow's id
 * names (isVowCopy / vowCopyId) — a vow with no flag is its own only copy.
 *
 * Driven on a booted table: Kira's player types the move, the real pipeline
 * (interpreter stub, the resolver with scripted dice) runs it on the GM.
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

let table, kirasVow, rensVow;

/** A vow written on the sheet with no GM connected: no module flags at all. */
function sheetVow(id, current, flags = {}) {
  const item = {
    id, type: 'progress', name: 'Background Vow', flags,
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

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());

async function setUp({ stamped, kiraTicks = 40 }) {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'nv-s1', sessionNumber: 1,
      currentSceneId: 'nv-scene', sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  kirasVow = sheetVow('v-kira', kiraTicks, stamped ? { [MODULE_ID]: { vowId: 'v-kira' } } : {});
  rensVow  = sheetVow('v-ren', 8,  stamped ? { [MODULE_ID]: { vowId: 'v-ren' } } : {});
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [kirasVow] } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [rensVow] } });
  scriptClaude(table, { fallback: () => 'The oath is kept.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  silenceConsoleErrors();
}

/** Kira's player types a vow move; `dice` are the challenge dice (and action die) the resolver rolls. */
async function kiraPlays(moveId, moveName, line, dice, extra = {}) {
  control.interpretation = { moveId, moveName, statUsed: null, adds: 0,
    isProgressMove: moveId === 'fulfill_your_vow', moveTarget: null, rationale: 'test', mischiefApplied: false, ...extra };
  control.dice = dice;
  await table.client('pl-1').chat(line, { speaker: { actor: 'pc-kira' } });
  await table.settle(); await table.drain();
}

/** Kira's Fulfill Your Vow: a full track against 1 and 2 — a strong hit. */
const kiraFulfils = () => kiraPlays('fulfill_your_vow', 'Fulfill Your Vow', 'Kira sees her background vow through at last.', [0.0, 0.15]);

const rens = () => ({ completed: rensVow.system.completed, fulfilPaid: rensVow.flags[MODULE_ID]?.fulfilPaid ?? false });

describe('two PCs\' independent "Background Vow"s', () => {
  it('control: with their vowId flags stamped, Kira\'s fulfilment leaves Ren\'s vow alone', async () => {
    await setUp({ stamped: true });
    await kiraFulfils();
    expect(kirasVow.system.completed).toBe(true);
    expect(rens()).toEqual({ completed: false, fulfilPaid: false });
  }, 30_000);

  it('made on the sheet with no GM connected (no vowId flags), Kira\'s fulfilment still leaves Ren\'s vow alone', async () => {
    await setUp({ stamped: false });
    await kiraFulfils();
    expect(kirasVow.system.completed, 'Kira\'s vow is fulfilled (setup)').toBe(true);
    expect(rens()).toEqual({ completed: false, fulfilPaid: false });
  }, 30_000);

  it('with no vowId flags, Kira\'s Forsake Your Vow forsakes only hers', async () => {
    await setUp({ stamped: false });
    await kiraPlays('forsake_your_vow', 'Forsake Your Vow', 'Kira turns her back on her background vow.',
      [0.25, 0.35, 0.65], { moveTarget: 'Background Vow' });
    expect({ completed: kirasVow.system.completed, forsaken: kirasVow.flags[MODULE_ID]?.forsaken ?? false }, 'setup')
      .toEqual({ completed: true, forsaken: true });
    expect({ completed: rensVow.system.completed, forsaken: rensVow.flags[MODULE_ID]?.forsaken ?? false })
      .toEqual({ completed: false, forsaken: false });
  }, 30_000);

  it('with no vowId flags, Kira\'s 🔁 Recommit after a missed fulfilment rewrites only hers', async () => {
    await setUp({ stamped: false, kiraTicks: 8 });
    // 2 boxes against 9 and 10: a miss — the pipeline offers the recommit.
    await kiraPlays('fulfill_your_vow', 'Fulfill Your Vow', 'Kira tries to see her background vow through.', [0.85, 0.95]);
    const [offer] = table.cards(f => f.vowRecommitOfferCard);
    expect(offer?.flags[MODULE_ID], 'the miss offers Kira the recommit (setup)').toMatchObject({ actorId: 'pc-kira' });
    table.client('pl-1').click(offer._id, '[data-action="sf-vow-recommit"]');
    await table.settle(); await table.drain();
    expect(kirasVow.system.rank, 'Kira\'s vow is recommitted (setup)').toBe('formidable');
    expect({ current: rensVow.system.current, rank: rensVow.system.rank }).toEqual({ current: 8, rank: 'dangerous' });
  }, 30_000);
});
