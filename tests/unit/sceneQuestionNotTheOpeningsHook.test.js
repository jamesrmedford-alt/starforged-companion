/**
 * STARFORGED COMPANION
 * tests/unit/sceneQuestionNotTheOpeningsHook.test.js
 *
 * Known-issues NARRATOR-REFRAINS — the long haul's third live run
 * (test/ci/playwright/explorations/long-haul-live-20261124-0321/). Session 3
 * opened on a galley vignette that closed "the speaker over the hatch crackles
 * once, clearing its throat for a speech it has not written yet", and its fact
 * block set the scene frame's question: "What is the speaker over the hatch
 * about to say?". The sidecar rule said a question is "kept for the scene",
 * nothing ends a scene but the table, and the player never took the hook up:
 * the question stood in 22 of the session's prompts (a51–a74) and 23
 * narrations of 23 ended on the speaker, the drawer, the needle or the lamp.
 * At a62 the narrator's own block had moved on — "What will the voice trade to
 * take its slip back?" — and the frame refused it.
 *
 *   - A session vignette is a bookend: its frame says where, who and what,
 *     never the question — it sets none, changes none, and is no beat.
 *   - A question play leaves unanswered for SCENE_QUESTION_BEATS beats is
 *     released: the frame holds none, the next prompt asks for the one the
 *     scene turns on now, and that beat's question is the scene's.
 *   - The count rides on the stored frame (it survives a reload) and in the
 *     frame's superseded chain (an X-Card puts it back).
 *   - The narrator is told a question is the player's line's, never a hook the
 *     line did not take up, and not to ring such a hook again.
 *
 * The prose, the lines and the fact blocks below are the run's own.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import {
  MODULE_ID, resetSkeletonTable, gmOf, narrationCallsOf, moveResolution, narrateMoveOn, onGm, playXCard, patSpeaks,
} from '../helpers/skeletonTable.js';
import { SCENE_QUESTION_BEATS, bookendFrame, countSceneQuestionBeat } from '../../src/narration/narrator.js';
import { applySceneFrame, retractNarrations } from '../../src/factContinuity/ledgers.js';
import { buildNarratorSystemBlocks, appendSidecarInstruction, buildLedgerBlock } from '../../src/narration/narratorPrompt.js';

// ── The run's own words ──────────────────────────────────────────────────────

const HOOK = 'What is the speaker over the hatch about to say?';
const GALLEY = 'Galley aboard the Kobayashi IV';

/** a50 — session 3's opening vignette, as the narrator returned it. */
const OPENING = {
  prose: 'You have the last of the dried apricots in a chipped enamel mug. Across the table, the cabin lights hum a note '
    + 'that climbs and then gives up, and the speaker over the hatch crackles once, clearing its throat for a speech it '
    + 'has not written yet.',
  sidecar: {
    newTruths: [],
    stateChanges: [{ subject: 'Mira Kestrel', attribute: 'location', value: 'in the galley aboard the Kobayashi IV' }],
    sceneFrame: {
      location: GALLEY, present: ['Mira Kestrel'],
      situation: "Mira passes quiet downtime in the galley with soaked dried apricots while the ship's noises and small habits keep her company.",
      question: HOOK,
    },
  },
};

/** a76 — the session's closing cutaway. */
const CLOSING_FRAME = {
  location: 'A service-corridor cabin past Hollow Spire', present: [],
  situation: 'An unnamed woman darns a sock over a ledger of lane tallies',
  question: "What will the raiders' architect do next?",
};

/** The session's lines of play and what each beat's block made of the scene (a56, a58, a61, a62). */
const BEATS = [
  { line: 'What is the raider cutter called?',
    situation: 'The voice from the Cinder Wren has named the cutter and asks whether Mira will board or be visited, over the galley speaker.' },
  { line: "I sit down in the galley and treat my wounds with the ship's medkit, cleaning and binding what the fight cost me.",
    situation: "Mira lays out the medkit while the Cinder Wren's voice waits over the galley speaker for her answer." },
  { line: "I lay the Bleakhold manifest stamp from the crate lid beside the Wake's registry and the voice's own words: the raids on the Cinder Expanse lanes trace back to one hand, and I can prove it.",
    situation: 'Mira has laid the Bleakhold manifest stamp on the table and claimed it proves the raids trace to one hand; the voice from the Cinder Wren doubts it.' },
];
const A62_QUESTION = 'What will the voice trade to take its slip back?';
const A62_SITUATION = "The stamp, registry and the voice's slip point to one broker's seal at Hollow Spire; the voice wants to retract its words.";

