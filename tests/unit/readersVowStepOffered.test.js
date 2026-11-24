/**
 * STARFORGED COMPANION
 * tests/unit/readersVowStepOffered.test.js
 *
 * A step toward a vow said in the fiction is at least offered Reach a
 * Milestone (known-issues VOW-STEP-SAID-IN-FICTION-NOT-READ).
 *
 * The readers' plain-line test read "I now have proof the raids are fed by
 * dock clerks selling cargo routes." twelve times — three such lines, twice
 * each, on two models — and narrated it with nothing offered twelve times
 * (test/ci/playwright/readers/runs/readers-live-20261124-0255/, `progress-1`,
 * `-2`, `-3`). The pacing reader's own reasons, from results.json:
 *
 *   "The player states a conclusion they've reached; no action is attempted
 *    and nothing is at stake in this statement itself."        (Sonnet 5.5)
 *   "Player states a conclusion or realization with no action attempted and
 *    no stakes — pure narration of what the character now knows." (Haiku 5.5)
 *
 * It asked whether an action was attempted with something at stake, and a
 * milestone is neither; and it was told of no vow. In the long haul's third
 * live run the one such line (a61) was offered Gather Information, and the
 * milestone was reached from that roll's card — by a roll the line did not
 * need.
 *
 * Reach a Milestone marks the sheet, and only a move marks it: the same case
 * as heal, resupply and repair. So the rule is in the same block of the
 * pacing reader's rules (WHAT ONLY A MOVE CHANGES IS ALWAYS OFFERED), the
 * reader is told the open vows (readersSituationBlock.test.js), and the move
 * reader's rules say the same. The offered move's way to the card's Roll and
 * to the vow's track is in vowStepPacedRollMarksVow.test.js.
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../src/pacing/telemetry.js', () => ({ logPacingDecision: vi.fn(async () => {}) }));
vi.mock('../../src/ui/progressTracks.js', async (importOriginal) => ({
  ...(await importOriginal()),
  listProgressTracks: vi.fn(async () => []),
  getActiveCombatPosition: vi.fn(async () => null),
}));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));

import { apiPost } from '../../src/api-proxy.js';
import { buildClassifierContext } from '../../src/pacing/classifier.js';
import { decidePacing, classifierReadingOf, resetRecentDensity } from '../../src/pacing/router.js';
import { interpretMove } from '../../src/moves/interpreter.js';
import { readMove, configureMovePipeline } from '../../src/moves/movePipeline.js';
import { listProgressTracks, getActiveCombatPosition } from '../../src/ui/progressTracks.js';
import { invalidateActorCache } from '../../src/character/actorBridge.js';

const MODULE_ID = 'starforged-companion';
const VOW  = 'Find who is raiding the Cinder Expanse lanes';
// The measured line (run 2's a71, without its rules word; the readers' test's progress-1).
const LINE = 'I now have proof the raids are fed by dock clerks selling cargo routes.';
const MIRA = { name: 'Mira Kestrel', actorId: 'pc-mira' };
const flat = (text) => text.replace(/\s+/g, ' ');

const pacingRules = () => flat(buildClassifierContext({
  playerText: LINE, campaignState: {}, character: MIRA, recentMoveDensity: { count: 0, window: 5 },
  pacingConfig: { dials: { combat: 9, investigation: 6, exploration: 6, social: 5, downtime: 1 } },
}).systemPrompt);
/** The always-offered block alone: from its heading to the next rule's. */
const alwaysOffered = () => {
  const rules = pacingRules();
  return rules.slice(rules.indexOf('WHAT ONLY A MOVE CHANGES IS ALWAYS OFFERED'), rules.indexOf('A LINE THAT NAMES ITS MOVE ASKS FOR IT'));
};

/** Answer each Claude call by what it is: the classifier, or the interpreter. */
function scriptCalls({ classifier = null, interpreter = null } = {}) {
  apiPost.mockImplementation(async (_url, _headers, body) => {
    const system = JSON.stringify(body.system ?? '');
    const reply = /pacing pre-classifier/.test(system) ? classifier : interpreter;
    return { content: [{ type: 'text', text: JSON.stringify(reply ?? {}) }] };
  });
}
const callsTo = (pattern) => apiPost.mock.calls.filter(c => pattern.test(JSON.stringify(c[2].system ?? '')));
const decide = (playerText = LINE) => decidePacing({ playerText, campaignState: {}, character: MIRA, apiKey: 'k' });

