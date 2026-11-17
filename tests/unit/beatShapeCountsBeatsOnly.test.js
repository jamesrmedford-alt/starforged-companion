/**
 * STARFORGED COMPANION
 * tests/unit/beatShapeCountsBeatsOnly.test.js
 *
 * Issue #362 AC72 BEAT-SHAPE-REPEATS. Issue #354 P2-27 gives each beat (a
 * move, a paced line, a round) a "shape", picked "by its place in the
 * session, so two in a row never share one" (decisions.md; proseVariety.js
 * pickBeatShape). The index was the count of ALL the session's narrator
 * cards (narrator.js beatVariety over sessionNarratorCards — @scene answers,
 * oracle follow-ups, vignettes and published reflections included), stepped
 * by 2 over five shapes: with four other narrator cards between two beats the
 * cycle came back round to the same shape, and a card taken out of the count
 * (deleted, or struck by a Burn / Improve) gave the next beat the shape of the
 * one before it.
 *
 * The index is now the session's beat cards — every one it posted, a struck,
 * X-Carded or unnarrated one included, since they stay in chat. Production
 * path: buildNarratorExtras, as every beat mode builds its extras.
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});

import { buildNarratorExtras } from '../../src/narration/narrator.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;

const card = (text, extra = {}) => ({
  flags: { [MODULE_ID]: { narratorCard: true, sessionId: 'sess-1', narrationText: text, ...extra } },
});
/** A paced line's narration card — a beat. */
const pacedBeat = (text) => card(text, { pacedNarrative: true, narrationCard: true, playerText: 'I wait.' });
/** A move's narration card — a beat. */
const moveBeat = (text, extra = {}) => card(text, { narrationCard: true, moveId: 'face_danger', outcome: 'weak_hit', resolutionId: `r-${text}`, ...extra });
/** A Batch Mode round's card — a beat. */
const roundBeat = (text) => card(text, { narrationCard: true, roundId: `round-${text}`, roundNumber: 1, roundEntries: [] });
/** Narrator prose in the ring that is no beat: an @scene answer, an oracle follow-up, a clock vignette. */
const sceneAnswer = (text) => card(text, { sceneResponse: true, sceneText: text, sceneQuestion: 'What do I see?' });
const oracleFollowup = (text) => card(text, { oracleNarrationCard: true, narrationKind: 'oracle' });
const clockVignette = (text) => card(text, { clockVignetteCard: true, clockId: 'c1' });

const state = () => game.settings.get(MODULE_ID, 'campaignState');
const opts  = { playerNarration: 'I wait.', character: { actorId: 'a-actor', name: 'Isaac Sutton' } };
const shapeOfNextBeat = async (mode = 'paced_narrative') => (await buildNarratorExtras(mode, state(), opts)).beatShape.id;

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
  // The world snapshot is not what this test is about.
  game.settings._store.set(`${MODULE_ID}.worldSnapshot`, false);
});

describe('issue #362 AC72 — two beats in a row never share a shape', () => {
  it('control: back-to-back beats get different shapes', async () => {
    const first = await shapeOfNextBeat();
    game.messages.contents.push(pacedBeat('Beat one.'));
    expect(await shapeOfNextBeat()).not.toBe(first);
  });

  it('control: one, two or three @scene answers between two beats still leave them different', async () => {
    for (const between of [1, 2, 3]) {
      game.messages.contents = [];
      const first = await shapeOfNextBeat();
      game.messages.contents.push(pacedBeat('Beat one.'));
      for (let i = 0; i < between; i += 1) game.messages.contents.push(sceneAnswer(`Answer ${i}.`));
      expect(await shapeOfNextBeat(), `${between} between`).not.toBe(first);
    }
  });

  it('four @scene answers between two beats: the second beat is still shaped differently from the first', async () => {
    const first = await shapeOfNextBeat();
    game.messages.contents.push(pacedBeat('Beat one.'));
    for (let i = 0; i < 4; i += 1) game.messages.contents.push(sceneAnswer(`Answer ${i}.`));
    expect(await shapeOfNextBeat()).not.toBe(first);
  });

  it('four oracle follow-ups and vignettes between a move and the next move: different shapes', async () => {
    const first = await shapeOfNextBeat('move_resolution');
    game.messages.contents.push(moveBeat('Beat one.'));
    game.messages.contents.push(oracleFollowup('An answer.'), clockVignette('The clock turns.'), oracleFollowup('Another.'), sceneAnswer('More.'));
    expect(await shapeOfNextBeat('move_resolution')).not.toBe(first);
  });

  it('a GM deletes an earlier @scene answer between two beats: the next beat is still shaped differently', async () => {
    game.messages.contents.push(sceneAnswer('An early answer.'), pacedBeat('Beat zero.'));
    const previous = await shapeOfNextBeat();
    game.messages.contents.push(pacedBeat('Beat one.'));
    game.messages.contents.shift();   // the early card is deleted from chat
    expect(await shapeOfNextBeat()).not.toBe(previous);
  });

  it('a Burn strikes an earlier beat after another player\'s beat: the re-narration is shaped differently from that beat', async () => {
    game.messages.contents.push(moveBeat('Isaac\'s miss.'));
    const karthiks = await shapeOfNextBeat();
    game.messages.contents.push(pacedBeat('Karthik\'s line.'));
    // Isaac burns momentum: his narration is struck, and its re-narration is the next beat.
    game.messages.contents[0].flags[MODULE_ID].burnSuperseded = true;
    expect(await shapeOfNextBeat('move_resolution')).not.toBe(karthiks);
  });

  it('a round\'s card is a beat too: the beat after it is shaped differently', async () => {
    const roundShape = await shapeOfNextBeat('round_resolution');
    game.messages.contents.push(roundBeat('The round.'));
    for (let i = 0; i < 4; i += 1) game.messages.contents.push(sceneAnswer(`Answer ${i}.`));
    expect(await shapeOfNextBeat()).not.toBe(roundShape);
  });

  it('control: another session\'s beats do not count', async () => {
    const first = await shapeOfNextBeat();
    const other = pacedBeat('Last session.');
    other.flags[MODULE_ID].sessionId = 'sess-0';
    game.messages.contents.push(other);
    expect(await shapeOfNextBeat()).toBe(first);
  });

  it('control: the images the session used are still read from every narrator card', async () => {
    game.messages.contents.push(sceneAnswer('The hatch opens like a mouth that has forgotten how to scream.'));
    const extras = await buildNarratorExtras('paced_narrative', state(), opts);
    expect(extras.usedImages.join(' ')).toMatch(/like a mouth that has forgotten/);
  });
});
