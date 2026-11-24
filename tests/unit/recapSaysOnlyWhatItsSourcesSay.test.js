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
import { buildNarratorSystemPrompt, buildCampaignRecapUserMessage } from '../../src/narration/narratorPrompt.js';
import { addChronicleEntry } from '../../src/character/chronicle.js';
import { writeChronicleEntry } from '../../src/character/chronicleWriter.js';
import { settledByMove } from '../../src/character/chronicleKeeps.js';

const MODULE_ID = 'starforged-companion';
const HEADING = '## WHERE THINGS STAND NOW';

// The Chronicle as run 3's recap at a65 was sent it (five of its entries).
const CHRONICLE = [
  'Mira Kestrel bought Tamsin\'s cooperation with a fair cut of salvage leads and first pick of her hauls, and learned the dark beacon\'s haulers carry water and medical stores.',
  'Tamsin saw the needle of Mira\'s sister Ilse\'s brass star-compass swing away from north toward the dark lane past the Spire, and called it no toy.',
  'Mira Kestrel brought the Kobayashi IV alongside The Ashen Wake, killed her engines and grappled her hull, then won grudging leave to board.',
  'Mira Kestrel traced the lading to the broker\'s seal at Hollow Spire, feeling her vow settle closer to done as the compass swung harder toward the dark lane.',
  'Mira Kestrel set the stamp square on the galley table, and the vow she had sworn was fulfilled: the hand and seal she sought were named at last.',
];
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
    'ilse\'s brass star-compass': [{ attribute: 'needle', value: 'settled on north, no longer leaning toward the dark lane', subjectText: 'Ilse\'s brass star-compass', updatedAt: 2 }],
  } },
};
// Session 3's summary, as written at a76.
const SUMMARY = 'Mira Kestrel sits in the galley of the Kobayashi IV, which is grappled to the dead flank of the Cinder Wren off Bleakhold Station. '
  + 'She carries Ilse\'s brass star-compass, its needle now settled on north. '
  + 'The question of whose name Mira has settled on for the seal remains unanswered.';

const recapPrompt = (state = {}, extras = {}) => buildNarratorSystemPrompt(
  { currentSessionId: 's-3', sessionNumber: 3, ...state }, {}, null, '', { mode: 'campaign_recap', ...extras });

