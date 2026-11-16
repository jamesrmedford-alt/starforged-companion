/**
 * PROBE — BATCH · ROUND-READING-NO-MOVE-WITH-PACING-OFF (seam: issue #354 P2-01 × Batch Mode)
 *
 * Scenario: the pacing classifier is switched off (the world setting
 * `pacing.enabled` false). decisions.md → "A line can make no move (P2-01)":
 * "Not when a roll was asked for (`!roll`, a round's "Roll a move instead") or
 * with pacing switched off, where every line is a move as before." Free-flow
 * honours it (index.js: `allowNoMove: !pacingResult.forced &&
 * !pacingResult.pacingDisabled`). A player submits an action in a Batch Mode
 * round.
 *
 * Correct: with pacing off the round's reading is a move reading too — the
 * interpreter is told a roll was asked for and may not answer "no move".
 *
 * Today: readAction passes `allowNoMove: !readAs?.move` whatever the pacing
 * decision said, so with pacing off the interpreter may still decline (or be
 * unsure) and the entry comes back "No roll needed".
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../../src/pacing/telemetry.js', () => ({ logPacingDecision: vi.fn(async () => {}) }));
vi.mock('../../../src/ui/progressTracks.js', async (importOriginal) => ({
  ...(await importOriginal()),
  listProgressTracks: vi.fn(async () => []),
  getActiveCombatPosition: vi.fn(async () => null),
}));
vi.mock('../../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));

import { apiPost } from '../../../src/api-proxy.js';
import { resetRecentDensity } from '../../../src/pacing/router.js';
import { readAction, configureMovePipeline } from '../../../src/moves/movePipeline.js';

const MODULE_ID = 'starforged-companion';

/** Answer each Claude call by what it is: the classifier, or the interpreter. */
function scriptCalls({ classifier = null, interpreter = null } = {}) {
  apiPost.mockImplementation(async (_url, _headers, body) => {
    const system = JSON.stringify(body.system ?? '');
    const reply = /pacing pre-classifier/.test(system) ? classifier : interpreter;
    return { content: [{ type: 'text', text: JSON.stringify(reply ?? {}) }] };
  });
}
const callsTo = (pattern) => apiPost.mock.calls.filter(c => pattern.test(JSON.stringify(c[2].system ?? '')));
const interpreterCall = () => callsTo(/move interpreter/)[0]?.[2] ?? null;

const host = Object.fromEntries([
  'postWhichFightCard', 'postWhichVowCard', 'postWhichLegacyCard', 'postTrackGoneCard',
  'applyOutcomeEffects', 'addLegacyTicks', 'postDevelopRelationshipCard', 'applyReachMilestone',
  'postForgeABondCard', 'postExpeditionFinishCard', 'noteUnsavedOnCopy', 'postSceneFinishCard',
  'postRecommitOfferCard', 'postVowRecommitOfferCard', 'postBondRecommitOfferCard',
  'resolveVowItemCopies', 'completeVowItemByName', 'postFulfillVowCard', 'payFulfilledVowNative',
  'postForsakeVowCard', 'postDecisiveActionCostCard', 'postMovePayThePriceCard', 'postMoveResult',
  'reportUnsavedMoveRecord', 'applyMoveConsequenceRiders', 'resolveCurrentLocationName',
].map(name => [name, vi.fn(async () => null)]));

const read = (extra = {}) => readAction({
  text: 'Tell us the whole story', speakerActorId: 'pc-isaac', campaignState: {}, apiKey: 'k', dial: 'balanced', ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  game.settings._store.clear();
  game.actors._reset();
  global.game.user = { id: 'gm-1', isGM: true };
  game.actors._set('pc-isaac', makeTestActor({ id: 'pc-isaac', name: 'Isaac Sutton' }));
  configureMovePipeline(host);
  game.settings._store.set(`${MODULE_ID}.campaignState`, {});
  resetRecentDensity();
});

describe('BATCH — a round\'s reading with the pacing classifier switched off', () => {
  it('every line is a move: the interpreter may not answer "no move", and the reading is a move reading', async () => {
    game.settings._store.set(`${MODULE_ID}.pacing.enabled`, false);
    // The interpreter would decline if it were allowed to.
    scriptCalls({ interpreter: { moveId: null, rationale: 'A narrative exchange.' } });
    const reading = await read();

    expect(callsTo(/pacing pre-classifier/), 'setup: pacing is off — the classifier was not called').toHaveLength(0);
    expect(callsTo(/move interpreter/), 'setup: the line went to the interpreter').toHaveLength(1);
    // FAILS today: the interpreter is offered NO MOVE, and the entry comes back "No roll needed".
    expect(reading.kind).toBe('move');
    expect(interpreterCall().messages[0].content).toMatch(/A ROLL WAS ASKED FOR/);
  });

  it('…and an unsure reading is rolled as read, not turned into a narrative entry', async () => {
    game.settings._store.set(`${MODULE_ID}.pacing.enabled`, false);
    scriptCalls({ interpreter: { moveId: 'compel', statUsed: 'heart', rationale: 'Low confidence.', confidence: 'low' } });
    const reading = await read();
    // FAILS today: { kind: "narrative", suggestedMove: "compel" }.
    expect(reading).toMatchObject({ kind: 'move', moveId: 'compel' });
  });

  it('control: with pacing on, a line the interpreter reads as no move is a narrative reading (P2-01)', async () => {
    scriptCalls({
      classifier:  { decision: 'MOVE', suggestedMove: 'compel', category: 'social', confidence: 0.8, reasoning: 'Presses Archer.' },
      interpreter: { moveId: null, rationale: 'A narrative exchange.' },
    });
    const reading = await read();
    expect(reading).toEqual({ kind: 'narrative', suggestedMove: 'compel', suggestedTargetId: null });
  });

  it('control: "Roll a move instead" reads the line as a move, pacing on or off', async () => {
    game.settings._store.set(`${MODULE_ID}.pacing.enabled`, false);
    scriptCalls({ interpreter: { moveId: 'compel', statUsed: 'heart', rationale: 'Pressed.' } });
    const reading = await read({ readAs: { move: true } });
    expect(reading.kind).toBe('move');
    expect(interpreterCall().messages[0].content).toMatch(/A ROLL WAS ASKED FOR/);
  });
});
