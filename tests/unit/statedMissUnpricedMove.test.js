/**
 * STARFORGED COMPANION
 * tests/unit/statedMissUnpricedMove.test.js
 *
 * Issue #362 AC02 STATED-MISS-PROMISED-FOR-UNPRICED-MISS — the miss stated
 * before the roll is shown, and narrated, as "what this miss costs" only for
 * a move whose miss pays a price (decisions.md → "Issue #353 R1": the miss is
 * shown "only when it is the price"; "`priceStated` is fixed when the
 * interpretation is read, so the dialog shows what the roll then pays").
 *
 * Enter the Fray's miss pays none ("Fight begins with you in a bad spot") —
 * nor do Swear an Iron Vow's, Test Your Relationship's, the suffer moves'
 * resist rolls or Face Death's. With a stated miss and its suffer move, the
 * Confirm dialog showed "On a miss: … (Endure Harm −1)" and the narrator was
 * told "deliver the miss as stated — it is what this miss costs"; nothing
 * charged it.
 *
 * End to end on a booted GM + player table: the player's line through the
 * chat hook, the REAL interpreter (Claude answered at the fetch boundary),
 * move pipeline, resolver and narrator prompt; scripted: the pacing decision,
 * the ability scan, the confirm dialog (which records the stakes it was
 * given), the dice. One case hands the pipeline an interpretation whose
 * `priceStated` was decided for another move: readMove decides it again for
 * the move the line is read as.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [], confirmedStakes: [], handed: null }));
vi.mock('../../src/pacing/router.js', async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
// The real interpreter — unless a test hands the pipeline an interpretation of its own.
vi.mock('../../src/moves/interpreter.js', async (original) => {
  const real = await original();
  return { ...real, interpretMove: vi.fn(async (text, opts) => (control.handed
    ? { ...control.handed, playerNarration: text, inputMethod: 'chat' }
    : real.interpretMove(text, opts))) };
});
vi.mock('../../src/moves/abilityScanner.js', async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async (interpretation) => {
    control.confirmedStakes.push(JSON.parse(JSON.stringify(interpretation?.stakes ?? null)));
    return true;
  }),
}));
// Challenge dice first (two d10), then the action die (d6), inside the REAL resolveMove.
vi.mock('../../src/moves/resolver.js', async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, 'random');
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude, isReaderCall } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { stakesShown, withPriceSource, normaliseStakes, STAKES_SETTING } from '../../src/moves/stakes.js';
import { missPaysPrice } from '../../src/moves/resolver.js';

const MISS_LINE = 'Their first volley catches your shoulder.';
const STAKES = { hit: 'You catch the raiders flat-footed.', miss: MISS_LINE, missSuffer: { move: 'endure_harm', amount: 1 } };
const READINGS = {
  enter_the_fray: { moveId: 'enter_the_fray', moveName: 'Enter the Fray', statUsed: 'edge', moveTarget: 'Ironclad raiders',
    combatRank: 'dangerous', rationale: 'Combat begins.', confidence: 'high', stakes: STAKES },
  face_danger:    { moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', rationale: 'A risky dash.', confidence: 'high', stakes: STAKES },
};
const MISS = [0.55, 0.65, 0.1];   // challenge 6, 7; action die 1 + edge 2 = 3: a miss; momentum 2 cannot burn it

let table, pc, reading;
const priceCards = () => table.cards(f => f.payThePriceCard);
const narratorCalls = () => table.claude.calls.filter(c => /MOVE OUTCOME/.test(`${c.userText}`));

/** The "Starforged Progress Tracks" journal: a document-level flag store, as progressTracks.js writes it. */
function makeTracksJournal() {
  const flags = {};
  return {
    id:      'tracks-journal',
    name:    'Starforged Progress Tracks',
    getFlag: (mod, key) => flags[`${mod}.${key}`],
    setFlag: async (mod, key, value) => { flags[`${mod}.${key}`] = JSON.parse(JSON.stringify(value)); },
  };
}

async function roll(moveId) {
  reading = READINGS[moveId];
  control.dice = MISS;
  await table.client('pl-1').chat('I draw and open fire on the raiders.', { speaker: { actor: pc.id } });
  await table.settle(); await table.drain();
  const call = narratorCalls().at(-1);
  const prompt = `${call?.system ?? ''}\n${call?.userText ?? ''}`;
  // What the Confirm dialog showed under "On a miss" (stakes.js stakesShown — its own renderer's input).
  const shown = stakesShown(control.confirmedStakes.at(-1)).find(s => s.kind === 'miss') ?? null;
  return {
    narrated:      !!call,
    prompt,
    dialogPromise: shown ? `${shown.text}${shown.cost ? ` (${shown.cost})` : ''}` : null,
    toldAsCost:    /it is what this miss costs/.test(prompt) || prompt.includes('(Endure Harm −1)'),
  };
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 60_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  control.confirmedStakes = [];
  control.handed = null;
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'ac02-s1', sessionNumber: 1,
      currentSceneId: 'ac02-scene', sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  pc = table.addActor({ id: 'pc-kira-ac02', name: 'Kira', ownership: { 'pl-1': 3 }, system: { edge: 2, momentum: { value: 2 } } });
  table.journal._set(makeTracksJournal());
  scriptClaude(table, { fallback: (call) => (isReaderCall(call)
    ? JSON.stringify(reading)
    : /NARRATOR ROLE|SIDECAR/.test(call?.system ?? '')
      ? 'Shots crack across the bay.\n```json\n{"newTruths":[],"stateChanges":[]}\n```'
      : '{}') });
});

