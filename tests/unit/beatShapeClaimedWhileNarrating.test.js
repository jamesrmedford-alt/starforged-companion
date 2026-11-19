/**
 * STARFORGED COMPANION
 * tests/unit/beatShapeClaimedWhileNarrating.test.js
 *
 * Issue #364 BEAT-SHAPE-SIMULTANEOUS (left open by
 * BEAT-SHAPE-AFTER-DELETED-CARD). Each beat is given the shape after the
 * newest written beat's, read off that beat's card. A card is posted only
 * once its narration is written, so two beats narrated at the same moment —
 * two players' lines, a move beside a paced line, a round beside either —
 * both read the same last card and were both told to build the beat the same
 * way: two cards in a row with one shape, which the shapes exist to prevent.
 *
 * A beat's narration now claims its shape when it picks it, for as long as it
 * is being written, and a beat picked meanwhile steps past the claimed ones.
 * The claim is this client's own, in memory, and is released when the
 * narration ends however it ends — a written card, a fallback card, a throw —
 * so nothing a failed narration picked skews the beat after it. No "last
 * shape" is stored: with nothing being written the next shape is read from
 * the cards, as before.
 *
 * Production path: the real narratePacedInput / narrateResolution /
 * narrateRound build the prompt (buildNarratorExtras → beatVariety), call the
 * (mocked, here held) API and post the beat's card; each shape is read off
 * the prompt its request was sent.
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const sent = [];
const api = { hold: null, failNext: 0 };
vi.mock('../../src/api-proxy.js', () => ({
  apiPost: vi.fn(async (_url, _headers, body) => {
    const model = String(body?.model ?? '');
    if (model.includes('haiku')) return { content: [{ type: 'text', text: '{}' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } };
    sent.push(JSON.stringify(body?.system ?? ''));
    const fail = api.failNext > 0;
    if (fail) api.failNext -= 1;
    if (api.hold) await api.hold.promise;
    if (fail) throw new Error('boom');
    const text = 'The deck hums underfoot.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
    return { content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } };
  }),
}));
vi.mock('../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});
// The prompt builder, real — except that a test can make its next build throw.
const promptBuild = { throwNext: false };
vi.mock('../../src/narration/narratorPrompt.js', async () => {
  const actual = await vi.importActual('../../src/narration/narratorPrompt.js');
  return {
    ...actual,
    buildNarratorSystemPrompt: (...args) => {
      if (promptBuild.throwNext) { promptBuild.throwNext = false; throw new Error('the prompt could not be built'); }
      return actual.buildNarratorSystemPrompt(...args);
    },
  };
});

import { narratePacedInput, narrateResolution, narrateRound, _resetDeletedMessagesForTests } from '../../src/narration/narrator.js';
import { BEAT_SHAPES, beatShapeAfter } from '../../src/narration/proseVariety.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const state = () => game.settings.get(MODULE_ID, 'campaignState');
const flagsOf = (m) => m?.flags?.[MODULE_ID] ?? {};

/** The shape a narration request was told to use, by its hint in the prompt. */
function shapeOf(system) {
  const shape = BEAT_SHAPES.find(s => system.includes(JSON.stringify(`Shape: ${s.hint}`).slice(1, -1)));
  expect(shape, 'the request names a shape').toBeTruthy();
  return shape.id;
}
const shapesSent = (from = 0) => sent.slice(from).map(shapeOf);

let clock = Date.UTC(2026, 10, 19, 20, 0, 0);
const tick = () => { clock += 1000; vi.setSystemTime(clock); };

function deferred() {
  let release;
  const promise = new Promise(resolve => { release = resolve; });
  return { promise, release };
}

const paced = (line) => { tick(); return narratePacedInput(line, state(), {}); };
const move = (id, outcome = 'weak_hit') => {
  tick();
  return narrateResolution({ _id: id, moveId: 'face_danger', moveName: 'Face Danger', outcome, outcomeLabel: outcome, playerNarration: 'I jump.' }, state(), {});
};
const round = (id) => {
  tick();
  return narrateRound({ campaignState: state(), round: {
    id, number: 1, sessionId: 'sess-1', acting: ['gm-1'],
    entries: { 'gm-1': { userId: 'gm-1', actorId: 'a-actor', actorName: 'Isaac Sutton', userName: 'GM', text: 'I hold the line.' } },
  } });
};

/**
 * Narrations begun at the same moment: each is started, the API holds every
 * request until all of them are waiting on it, then answers them all.
 * Returns the shapes their requests were told to use, in the order sent.
 */
async function narratedTogether(starts) {
  const from = sent.length;
  api.hold = deferred();
  const running = starts.map(start => start());
  await vi.waitFor(() => expect(sent.length - from, 'every narration is waiting on its reply').toBe(starts.length));
  const shapes = shapesSent(from);
  api.hold.release();
  api.hold = null;
  await Promise.allSettled(running);
  return shapes;
}

/** One beat narrated alone: the shape its request was told to use. */
async function narratedAlone(start = () => paced('I go on.')) {
  const from = sent.length;
  await start();
  expect(sent.length - from, 'one request').toBe(1);
  return shapeOf(sent[from]);
}

