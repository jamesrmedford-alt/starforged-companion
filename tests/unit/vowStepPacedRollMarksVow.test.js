/**
 * STARFORGED COMPANION
 * tests/unit/vowStepPacedRollMarksVow.test.js
 *
 * A step toward a vow, offered — and the offer followed to the vow's track
 * (known-issues VOW-STEP-SAID-IN-FICTION-NOT-READ).
 *
 * The pacing reader's rules now say a line that states a real step toward an
 * open vow is at least offered Reach a Milestone
 * (readersVowStepOffered.test.js). This is every hop after its answer, on a
 * booted table with the real router, narrator, cards and pipeline:
 *
 *   the reader offers reach_a_milestone
 *     → the line is narrated, and its card carries the move
 *       (router.routePacedInput → narrator.narratePacedInput →
 *       postPacedNarrativeCard: `suggestedMove`, the button)
 *     → the press relays to the canonical GM, which posts the line again as
 *       the speaker with the move forced (cardActions.applyPacedRoll)
 *     → the pipeline makes the move — no roll, no stat to read, no model
 *       asked (movePipeline.readMove's forced interpretation → rollMove's
 *       reachMilestone branch → index.js applyReachMilestone)
 *     → the vow's track is marked by its rank, and the table is told.
 *
 * Reach a Milestone is a move with no roll: nothing here may wait on dice.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude, isReaderCall, readerReply } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const VOW  = 'Find who is raiding the Cinder Expanse lanes';
// The measured line (run 2's a71, without its rules word; the readers' test's progress-1).
const LINE = 'I now have proof the raids are fed by dock clerks selling cargo routes.';
const isClassifier = (call) => isReaderCall(call);
const OFFERED = readerReply({ move: 'reach_a_milestone', risk: 'slight', category: 'investigation' });
// The narrator's reply closes on no hint of its own: the reader's move stands on the card.
const NARRATION = 'Roe will not look at the ledger. The schedules are in his own hand.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

function makeVow(id, name, { ticks = 0, rank = 'dangerous' } = {}) {
  const item = {
    id, type: 'progress', name, flags: { [MODULE_ID]: { vowId: `vid-${id}` } },
    system: { subtype: 'vow', rank, current: ticks, completed: false },
    async update(changes) {
      for (const [k, v] of Object.entries(changes)) if (k === 'system.current') item.system.current = v;
      return item;
    },
    async setFlag(scope, key, value) { (item.flags[scope] ??= {})[key] = value; return item; },
    async getFlag(scope, key) { return item.flags[scope]?.[key]; },
  };
  return item;
}

let table;
let vow;

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'vow-s1', sessionNumber: 1, currentSceneId: 'vow-scene', sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  vow = makeVow('vow-mira', VOW, { ticks: 16 });
  table.addActor({ id: 'pc-mira', name: 'Mira Kestrel', ownership: { 'pl-1': 3 }, items: { contents: [vow] } });
  scriptClaude(table, { fallback: (call) => (isReaderCall(call) ? '{}' : NARRATION) }).when(isClassifier, OFFERED);
});

const pacedCards = () => table.cards(f => f.narratorCard && f.pacedNarrative === true);

async function miraSaysIt() {
  await table.client('pl-1').chat(LINE, { speaker: { actor: 'pc-mira', alias: 'Mira Kestrel' } });
  await table.settle(); await table.drain();
  const [card] = pacedCards();
  expect(card, 'the line was narrated').toBeTruthy();
  return card;
}

describe('a step toward a vow said in the fiction: offered on the card, made by its Roll', () => {
  it('the reader was told the vow, and its move is on the narration\'s card', async () => {
    const card = await miraSaysIt();

    const asked = table.claude.calls.find(isClassifier);
    expect(asked.userText).toContain(`- Open vows: "${VOW}" (dangerous, 4 of 10 boxes).`);
    expect(asked.userText).toContain(`"${LINE}"`);

    expect(card.flags[MODULE_ID]).toMatchObject({ suggestedMove: 'reach_a_milestone', playerText: LINE, actorId: 'pc-mira' });
    expect(card.content).toContain('data-action="sf-paced-roll"');
    expect(card.content).toContain('Reach a Milestone');
    // Narrated, and nothing marked: the narration changes no sheet.
    expect(vow.system.current).toBe(16);
    expect(table.cards(f => f.moveResolution)).toHaveLength(0);
  }, 30_000);

  it('pressing it makes the move: the vow is marked by its rank, with no roll and no reader asked', async () => {
    const card = await miraSaysIt();
    const callsBefore = table.claude.calls.length;

    table.client('pl-1').click(card._id ?? card.id, '[data-action="sf-paced-roll"]');
    await table.settle(); await table.drain();

    // The line posted again, as Mira, with the move forced — past the pacing reader.
    const [forced] = table.cards(f => f.forcedMoveId === 'reach_a_milestone');
    expect(forced, 'the forced move was posted').toBeTruthy();
    expect(forced.flags[MODULE_ID]).toMatchObject({ bypassPacing: true, forcedMoveId: 'reach_a_milestone' });
    expect(forced.speaker?.actor).toBe('pc-mira');
    expect(forced.content).toBe(LINE);

    // A dangerous vow: a milestone is two boxes (8 ticks).
    expect(vow.system.current).toBe(24);
    const [made] = table.cards(f => f.moveResolution);
    expect(made, 'the move\'s own card').toBeTruthy();
    expect(made.flags[MODULE_ID].actorId).toBe('pc-mira');
    expect(made.content).toMatch(/Reach a Milestone/);

    // No reader read it again: the move was chosen, and it has no stat to read.
    expect(table.claude.calls.slice(callsBefore).filter(isReaderCall)).toEqual([]);
    // The card is spent.
    expect(table.world.message(card._id ?? card.id).flags[MODULE_ID].rolled).toBeTruthy();
  }, 30_000);

  it('the GM pressing it marks Mira\'s vow too — the move is the speaker\'s', async () => {
    const card = await miraSaysIt();

    table.client('gm-1').click(card._id ?? card.id, '[data-action="sf-paced-roll"]');
    await table.settle(); await table.drain();

    expect(vow.system.current).toBe(24);
    expect(table.cards(f => f.forcedMoveId === 'reach_a_milestone')[0].speaker?.actor).toBe('pc-mira');
  }, 30_000);

  it('control: a line the reader narrates plainly carries no move, and marks nothing', async () => {
    scriptClaude(table, { fallback: (call) => (isReaderCall(call) ? '{}' : NARRATION) })
      .when(isClassifier, readerReply({ category: 'social' }));
    await table.client('pl-1').chat('I turn my sister\'s compass over in my palm.', { speaker: { actor: 'pc-mira', alias: 'Mira Kestrel' } });
    await table.settle(); await table.drain();

    const [card] = pacedCards();
    expect(card.flags[MODULE_ID].suggestedMove ?? null).toBeNull();
    expect(card.content).not.toContain('data-action="sf-paced-roll"');
    expect(vow.system.current).toBe(16);
  }, 30_000);
});
