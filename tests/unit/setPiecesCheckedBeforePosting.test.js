/**
 * STARFORGED COMPANION
 * tests/unit/setPiecesCheckedBeforePosting.test.js
 *
 * Issue #399's bug audit, N29 (the maintainer's call: "address all bugs from
 * audit with recommended choice"): the clock vignette, the oath scene and the
 * inciting incident posted with no check, and no reason was recorded; the
 * inciting incident's audit read its proposal block ("Suggested vow: …") as
 * narration. Each is now held to its certain lines before it posts, as a
 * session vignette is — "you" in a second-person game ([person]) and no table
 * words ([apparatus]) — asked again once, failing open, with no judge. The
 * inciting incident's checks and its audit read its prose alone: the block is
 * the card's, and its "Situation:" line names the character by design.
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../src/system/campaignTruths.js', async (importOriginal) => ({
  ...(await importOriginal()),
  buildCampaignTruthsBlock: vi.fn(async () => ''),
}));
vi.mock('../../src/factContinuity/consistencyCheck.js', async (importOriginal) => ({
  ...(await importOriginal()),
  runConsistencyCheck: vi.fn(async () => ({ contradictions: [], dispatched: false })),
}));

import { apiPost } from '../../src/api-proxy.js';
import { runConsistencyCheck } from '../../src/factContinuity/consistencyCheck.js';
import { narrateClockAdvancement, narrateVowSwearing, narrateIncitingIncident } from '../../src/narration/narrator.js';
import { splitIncitingMeta } from '../../src/session/incitingIncident.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const SIDECAR = '\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const reply = (text) => ({ content: [{ type: 'text', text }], usage: {}, stop_reason: 'end_turn' });
const labels = () => apiPost.mock.calls.map(c => c[3]?.label ?? null);
const asked = (n) => String(apiPost.mock.calls[n]?.[2]?.messages?.[0]?.content ?? '');
const state = () => game.settings.get(MODULE_ID, 'campaignState');
const CLOCK = { _id: 'clk-1', name: 'The blockade tightens', type: 'campaign', filled: 2, segments: 6, triggered: false };
const VOW = { name: 'Find who is raiding the Cinder Expanse lanes', rank: 'dangerous' };

/** Answer the narration calls in turn, and anything else (a chronicle, a tier pass) with nothing. */
function narratorReplies(...texts) {
  const queue = texts.map(t => reply(t + SIDECAR));
  apiPost.mockImplementation(async (_url, _headers, _body, opts) => (String(opts?.label ?? '').startsWith('narrator:narrate')
    ? queue.shift() ?? reply('') : reply('{}')));
}

