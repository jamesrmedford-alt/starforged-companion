/**
 * STARFORGED COMPANION
 * tests/unit/sceneAnswerPlainAndUnrecorded.test.js
 *
 * Known-issues SCENE-ANSWER-NOT-A-CAMERA — the long haul's third live run
 * (test/ci/playwright/explorations/long-haul-live-20261124-0321/). An `@scene`
 * question's system text said "Describe only what is already established —
 * answer the question, do not invent", and its user message asked for "2–3
 * sentences of atmospheric description". Sixteen answers were right, and each
 * dressed its fact in scenery that invented: the compass "against the galley
 * table" (a20), "in your coat, where it has ridden since Hollow Spire" (a51),
 * in a drawer (a66), "on your belt … where it has hung since Hollow Spire"
 * (a73); its needle "has not settled on north in all the time you've owned
 * it" (a20). Each answer was then applied to the scene's record: its fact
 * block rewrote the frame's situation, and its capture filed the scenery as
 * lore and a draft location.
 *
 *   - An answer is asked for the fact and nothing else: one or two plain
 *     sentences from what the prompt holds, "the story has not established
 *     it" otherwise, and no fact block. No permission block asks it for
 *     sensory detail. The Scene Response Length setting is the most sentences
 *     it runs to.
 *   - Nothing of an answer is recorded: no frame, truth, state or plan — on
 *     the GM or relayed from a player's key — no detection, no tier pass, no
 *     Chronicle entry.
 *   - It is still something the narrator said: its card is in the recent
 *     scene of the next narration (architecture §2, the A1 decision kept).
 *     It is no narration for the X-Card's redirect.
 *
 * The questions, the answers and the fact blocks below are the run's own.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import {
  MODULE_ID, NARRATION_MODEL, resetSkeletonTable, gmOf, onGm, moveResolution, narrateMoveOn, playXCard, patSpeaks,
} from '../helpers/skeletonTable.js';
import { buildNarratorSystemBlocks, buildSceneUserMessage } from '../../src/narration/narratorPrompt.js';

// ── The run's own words ──────────────────────────────────────────────────────

/** a20 — the question, the answer as it was given, and the fact block it carried. */
const A20 = {
  question: 'What do I still carry that belonged to my sister?',
  prose: "The brass star-compass sits where you left it, a dull gold weight against the galley table beside the egg jar. "
    + "Its needle has not settled on north in all the time you've owned it. It leans stubbornly toward the dark lane past "
    + 'Hollow Spire, and it trembles slightly each time the coolant line ticks.',
  sidecar: {
    newTruths: [{ subject: "Ilse's star-compass", fact: 'sits on the galley table beside the egg jar' }],
    stateChanges: [{ subject: "Ilse's star-compass", attribute: 'location', value: 'on the galley table' }],
    sceneFrame: {
      location: 'the galley aboard the Kobayashi IV', present: ['Mira Kestrel'],
      situation: "Mira eats a pickled egg alone in the galley while the ship's systems act up; the intercom announces something has completed",
      question: 'What has the ship just completed?',
    },
    openQuestions: [{ question: 'Why does the needle lean toward the dark lane?', about: "Ilse's star-compass" }],
  },
  /** What the detection pass made of that answer in the run: lore, and a draft location. */
  detection: {
    entities: [{ type: 'location', name: 'Dark Lane', description: "The dark lane past Hollow Spire, toward which Ilse's brass star-compass needle leans.", confidence: 'medium' }],
    renames: [],
    worldJournal: {
      lore: [{ title: "Ilse's compass points to the dark lane", category: 'artifact', salience: 'notable', narratorAsserted: true, confirmed: false, entityName: null,
        text: "Ilse's brass star-compass never settles on north; its needle leans toward the dark lane past Hollow Spire and trembles when the coolant line ticks." }],
      threats: [], factionUpdates: [], locationUpdates: [{ name: 'Dark Lane', type: 'location', summary: 'A dark lane past Hollow Spire.', isNew: true }], stateTransitions: [],
    },
  },
};
const A51_QUESTION = "Remind me, which keepsake of my sister's is on me?";
const A73_QUESTION = "Didn't I leave the compass with Tamsin?";

/** The scene as it stood when the question was asked. */
const STANDING_FRAME = {
  location: 'Bleakhold Station, berth nine', present: ['Kira'], situation: 'The Kobayashi IV has berthed and someone on the dock is calling the ship by name',
  question: 'Who is calling for the Kobayashi IV?', questionBeats: 1, sceneId: 'sc-1',
};

