/**
 * PROBE — IP-04 POSITION-UNNAMED-FIGHT-DROPPED (eighth audit, area index-pipeline)
 *
 * What the user does: two fights are open (a crew split between two foes, or
 * an older fight never finished). Kira — in a bad spot in her fight — rolls
 * React Under Fire (or Gain Ground) without naming the foe, and gets a strong
 * hit: "Succeed and are in control." Then she types a Strike.
 *
 * What happens: applyOutcomeEffects (src/index.js) resolves the move's fight
 * as `selectCombatTrack(tracks, moveTarget, { trackId })` — the target, else
 * the sole open fight. Two open and none named, that is null, so the
 * position is written nowhere: a console warning ("matched no open fight —
 * not written") and nothing on any card (the pipeline never surfaces
 * applyOutcomeEffects' notApplied). The move card still says "you are in
 * control". Strike and Clash ask "which fight?" in this case (issue #321
 * U16); React Under Fire and Gain Ground neither ask nor say. Yet the
 * pipeline already knows Kira's own fight — the one fight that records her
 * position, which getActiveCombatPosition reads for the interpreter (issue
 * #322 V03). So her next Strike is steered by the stale "bad spot" and
 * remapped to Clash (constrainMoveToPosition), and a Take Decisive Action
 * would still be downgraded.
 *
 * What should happen: the position lands on the roller's own fight (the one
 * fight recording their position), or the move asks which fight as Strike /
 * Clash do — never silently nowhere.
 *
 * The control: with one fight open the same move writes the position.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [], interpretation: null }));
vi.mock('../../../src/pacing/router.js', async (original) => ({
  ...(await original()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (original) => ({
  ...(await original()), interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: 'chat' })),
}));
vi.mock('../../../src/moves/abilityScanner.js', async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../../src/moves/resolver.js', async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, 'random');
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';
import { interpretMove } from '../../../src/moves/interpreter.js';

function makeTracksJournal(tracks = []) {
  const store = { [`${MODULE_ID}.tracks`]: structuredClone(tracks) };
  return {
    id: 'tracks-journal', name: 'Starforged Progress Tracks',
    getFlag: (mod, key) => store[`${mod}.${key}`],
    setFlag: async (mod, key, value) => { store[`${mod}.${key}`] = structuredClone(value); },
  };
}

const kiraFight = { id: 'fight-1', label: 'Corsair boarding party', type: 'combat', rank: 'dangerous', ticks: 8,
  completed: false, combatState: 'bad_spot', positions: { 'pc-kira': 'bad_spot' } };
const renFight  = { id: 'fight-2', label: 'Dock brawl', type: 'combat', rank: 'dangerous', ticks: 4,
  completed: false, combatState: 'in_control', positions: { 'pc-ren': 'in_control' } };

// Challenge 2 and 3, action 6 + edge 2 = 8: a strong hit.
const STRONG = [0.15, 0.25, 0.99];

let table;

async function roll(interpretation, dice = STRONG) {
  control.interpretation = { rationale: 'test', mischiefApplied: false, adds: 0, ...interpretation };
  control.dice = dice;
  await table.client('pl-1').chat(`Kira acts — ${interpretation.moveId}, ducking the incoming fire.`, { speaker: { actor: 'pc-kira' } });
  await table.settle(); await table.drain();
}

const tracks = () => table.journal.find(j => j.name === 'Starforged Progress Tracks').getFlag(MODULE_ID, 'tracks');

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'pos-s1', sessionNumber: 1,
      currentSceneId: 'pos-scene', sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 } });
  scriptClaude(table, { fallback: () => 'Steel rings.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  interpretMove.mockClear();
});

describe('IP-04 a combat move\'s position with two fights open and no foe named', () => {
  it('React Under Fire\'s "in control" lands on the roller\'s own fight, and steers her next move', async () => {
    silenceConsoleErrors();
    table.journal._set(makeTracksJournal([kiraFight, renFight]));

    await roll({ moveId: 'react_under_fire', moveName: 'React Under Fire', statUsed: 'edge' });
    expect(table.cards(f => f.moveResolution)).toHaveLength(1);                 // the move rolled: a strong hit
    expect.soft(tracks()[0].positions['pc-kira']).toBe('in_control');           // actual: "bad_spot" — written nowhere
    expect.soft(getCapturedWarns().some(w => /matched no open fight/.test(w))).toBe(false);   // actual: only a console warning says so

    await roll({ moveId: 'strike', moveName: 'Strike', statUsed: 'iron' });
    expect.soft(interpretMove.mock.calls.at(-1)[1].combatPosition).toBe('in_control');   // actual: "bad_spot" — her Strike is steered to Clash
  }, 30_000);

  it('control: with one fight open the same move writes the roller\'s position', async () => {
    table.journal._set(makeTracksJournal([kiraFight]));

    await roll({ moveId: 'react_under_fire', moveName: 'React Under Fire', statUsed: 'edge' });
    expect(tracks()[0].positions['pc-kira']).toBe('in_control');
  }, 30_000);
});