beforeEach(() => {
  vi.clearAllMocks();
  ChatMessage._reset();
  game.settings._store.clear();
  game.actors._reset();
  global.game.messages = { contents: [] };
  global.game.users = Object.assign([{ id: 'gm-1', isGM: true, active: true }], {
    contents: [{ id: 'gm-1', isGM: true, active: true }],
    get: (id) => (id === 'gm-1' ? { id: 'gm-1', isGM: true, active: true } : null),
  });
  global.game.user = { id: 'gm-1', isGM: true, active: true };
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
  game.settings._store.set(`${MODULE_ID}.worldSnapshot`, false);
  game.settings._store.set(`${MODULE_ID}.narrativeSkeletons`, false);
  game.settings._store.set(KEY, { currentSessionId: 'sess-2', sessionNumber: 2, currentSceneId: 'sc-2',
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-2' }, sceneFrame: null });
  game.actors._set('pc-mira', makeTestActor({ id: 'pc-mira', name: 'Mira Kestrel' }));
});

describe('the clock vignette is held to its certain lines before it posts (N29)', () => {
  it('told in the third person: asked again once, its draft and the rule, and the second is posted — no judge', async () => {
    narratorReplies('Far down the lane, the blockade closes, and Mira watches the pickets turn.',
      'Far down the lane, the blockade closes, and you watch the pickets turn.');
    const text = await narrateClockAdvancement({ clock: CLOCK, campaignState: state(), narrationId: 'nar-clk' });
    expect(text).toBe('Far down the lane, the blockade closes, and you watch the pickets turn.');
    expect(labels().filter(l => /narrateClockAdvancement/.test(l))).toEqual(['narrator:narrateClockAdvancement', 'narrator:narrateClockAdvancement:reask']);
    expect(asked(1)).toContain('## YOUR DRAFT — NOT POSTED');
    expect(asked(1)).toContain('- [person] The player\'s character is "you"');
    expect(labels()).not.toContain('obligationJudge');
  });

  it('a table word in it is asked again; one told as "you", in the fiction\'s words, is one call', async () => {
    narratorReplies('The pickets turn toward you, and Momentum drains out of the room.', 'The pickets turn toward you.');
    await narrateClockAdvancement({ clock: CLOCK, campaignState: state() });
    expect(labels()).toContain('narrator:narrateClockAdvancement:reask');
    expect(asked(1)).toContain('- [apparatus] ');

    vi.clearAllMocks();
    narratorReplies('The pickets turn toward you.');
    expect(await narrateClockAdvancement({ clock: CLOCK, campaignState: state() })).toBe('The pickets turn toward you.');
    expect(labels().filter(l => /narrateClockAdvancement/.test(l))).toEqual(['narrator:narrateClockAdvancement']);
  });

  it('a third-person table names its characters by design: not asked again', async () => {
    game.settings._store.set(`${MODULE_ID}.narrationPerspective`, 'third_person');
    narratorReplies('Far down the lane, the blockade closes, and Mira watches the pickets turn.');
    await narrateClockAdvancement({ clock: CLOCK, campaignState: state() });
    expect(labels().filter(l => /narrateClockAdvancement/.test(l))).toEqual(['narrator:narrateClockAdvancement']);
  });
});

describe('the oath scene is held to its certain lines before it posts (N29)', () => {
  it('told in the third person: asked again once, and the second is the scene', async () => {
    narratorReplies('Mira lays her palm flat on the cold iron of the bulkhead and says the words.',
      'You lay your palm flat on the cold iron of the bulkhead and say the words.');
    const text = await narrateVowSwearing({ vow: VOW, campaignState: state(), speakerActorId: 'pc-mira', narrationId: 'nar-vow' });
    expect(text).toBe('You lay your palm flat on the cold iron of the bulkhead and say the words.');
    expect(labels().filter(l => /narrateVowSwearing/.test(l))).toEqual(['narrator:narrateVowSwearing', 'narrator:narrateVowSwearing:reask']);
    expect(labels()).not.toContain('obligationJudge');
  });
});

describe('the inciting incident: its prose is checked, and audited, without its proposal block (N29)', () => {
  const BLOCK = [
    '',
    'Suggested vow: I will find Dani before the Covenant does (extreme)',
    "Suggested clock: Dani's captivity (6 segments)",
    'Vow target: Dani Okoro (she/her) — a relay engineer taken by Covenant raiders.',
    'Situation: Mira Kestrel must reach the Ashwind relay before the raiders strip it.',
  ].join('\n');
  const narrationOf = (reply) => splitIncitingMeta(reply).prose;
  const incite = (opts = {}) => narrateIncitingIncident({ userMessage: 'The campaign begins. Compose the inciting incident.',
    campaignState: state(), narrationId: 'nar-inc', narrationOf, ...opts });

  it('prose told as "you" is one call, though its Situation line names the character; the audit reads the prose alone', async () => {
    narratorReplies(`The distress call cuts out mid-word, and you are already at the console.${BLOCK}`);
    const text = await incite();
    expect(text).toContain('Suggested vow: I will find Dani');   // the block is the card's: kept
    expect(labels().filter(l => /narrateIncitingIncident/.test(l))).toEqual(['narrator:narrateIncitingIncident']);
    expect(runConsistencyCheck).toHaveBeenCalledTimes(1);
    expect(runConsistencyCheck.mock.calls[0][0]).toBe('The distress call cuts out mid-word, and you are already at the console.');
  });

  it('control: with no view of its reply, the Situation line is read as narration and asked again', async () => {
    narratorReplies(`The distress call cuts out mid-word, and you are already at the console.${BLOCK}`,
      `The distress call cuts out mid-word, and you are already at the console.${BLOCK}`);
    await incite({ narrationOf: null });
    expect(labels()).toContain('narrator:narrateIncitingIncident:reask');
  });

  it('prose that names the character is asked again, shown its draft whole — block and all — and the redraft is posted', async () => {
    narratorReplies(`The distress call cuts out mid-word, and Mira is already at the console.${BLOCK}`,
      `The distress call cuts out mid-word, and you are already at the console.${BLOCK}`);
    const text = await incite();
    expect(labels().filter(l => /narrateIncitingIncident/.test(l))).toEqual(['narrator:narrateIncitingIncident', 'narrator:narrateIncitingIncident:reask']);
    expect(asked(1)).toContain('Suggested vow: I will find Dani before the Covenant does (extreme)');
    expect(text).toContain('you are already at the console');
    expect(splitIncitingMeta(text).vow?.statement).toBe('I will find Dani before the Covenant does');
    expect(labels()).not.toContain('obligationJudge');
  });
});