// ── What the narrator is asked ───────────────────────────────────────────────

describe('SCENE-ANSWER-NOT-A-CAMERA — the answer is asked for the fact and nothing else', () => {
  const STATE = { currentSessionId: 's-3', sessionNumber: 3, currentSceneId: 'sc-1', sceneTruths: [], sceneFrame: STANDING_FRAME };
  const blocks = (mode, extras = {}, settings = {}) => buildNarratorSystemBlocks(STATE, settings, null, '', { mode, ...extras });

  it('the user message asks for plain sentences — never "atmospheric description" beside "do not invent"', () => {
    const msg = buildSceneUserMessage(A51_QUESTION, '', 2, 'Mira Kestrel');
    expect(msg).toContain(`Mira Kestrel: "${A51_QUESTION}"`);
    expect(msg).not.toMatch(/atmospheric|description\. Do not introduce|2–3 sentences|camera/);
    expect(msg).toContain('Answer this question in at most two plain sentences — one, if one answers it: the fact asked for and nothing else');
    expect(msg).toContain('No description, no scenery, nothing new, and nothing happens.');
    expect(msg).toContain('say that the story has not established it');
  });

  it('Scene Response Length is the most sentences an answer runs to', () => {
    expect(buildSceneUserMessage(A73_QUESTION, '', 1)).toContain('Answer this question in one plain sentence: the fact asked for');
    expect(buildSceneUserMessage(A73_QUESTION, '', 3)).toContain('in at most three plain sentences — one, if one answers it');
    expect(buildSceneUserMessage(A73_QUESTION, '', 4)).toContain('in at most four plain sentences');
    expect(buildSceneUserMessage(A73_QUESTION, '', 9)).toContain('in at most four plain sentences');   // the setting's range
    expect(buildSceneUserMessage(A73_QUESTION, '', undefined)).toContain('in at most two plain sentences');
  });

  it('its role is an answer, not narration: only what the prompt holds, or "not established"; nothing happens', () => {
    const { mode } = blocks('scene_interrogation');
    expect(mode).toContain('The player has stepped out of the story to ask you a question about it');
    expect(mode).toContain('This is an answer, not narration');
    expect(mode).toContain('If the prompt does not give one, do not supply it.');
    expect(mode).toContain('say plainly that the story has not established it');
    expect(mode).toContain('No scenery, no sensory detail, no mood, no comparison');
    expect(mode).toContain('Nothing happens in an answer');
    // Worded for both layouts: the snapshot's HIDDEN PLANS and the context's UNREVEALED are each "FOR THE NARRATOR ONLY".
    expect(mode).toContain('What this prompt marks FOR THE NARRATOR ONLY — a hidden plan, anything under UNREVEALED — the characters do not know. Never state it');
  });

  it('no permission block asks it for sensory detail, and no beat-ending rule for a hook', () => {
    const { mode } = blocks('scene_interrogation');
    expect(mode).not.toContain('NARRATOR PERMISSIONS');
    expect(mode).not.toContain('Focus on concrete sensory and emotional detail');
    expect(mode).not.toContain('HOW A BEAT ENDS');
    // The modes that narrate keep theirs.
    expect(blocks('oracle_followup').mode).toContain('EMBELLISHMENT MODE');
    expect(blocks('paced_narrative').mode).toContain('INTERACTION MODE');
  });

  it('it is asked for no fact block: the context closes on ANSWER NOW, the standing rules unchanged', () => {
    const scene = blocks('scene_interrogation');
    expect(scene.beat.trimEnd().endsWith('Write no JSON block.')).toBe(true);
    expect(scene.beat).toContain('## ANSWER NOW');
    expect(scene.beat).not.toContain('## RESPOND NOW');
    // The cached standing block is every mode's (invariant 7b); a narration still closes on RESPOND NOW.
    const paced = blocks('paced_narrative');
    expect(scene.standing).toBe(paced.standing);
    expect(paced.beat).toContain('## RESPOND NOW');
    expect(paced.beat).not.toContain('## ANSWER NOW');
    // With fact continuity off there is no response format to set aside.
    expect(blocks('scene_interrogation', {}, { factContinuityEnabled: false }).beat).not.toContain('ANSWER NOW');
  });

  it('the plans in play are shown to it without the lines that ask for a record, and it decides none', () => {
    const plans = [
      { id: 'sk-1', kind: 'threat', subject: { type: 'name', name: 'the raider captain' }, truth: 'She is the broker\'s sister.', clues: [], escalation: [], resolutions: [] },
      { id: 'sk-2', kind: 'mystery', subject: { type: 'name', name: 'the needle' }, question: 'Why does the needle lean?', truth: '', oracleSeeds: ['Guard / Secret'] },
    ];
    const scene = blocks('scene_interrogation', { unrevealed: plans, planRequests: [{ ref: 'r-1', kind: 'threat', label: 'a new enemy' }] }).beat;
    expect(scene).toContain('## UNREVEALED — FOR THE NARRATOR ONLY');
    expect(scene).toContain('Never state one outright');
    expect(scene).not.toContain('in your sidecar');
    expect(scene).not.toContain('DECIDE NOW');
    // A narration is still asked to record and to decide.
    const paced = blocks('paced_narrative', { unrevealed: plans, planRequests: [{ ref: 'r-1', kind: 'threat', label: 'a new enemy' }] }).beat;
    expect(paced).toContain('record exactly what it showed in your sidecar');
    expect(paced).toContain('### DECIDE NOW');
  });
});