beforeEach(() => {
  vi.clearAllMocks();
  game.settings._store.clear();
  game.actors._reset();
  global.game.user = { id: 'gm-1', isGM: true };
  game.actors._set('pc-mira', makeTestActor({ id: 'pc-mira', name: 'Mira Kestrel', items: { contents: [
    { id: 'v1', name: VOW, type: 'progress', flags: {}, system: { subtype: 'vow', rank: 2, current: 16, completed: false } },
  ] } }));
  invalidateActorCache('pc-mira');
  listProgressTracks.mockResolvedValue([]);
  getActiveCombatPosition.mockResolvedValue(null);
  resetRecentDensity();
});

describe('the pacing reader\'s rule: a step toward an open vow is never plain NARRATIVE', () => {
  it('is part of the one always-offered block, not a second block beside it', () => {
    expect(pacingRules().match(/WHAT ONLY A MOVE CHANGES IS ALWAYS OFFERED/g)).toHaveLength(1);
    const block = alwaysOffered();
    // The block's own rule covers it: at least offered, at any dial.
    expect(block).toMatch(/a line that sets about one of the things below is never plain NARRATIVE\. At any dial, answer at least NARRATIVE_WITH_MOVE_AVAILABLE with that move as suggestedMove/);
    expect(block).toContain('- RECOVERY — treating a wound or an ailment (heal)');
    expect(block).toContain('- A STEP TOWARD A VOW — a line that states a real step toward one of the speaker\'s open vows (the Open vows of the SITUATION): proof found, an obstacle overcome, a lead run to ground, a foe of the quest beaten.');
    expect(block).toContain('Only reach_a_milestone marks a vow\'s progress, so offer it.');
  });

  it('answers the reader\'s own reason for narrating it: nothing attempted, nothing at stake', () => {
    expect(alwaysOffered()).toContain('Such a line often attempts nothing and puts nothing at stake — it says what has been achieved, to the table or to someone in the scene — and that is no reason to call it plain NARRATIVE: a milestone is claimed, not rolled.');
  });

  it('gives the measured line as its example', () => {
    expect(alwaysOffered()).toContain(`Example: "${LINE}" with the open vow "${VOW}" → NARRATIVE_WITH_MOVE_AVAILABLE, suggestedMove reach_a_milestone. NOT plain NARRATIVE.`);
  });

  it('a line that also attempts something is still that action\'s move, and "it is done" is still Fulfill Your Vow', () => {
    const block = alwaysOffered();
    expect(block).toContain('A line that also attempts something with stakes is still that action\'s move (going through the files is gather_information; the milestone is what it may earn).');
    expect(block).toContain('A line that says outright the vow is done — the quest finished, the promise kept — is fulfill_your_vow.');
    expect(block).toContain('A hope, a plan, a question or a passing remark about the quest is no step; and with no open vow there is nothing to step toward.');
  });

  it('the catalog says what the move is — a step, and no roll', () => {
    expect(pacingRules()).toContain('- reach_a_milestone: a real step toward an open vow — marks its progress (no roll)');
    expect(pacingRules()).toContain('- fulfill_your_vow: progress move when vow completes');
  });

  it('control: the rules it stands beside are as they were', () => {
    const rules = pacingRules();
    expect(rules).toContain('TALKING IS NOT A MOVE');
    expect(rules).toContain('AN EVERYDAY ACTION WITH NOTHING AT RISK IS NOT A MOVE');
    expect(rules).toContain('A LINE THAT NAMES ITS MOVE ASKS FOR IT');
    expect(rules).toMatch(/"I treat my wounds with the ship's medkit" at a downtime dial of 1/);
  });
});

