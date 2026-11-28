/**
 * STARFORGED COMPANION
 * tests/unit/oracleAnswerFiledAsDice.test.js
 *
 * Issue #402, change 1a, on round 10's recording: an answered oracle question
 * is a fact the dice decided. At a43 the table asked "Is anyone left alive
 * aboard the Cinder Wren?" and the oracle answered YES. The follow-up's fact
 * block said "at least one crew member survived the disabling of her engine
 * bay and is moving inside the open side lock", tagged `result` — it shares no
 * telling word with the question, so the floor refused it (provenance.js
 * factBasis). Nothing of the answer bound; a47's opening was told "What binds:
 * raider cutter — is named the Cinder Wren (the player)", and the survivor was
 * gone.
 *
 * The code now files the question with its answer, in those words, from the
 * card: no tag and no word test. Replayed here through the real follow-up with
 * a43's own card and reply, then session 3's opening from the record.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});

import { apiPost } from '../../src/api-proxy.js';
import { narrateOracleFollowup, applyXCardToNarratorMemory } from '../../src/narration/narrator.js';
import { composeOpeningScene } from '../../src/session/galleyVignette.js';
import { recordSettled, _resetRecordForTests } from '../../src/record/record.js';
import { _resetSummaryViewForTests } from '../../src/record/summaryView.js';
import { yesNoAnswerOfCard } from '../../src/oracles/oracleMemory.js';
import { installJournalMock } from '../helpers/fullStateFixture.js';
import { seedSessionRecord, recordedEvent, sessionPageOf } from '../helpers/sessionRecordSeed.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const RUN = fileURLToPath(new URL('../../test/ci/playwright/explorations/long-haul-live-20261127-202557/replay.json', import.meta.url));
const exchanges = JSON.parse(readFileSync(RUN, 'utf8')).recording.exchanges;
const textOf = (e) => (typeof e?.response === 'object' ? e.response?.content?.[0]?.text : e?.response) ?? '';

// a43's card, as the yes/no command posts it (index.js), with the run's words and roll.
const QUESTION = 'Is anyone left alive aboard the Cinder Wren?';
const CARD = {
  id: 'card-a43', author: { id: 'pl-1' },
  flags: { [MODULE_ID]: {
    oracleCommandCard: true,
    oracleNarration: { kind: 'oracle_yes_no', oracleName: 'Ask the Oracle (likely)', question: QUESTION, rolledLine: 'd100 = 3 → YES' },
    oracleMemory: { name: 'Ask the Oracle (likely)', question: QUESTION, answer: 'YES' },
  } },
};
// a43's follow-up reply, as recorded.
const A43 = textOf(exchanges.find(e => e.step === 'a43' && /narrateOracleFollowup$/.test(e.kind)));
const reply = (text) => ({ content: [{ type: 'text', text }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'end_turn' });

const actor = (name) => ({ id: `a-${name}`, name, type: 'character', system: { biography: '' } });
const mira = { active: [{ actor: actor('Mira Kestrel') }], absent: [] };
const stored = () => game.settings.get(MODULE_ID, 'campaignState');
const answerTruths = () => (stored().sceneTruths ?? []).filter(t => t.subject?.text === QUESTION);

let journals;
beforeEach(async () => {
  vi.clearAllMocks();
  ChatMessage._reset();
  game.settings._store.clear();
  game.actors._reset();
  journals = installJournalMock();
  _resetRecordForTests();
  _resetSummaryViewForTests();
  global.game.user = { id: 'gm-1', isGM: true };
  global.game.users = [{ id: 'gm-1', isGM: true, active: true }];
  global.game.messages = { contents: [CARD], get: (id) => (id === CARD.id ? CARD : null) };
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
  game.settings._store.set(KEY, {
    currentSessionId: 's-2', sessionNumber: 2, currentSceneId: 'sc-s-2', sessionActive: true,
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-s-2' },
    sceneFrame: { location: 'Bleakhold Station dock ring', present: ['Mira Kestrel', 'customs clerk'], situation: 'The Cinder Wren drifts off the ring.' },
  });
  // Session 2 as the record holds it before the oracle beat: begun, its scene at Bleakhold.
  await seedSessionRecord('s-2', [
    recordedEvent('s-2', 'session.begun', { d: { number: 2, table: {} } }),
    recordedEvent('s-2', 'scene.started', { d: { sceneId: 'sc-s-2', reason: 'arrival', cause: 'place', what: 'the ship arrives',
      place: { id: 'set-bleakhold', type: 'settlement', name: 'Bleakhold Station' } } }),
  ], { number: 2 });
  apiPost.mockResolvedValue(reply(A43));
});
afterEach(() => journals.restore());

async function a43() {
  await narrateOracleFollowup({
    kind: 'oracle_yes_no', oracleName: 'Ask the Oracle (likely)', question: QUESTION, rolledLine: 'd100 = 3 → YES',
    campaignState: structuredClone(stored()), speakerActorId: null, oracleCardId: CARD.id,
  });
  await vi.waitFor(() => expect(answerTruths()).toHaveLength(1));
  await recordSettled();
  return ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.oracleCardId === CARD.id);
}

describe('round 10\'s a43: an answered oracle question is filed as the dice decided it (issue #402, change 1a)', () => {
  it('reads the kept run (setup): the reply\'s own fact was the survivor, tagged result', () => {
    expect(A43).toMatch(/something moves inside it: a figure hauling itself along a bulkhead/);
    expect(A43).toContain('"fact": "at least one crew member survived the disabling of her engine bay and is moving inside the open side lock", "from": "result"');
    expect(yesNoAnswerOfCard(CARD)).toEqual({ question: QUESTION, answer: 'YES' });
  });

  it('the question and its answer bind, in those words, stamped with the narration that told them', async () => {
    const card = await a43();
    const [truth] = answerTruths();
    expect(truth).toMatchObject({ fact: 'the oracle answered YES', basis: 'dice', source: 'oracle_answer', retracted: false, sceneId: 'sc-s-2' });
    expect(truth.narrationId, 'the follow-up\'s own').toBe(card.flags[MODULE_ID].narrationId);
    // On the record, a truth the dice decided, on the follow-up's beat.
    const events = Object.values(sessionPageOf('s-2').flags[MODULE_ID].sessionRecord.events);
    expect(events.find(e => e.k === 'truth.set' && e.ref?.truth === truth.id)).toMatchObject({
      ref: { nar: truth.narrationId }, d: { fact: 'the oracle answered YES', basis: 'dice', subject: { kind: 'text', text: QUESTION } },
    });
  });

  it('a47: the next session\'s opening is given it in what binds', async () => {
    await a43();
    game.settings._store.set(KEY, { ...stored(), currentSessionId: 's-3', sessionNumber: 3, currentSceneId: null });
    const { userMessage } = await composeOpeningScene(mira, stored(), { draw: () => 50 });
    expect(userMessage).toContain('WHERE THE LAST SESSION STOPPED — session 2\'s record, the table\'s facts:');
    expect(userMessage).toMatch(/ {2}What binds: [^\n]*Is anyone left alive aboard the Cinder Wren\? — the oracle answered YES \(the dice\)/);
  });

  it('the X-Card on the follow-up takes it with the narration', async () => {
    const card = await a43();
    const cs = structuredClone(stored());
    applyXCardToNarratorMemory(cs, { cards: [card] });
    expect(cs.sceneTruths.filter(t => t.subject?.text === QUESTION && !t.retracted), 'retracted with the narration').toEqual([]);
  });

  it('control: a table oracle and a yes/no asked with no question file nothing', async () => {
    const table = { ...CARD, flags: { [MODULE_ID]: { ...CARD.flags[MODULE_ID], oracleNarration: { kind: 'oracle_table' } } } };
    expect(yesNoAnswerOfCard(table)).toBeNull();
    const bare = { ...CARD, flags: { [MODULE_ID]: { ...CARD.flags[MODULE_ID], oracleMemory: { name: 'Ask the Oracle (likely)', question: '', answer: 'YES' } } } };
    expect(yesNoAnswerOfCard(bare)).toBeNull();
    global.game.messages = { contents: [table], get: (id) => (id === CARD.id ? table : null) };
    await narrateOracleFollowup({
      kind: 'oracle_table', oracleName: 'Action', question: QUESTION, rolledLine: 'd100 = 3 → Defend',
      campaignState: structuredClone(stored()), speakerActorId: null, oracleCardId: CARD.id,
    });
    await new Promise(r => setTimeout(r, 0));
    expect(answerTruths()).toEqual([]);
  });
});