// ── On the table: the real `@scene` path ─────────────────────────────────────

describe('SCENE-ANSWER-NOT-A-CAMERA — on the table: an answer is not written back', () => {
  let table;
  let restore;
  beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
  afterAll(() => table?.teardown());
  beforeEach(async () => {
    restore = await resetSkeletonTable(table, { chronicleAutoEntry: true }, { sceneFrame: STANDING_FRAME, sceneState: { bySubject: {}, sceneId: 'sc-1' } });
    // The answer as the run's narrator gave it, fact block and all; every
    // helper call is answered as the run's detection pass answered a20.
    table.replies = () => A20;
    table.script.when(call => call.model !== NARRATION_MODEL, () => JSON.stringify(A20.detection));
  });
  afterEach(() => restore?.());

  const stored = () => gmOf(table).run(() => game.settings.get(MODULE_ID, 'campaignState'));
  // The narrator's own calls: the Chronicle's scribe writes on the same model.
  const isNarrator = (c) => String(c.system ?? '').startsWith('## NARRATOR ROLE AND VOICE');
  const narrationCallsOf = (t) => t.claude.calls.filter(isNarrator);
  const helperCalls = (pattern) => table.claude.calls.filter(c => !isNarrator(c) && pattern.test(`${c.system ?? ''}\n${c.userText ?? ''}`));

  /** The player's `@scene` question, answered where the table answers it. */
  async function ask(question, client = gmOf(table)) {
    const { interrogateScene } = await client.import('../../src/narration/narrator.js');
    return onGm(table, () => client.run(() => interrogateScene(question,
      foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')), { speakerActorId: 'pc-kira' })));
  }

  it('the request asks for plain sentences and no fact block', async () => {
    await ask(A20.question);
    const call = narrationCallsOf(table).at(-1);
    expect(call.userText).toContain('in at most two plain sentences — one, if one answers it');
    expect(call.userText).not.toContain('atmospheric');
    expect(call.system).toContain('## ANSWER NOW');
    expect(call.system).not.toContain('## RESPOND NOW');
    expect(call.system).not.toContain('EMBELLISHMENT MODE');
    // The scene it is asked about is in view — its frame, with its question.
    expect(call.system).toContain('  Where:    Bleakhold Station, berth nine — as the narration has it');
    expect(call.system).toContain('  Turns on: Who is calling for the Kobayashi IV? — from the player\'s line');
  }, 60_000);

  it('the card shows the answer without its block; the frame, its question and its count, the truths, the state and the plans are as they were', async () => {
    const before = stored();
    const answer = await ask(A20.question);
    expect(answer).toContain('brass star-compass');
    expect(answer).not.toContain('sceneFrame');

    const cards = table.cards(f => f.sceneResponse && !f.sceneFallback);
    expect(cards).toHaveLength(1);
    expect(cards[0].flags[MODULE_ID]).toMatchObject({ narratorCard: true, sceneQuestion: A20.question, playerName: 'Kira' });
    expect(cards[0].flags[MODULE_ID].narrationText).not.toMatch(/```|newTruths/);

    const after = stored();
    expect(after.sceneFrame).toEqual(before.sceneFrame);                       // not "Mira eats a pickled egg…"
    expect(after.sceneFrame).toMatchObject({ situation: STANDING_FRAME.situation, question: STANDING_FRAME.question, questionBeats: 1 });
    expect(after.sceneTruths).toEqual([]);
    expect(after.sceneState.bySubject).toEqual({});
    // No hidden mystery was filed for the question its block posed.
    const secrets = gmOf(table).run(() => game.journal.find(j => j.flags?.[MODULE_ID]?.worldJournalCategory === 'secrets')) ?? null;
    expect(secrets?.pages?.contents ?? []).toEqual([]);
  }, 60_000);

  it('it is not mined: no detection pass, no tier pass, no Chronicle entry, no lore, no draft card', async () => {
    await ask(A20.question);
    expect(helperCalls(/ENTITY TYPES TO DETECT/), 'the detection pass').toEqual([]);
    expect(helperCalls(/capture any SIGNIFICANT new development/), 'the tier pass').toEqual([]);
    expect(helperCalls(/chronicle scribe/), 'the Chronicle scribe').toEqual([]);
    expect(table.cards(f => f.draftEntityCard)).toEqual([]);
    const pages = gmOf(table).run(() => game.journal.contents.flatMap(j => j.pages?.contents ?? []).map(p => p.name));
    expect(pages.filter(n => /compass|Dark Lane/i.test(n))).toEqual([]);
  }, 60_000);

  it('control: the same words as a line of play are recorded and mined — the difference is the mode', async () => {
    const { narratePacedInput } = await gmOf(table).import('../../src/narration/narrator.js');
    await onGm(table, () => narratePacedInput('I set the compass on the galley table.',
      foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')), { speakerActorId: 'pc-kira' }));
    expect(stored().sceneFrame.situation).toBe(A20.sidecar.sceneFrame.situation);
    expect(stored().sceneTruths.map(t => t.fact)).toContain('sits on the galley table beside the egg jar');
    expect(helperCalls(/ENTITY TYPES TO DETECT/)).toHaveLength(1);
  }, 60_000);

  it('answered on a player\'s own key, nothing is relayed to the GM either', async () => {
    await table.setClaudeKey('gm-1', '');
    await table.setClaudeKey('pl-1', 'sk-ant-player');
    const before = stored();
    const pat = table.client('pl-1');
    const { interrogateScene } = await pat.import('../../src/narration/narrator.js');
    const answer = await pat.run(() => interrogateScene(A20.question,
      foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')), { speakerActorId: 'pc-kira' }));
    await table.settle(); await table.drain();
    expect(answer).toContain('brass star-compass');
    expect(table.claude.by('pl-1').filter(isNarrator)).toHaveLength(1);
    expect(stored().sceneFrame).toEqual(before.sceneFrame);
    expect(stored().sceneTruths).toEqual([]);
    expect(stored().sceneState.bySubject).toEqual({});
  }, 60_000);

  it('what was asked and what was said are in the next narration\'s recent scene (the A1 decision, kept)', async () => {
    await ask(A20.question);
    table.replies = () => ({ prose: 'You pocket the compass.', sidecar: { newTruths: [], stateChanges: [] } });
    await narrateMoveOn(table, moveResolution({ playerNarration: 'I pocket the compass and go to the lock.' }));
    const next = narrationCallsOf(table).at(-1);
    expect(next.userText).toContain(`PLAYER — Kira asked: "${A20.question}"`);
    expect(next.userText).toContain('The brass star-compass sits where you left it');
  }, 60_000);

  it('an answer does not use up the X-Card\'s redirect: the first narration after it is still steered away', async () => {
    table.replies = () => ({ prose: 'The interrogator lifts the cutting torch.', sidecar: { newTruths: [], stateChanges: [] } });
    await patSpeaks(table);
    await narrateMoveOn(table, moveResolution());
    await playXCard(table);
    await gmOf(table).chat('!x clear');
    await table.settle(); await table.drain();
    expect(stored().xCardRedirect).toBeTruthy();

    table.replies = () => A20;
    await ask(A20.question);
    expect(narrationCallsOf(table).at(-1).system).toContain('## X-CARD — REDIRECT');
    expect(stored().xCardRedirect, 'an answer steers nothing away').toBeTruthy();

    table.replies = () => ({ prose: 'The corridor lights flicker.', sidecar: { newTruths: [], stateChanges: [] } });
    await narrateMoveOn(table, moveResolution({ playerNarration: 'I walk out of the cell.' }));
    expect(narrationCallsOf(table).at(-1).system).toContain('## X-CARD — REDIRECT');
    expect(stored().xCardRedirect).toBeNull();                 // delivered by a narration — cleared
  }, 90_000);
});