const frame = (over = {}) => ({ location: GALLEY, present: ['Mira Kestrel'], situation: BEATS[0].situation, ...over });
const ASK = "  Question: none stands — set the one the scene turns on now, from the player's latest line.";

// ── The two rules, pure ──────────────────────────────────────────────────────

describe('NARRATOR-REFRAINS — a session vignette is a bookend, not the scene', () => {
  it("its frame keeps where, who and what, and loses the question it closed on", () => {
    const kept = bookendFrame(OPENING.sidecar.sceneFrame);
    expect(kept).toEqual({ location: GALLEY, present: ['Mira Kestrel'], situation: OPENING.sidecar.sceneFrame.situation });
    expect(bookendFrame({ ...CLOSING_FRAME, questionAnswered: true })).not.toHaveProperty('questionAnswered');
    // The vignette's own block is left as it was.
    expect(OPENING.sidecar.sceneFrame.question).toBe(HOOK);
    expect(bookendFrame(null)).toBeNull();
  });

  it('over a scene that has a question it changes neither the question nor its count', () => {
    const cs = { currentSceneId: 'sc-1', sceneTruths: [], sceneFrame: null };
    applySceneFrame({ location: 'the bridge', present: ['Mira Kestrel'], situation: 'A raider cutter drops out of the lane', question: 'Will the cutter fire?' }, cs, { narrationId: 'n0' });
    cs.sceneFrame = countSceneQuestionBeat(cs.sceneFrame, null);
    const prior = cs.sceneFrame;
    applySceneFrame(bookendFrame({ ...OPENING.sidecar.sceneFrame, questionAnswered: true }), cs, { narrationId: 'n-vignette' });
    cs.sceneFrame = countSceneQuestionBeat(cs.sceneFrame, prior, { bookend: true });
    expect(cs.sceneFrame).toMatchObject({ location: GALLEY, question: 'Will the cutter fire?', questionBeats: 0 });
    expect(cs.sceneFrame.questionAnswered).toBeUndefined();
  });
});

describe('NARRATOR-REFRAINS — a question play does not answer is released', () => {
  const state = () => ({ currentSceneId: 'sc-1', sceneTruths: [], sceneFrame: null });
  /** One beat's frame applied as narrator.js applies it: applySceneFrame, then the count. */
  const beat = (cs, sidecarFrame, narrationId) => {
    const prior = cs.sceneFrame;
    applySceneFrame(sidecarFrame, cs, { narrationId });
    cs.sceneFrame = countSceneQuestionBeat(cs.sceneFrame, prior);
    return cs.sceneFrame;
  };

  it(`the number is a small one, named: ${SCENE_QUESTION_BEATS}`, () => {
    expect(Number.isInteger(SCENE_QUESTION_BEATS)).toBe(true);
    expect(SCENE_QUESTION_BEATS).toBeGreaterThanOrEqual(2);
    expect(SCENE_QUESTION_BEATS).toBeLessThanOrEqual(4);
  });

  it('the beat that sets it starts the count; each beat that leaves it open adds one; the last releases it', () => {
    const cs = state();
    expect(beat(cs, frame({ question: HOOK }), 'n0')).toMatchObject({ question: HOOK, questionBeats: 0 });
    for (let i = 1; i < SCENE_QUESTION_BEATS; i += 1) {
      expect(beat(cs, frame({ question: HOOK, situation: BEATS[i % BEATS.length].situation }), `n${i}`))
        .toMatchObject({ question: HOOK, questionBeats: i });
    }
    const released = beat(cs, frame({ question: HOOK }), 'n-last');
    expect(released).not.toHaveProperty('question');
    expect(released).not.toHaveProperty('questionBeats');
    expect(released.location).toBe(GALLEY);                    // the rest of the frame stands
    // …and the next beat's question is the scene's — a62's, refused in the run.
    expect(beat(cs, frame({ question: A62_QUESTION, situation: A62_SITUATION }), 'n-next'))
      .toMatchObject({ question: A62_QUESTION, questionBeats: 0 });
  });

  it('an answered question is not counted, and the question after it starts again', () => {
    const cs = state();
    beat(cs, frame({ question: HOOK }), 'n0');
    const answered = beat(cs, frame({ question: HOOK, questionAnswered: true }), 'n1');
    expect(answered).toMatchObject({ question: HOOK, questionAnswered: true });
    expect(answered).not.toHaveProperty('questionBeats');
    expect(beat(cs, frame({ question: A62_QUESTION }), 'n2')).toMatchObject({ question: A62_QUESTION, questionBeats: 0 });
  });

  it('a new scene counts from nothing', () => {
    const cs = state();
    beat(cs, frame({ question: HOOK }), 'n0');
    beat(cs, frame({ question: HOOK }), 'n1');
    cs.currentSceneId = 'sc-2';
    expect(beat(cs, frame({ question: HOOK }), 'n2')).toMatchObject({ question: HOOK, questionBeats: 0 });
  });

  it('the X-Card on the beat that released it puts the question back, with the count it had', () => {
    const cs = state();
    beat(cs, frame({ question: HOOK }), 'n0');
    for (let i = 1; i < SCENE_QUESTION_BEATS; i += 1) beat(cs, frame({ question: HOOK }), `n${i}`);
    expect(beat(cs, frame({ question: HOOK }), 'n-last')).not.toHaveProperty('question');
    retractNarrations(cs, ['n-last']);
    expect(cs.sceneFrame).toMatchObject({ question: HOOK, questionBeats: SCENE_QUESTION_BEATS - 1 });
  });
});

