/**
 * STARFORGED COMPANION
 * tests/unit/sceneQuestion.test.js
 *
 * Issue #353 R2 — each scene has a question; scenes still end by hand
 * (decided, maintainer 2026-11-13: the module does not end a scene, and does
 * not offer to).
 *   - The scene frame's `question` — what the scene is deciding — is set on
 *     the scene's first beat and kept: a later snapshot may not reword it.
 *   - A beat that answers it marks it (`questionAnswered`) and is told to end
 *     on a cut forward; the next beat sets the question the scene turns on.
 *   - The X-Card on a beat puts back the question it changed (the frame's
 *     superseded chain).
 *   - It is gone when the scene ends; no narration ends a scene.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { normaliseSidecar } from '../../src/factContinuity/sidecarParser.js';
import { applySceneFrame, retractNarrations } from '../../src/factContinuity/ledgers.js';
import { buildLedgerBlock, appendSidecarInstruction } from '../../src/narration/narratorPrompt.js';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import {
  MODULE_ID, resetSkeletonTable, gmOf, narrationCallsOf, moveResolution, narrateMoveOn,
} from '../helpers/skeletonTable.js';

const BASE = { location: 'the corridor', present: ['Kira', 'the escort'], situation: 'The escort blocks the way' };
const Q = 'Will the escort let them pass?';

describe('issue #353 R2 — the sidecar\'s scene question', () => {
  it('is kept bounded, with its answered mark', () => {
    const { sceneFrame } = normaliseSidecar({ newTruths: [], stateChanges: [],
      sceneFrame: { ...BASE, question: `  ${Q}\n`, questionAnswered: true } });
    expect(sceneFrame).toMatchObject({ question: Q, questionAnswered: true });
    const long = normaliseSidecar({ sceneFrame: { ...BASE, question: 'x'.repeat(400) } }).sceneFrame;
    expect(long.question.length).toBeLessThanOrEqual(160);
    const none = normaliseSidecar({ sceneFrame: { ...BASE, question: 42, questionAnswered: 'yes' } }).sceneFrame;
    expect(none).not.toHaveProperty('question');
    expect(none).not.toHaveProperty('questionAnswered');
  });

  it('the narrator is asked for it, told to keep it, to cut forward when it is answered, and never to end the scene', () => {
    const text = appendSidecarInstruction({ mode: 'move_resolution' });
    expect(text).toContain('"question":  "Will Vance let them board?"');
    expect(text).toContain('Set it on the scene\'s first beat; afterwards copy it');
    expect(text).toContain('"questionAnswered": true and end the beat on a cut');
    expect(text).toContain('Never end the scene: the table ends');
    expect(appendSidecarInstruction({ mode: 'move_resolution', sceneFrameEnabled: false })).not.toContain('"question"');
  });
});

describe('issue #353 R2 — the frame keeps the question for the scene', () => {
  const state = () => ({ currentSceneId: 'sc-1', sceneTruths: [], sceneFrame: null });

  it('set on the first beat; a later snapshot that rewords it, or leaves it out, keeps it', () => {
    const cs = state();
    applySceneFrame({ ...BASE, question: Q }, cs, { narrationId: 'n1' });
    applySceneFrame({ ...BASE, question: 'Who sent the escort?' }, cs, { narrationId: 'n2' });
    expect(cs.sceneFrame.question).toBe(Q);
    applySceneFrame({ ...BASE }, cs, { narrationId: 'n3' });
    expect(cs.sceneFrame.question).toBe(Q);
    expect(cs.sceneFrame.questionAnswered).toBeUndefined();
  });

  it('a beat that answers it marks it; the next beat\'s question is the scene\'s; with none, the answered one stays marked', () => {
    const cs = state();
    applySceneFrame({ ...BASE, question: Q }, cs, { narrationId: 'n1' });
    applySceneFrame({ ...BASE, question: Q, questionAnswered: true }, cs, { narrationId: 'n2' });
    expect(cs.sceneFrame).toMatchObject({ question: Q, questionAnswered: true });
    applySceneFrame({ ...BASE }, cs, { narrationId: 'n3' });
    expect(cs.sceneFrame).toMatchObject({ question: Q, questionAnswered: true });
    applySceneFrame({ ...BASE, question: 'Can they reach the relay before the count ends?' }, cs, { narrationId: 'n4' });
    expect(cs.sceneFrame.question).toBe('Can they reach the relay before the count ends?');
    expect(cs.sceneFrame.questionAnswered).toBeUndefined();
  });

  it('a new scene starts with none of the old scene\'s', () => {
    const cs = state();
    applySceneFrame({ ...BASE, question: Q }, cs, { narrationId: 'n1' });
    cs.currentSceneId = 'sc-2';
    applySceneFrame({ ...BASE, question: 'Where is the relay?' }, cs, { narrationId: 'n2' });
    expect(cs.sceneFrame.question).toBe('Where is the relay?');
  });

  it('the X-Card on the answering beat puts the open question back', () => {
    const cs = state();
    applySceneFrame({ ...BASE, question: Q }, cs, { narrationId: 'n1' });
    applySceneFrame({ ...BASE, question: Q, questionAnswered: true }, cs, { narrationId: 'n2' });
    retractNarrations(cs, ['n2']);
    expect(cs.sceneFrame.question).toBe(Q);
    expect(cs.sceneFrame.questionAnswered).toBeUndefined();
  });

  it('the narrator reads it in SCENE FRAME — open, or answered with the instruction to move on', () => {
    const cs = state();
    applySceneFrame({ ...BASE, question: Q }, cs, { narrationId: 'n1' });
    expect(buildLedgerBlock(cs).frame).toContain(`  Question: ${Q}`);
    applySceneFrame({ ...BASE, question: Q, questionAnswered: true }, cs, { narrationId: 'n2' });
    expect(buildLedgerBlock(cs).frame).toContain(`  Question (answered): ${Q} — the scene has moved past it; set the question it turns on now.`);
  });
});

describe('issue #353 R2 — on the table: kept across beats, gone when the scene ends, never ended by a narration', () => {
  let table;
  let restore;
  beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
  afterAll(() => table?.teardown());
  beforeEach(async () => { restore = await resetSkeletonTable(table, {}, { sceneFrame: null }); });
  afterEach(() => restore?.());

  const stored = () => gmOf(table).run(() => game.settings.get(MODULE_ID, 'campaignState'));
  const frameReply = (frame) => () => ({ prose: 'The escort waits.', sidecar: { newTruths: [], stateChanges: [], sceneFrame: { ...BASE, ...frame } } });

  it('the first beat sets it, the next keeps it and is shown it; an answer cuts forward but the scene stays', async () => {
    table.replies = frameReply({ question: Q });
    await narrateMoveOn(table, moveResolution());
    expect(stored().sceneFrame.question).toBe(Q);

    table.replies = frameReply({ question: 'What does the escort want?' });
    await narrateMoveOn(table, moveResolution({ outcome: 'weak_hit', outcomeLabel: 'Weak Hit' }));
    expect(stored().sceneFrame.question).toBe(Q);
    expect(narrationCallsOf(table).at(-1).system).toContain(`  Question: ${Q}`);

    table.replies = frameReply({ question: Q, questionAnswered: true });
    await narrateMoveOn(table, moveResolution({ outcome: 'strong_hit', outcomeLabel: 'Strong Hit' }));
    expect(stored().sceneFrame).toMatchObject({ question: Q, questionAnswered: true });
    expect(stored().currentSceneId).toBe('sc-1');
  }, 60_000);

  it('!scene end takes it with the frame; the next scene starts without it', async () => {
    table.replies = frameReply({ question: Q });
    await narrateMoveOn(table, moveResolution());
    expect(stored().sceneFrame.question).toBe(Q);
    await gmOf(table).chat('!scene end');
    await table.settle(); await table.drain();
    expect(stored().currentSceneId ?? null).toBeNull();
    expect(stored().sceneFrame ?? null).toBeNull();
  }, 60_000);
});