describe('issue #362 AC02 — which moves\' misses pay a price', () => {
  it('a routed miss, or a miss whose price is one of its choices (Sojourn), pays one', () => {
    for (const id of ['face_danger', 'gather_information', 'compel', 'aid_your_ally', 'battle', 'clash', 'strike',
      'set_a_course', 'undertake_an_expedition', 'explore_a_waypoint', 'make_a_connection', 'heal', 'repair',
      'face_danger_scene_challenge', 'sojourn']) {
      expect(missPaysPrice(id), id).toBe(true);
    }
  });

  it('Enter the Fray, Swear an Iron Vow, Test Your Relationship, the resist rolls and the threshold moves pay none', () => {
    for (const id of ['enter_the_fray', 'swear_an_iron_vow', 'test_your_relationship', 'endure_harm', 'endure_stress',
      'withstand_damage', 'companion_takes_a_hit', 'face_death', 'face_desolation', 'no_such_move', null]) {
      expect(missPaysPrice(id), String(id)).toBe(false);
    }
  });

  it('a stated miss is the price only for a move whose miss pays one, and with the setting on', () => {
    const stakes = normaliseStakes(STAKES);
    expect(withPriceSource(stakes, true).priceStated).toBe(true);
    expect(withPriceSource(stakes, false).priceStated).toBe(false);
    expect(withPriceSource(stakes).priceStated).toBe(false);
    expect(withPriceSource(normaliseStakes({ hit: 'In.' }), true).priceStated).toBe(false);
    game.settings._store.set(`${MODULE_ID}.${STAKES_SETTING}`, false);
    try {
      expect(withPriceSource(stakes, true).priceStated).toBe(false);
    } finally {
      game.settings._store.delete(`${MODULE_ID}.${STAKES_SETTING}`);
    }
  });
});

describe('issue #362 AC02 — a miss cost the dialog and the narrator state is a cost the miss charges', () => {
  it('control: a Face Danger miss — the dialog\'s "On a miss" line is charged (its card, Endure Harm -1) and narrated as the cost', async () => {
    const r = await roll('face_danger');
    expect(r.narrated).toBe(true);
    expect(r.dialogPromise).toBe(`${MISS_LINE} (Endure Harm −1)`);
    expect(priceCards()).toHaveLength(1);
    expect(priceCards()[0].content).toContain(`As stated before the roll: <strong>${MISS_LINE}</strong>`);
    expect(pc.system.health.value).toBe(4);
    expect(r.toldAsCost).toBe(true);
  }, 60_000);

  it('an Enter the Fray miss pays no price: the dialog shows no miss cost, and the narrator is not told one', async () => {
    const r = await roll('enter_the_fray');
    expect(r.narrated, 'the miss was narrated (setup)').toBe(true);
    expect(table.cards(f => f.combatThresholdCard), 'the fight begins (setup)').toHaveLength(1);
    expect(priceCards(), 'Enter the Fray\'s miss routes no Pay the Price (setup)').toHaveLength(0);
    expect(pc.system.health.value, 'nothing was charged (setup)').toBe(5);

    expect(control.confirmedStakes.at(-1)).toMatchObject({ hit: STAKES.hit, miss: MISS_LINE, priceStated: false });
    expect(r.dialogPromise, 'the dialog showed a miss cost').toBeNull();
    expect(r.toldAsCost, 'the narrator was told the miss costs Endure Harm −1').toBe(false);
    // The hit was shown; the miss's cost is the move outcome's.
    expect(r.prompt).toContain('- On a hit: You catch the raiders flat-footed.');
    expect(r.prompt).toContain('Its cost is the move outcome\'s, not a stated one.');
  }, 60_000);

  it('an interpretation whose price source was decided for another move is decided again for the move rolled', async () => {
    // As if read for a move whose miss pays a price: priceStated true on an Enter the Fray.
    control.handed = { ...READINGS.enter_the_fray, adds: 0, mischiefApplied: false, stakes: { ...STAKES, priceStated: true } };
    const r = await roll('enter_the_fray');
    expect(r.narrated, 'the miss was narrated (setup)').toBe(true);
    expect(control.confirmedStakes.at(-1)).toMatchObject({ priceStated: false });
    expect(r.dialogPromise).toBeNull();
    expect(r.toldAsCost).toBe(false);
    expect(pc.system.health.value).toBe(5);
  }, 60_000);
});