// ── What the narrator is told ────────────────────────────────────────────────

describe('NARRATOR-REFRAINS — what the narrator is told', () => {
  const STATE = (sceneFrame) => ({ currentSessionId: 's-3', sessionNumber: 3, currentSceneId: 'sc-1', sceneTruths: [], sceneFrame });
  const blocks = (mode, sceneFrame, settings = {}) => buildNarratorSystemBlocks(STATE(sceneFrame), settings, null, '', { mode });
  const noQuestion = { ...OPENING.sidecar.sceneFrame, sceneId: 'sc-1' };
  delete noQuestion.question;

  it('the fact block\'s question is the player\'s line\'s — not "kept for the scene", and never a hook of the narrator\'s own', () => {
    const text = appendSidecarInstruction({ mode: 'paced_narrative' });
    expect(text).not.toContain("Set it on the scene's first beat");
    expect(text).not.toContain('it is kept for the scene');
    expect(text).toContain("what the player's latest line sets out to settle");
    expect(text).toContain('a hook of your own that their line did not take up');
    expect(text).toContain('When SCENE FRAME shows none, or one');
    expect(text).toContain('do not bring it');
    // What issue #353 R2 asked for stands.
    expect(text).toContain('"questionAnswered": true and end the beat on a cut');
    expect(text).toContain('Never end the scene: the table ends scenes.');
  });

  it('a beat does not end twice on a hook the player\'s line did not take up', () => {
    for (const mode of ['move_resolution', 'paced_narrative', 'round_resolution']) {
      expect(blocks(mode, null).mode, mode).toContain("A hook the player's line did not take up is not rung again");
    }
  });

  it('a frame with no question asks a beat of play for one, from the player\'s line', () => {
    expect(blocks('paced_narrative', noQuestion).beat).toContain(ASK);
    expect(blocks('move_resolution', noQuestion).beat).toContain(ASK);
    expect(blocks('round_resolution', noQuestion).beat).toContain("from the players' lines this round.");
    expect(blocks('oracle_followup', noQuestion).beat).toContain('  Question: none stands — set the one the scene turns on now.');
    // A frame that has one shows it, and nothing is asked.
    const standing = blocks('paced_narrative', { ...noQuestion, question: HOOK }).beat;
    expect(standing).toContain(`  Question: ${HOOK}`);
    expect(standing).not.toContain('none stands');
  });

  it('a vignette, a scene answer and a recap are asked for none; nor is a table with the frame or the block switched off', () => {
    for (const mode of ['session_vignette', 'scene_interrogation', 'campaign_recap']) {
      expect(blocks(mode, noQuestion).beat, mode).not.toContain('none stands');
    }
    expect(blocks('paced_narrative', noQuestion, { factContinuityEnabled: false }).beat).not.toContain('none stands');
    expect(blocks('paced_narrative', noQuestion, { factContinuitySceneFrame: false }).beat).not.toContain('none stands');
    // The audit and the Private Channel read the block as it was: no line.
    expect(buildLedgerBlock(STATE(noQuestion)).frame).not.toContain('Question');
  });

  it('a session vignette is told its fact block sets no question — in its own mode block, the standing rules unchanged', () => {
    const vignette = blocks('session_vignette', null);
    expect(vignette.mode).toContain('## A VIGNETTE IS NOT THE SCENE');
    expect(vignette.mode).toContain('no "question": never set one');
    for (const mode of ['paced_narrative', 'move_resolution', 'clock_advance', 'inciting_incident']) {
      expect(blocks(mode, null).mode, mode).not.toContain('A VIGNETTE IS NOT THE SCENE');
      expect(blocks(mode, null).standing, mode).toBe(vignette.standing);
    }
    expect(blocks('session_vignette', null, { factContinuitySceneFrame: false }).mode).not.toContain('A VIGNETTE IS NOT THE SCENE');
  });
});

