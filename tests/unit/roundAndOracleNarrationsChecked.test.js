/**
 * STARFORGED COMPANION
 * tests/unit/roundAndOracleNarrationsChecked.test.js
 *
 * Overhaul 4: the round's narration and the oracle follow-up's are checked
 * against their obligations block before they post, as the move's and the
 * paced line's are (moves/contracts/checks.js narrateKeepingObligations). A
 * round told with an outcome's name is asked once more ([apparatus],
 * certain); an oracle's NO told as a yes trips the judge, which says so, and
 * the answer is asked once more ([oracle]).
 *
 * Each call's kind, as the scripted playthroughs' strict replay files it
 * (test/ci/playwright/lib/claude.mjs callerKind — the two named module frames
 * above apiPost, looking through the check), read off the real stack: the
 * narration and its re-ask are the narrator function's
 * (`callNarratorAPI>narrateRound`, `>narrateOracleFollowup`), the judge is
 * `judgeNarration>` the narration it judges.
 */

/* global makeTestActor */
import path from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));

import { callerKind } from '../../test/ci/playwright/lib/claude.mjs';
import { apiPost } from '../../src/api-proxy.js';
import { narrateOracleFollowup, narrateRound, narrateSessionVignette } from '../../src/narration/narrator.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const SIDECAR = '\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const ROOT = path.resolve(__dirname, '../..');
const reply = (text) => ({ content: [{ type: 'text', text }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'end_turn' });
const userOf = (call) => String(call[2]?.messages?.[0]?.content ?? '');
const labelOf = (call) => call[3]?.label ?? null;

/** The stack as the browser has it: the module's files under /modules/starforged-companion/. */
// vite-node calls an imported function through its module namespace — "at Module.narrateRound" — where the browser says "at narrateRound".
const asModuleStack = (stack) => String(stack).split(`${ROOT}/src/`).join('http://foundry:30000/modules/starforged-companion/src/')
  .replace(/^(\s+at (?:async )?)Module\./gm, '$1');

let kinds = [];
/** apiPost answers `texts` in turn, noting each call's kind from the stack at the call. */
function answer(...texts) {
  const queue = texts.map(reply);
  apiPost.mockImplementation(async () => {
    kinds.push(callerKind(asModuleStack(new Error().stack)));   // read before any await
    return queue.shift() ?? reply('');
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  kinds = [];
  ChatMessage._reset();
  game.settings._store.clear();
  game.actors._reset();
  global.game.messages = { contents: [] };
  global.game.user = { id: 'gm-1', isGM: true };
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
  game.settings._store.set(KEY, {
    currentSessionId: 'sess-3', sessionNumber: 3, currentSceneId: 'sc-3',
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-3' }, sceneFrame: null,
  });
});

describe("the oracle follow-up's narration is checked", () => {
  // Issue #399, D7: [oracle] passed the measure in the pre-post judge — round
  // 3's a46 and round 8's a53 are among its real breaches (D6) — so the
  // judge's verdict asks again.
  it('a NO told as a yes: the judge says so, and it is logged — the narration posts as written (issue #402, change 5)', async () => {
    answer(
      'A thin voice answers — someone is left alive aboard the wreck.' + SIDECAR,
      '{"violations":[{"tag":"oracle","quote":"someone is left alive aboard"}]}',
    );
    const text = await narrateOracleFollowup({
      kind: 'oracle_yes_no', oracleName: 'Ask the Oracle (likely)', question: 'Is anyone left alive aboard the wreck?',
      rolledLine: 'd100 = 97 → NO', campaignState: game.settings.get(MODULE_ID, 'campaignState'),
    });
    expect(apiPost.mock.calls.map(labelOf)).toEqual(['narrator:narrateOracleFollowup', 'obligationJudge']);
    // The judge reads the line as the breach, with the question it answers.
    expect(userOf(apiPost.mock.calls[1])).toContain('[oracle] BREACH: The narration says, shows or implies the opposite of the oracle\'s answer to "Is anyone left alive aboard the wreck?": the oracle answered NO.');
    expect(text).toBe('A thin voice answers — someone is left alive aboard the wreck.');
    expect(kinds).toEqual(['callNarratorAPI>narrateOracleFollowup', 'judgeNarration>narrateOracleFollowup']);
  });
});

describe("the round's narration is checked", () => {
  it("told with an outcome's name: asked once more, and the second reply is the one posted", async () => {
    game.actors._set('pc-kira', makeTestActor({ id: 'pc-kira', name: 'Kira', hasPlayerOwner: true }));
    answer('It is a strong hit: Kira holds the lock.' + SIDECAR, 'Kira braces, and the lock holds.' + SIDECAR);
    const round = {
      id: 'round-1', number: 1, phase: 'narrating', acting: ['pl-1'],
      entries: { 'pl-1': { userId: 'pl-1', actorId: 'pc-kira', actorName: 'Kira', userName: 'Kira', text: 'I hold the lock.',
        rolled: { narrationInput: {
          kind: 'move', resolutionId: 'res-1', moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'iron',
          outcome: 'strong_hit', outcomeLabel: 'Strong hit', isMatch: false, endingTrackIds: [],
          relevance: { resolvedClass: 'interaction', entityIds: [], entityTypes: [] },
        } } } },
    };
    const res = await narrateRound({ round, campaignState: game.settings.get(MODULE_ID, 'campaignState') });
    expect(res.posted).toBe('card');
    expect(apiPost.mock.calls.slice(0, 2).map(labelOf)).toEqual(['narrator:narrateRound', 'narrator:narrateRound:reask']);
    expect(userOf(apiPost.mock.calls[1])).toContain('## YOUR DRAFT — NOT POSTED');
    expect(kinds.slice(0, 2)).toEqual(['callNarratorAPI>narrateRound', 'callNarratorAPI>narrateRound']);
    expect(ChatMessage._created.some(m => /sf-narration-prose">Kira braces, and the lock holds\.</.test(m.content ?? ""))).toBe(true);
  });
});

// Issue #397, Code fix 4 (TABLE-WORDS-IN-THE-FICTION): round 1's a15 opening
// said "because Wits 3 is a lot of thinking to do on bland food", and session
// set-pieces and oracle follow-ups carried no [apparatus] line.
describe('a set-piece and an oracle follow-up are held to the table\'s words', () => {
  it('an opening that says a stat with its number is asked once more', async () => {
    answer('You stir the paste, because Wits 3 is a lot of thinking to do on bland food.' + SIDECAR,
      'You stir the paste and watch the station lights wink through the porthole.' + SIDECAR);
    const text = await narrateSessionVignette({ userMessage: 'OPENING VIGNETTE — the galley, before the session begins.',
      campaignState: game.settings.get(MODULE_ID, 'campaignState') });
    expect(apiPost.mock.calls.map(labelOf)).toEqual(['narrator:narrateSessionVignette', 'narrator:narrateSessionVignette:reask']);
    expect(userOf(apiPost.mock.calls[1])).toContain('## YOUR DRAFT — NOT POSTED');
    expect(text).toBe('You stir the paste and watch the station lights wink through the porthole.');
  });

  it('a follow-up that reads a track out is asked once more', async () => {
    answer('The voice laughs. "Still counting your boxes? Two of ten." Then the channel dies.' + SIDECAR,
      'The voice laughs once, and the channel dies.' + SIDECAR, '{"violations":[]}');
    const text = await narrateOracleFollowup({
      kind: 'oracle_yes_no', oracleName: 'Ask the Oracle (likely)', question: 'Does the voice answer?',
      rolledLine: 'd100 = 12 → YES', campaignState: game.settings.get(MODULE_ID, 'campaignState'),
    });
    // A certain check: asked again, before any judge call. The draft that
    // posts is then judged — its [oracle] line trips on "voice" — once (issue
    // #399's audit N10: neither draft of a re-asked narration was judged).
    expect(apiPost.mock.calls.map(labelOf)).toEqual(['narrator:narrateOracleFollowup', 'narrator:narrateOracleFollowup:reask', 'obligationJudge']);
    expect(kinds.at(-1)).toBe('judgeNarration>narrateOracleFollowup');
    expect(text).toBe('The voice laughs once, and the channel dies.');
  });
});