describe('the move reader\'s rule: such a line is Reach a Milestone, though nothing is attempted', () => {
  const moveRules = async () => {
    scriptCalls({ interpreter: { moveId: 'reach_a_milestone', statUsed: null, moveTarget: VOW, confidence: 'high', rationale: 'Proof found.' } });
    await interpretMove(LINE, { campaignState: {}, mischiefLevel: 'lawful', apiKey: 'k', roller: game.actors.get('pc-mira') });
    return callsTo(/move interpreter/).at(-1)[2];
  };

  it('rule 10 says so, and rule 7 no longer makes it NO MOVE', async () => {
    const system = (await moveRules()).system[0].text;
    expect(system).toContain('- A STEP TOWARD A VOW: a line that states a real step toward one of the character\'s open vows — proof found, an obstacle overcome, a lead run to ground, a foe of the quest beaten — is reach_a_milestone (no roll: statUsed and stakes null; moveTarget the vow\'s name), though it attempts nothing: rule 7 does not make it NO MOVE.');
    expect(system).toContain('A line that also attempts something with stakes is that action\'s move; one that says outright the vow is done is fulfill_your_vow.');
    expect(system).toContain('So is a line that states a real step toward one of the character\'s open vows, though nothing is attempted in it (rule 10).');
  });

  it('and it is told the vow the step is toward, with its progress', async () => {
    const user = (await moveRules()).messages[0].content;
    expect(user).toContain(`- Open vows: "${VOW}" (dangerous, 4 of 10 boxes).`);
  });

  it('its reading is a move with no roll: no stat, no stakes, the vow as its target', async () => {
    scriptCalls({ interpreter: { moveId: 'reach_a_milestone', statUsed: null, moveTarget: VOW, confidence: 'high', rationale: 'Proof found.', stakes: { hit: 'x', miss: 'y' } } });
    const reading = await interpretMove(LINE, { campaignState: {}, mischiefLevel: 'lawful', apiKey: 'k', roller: game.actors.get('pc-mira') });
    expect(reading).toMatchObject({ moveId: 'reach_a_milestone', moveName: 'Reach a Milestone', statUsed: null, moveTarget: VOW, isProgressMove: false, stakes: null });
    expect(reading.noMove).toBeUndefined();
  });
});

describe('decidePacing: what the code does with the reader\'s answer', () => {
  const OFFERED = { decision: 'NARRATIVE_WITH_MOVE_AVAILABLE', suggestedMove: 'reach_a_milestone', sceneChallenge: null, category: 'investigation', confidence: 0.8, reasoning: 'Proof found is a step toward her open vow.' };

  it('the reader is given the open vow with the line (it was told of none)', async () => {
    scriptCalls({ classifier: OFFERED });
    await decide();
    const user = callsTo(/pacing pre-classifier/)[0][2].messages[0].content;
    expect(user).toContain(`- Open vows: "${VOW}" (dangerous, 4 of 10 boxes).`);
    expect(user).toContain(`## PLAYER INPUT\n"${LINE}"`);
  });

  it('offered: the line is narrated, and the move goes to the card\'s Roll', async () => {
    scriptCalls({ classifier: OFFERED });
    expect(await decide()).toMatchObject({ runMove: false, decision: 'NARRATIVE_WITH_MOVE_AVAILABLE', suggestedMove: 'reach_a_milestone', suggestedTargetId: null });
  });

  it('the move named as the catalog prints it is the same move', async () => {
    scriptCalls({ classifier: { ...OFFERED, suggestedMove: 'Reach a Milestone' } });
    expect((await decide()).suggestedMove).toBe('reach_a_milestone');
  });

  it('at a low dial an unsure MOVE is an offer too — never nothing', async () => {
    scriptCalls({ classifier: { ...OFFERED, decision: 'MOVE', category: 'downtime', confidence: 0.6 } });
    expect(await decide()).toMatchObject({ runMove: false, decision: 'NARRATIVE_WITH_MOVE_AVAILABLE', suggestedMove: 'reach_a_milestone' });
  });

  it('called a MOVE, it goes to the move reader with the milestone named', async () => {
    scriptCalls({ classifier: { ...OFFERED, decision: 'MOVE', confidence: 0.85 } });
    const pacing = await decide();
    expect(pacing).toMatchObject({ runMove: true, decision: 'MOVE', nominatedMove: 'reach_a_milestone', suggestedMove: null });
    expect(classifierReadingOf(pacing)).toMatchObject({ moveId: 'reach_a_milestone', category: 'investigation' });
  });

  it('in an open fight an offer is a MOVE, as every offer there is: the move reader reads it', async () => {
    listProgressTracks.mockResolvedValue([{ id: 'f1', type: 'combat', label: 'The Cinder Wren', completed: false }]);
    scriptCalls({ classifier: OFFERED });
    const pacing = await decide();
    expect(pacing).toMatchObject({ runMove: true, decision: 'MOVE', nominatedMove: 'reach_a_milestone' });
    expect(pacing.reasoning).toMatch(/^\[combat-active backstop: NWMA→MOVE\]/);
  });

  it('control: plain NARRATIVE from the reader is still plain narration — the code adds no offer of its own', async () => {
    scriptCalls({ classifier: { decision: 'NARRATIVE', suggestedMove: null, category: 'social', confidence: 0.9, reasoning: 'A reflective line.' } });
    expect(await decide('I turn my sister\'s compass over in my palm.')).toMatchObject({ runMove: false, decision: 'NARRATIVE', suggestedMove: null });
  });
});

