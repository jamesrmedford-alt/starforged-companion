/**
 * STARFORGED COMPANION
 * tests/unit/oracleAnswerBindsNarration.test.js
 *
 * known-issues ORACLE-NO-NARRATED-AS-YES — the long haul's third live run
 * (explorations/long-haul-live-20261124-0321, a46).
 *
 * `!oracle yes likely Is anyone left alive aboard the wreck?` rolled 97: NO.
 * The follow-up narration said "The open comm still hisses with the dry
 * voice's breathing, which means someone is aboard". Its request carried the
 * result ("Mechanical result: d100 = 97 → NO") under a recent scene in which
 * a voice aboard had been speaking for three beats, and was asked only to
 * "Render this result as 2-3 sentences … anchored to the current scene":
 * nothing said which of the two gives way. The narrator kept what it had made.
 *
 * Now the mode's role says an answer binds and the scene is what is
 * reconciled, and the user message says the answer back, with the question,
 * as the last thing before the ask.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});

import { apiPost } from '../../src/api-proxy.js';
import { narrateOracleFollowup } from '../../src/narration/narrator.js';
import { formatOracleAnswerRule, formatRecentOraclesBlock, buildNarratorSystemPrompt } from '../../src/narration/narratorPrompt.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const reply = (text) => ({ content: [{ type: 'text', text }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'end_turn' });

// Run 3, a46 — the card's own words.
const QUESTION = 'Is anyone left alive aboard the wreck?';
const ROLLED   = 'd100 = 97 → NO';
// Run 3, a40 — the narration before it, in the follow-up's recent scene.
const A40 = 'You close the last of the distance and put the Kobayashi IV\'s weight against the Wake\'s dead flank. '
  + 'Her engines cough and quit. Grapples bite, and her hull groans as it settles against yours. '
  + 'On the open comm, the dry voice gives a short, tired laugh. "Fine. Board, then. But you\'ll want to ask me the question properly."';

const narratorCard = (text) => ({
  id: 'm-a40', timestamp: 1,
  flags: { [MODULE_ID]: { narratorCard: true, narrationText: text, sessionId: 'sess-2', narrationId: 'nar-a40' } },
});

beforeEach(() => {
  vi.clearAllMocks();
  ChatMessage._reset();
  game.settings._store.clear();
  game.actors._reset();
  global.game.messages = { contents: [narratorCard(A40)] };
  global.game.user = { id: 'gm-1', isGM: true };
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
  game.settings._store.set(KEY, {
    currentSessionId: 'sess-2', sessionNumber: 2, currentSceneId: 'sc-2',
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-2' }, sceneFrame: null,
  });
  apiPost.mockResolvedValue(reply('The comm goes to static.\n```json\n{"newTruths":[],"stateChanges":[]}\n```'));
});

async function followUp(over = {}) {
  await narrateOracleFollowup({
    kind: 'oracle_yes_no', oracleName: 'Ask the Oracle (likely)', question: QUESTION, rolledLine: ROLLED,
    campaignState: game.settings.get(MODULE_ID, 'campaignState'), speakerActorId: null, ...over,
  });
  expect(apiPost).toHaveBeenCalledTimes(1);
  const body = apiPost.mock.calls[0][2];
  return { system: body.system.map(b => b.text).join('\n'), user: String(body.messages[0].content) };
}

describe('ORACLE-NO-NARRATED-AS-YES — an oracle\'s answer binds the narration of it', () => {
  it('the follow-up is told the answer in plain words, with its question, after the scene that said otherwise', async () => {
    const { user } = await followUp();
    expect(user).toContain('the dry voice gives a short, tired laugh');        // the scene that says someone is aboard
    expect(user).toContain(`The answer is NO: to "${QUESTION}", the oracle says no.`);
    expect(user.indexOf('the dry voice gives a short, tired laugh')).toBeLessThan(user.indexOf('The answer is NO'));
    expect(user.indexOf('The answer is NO')).toBeLessThan(user.indexOf('Render this result as 2-3 sentences'));
  });

  it('it is not to be narrated as its opposite: the scene is reconciled to it', async () => {
    const { user } = await followUp();
    expect(user).toMatch(/it is not yours to change: narrate a scene in which it is true/);
    expect(user).toMatch(/Nothing in the prose may say, show or imply yes, or leave it open/);
    expect(user).toMatch(/Where RECENT NARRATION said otherwise, bring the scene into line with the answer here/);
    expect(user).toMatch(/a recording, a relay, an echo or a mistake, or it has stopped/);
  });

  it('the mode\'s role says the same of every answer: the scene gives way, not the answer', async () => {
    const { system } = await followUp();
    expect(system).toMatch(/The oracle's answer is the table's, not yours, and it binds the story from here/);
    expect(system).toMatch(/never as its opposite, never as doubtful, and never as something still to be found out/);
    expect(system).toMatch(/the scene gives way, not the answer/);
    expect(system).toMatch(/what was heard was a recording, a relay or an echo, was mistaken, or has stopped/);
  });

  it('a YES is bound the same way', () => {
    const rule = formatOracleAnswerRule({ kind: 'oracle_yes_no', question: 'Is the hatch sealed?', rolledLine: 'd100 = 12 → YES (MATCH — extreme/twist)' });
    expect(rule).toContain('The answer is YES: to "Is the hatch sealed?", the oracle says yes.');
    expect(rule).toMatch(/say, show or imply no, or leave it open/);
  });

  it('a question typed with none still binds the answer', () => {
    expect(formatOracleAnswerRule({ kind: 'oracle_yes_no', question: '', rolledLine: ROLLED }))
      .toMatch(/^The answer is NO\. It is the table's answer/);
  });

  it('control: a table roll, a price and a complication answer no yes/no question', async () => {
    for (const kind of ['oracle_table', 'pay_the_price', 'complication']) {
      expect(formatOracleAnswerRule({ kind, question: QUESTION, rolledLine: ROLLED }), kind).toBe('');
    }
    expect(formatOracleAnswerRule({ kind: 'oracle_yes_no', question: QUESTION, rolledLine: 'd100 = 40' })).toBe('');
    const { user } = await followUp({ kind: 'oracle_table', oracleName: 'Action', question: '', rolledLine: 'd100 = 40 → Bolster' });
    expect(user).not.toMatch(/The answer is/);
    expect(user).toMatch(/Render this result as 2-3 sentences/);
  });

  it('every later narration is told which gives way: the answer stands over earlier narration', () => {
    const block = formatRecentOraclesBlock([{ name: 'Ask the Oracle (likely)', question: QUESTION, answer: 'NO' }]);
    expect(block).toContain(`- Ask the Oracle (likely): "${QUESTION}" → NO`);
    expect(block).toMatch(/Where earlier narration in this prompt says otherwise, the answer stands and the story is brought into line with it, never the answer with the story/);
  });

  it('control: no other mode\'s role carries the oracle\'s rule', () => {
    for (const mode of ['move_resolution', 'paced_narrative', 'scene_interrogation', 'session_vignette']) {
      expect(buildNarratorSystemPrompt({}, {}, null, '', { mode }), mode).not.toMatch(/The oracle's answer is the table's, not yours/);
    }
  });
});