describe('RECAP-STATES-WHAT-DID-NOT-HAPPEN — what a recap is told it may say', () => {
  it('only what its sources state: nothing inferred', () => {
    const system = recapPrompt();
    expect(system).toMatch(/A recap says only what its sources say\./);
    expect(system).toMatch(/Every sentence restates what an entry or the context states\. Infer nothing: no cause, motive or link between two things that no entry gives/);
    expect(system).toMatch(/no answer to a question an entry leaves open/);
  });

  it('nothing filled in between entries — one may be missing because the table took it out', () => {
    const system = recapPrompt();
    expect(system).toMatch(/Fill nothing in between entries\./);
    expect(system).toMatch(/an entry may be missing because the table took that moment out of the story/);
    expect(system).toMatch(/A place no entry says was entered was not entered; a thing no entry says was found was not found/);
  });

  it('whose things are whose: "her hauls" does not become "your" or the wrong woman\'s by guess', () => {
    const system = recapPrompt();
    expect(system).toMatch(/Keep whose things are whose\./);
    expect(system).toMatch(/the recap may call that character "you" — and no one else/);
    expect(system).toMatch(/where an entry leaves it open \("first pick of her hauls", of two women\), keep the entry's own names and words/);
  });

  it('how a thing stands now is its latest word', () => {
    expect(recapPrompt()).toMatch(/How a thing stands now is its latest word, not its first\.[\s\S]*never carry the earlier forward as still true/);
  });

  it('the user message, read last, says the same of its own list', () => {
    const user = buildCampaignRecapUserMessage(CHRONICLE);
    expect(user).toContain('first pick of her hauls');                           // the entry as the scribe wrote it
    expect(user).toMatch(/Each of these only as far as the entries above state it/);
    expect(user).toMatch(/Nothing inferred, nothing filled in between two entries, and no "your" for what an entry does not make certainly the character's own/);
    expect(user).toMatch(/A point the entries say nothing of is left out\./);
  });
});

describe('a recap is told how things stand now — the open scene (a `!recap` mid-session, a65)', () => {
  it('the scene\'s facts and state reach it: the needle rests on north, whatever the Chronicle\'s last word on it', () => {
    const system = recapPrompt(SCENE);
    expect(system).toContain(HEADING);
    expect(system).toContain(`Ilse's brass star-compass — ${NEEDLE_TRUTH}`);
    expect(system).toContain('Ilse\'s brass star-compass — needle: settled on north, no longer leaning toward the dark lane');
    expect(system).toMatch(/Later than any Chronicle entry: how things stand as the story stops\./);
    expect(system).toMatch(/this is the later word and the recap follows it/);
    expect(system).toMatch(/add no event from it that the Chronicle does not hold/);
  });

  it('as how things stand, never as the campaign\'s scene (issue #374 A1 holds)', () => {
    const system = recapPrompt(SCENE);
    expect(system).not.toMatch(/ACTIVE SCENE — BINDING/);
    expect(system).not.toMatch(/SCENE FRAME/);
    expect(system).not.toMatch(/They are\s+binding/);
    expect(system).toContain('THE SCENE IN PLAY (one moment of the campaign — not where the campaign is set):');
    expect(system).toContain('Where: Galley aboard the Kobayashi IV');
    expect(system).not.toContain('What is the speaker over the hatch about to say?');   // the narrator's device, not a fact
    expect(system).not.toMatch(/Present:/);
  });

  it('control: with no scene open and no summary there is no such section', () => {
    expect(recapPrompt()).not.toContain(HEADING);
  });

  it('control: with fact continuity off the scene is not read — the summary alone', () => {
    const system = buildNarratorSystemPrompt({ currentSessionId: 's-3', ...SCENE }, { factContinuityEnabled: false }, null, '',
      { mode: 'campaign_recap', recapSummary: { text: SUMMARY, sessionNumber: 3, current: true } });
    expect(system).toContain(HEADING);
    expect(system).toContain('THE SESSION JUST PLAYED (session 3), as its summary has it:');
    expect(system).not.toContain(NEEDLE_TRUTH);
  });

  it('control: a narration of that scene still has it as its binding scene, and no recap section', () => {
    const paced = buildNarratorSystemPrompt({ currentSessionId: 's-3', ...SCENE }, {}, null, '', { mode: 'paced_narrative' });
    expect(paced).toMatch(/ACTIVE SCENE — BINDING/);
    expect(paced).not.toContain(HEADING);
  });
});

describe('getCampaignRecap — the summary of the session, when it is whole (End a Session, a76)', () => {
  let journals, savedJournal, savedCreate, origFetch, requests;
  const card = (text, extra = {}) => ({ flags: { [MODULE_ID]: { narratorCard: true, narrationText: text, sessionId: 's-3', ...extra } } });
  const state = (over = {}) => ({ currentSessionId: 's-3', sessionNumber: 3, characterIds: ['pc-mira'],
    campaignRecapCache: { text: '', generatedAt: null, chronicleLength: 0 }, ...over });
  const systemOf = () => JSON.stringify(requests.at(-1)?.system ?? '');

  beforeEach(async () => {
    ChatMessage._reset();
    game.actors._reset();
    game.actors._set('pc-mira', makeTestActor({ id: 'pc-mira', name: 'Mira Kestrel' }));
    journals = [];
    savedJournal = game.journal;
    savedCreate  = JournalEntry.create;
    game.journal = {
      get contents() { return [...journals]; },
      get: (id) => journals.find(j => j.id === id) ?? null,
      getName: (n) => journals.find(j => j.name === n) ?? null,
    };
    JournalEntry.create = async (data) => {
      const page = { name: 'Chronicle', flags: { [MODULE_ID]: { chronicle: [] } },
        setFlag: async (mod, key, val) => { (page.flags[mod] ??= {})[key] = val; } };
      const journal = { id: `j-${journals.length + 1}`, name: data.name, flags: data.flags ?? {},
        pages: { contents: [page] }, createEmbeddedDocuments: async () => [] };
      journals.push(journal);
      return journal;
    };
    origFetch = global.fetch;
    requests = [];
    global.fetch = vi.fn(async (_url, init) => {
      requests.push(JSON.parse(init.body));
      return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: 'A recap.' }] }), text: async () => '' };
    });
    game.user.isGM = true;
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
    game.settings._store.delete(`${MODULE_ID}.campaignState`);
    for (const text of CHRONICLE) await addChronicleEntry('pc-mira', { text });
  });
  afterEach(() => {
    game.journal = savedJournal;
    JournalEntry.create = savedCreate;
    global.fetch = origFetch;
    global.game.messages = { contents: [] };
    game.settings._store.delete(`${MODULE_ID}.claudeApiKey`);
    game.settings._store.delete(`${MODULE_ID}.campaignState`);
    game.actors._reset();
  });

  it('End a Session: the summary covers every narration but the closing cutaway posted since — the recap is told it', async () => {
    global.game.messages = { contents: [
      card('The compass needle swings north and stops.'), card('"Whose name did you decide on?"'),
      card('Somewhere by the Spire, a woman darns a sock.', { sessionVignetteCard: true, vignetteKind: 'npc_end' }),
    ] };
    await getCampaignRecap(state({ sessionSummary: { sessionId: 's-3', text: SUMMARY, coveredCount: 2 } }), { forceRefresh: true });
    expect(requests).toHaveLength(1);
    expect(systemOf()).toContain('## WHERE THINGS STAND NOW');
    expect(systemOf()).toContain('THE SESSION JUST PLAYED (session 3), as its summary has it:');
    expect(systemOf()).toContain('its needle now settled on north');
    expect(systemOf()).toContain('remains unanswered');
    // …beside the Chronicle, whose last word on the needle is the older one.
    expect(String(requests[0].messages[0].content)).toContain('the compass swung harder toward the dark lane');
  });

  it('a summary made at the debounce, with narrations after it, is behind the Chronicle: left out', async () => {
    global.game.messages = { contents: [card('Beat one.'), card('Beat two.'), card('The compass needle swings north and stops.')] };
    await getCampaignRecap(state({ sessionSummary: { sessionId: 's-3', text: 'The needle leans toward the dark lane.', coveredCount: 2 } }), { forceRefresh: true });
    expect(systemOf()).not.toContain('leans toward the dark lane');
    expect(systemOf()).not.toContain('## WHERE THINGS STAND NOW');
  });

  it('a new session with no narration yet: the last session\'s summary says how things stand', async () => {
    global.game.messages = { contents: [] };
    await getCampaignRecap(state({ currentSessionId: 's-4', sessionNumber: 4,
      previousSessionSummary: { sessionId: 's-3', sessionNumber: 3, text: SUMMARY } }), { forceRefresh: true });
    expect(systemOf()).toContain('THE LAST SESSION PLAYED (session 3), as its summary has it:');
    expect(systemOf()).toContain('its needle now settled on north');
  });

  it('control: the session summary switched off — nothing of it is read', async () => {
    game.settings._store.set(`${MODULE_ID}.narratorSessionSummary`, false);
    try {
      await getCampaignRecap(state({ sessionSummary: { sessionId: 's-3', text: SUMMARY, coveredCount: 0 } }), { forceRefresh: true });
      expect(systemOf()).not.toContain('## WHERE THINGS STAND NOW');
    } finally {
      game.settings._store.delete(`${MODULE_ID}.narratorSessionSummary`);
    }
  });
});

