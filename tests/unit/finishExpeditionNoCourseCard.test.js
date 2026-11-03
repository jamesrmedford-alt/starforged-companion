// tests/unit/finishExpeditionNoCourseCard.test.js
// The Set a Course feedback card is Set a Course's (issue #326 W46).
// applyOutcomeEffects' arrival branch serves set_a_course and
// finish_an_expedition and posted postSetACourseFeedbackCard for both: a
// Finish an Expedition hit was told "Course held cleanly (+1 momentum)" —
// the move grants none — or "see the suffer prompt", which it has none of,
// beside its own "Expedition complete" card. The card now posts for Set a
// Course only.

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ interpretation: null, dice: [] }));
vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (text) => ({ ...control.interpretation, playerNarration: text, inputMethod: 'chat' })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../src/moves/resolver.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random');
      for (const d of control.dice) dice.mockReturnValueOnce(d);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const REPLY = 'The journey ends.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
let table;
let kira;

function makeTracksJournal(tracks = []) {
  const store = { [`${MODULE_ID}.tracks`]: structuredClone(tracks) };
  return {
    id: 'tracks-journal', name: 'Starforged Progress Tracks',
    getFlag: (mod, key) => store[`${mod}.${key}`],
    setFlag: async (mod, key, value) => { store[`${mod}.${key}`] = structuredClone(value); },
  };
}

async function play(interpretation, dice, text) {
  control.interpretation = { adds: 0, rationale: 'test', mischiefApplied: false, ...interpretation };
  control.dice = dice;
  await table.client('pl-1').chat(text, { speaker: { actor: 'pc-kira' } });
  await table.settle();
  await table.drain();
}

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 2, currentSceneId: 'sc-1', sceneTruths: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  kira = table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, system: { momentum: { value: 2, max: 10, min: -6, resetValue: 2 } } });
  table.journal._set(makeTracksJournal([
    { id: 'exp-1', label: 'Expedition to the Vault', type: 'expedition', rank: 'dangerous', ticks: 40, completed: false },
  ]));
  scriptClaude(table, { fallback: () => REPLY });
});

describe('A Finish an Expedition arrival posts no Set a Course card (issue #326 W46)', () => {
  it('a Finish an Expedition strong hit posts no "Set a Course resolved (+1 momentum)" card', async () => {
    await play({ moveId: 'finish_an_expedition', moveName: 'Finish An Expedition', statUsed: null,
      isProgressMove: true, moveTarget: 'Expedition to the Vault' },
    [0.25, 0.35],   // challenge 3, 4 against progress 10: a strong hit
    'We bring the ship down at the vault at last; the expedition is over.');

    expect(table.cards(f => f.expeditionFinishCard)).toHaveLength(1);        // the move resolved and finished
    const course = table.cards(f => f.setACourseFeedback);
    expect.soft(course.map(c => c.content)).toEqual([]);                     // actual: ["…Set a Course resolved… Course held cleanly (+1 momentum)…"]
    expect.soft(kira.system.momentum.value).toBe(2);                          // the +1 the card claims was never given (passes)
  }, 30_000);

  it('control: the finish reveals the expedition\'s linked site, and the working-copy reveal rides the persist', async () => {
    // A sector with an undiscovered vault the expedition is linked to (siteId).
    await table.reset({ world: { settings: {
      chronicleAutoEntry: false, narratorSessionSummary: false,
      campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 2, currentSceneId: 'sc-1', sceneTruths: [],
        sectors: [{ id: 'sec-1', name: 'Devil\'s Reach', mapData: { discoveries: [{ id: 'site-1', name: 'The Hollow Vault', type: 'vault', discovered: false }] } }],
        activeSectorId: 'sec-1' },
    } } });
    await table.setClaudeKey('gm-1', 'sk-ant-gina');
    table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
    table.journal._set(makeTracksJournal([
      { id: 'exp-1', label: 'Expedition to the Vault', type: 'expedition', rank: 'dangerous', ticks: 40, completed: false, siteId: 'site-1' },
    ]));
    scriptClaude(table, { fallback: () => REPLY });

    await play({ moveId: 'finish_an_expedition', moveName: 'Finish An Expedition', statUsed: null,
      isProgressMove: true, moveTarget: 'Expedition to the Vault' }, [0.25, 0.35], 'We reach the vault at last.');

    expect(table.cards(f => f.siteDiscovered)).toHaveLength(1);
    expect(table.world.campaignState().sectors[0].mapData.discoveries[0].discovered).toBe(true);
  }, 30_000);

  it('control: a Set a Course strong hit posts its feedback card', async () => {
    await play({ moveId: 'set_a_course', moveName: 'Set A Course', statUsed: 'supply', moveTarget: 'Bleakhold' },
      [0.15, 0.25, 0.99],   // challenge 2, 3; action 6 + supply 3: a strong hit
      'We plot the jump to Bleakhold and hold the course.');

    const course = table.cards(f => f.setACourseFeedback);
    expect(course).toHaveLength(1);
    expect(course[0].content).toContain('Set a Course resolved');
  }, 30_000);
});