const beatCards = () => ChatMessage._created.filter(m => typeof flagsOf(m).beatShape === 'string');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  sent.length = 0;
  api.hold = null;
  api.failNext = 0;
  promptBuild.throwNext = false;
  ChatMessage._reset();
  _resetDeletedMessagesForTests();
  game.actors._reset();
  // The chat log is the cards the narrator posted.
  global.game.messages = { get contents() { return ChatMessage._created; } };
  global.game.users = Object.assign([{ id: 'gm-1', isGM: true, active: true }], {
    get: (id) => (id === 'gm-1' ? { id: 'gm-1', isGM: true, active: true } : null),
  });
  global.game.user = global.game.users[0];
  const store = game.settings._store;
  store.clear();
  store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
  store.set(`${MODULE_ID}.chronicleAutoEntry`, false);
  store.set(`${MODULE_ID}.worldSnapshot`, false);
  store.set(KEY, {
    ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1,
    currentSceneId: 'sc-1', sceneTruths: [],
  });
  game.actors._set('a-actor', makeTestActor({ id: 'a-actor', name: 'Isaac Sutton' }));
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('issue #364 BEAT-SHAPE-SIMULTANEOUS — beats narrated at the same moment are not given the same shape', () => {
  it('two paced lines at once: two shapes, and neither is the last written beat\'s', async () => {
    const last = await narratedAlone(() => paced('I check the seals.'));

    const [a, b] = await narratedTogether([() => paced('I wait by the airlock.'), () => paced('I watch the door.')]);

    expect(b, 'the second line read the same last card as the first').not.toBe(a);
    expect([a, b]).not.toContain(last);
    // Each card carries the shape its own narration was told to use.
    expect(beatCards().map(m => flagsOf(m).beatShape).sort()).toEqual([last, a, b].sort());
  });

  it('a move beside a paced line, and a round beside a move: every caller that picks a shape claims it', async () => {
    const [m1, p1] = await narratedTogether([() => move('res-1'), () => paced('I wait.')]);
    expect(p1).not.toBe(m1);

    const [r2, m2] = await narratedTogether([() => round('round-1'), () => move('res-2')]);
    expect(m2).not.toBe(r2);

    const [p3, r3] = await narratedTogether([() => paced('I listen.'), () => round('round-2')]);
    expect(r3).not.toBe(p3);
  });

  it('three at once: three shapes', async () => {
    const shapes = await narratedTogether([() => paced('One.'), () => move('res-3'), () => paced('Three.')]);
    expect(new Set(shapes).size).toBe(3);
  });

  it('a beat begun while another is still being written, after a third has posted: it shares a shape with neither', async () => {
    const from = sent.length;
    api.hold = deferred();
    const slow = paced('I work the lock.');                         // held: still being written
    await vi.waitFor(() => expect(sent.length - from).toBe(1));
    const slowShape = shapeOf(sent[from]);
    const held = api.hold;
    api.hold = null;
    const quick = await narratedAlone(() => paced('I keep watch.'));   // written and posted meanwhile
    expect(quick).not.toBe(slowShape);

    const next = await narratedAlone(() => paced('I count the seconds.'));

    expect(next, 'not the card just posted').not.toBe(quick);
    expect(next, 'not the beat still being written').not.toBe(slowShape);
    held.release();
    await slow;
  });
});

describe('issue #364 BEAT-SHAPE-SIMULTANEOUS — a claim ends with its narration, however it ends', () => {
  it('control: beats narrated one after another follow the cycle, as before', async () => {
    const a = await narratedAlone();
    const b = await narratedAlone();
    const c = await narratedAlone(() => move('res-4'));
    expect(b).toBe(beatShapeAfter(a).id);
    expect(c).toBe(beatShapeAfter(b).id);
  });

  it('after two beats written together, the next follows the newest card', async () => {
    await narratedTogether([() => paced('One.'), () => paced('Two.')]);
    const newest = flagsOf(beatCards().at(-1)).beatShape;

    expect(await narratedAlone()).toBe(beatShapeAfter(newest).id);
  });

  it('a narration that fails beside one that is written leaves nothing claimed: the next beat follows the written one', async () => {
    const last = await narratedAlone();
    api.failNext = 4;   // the move's call and its retry, whichever order the two requests land in
    const from = sent.length;
    api.hold = deferred();
    const failing = move('res-5', 'miss');
    await vi.waitFor(() => expect(sent.length - from).toBe(1));
    api.hold.release();
    api.hold = null;
    await failing;
    api.failNext = 0;
    expect(ChatMessage._created.some(m => flagsOf(m).narrationFallback), 'the fallback card posted').toBe(true);
    expect(beatCards(), 'only the first beat was written').toHaveLength(1);

    // The failed narration had picked the shape after `last`; nothing was written in it.
    expect(await narratedAlone()).toBe(beatShapeAfter(last).id);
  });

  it('a narration that throws before its call leaves nothing claimed', async () => {
    const last = await narratedAlone();
    promptBuild.throwNext = true;
    await expect(move('res-6')).rejects.toThrow('the prompt could not be built');

    expect(await narratedAlone()).toBe(beatShapeAfter(last).id);
    // …and with every narration ended, any number of beats follow the cycle.
    const more = [await narratedAlone(), await narratedAlone(), await narratedAlone(), await narratedAlone()];
    expect(new Set(more).size).toBe(4);
  });

  it('a round whose narration fails leaves nothing claimed', async () => {
    const last = await narratedAlone();
    api.failNext = 2;
    const told = await round('round-3');
    api.failNext = 0;
    expect(told?.posted).toBe('fallback');

    expect(await narratedAlone()).toBe(beatShapeAfter(last).id);
  });

  it('a paced line whose narration fails leaves nothing claimed', async () => {
    const last = await narratedAlone();
    api.failNext = 2;
    expect(await paced('I try the hatch.')).toBeNull();
    api.failNext = 0;

    expect(await narratedAlone()).toBe(beatShapeAfter(last).id);
  });

  it('nothing is stored: no shape reaches campaignState', async () => {
    await narratedTogether([() => paced('One.'), () => move('res-7')]);
    expect(JSON.stringify(state())).not.toMatch(/beatShape|"shape"/i);
  });
});