describe('the session summary keeps what its moves settled (a76: the vow\'s fulfilment was left out)', () => {
  let origFetch, requests;
  const A64 = '"I\'d still like that slip back," the dry voice says. You don\'t answer it. You set the stamp square on the galley table, '
    + 'and the weight of the vow lifts off you. The thing you swore to find has a hand and a seal, and both are named now.';
  const card = (text, extra = {}) => ({ flags: { [MODULE_ID]: { narratorCard: true, narrationText: text, sessionId: 's-3', ...extra } } });

  beforeEach(() => {
    origFetch = global.fetch;
    requests = [];
    global.fetch = vi.fn(async (_url, init) => {
      requests.push(JSON.parse(init.body));
      return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: SUMMARY }] }), text: async () => '' };
    });
    game.user.isGM = true;
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
    game.settings._store.delete(`${MODULE_ID}.campaignState`);
    global.game.messages = { contents: [
      card('The galley lamp hums over the table.', { playerText: 'Mark progress on your vow.', playerName: 'Mira Kestrel', moveId: 'reach_a_milestone', outcome: 'strong_hit' }),
      card(A64, { playerText: 'Attempt to fulfill your vow.', playerName: 'Mira Kestrel', moveId: 'fulfill_your_vow', outcome: 'strong_hit' }),
      card('The drawer by your hip stands open its inch.', { sceneQuestion: 'What of my sister\'s do I have with me?', playerName: 'Mira Kestrel' }),
    ] };
  });
  afterEach(() => {
    global.fetch = origFetch;
    global.game.messages = { contents: [] };
    game.settings._store.delete(`${MODULE_ID}.claudeApiKey`);
  });

  it('the source says, under the fulfilment\'s narration, that the vow was fulfilled', async () => {
    await getRollingSessionSummary({ currentSessionId: 's-3' }, { forceRefresh: true, persist: false });
    expect(requests).toHaveLength(1);
    const source = String(requests[0].messages[0].content);
    expect(source).toContain('the weight of the vow lifts off you');
    expect(source).toMatch(/both are named now\.\n\(Settled by this move: the vow was fulfilled\.\)/);
    // Only what a move settled for good: a milestone marked and a question asked settle nothing.
    expect(source.match(/\(Settled by this move:/g)).toHaveLength(1);
  });

  it('and the summary is told to keep every such line, and to say only what the passages state', async () => {
    await getRollingSessionSummary({ currentSessionId: 's-3' }, { forceRefresh: true, persist: false });
    const system = JSON.stringify(requests[0].system);
    expect(system).toContain('continuity scribe');
    expect(system).toMatch(/Every one of them is in the summary, stated plainly — a vow fulfilled is said to be fulfilled/);
    expect(system).toMatch(/Say only what the passages state\. Infer nothing/);
    expect(system).toMatch(/count nothing they do not count/);
    expect(system).toMatch(/Where something changes during the session, say how it stands at the end/);
  });

  it('what a move settles for good, in words a summary can state', () => {
    expect(settledByMove({ moveId: 'fulfill_your_vow', outcome: 'strong_hit' })).toBe('the vow was fulfilled');
    expect(settledByMove({ moveId: 'fulfill_your_vow', outcome: 'weak_hit' })).toBe('the vow was fulfilled');
    expect(settledByMove({ moveId: 'fulfill_your_vow', outcome: 'miss' })).toBeNull();
    expect(settledByMove({ moveId: 'swear_an_iron_vow', outcome: 'miss' })).toBe('a vow was sworn');
    expect(settledByMove({ moveId: 'forsake_your_vow', outcome: null })).toBe('a vow was forsaken');
    expect(settledByMove({ moveId: 'take_decisive_action', outcome: 'weak_hit' })).toBe('the fight was won');
    expect(settledByMove({ moveId: 'take_decisive_action', outcome: 'miss' })).toBeNull();
    expect(settledByMove({ moveId: 'face_danger', outcome: 'strong_hit' })).toBeNull();
    expect(settledByMove(null)).toBeNull();
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