// ── On the table: the real vignette, the real beats, the stored frame ────────

describe('NARRATOR-REFRAINS — on the table: the opening\'s hook is not the session\'s question', () => {
  let table;
  let restore;
  beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
  afterAll(() => table?.teardown());
  beforeEach(async () => {
    restore = await resetSkeletonTable(table, {}, { currentSceneId: null, sceneFrame: null, sceneState: { bySubject: {}, sceneId: null } });
  });
  afterEach(() => restore?.());

  const stored = () => gmOf(table).run(() => game.settings.get(MODULE_ID, 'campaignState'));
  const lastSystem = () => narrationCallsOf(table).at(-1).system;
  const reply = (prose, sceneFrame) => () => ({ prose, sidecar: { newTruths: [], stateChanges: [], sceneFrame } });

  /** A session vignette narrated as Begin / End a Session narrate one: on a working copy of the store. */
  async function narrateVignette(userMessage) {
    const { narrateSessionVignette } = await gmOf(table).import('../../src/narration/narrator.js');
    return onGm(table, () => narrateSessionVignette({
      userMessage, campaignState: foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')), actorIds: ['pc-kira'],
    }));
  }
  /** A line of free narration, as the pacing router hands one in. */
  async function narrateLine(line) {
    const { narratePacedInput } = await gmOf(table).import('../../src/narration/narrator.js');
    return onGm(table, () => narratePacedInput(line,
      foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')), { speakerActorId: 'pc-kira' }));
  }

  it('the opening vignette frames the galley and sets no question; the first line of play is asked for it', async () => {
    table.replies = () => OPENING;
    expect(await narrateVignette("OPENING VIGNETTE — begin-session ship's galley.")).toContain('the speaker over the hatch crackles once');

    const opened = stored().sceneFrame;
    expect(opened).toMatchObject({ location: GALLEY, present: ['Mira Kestrel'] });
    expect(opened.situation).toContain('quiet downtime in the galley');
    expect(opened).not.toHaveProperty('question');
    expect(narrationCallsOf(table).at(-1).system).toContain('## A VIGNETTE IS NOT THE SCENE');

    // a56 — the first line of play: no hook in its SCENE FRAME, and it is asked for the scene's question.
    table.replies = reply('The speaker over the hatch clicks, and a dry voice reads the name off like a line from a ledger.',
      frame({ question: 'Will Mira cross to the Cinder Wren?' }));
    await narrateLine(BEATS[0].line);
    expect(lastSystem()).toContain(`  Where:   ${GALLEY}`);
    expect(lastSystem()).toContain(ASK);
    expect(lastSystem()).not.toContain(`Question: ${HOOK}`);
    expect(stored().sceneFrame).toMatchObject({ question: 'Will Mira cross to the Cinder Wren?', questionBeats: 0 });
  }, 60_000);

  it('a vignette that follows a beat into its scene moves the frame, and leaves that scene\'s question and its count alone', async () => {
    table.replies = reply('A cutter drops out of the lane.', { location: 'the bridge', present: ['Mira Kestrel'],
      situation: 'A raider cutter drops out of the lane', question: 'Will the cutter fire?' });
    await narrateLine('I bring the ship about.');
    await narrateLine('I hold my course.');
    expect(stored().sceneFrame).toMatchObject({ question: 'Will the cutter fire?', questionBeats: 1 });

    table.replies = () => OPENING;
    await narrateVignette("OPENING VIGNETTE — begin-session ship's galley.");
    expect(stored().sceneFrame).toMatchObject({ location: GALLEY, question: 'Will the cutter fire?', questionBeats: 1 });
    // Its facts are the scene's, as before: the vignette's state change landed.
    expect(JSON.stringify(stored().sceneState.bySubject)).toContain('in the galley aboard the Kobayashi IV');
  }, 60_000);

  it("the closing cutaway's frame sets no question either", async () => {
    table.replies = reply('She bites the thread off, pulls the sock on, and wiggles her toes.', CLOSING_FRAME);
    await narrateVignette('CLOSING VIGNETTE — end-session NPC slice-of-life.\n\nFLAVOUR: END.');
    expect(stored().sceneFrame).toMatchObject({ location: CLOSING_FRAME.location, situation: CLOSING_FRAME.situation });
    expect(stored().sceneFrame).not.toHaveProperty('question');
  }, 60_000);

  it(`a question a beat sets is shown for ${SCENE_QUESTION_BEATS} beats, then released: the next prompt asks, and that beat's question is kept`, async () => {
    // The beat that sets it — the run's hook, as if a line of play had posed it.
    table.replies = reply('The speaker over the hatch crackles once.', frame({ question: HOOK }));
    await narrateLine('I wait in the galley.');
    expect(stored().sceneFrame).toMatchObject({ question: HOOK, questionBeats: 0 });

    // a56, a58, a61 — three lines that do not take it up; each block copies it, as the run's did.
    for (let i = 0; i < SCENE_QUESTION_BEATS; i += 1) {
      const b = BEATS[i % BEATS.length];
      table.replies = reply('The drawer slides open its inch again.', frame({ question: HOOK, situation: b.situation }));
      await narrateLine(b.line);
      expect(lastSystem(), `beat ${i + 1} is shown the question`).toContain(`  Question: ${HOOK}`);
      // The count is in the world's stored frame after every beat: a reload reads it back.
      if (i + 1 < SCENE_QUESTION_BEATS) expect(table.world.campaignState().sceneFrame).toMatchObject({ question: HOOK, questionBeats: i + 1 });
    }
    expect(table.world.campaignState().sceneFrame).not.toHaveProperty('question');
    expect(stored().sceneFrame.situation).toBe(BEATS[(SCENE_QUESTION_BEATS - 1) % BEATS.length].situation);

    // a62 — the move's prompt shows no question and asks; its own is the scene's now.
    table.replies = reply('The stamp, the registry and the voice\'s own slip line up on the table.',
      frame({ question: A62_QUESTION, situation: A62_SITUATION }));
    await narrateMoveOn(table, moveResolution({ moveId: 'gather_information', moveName: 'Gather Information',
      outcome: 'strong_hit', outcomeLabel: 'Strong Hit', playerNarration: BEATS[2].line }));
    expect(lastSystem()).toContain(ASK);
    expect(lastSystem()).not.toContain(HOOK);
    expect(stored().sceneFrame).toMatchObject({ question: A62_QUESTION, questionBeats: 0, situation: A62_SITUATION });
  }, 120_000);

  it('the X-Card on the releasing beat puts the question and its count back in the store', async () => {
    table.replies = reply('The speaker over the hatch crackles once.', frame({ question: HOOK }));
    await narrateLine('I wait in the galley.');
    for (let i = 0; i < SCENE_QUESTION_BEATS; i += 1) {
      if (i === SCENE_QUESTION_BEATS - 1) await patSpeaks(table);          // the X-Card's beat begins here
      table.replies = reply('The drawer slides open its inch again.', frame({ question: HOOK, situation: BEATS[i % BEATS.length].situation }));
      await narrateLine(BEATS[i % BEATS.length].line);
    }
    expect(stored().sceneFrame).not.toHaveProperty('question');
    await playXCard(table);
    expect(stored().sceneFrame).toMatchObject({ question: HOOK, questionBeats: SCENE_QUESTION_BEATS - 1 });
  }, 120_000);
});
