/**
 * NARP-06 · BEAT-SHAPE-REPEATS (WRONG-DETAIL, cosmetic)
 *
 * Scenario: issue #354 P2-27 gives each beat (a move, a paced line, a round) a
 * "shape", picked "by its place in the session, so two in a row never share
 * one" (decisions.md; proseVariety.js pickBeatShape, "never the previous
 * beat's"). Between two beats the table asks the narrator four `@scene`
 * questions (or rolls four oracles the narrator follows up) — or a GM deletes
 * one earlier narrator card of the session.
 *
 * Correct: the second beat is built to a different shape than the beat before
 * it.
 *
 * Today: the shape's index is the count of ALL the session's narrator cards
 * (narrator.js beatVariety: `beatIndex: cards.length` over
 * sessionNarratorCards — `@scene` answers, oracle follow-ups, vignettes and
 * published reflections included), stepped by 2 over five shapes. Five cards
 * later the cycle is back where it was, so with four other narrator cards
 * between two beats — or the count taken down by one deleted card — both beats
 * get the same "Shape:" line.
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});

import { buildNarratorExtras } from '../../../src/narration/narrator.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;

const card = (text, extra = {}) => ({
  flags: { [MODULE_ID]: { narratorCard: true, sessionId: 'sess-1', narrationText: text, ...extra } },
});
/** A beat's own card (a paced line's narration). */
const beatCard = (text) => card(text, { pacedNarrative: true, playerText: 'I wait.' });
/** An `@scene` answer: narrator prose in the ring, but no beat. */
const sceneAnswer = (text) => card(text, { sceneResponse: true, sceneText: text, sceneQuestion: 'What do I see?' });

const state = () => game.settings.get(MODULE_ID, 'campaignState');
const opts  = { playerNarration: 'I wait.', character: { actorId: 'a-actor', name: 'Isaac Sutton' } };
const shapeOfNextBeat = async () => (await buildNarratorExtras('paced_narrative', state(), opts)).beatShape.id;

beforeEach(() => {
  vi.clearAllMocks();
  ChatMessage._reset();
  game.settings._store.clear();
  game.actors._reset();
  global.game.messages = { contents: [] };
  global.game.user = { id: 'gm-1', isGM: true };
  global.game.users = [{ id: 'gm-1', isGM: true, active: true }];
  game.actors._set('a-actor', makeTestActor({ id: 'a-actor', name: 'Isaac Sutton' }));
  game.settings._store.set(KEY, { currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1' });
  // The world snapshot is not what this probe is about.
  game.settings._store.set(`${MODULE_ID}.worldSnapshot`, false);
});

describe('NARP-06 — two beats in a row never share a shape', () => {
  it('control: back-to-back beats get different shapes', async () => {
    const first = await shapeOfNextBeat();
    game.messages.contents.push(beatCard('Beat one.'));
    expect(await shapeOfNextBeat()).not.toBe(first);
  });

  it('control: one, two or three @scene answers between two beats still leave them different', async () => {
    for (const between of [1, 2, 3]) {
      game.messages.contents = [];
      const first = await shapeOfNextBeat();
      game.messages.contents.push(beatCard('Beat one.'));
      for (let i = 0; i < between; i += 1) game.messages.contents.push(sceneAnswer(`Answer ${i}.`));
      expect(await shapeOfNextBeat(), `${between} between`).not.toBe(first);
    }
  });

  it('four @scene answers between two beats: the second beat is still shaped differently from the first', async () => {
    const first = await shapeOfNextBeat();
    game.messages.contents.push(beatCard('Beat one.'));
    for (let i = 0; i < 4; i += 1) game.messages.contents.push(sceneAnswer(`Answer ${i}.`));
    expect(await shapeOfNextBeat()).not.toBe(first);
  });

  it('a GM deletes an earlier narrator card between two beats: the next beat is still shaped differently', async () => {
    game.messages.contents.push(sceneAnswer('An early answer.'), beatCard('Beat zero.'));
    const previous = await shapeOfNextBeat();
    game.messages.contents.push(beatCard('Beat one.'));
    game.messages.contents.shift();   // the early card is deleted from chat
    expect(await shapeOfNextBeat()).not.toBe(previous);
  });
});
