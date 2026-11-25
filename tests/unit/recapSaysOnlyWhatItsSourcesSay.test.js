/* global makeTestActor -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/recapSaysOnlyWhatItsSourcesSay.test.js
 *
 * known-issues RECAP-STATES-WHAT-DID-NOT-HAPPEN — the long haul's third live
 * run (explorations/long-haul-live-20261124-0321; its review-notes.md lists
 * the fourteen unsupported sentences of its four recaps, each with the step
 * that shows otherwise) and run 2's a76.
 *
 * A recap was written from the Chronicle alone, under "Draw only on the
 * chronicle provided". By cause, as the prompts show:
 *   - inference — "your first hint that the Spire's water shortage and the
 *     raids might share a source"; "it is a question you can now answer";
 *   - a gap filled in — "What you found there was the point of it all", of a
 *     ship never boarded: the entry between was X-Carded;
 *   - a third-person entry turned to "you" — "first pick of her hauls", the
 *     offer having been first pick of the character's own;
 *   - an earlier state carried forward — "The compass still swings toward the
 *     dark lane", after it "swings north and stops" (a64): that step's entry
 *     dropped the needle, and the recap was sent nothing else of how things
 *     stood.
 * And the summary and the recap of one End a Session (a76) contradicted each
 * other, the summary leaving out the session's one change to the sheet — the
 * vow fulfilled — whose narration said only "the weight of the vow lifts off
 * you".
 *
 * The entries, truths and summary below are the run's own.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});

import { getCampaignRecap, getRollingSessionSummary } from '../../src/narration/narrator.js';
import { recapSource, standingLines, campaignRecapSourceOf } from '../../src/record/recapView.js';
import { buildNarratorSystemPrompt, buildCampaignRecapUserMessage } from '../../src/narration/narratorPrompt.js';
import { addChronicleEntry } from '../../src/character/chronicle.js';
import { writeChronicleEntry } from '../../src/character/chronicleWriter.js';
import { installJournalMock } from '../helpers/fullStateFixture.js';
import { seedSessionRecord, recordedEvent } from '../helpers/sessionRecordSeed.js';
import { _resetSummaryViewForTests } from '../../src/record/summaryView.js';

const MODULE_ID = 'starforged-companion';
const HEADING = '## WHERE THINGS STAND';

// The scene's ledger at a65, as the narrations of that scene were given it.
const NEEDLE_TRUTH = 'its needle has stopped pointing at the dark lane and now rests on north';
const SCENE = {
  currentSceneId: 'sc-3',
  sceneFrame: { location: 'Galley aboard the Kobayashi IV', present: ['Mira Kestrel'],
    situation: 'Mira\'s vow is fulfilled; the voice over the hatch still waits for her answer about its slip.',
    question: 'What is the speaker over the hatch about to say?' },
  sceneTruths: [
    { id: 't1', subject: { kind: 'text', text: 'Ilse\'s brass star-compass' }, fact: NEEDLE_TRUTH, sceneId: 'sc-3', sessionId: 's-3' },
  ],
  sceneState: { sceneId: 'sc-3', bySubject: {
    'ilse\'s brass star-compass': [{ attribute: 'needle', value: 'settled on north, no longer leaning toward the dark lane', subjectText: 'Ilse\'s brass star-compass', updatedAt: 2, basis: 'player' }],
  } },
};

const recapPrompt = (state = {}, extras = {}) => buildNarratorSystemPrompt(
  { currentSessionId: 's-3', sessionNumber: 3, ...state }, {}, null, '', { mode: 'campaign_recap', ...extras });

// Issue #382 slice 2: the recap's source is the session record — facts, each
// line an id — and how things stand is read live (record/recapView.js).
describe('RECAP-STATES-WHAT-DID-NOT-HAPPEN — what a recap is told it may say', () => {
  it('only what its sources state: nothing inferred', () => {
    const system = recapPrompt();
    expect(system).toMatch(/A recap says only what its sources say\. THE RECORD in the user message is what happened/);
    expect(system).toMatch(/Every sentence restates what a line it cites states\. Infer nothing: no cause, motive or link between two things that no line gives/);
    expect(system).toMatch(/no answer to a question a line leaves open/);
    expect(system).toMatch(/Draw only on the record below/);
    expect(system).not.toMatch(/Draw only on the chronicle/);
  });

  it('nothing filled in between lines — a beat may be missing because the table took it out', () => {
    const system = recapPrompt();
    expect(system).toMatch(/Fill nothing in between lines\./);
    expect(system).toMatch(/a beat may be missing because the table took it out of the story/);
    expect(system).toMatch(/A place no line says was entered was not entered; a thing no line says was found was not found/);
  });

  it('whose things are whose: a player\'s own words are kept as they wrote them, and a claim is the character\'s', () => {
    const system = recapPrompt();
    expect(system).toMatch(/Keep whose things are whose\./);
    expect(system).toMatch(/the recap may call the player character "you" — and no one else/);
    expect(system).toMatch(/"first pick of whatever I haul" is the character's own haul/);
    expect(system).toMatch(/What it claims about the world is the character's claim, unless an outcome or an established line supports it/);
  });

  it('how a thing stands now is WHERE THINGS STAND\'s word; one name for everyone', () => {
    expect(recapPrompt()).toMatch(/Say that something still stands only when WHERE THINGS STAND says so; never carry an earlier state forward as still true/);
    expect(recapPrompt()).toMatch(/Use each name as the record writes it, and write no other name for anyone/);
  });

  it('the user message, read last, says the same of its own list', () => {
    const user = buildCampaignRecapUserMessage({ text: '## THE RECORD\n\n[s3-1] Mira Kestrel — the player wrote “first pick of whatever I haul”' });
    expect(user).toContain('first pick of whatever I haul');                       // the player's own words
    expect(user).toMatch(/Each of these only as far as the lines above state it/);
    expect(user).toMatch(/Nothing inferred, nothing filled in between two lines, and no "your" for what a line does not make certainly the character's own/);
    expect(user).toMatch(/A point the lines say nothing of is left out\./);
  });
});

describe('a recap is told how things stand now — read live, in its own user message (a `!recap` mid-session, a65)', () => {
  beforeEach(() => { game.actors._reset(); });
  afterEach(() => { game.actors._reset(); });

  it('the open scene\'s state reaches it: the needle rests on north, whatever an earlier beat said of it — and the scene\'s question, unanswered', async () => {
    const lines = await standingLines({ currentSessionId: 's-3', ...SCENE });
    expect(lines).toContain('Ilse\'s brass star-compass — needle: settled on north, no longer leaning toward the dark lane.');
    // The question is the player's (overhaul 2 §7.2), and WHERE THINGS STAND says so.
    expect(lines).toContain('The open scene\'s question, from the player\'s line: “What is the speaker over the hatch about to say?” — not yet answered.');
    expect(recapSource({ read: { sessions: [] }, standing: lines }).text).toMatch(/## WHERE THINGS STAND — read from the sheets and tracks as play stopped\n\n\[now-1\] Ilse's brass star-compass — needle: settled on north/);
  });

  it('a question the scene answered is said answered', async () => {
    const lines = await standingLines({ currentSessionId: 's-3', ...SCENE, sceneFrame: { ...SCENE.sceneFrame, questionAnswered: true } });
    expect(lines).toContain('The open scene\'s question, from the player\'s line: “What is the speaker over the hatch about to say?” — answered.');
  });

  it('never as the campaign\'s scene (issue #374 A1 holds): the system prompt has no binding scene and no section of its own on how things stand', () => {
    const system = recapPrompt(SCENE);
    expect(system).not.toMatch(/ACTIVE SCENE — WHAT BINDS/);
    expect(system).not.toMatch(/SCENE FRAME/);
    expect(system).not.toContain('WHERE THINGS STAND NOW');
    expect(system).not.toContain(NEEDLE_TRUTH);
  });

  it('control: a narration of that scene still has it as its binding scene, and no recap section', () => {
    const paced = buildNarratorSystemPrompt({ currentSessionId: 's-3', ...SCENE }, {}, null, '', { mode: 'paced_narrative' });
    expect(paced).toMatch(/ACTIVE SCENE — WHAT BINDS/);
    expect(paced).not.toContain(HEADING);
  });
});

describe('the recap is not told a summary (issue #382: one record, read by the recap, and by the summary in its turn)', () => {
  const SUMMARY = 'Mira Kestrel sits in the galley of the Kobayashi IV. The question of whose name Mira has settled on remains unanswered.';
  const withSummary = { currentSessionId: 's-3', sessionNumber: 3, ...SCENE, sessionSummary: { sessionId: 's-3', text: SUMMARY, coveredCount: 0 } };

  it('a whole session summary on the store is in neither the recap\'s source nor its system prompt — the record and the sheets are', async () => {
    const source = await campaignRecapSourceOf(withSummary);
    expect(buildCampaignRecapUserMessage(source)).not.toContain('remains unanswered');
    expect(source.text).toContain('needle: settled on north');
    expect(recapPrompt(withSummary)).not.toContain('remains unanswered');
  });

  it('with nothing on the record to retell, no recap is asked for', async () => {
    expect((await campaignRecapSourceOf(withSummary)).empty).toBe(true);
    expect(await getCampaignRecap(withSummary, { forceRefresh: true })).toBe('');
  });
});

describe('the session summary keeps what its moves settled (a76: the vow\'s fulfilment was left out)', () => {
  // Since issue #382 slice 3 the summary is a view of the session record: a
  // move that settles something for good is a beat marked LASTING in its
  // source (read.js — chronicleKeeps.js lastingChangeOf), and the summary is
  // told to tell every such beat. The prose alone told the fulfilment as "the
  // weight of the vow lifts off you", and the summary of that session left it out.
  let origFetch, requests, journals;
  const A64 = '"I\'d still like that slip back," the dry voice says. You don\'t answer it. You set the stamp square on the galley table, '
    + 'and the weight of the vow lifts off you. The thing you swore to find has a hand and a seal, and both are named now.';
  const ev = (k, extra) => recordedEvent('s-3', k, extra);

  beforeEach(async () => {
    origFetch = global.fetch;
    requests = [];
    global.fetch = vi.fn(async (_url, init) => {
      requests.push(JSON.parse(init.body));
      return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: JSON.stringify([{ text: SUMMARY, because: ['2'] }]) }] }), text: async () => '' };
    });
    game.user.isGM = true;
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
    game.settings._store.delete(`${MODULE_ID}.campaignState`);
    journals = installJournalMock();
    _resetSummaryViewForTests();
    game.actors._reset();
    game.actors._set('pc-mira', makeTestActor({ id: 'pc-mira', name: 'Mira Kestrel' }));
    const who = { actor: 'pc-mira' };
    await seedSessionRecord('s-3', [
      ev('session.begun', { d: { number: 3 } }),
      ev('move.resolved', { who, ref: { res: 'r1' }, d: { moveId: 'reach_a_milestone', moveName: 'Reach a Milestone', rollKind: 'none', outcome: null } }),
      ev('narration', { who, ref: { nar: 'n1', res: 'r1' }, d: { mode: 'move' }, text: 'The galley lamp hums over the table.' }),
      ev('move.resolved', { who, ref: { res: 'r2' }, d: { moveId: 'fulfill_your_vow', moveName: 'Fulfill Your Vow', rollKind: 'progress', progressScore: 9, outcome: 'strong_hit' } }),
      ev('narration', { who, ref: { nar: 'n2', res: 'r2' }, d: { mode: 'move' }, text: A64 }),
      ev('question', { who, ref: { nar: 'n3' }, text: 'What of my sister\'s do I have with me?' }),
      ev('narration', { who, ref: { nar: 'n3' }, d: { mode: 'scene_answer' }, text: 'The drawer by your hip stands open its inch.' }),
    ], { number: 3 });
  });
  afterEach(() => {
    global.fetch = origFetch;
    journals.restore();
    game.actors._reset();
    game.settings._store.delete(`${MODULE_ID}.claudeApiKey`);
  });

  it('the source marks the fulfilment LASTING, with its telling under it — a milestone and a question are not', async () => {
    await getRollingSessionSummary({ currentSessionId: 's-3' }, { forceRefresh: true });
    expect(requests).toHaveLength(1);
    const source = String(requests[0].messages[0].content);
    expect(source).toMatch(/Mira Kestrel — Fulfill Your Vow, strong hit — LASTING: a vow brought to its end\nTOLD AS: “[^”]*the weight of the vow lifts off you/);
    expect(source.match(/LASTING:/g)).toHaveLength(1);
    expect(source).toMatch(/## QUESTIONS[^\n]*\n\n- Mira Kestrel asked the narrator “What of my sister's do I have with me\?”/);
  });

  it('and the summary is told to tell every such beat, and to say only what the facts state', async () => {
    await getRollingSessionSummary({ currentSessionId: 's-3' }, { forceRefresh: true });
    const system = JSON.stringify(requests[0].system);
    expect(system).toContain('continuity scribe');
    expect(system).toMatch(/Every beat marked LASTING is told/);
    expect(system).toMatch(/State only what the facts state/);
    expect(system).toMatch(/nothing found only in TOLD AS is an event/);
    expect(system).toMatch(/nothing happened because one was asked/);
  });
});
describe('the Chronicle scribe names whose thing a thing is, and genders no one the story did not', () => {
  let origFetch, requests;
  beforeEach(() => {
    origFetch = global.fetch;
    requests = [];
    global.fetch = vi.fn(async (_url, init) => {
      requests.push(JSON.parse(init.body));
      return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: '{"type":"moment","salience":"trivial","text":"x"}' }] }), text: async () => '' };
    });
    game.user.isGM = true;
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
    game.settings._store.set(`${MODULE_ID}.chronicleAutoEntry`, true);
    game.actors._reset();
    game.actors._set('pc-mira', makeTestActor({ id: 'pc-mira', name: 'Mira Kestrel' }));
  });
  afterEach(() => {
    global.fetch = origFetch;
    game.settings._store.delete(`${MODULE_ID}.claudeApiKey`);
    game.settings._store.delete(`${MODULE_ID}.chronicleAutoEntry`);
    game.actors._reset();
  });

  it('its instructions say so, with the run\'s own case', async () => {
    await writeChronicleEntry({ narrationText: '"First pick of what you haul," Tamsin says.', campaignState: { currentSessionId: 's-1', sessionNumber: 1 }, kind: 'paced', actorId: 'pc-mira' });
    expect(requests.length).toBeGreaterThan(0);
    const system = JSON.stringify(requests[0].system);
    expect(system).toContain('chronicle scribe');
    expect(system).toMatch(/Say whose a thing is by name when the sentence has two people in it — \\"first pick of Mira Kestrel's hauls\\"/);
    expect(system).toMatch(/Give no one a \\"he\\" or a \\"she\\" the prose and the player's line did not/);
  });
});