describe('readMove: the milestone is offered or made, never dropped', () => {
  const host = Object.fromEntries([
    'postWhichFightCard', 'postWhichVowCard', 'postWhichLegacyCard', 'postTrackGoneCard',
    'applyOutcomeEffects', 'addLegacyTicks', 'postDevelopRelationshipCard', 'applyReachMilestone',
    'postForgeABondCard', 'postExpeditionFinishCard', 'noteUnsavedOnCopy', 'postSceneFinishCard',
    'postRecommitOfferCard', 'postVowRecommitOfferCard', 'postBondRecommitOfferCard',
    'resolveVowItemCopies', 'completeVowItemByName', 'postFulfillVowCard', 'payFulfilledVowNative',
    'postForsakeVowCard', 'postDecisiveActionCostCard', 'postMovePayThePriceCard', 'postMoveResult',
    'reportUnsavedMoveRecord', 'applyMoveConsequenceRiders', 'resolveCurrentLocationName',
  ].map(name => [name, vi.fn(async () => null)]));
  const read = (extra = {}) => readMove({ narration: LINE, speakerActorId: 'pc-mira', campaignState: {}, apiKey: 'k', dial: 'balanced', ...extra });
  const CLASSIFIER = { moveId: 'reach_a_milestone', category: 'investigation', reasoning: 'Proof found is a step toward her open vow.' };

  beforeEach(() => {
    configureMovePipeline(host);
    game.settings._store.set(`${MODULE_ID}.campaignState`, {});
    game.settings._store.set(`${MODULE_ID}.riders.autoApply`, false);
  });

  it('the move reader reads the milestone: it goes on to the confirm dialog, with nothing to roll', async () => {
    scriptCalls({ interpreter: { moveId: 'reach_a_milestone', statUsed: null, moveTarget: VOW, confidence: 'high', rationale: 'Proof found.' } });
    const result = await read({ classifier: CLASSIFIER });
    expect(result.noMove).toBeUndefined();
    expect(result.targetChoice).toBeNull();
    expect(result.interpretation).toMatchObject({ moveId: 'reach_a_milestone', statUsed: null, moveTarget: VOW, stakes: null });
    expect(callsTo(/move interpreter/)[0][2].messages[0].content).toMatch(/PACING READ \(a hint, not a ruling — rule 9\): the stage before you read this line as reach_a_milestone in a investigation scene/);
  });

  it('the move reader reads no move after all: the line is narrated with the milestone offered', async () => {
    scriptCalls({ interpreter: { moveId: null, rationale: 'She states a conclusion.' } });
    const result = await read({ classifier: CLASSIFIER });
    expect(result.noMove).toEqual({ rationale: 'She states a conclusion.', lowConfidence: false, offeredMove: 'reach_a_milestone' });
  });

  it('the card\'s Roll forces the move: no reader is asked, and the vow is the roller\'s to mark', async () => {
    const result = await read({ forced: { moveId: 'reach_a_milestone' } });
    expect(apiPost, 'a move with no stat has nothing to read').not.toHaveBeenCalled();
    expect(result.noMove).toBeUndefined();
    expect(result.interpretation).toMatchObject({ moveId: 'reach_a_milestone', moveName: 'Reach a Milestone', statUsed: null, isProgressMove: false, moveTarget: null });
    expect(result.rollerActor?.id).toBe('pc-mira');
  });
});
