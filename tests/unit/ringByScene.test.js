/**
 * STARFORGED COMPANION
 * tests/unit/ringByScene.test.js
 *
 * Overhaul 2, slice 5 (§8) — the ring turns with the scene. A beat of play's
 * narration (a move's, a round's, an oracle follow-up's, a paced line's) is
 * told its own scene's cards — by the `sceneId` the stamp hook gave them —
 * and before them, while there is room, the last two told before the scene
 * began, headed by why the scene before ended; the session summary, made at
 * every scene end, tells what came earlier. The reader's recent scene is the
 * scene's last three entries, with fewer the one before, headed. An `@scene`
 * question (a recall wants the session), the summary off, or a session whose
 * cards are unstamped read the session's ring, as before.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { MODULE_ID, resetSkeletonTable, gmOf, onGm, narrationCallsOf } from '../helpers/skeletonTable.js';

const BLEAKHOLD = 'set-bleak';
const HOLLOW = 'set-hollow';
const HEAD = 'THE SCENE BEFORE — it ended when the characters are at Hollow Spire. How it ended:';

describe('overhaul 2 §8 — the ring turns with the scene', () => {
  let table;
  let restore;
  let n = 0;
  beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
  afterAll(() => table?.teardown());
  async function setUp(settings = {}) {
    restore = await resetSkeletonTable(table, { narratorSessionSummary: true, ...settings }, {
      currentSceneId: null, sceneFrame: null, sceneState: { bySubject: {}, sceneId: null },
      currentLocationId: BLEAKHOLD, currentLocationType: 'settlement', settlementIds: [BLEAKHOLD, HOLLOW],
    });
    for (const [id, name] of [[BLEAKHOLD, 'Bleakhold Station'], [HOLLOW, 'Hollow Spire']]) {
      table.addActor({ id, type: 'location', name,
        flags: { [MODULE_ID]: { entityType: 'settlement', settlement: { _id: `rec-${id}`, name } } } });
    }
    n = 0;
    table.replies = () => {
      n += 1;
      return { prose: `Prose number ${n} of the story.`, sidecar: { newTruths: [], stateChanges: [],
        sceneFrame: { location: 'the market deck', present: ['Kira'], situation: 'Kira walks' } } };
    };
  }
  beforeEach(async () => { await setUp(); });
  afterEach(() => restore?.());

  const stored = () => gmOf(table).run(() => game.settings.get(MODULE_ID, 'campaignState'));
  const lastUser = () => narrationCallsOf(table).at(-1).userText ?? '';
  const ringOf = (text) => (text.split('## RECENT SCENE\n\n')[1] ?? '').split('\n\n## ')[0];
  async function narrateLine(line) {
    const { narratePacedInput } = await gmOf(table).import('../../src/narration/narrator.js');
    return onGm(table, () => narratePacedInput(line,
      foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')), { speakerActorId: 'pc-kira' }));
  }
  async function placeAt(id) {
    await gmOf(table).run(async () => {
      const cs = foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState'));
      await game.settings.set(MODULE_ID, 'campaignState', { ...cs, currentLocationId: id, currentLocationType: 'settlement' });
    });
    await table.settle();
  }
  /** Three beats at Bleakhold, then the characters are at Hollow Spire. */
  async function aSceneThenATurn() {
    for (const line of ['I walk the deck.', 'I look at the stalls.', 'I buy a drink.']) await narrateLine(line);
    const first = stored().currentSceneId;
    await placeAt(HOLLOW);
    return first;
  }

  it('the new scene\'s first beat sees the last two told before it, headed; its third, its own two and those two', async () => {
    const first = await aSceneThenATurn();
    await narrateLine('I step off at the Spire.');
    expect(stored().currentSceneId).not.toBe(first);
    let ring = ringOf(lastUser());
    expect(ring.startsWith(HEAD)).toBe(true);
    expect(ring).toContain('Prose number 2 of the story.');
    expect(ring).toContain('Prose number 3 of the story.');
    expect(ring).not.toContain('Prose number 1 of the story.');
    expect(ring).not.toContain('THIS SCENE:');

    await narrateLine('I find a bench.');
    await narrateLine('I watch the crowd.');
    ring = ringOf(lastUser());
    expect(ring.startsWith(HEAD)).toBe(true);
    const [before, own] = ring.split('\n\nTHIS SCENE:\n\n');
    expect(before).toContain('Prose number 2 of the story.');
    expect(before).toContain('Prose number 3 of the story.');
    expect(own).toContain('Prose number 4 of the story.');
    expect(own).toContain('Prose number 5 of the story.');
    expect(ring).not.toContain('Prose number 1 of the story.');
  }, 120_000);

  it('the reader\'s recent scene: the scene\'s own entries, with fewer than three the one before, headed', async () => {
    await aSceneThenATurn();
    await narrateLine('I step off at the Spire.');
    const { getRecentSceneForReading } = await gmOf(table).import('../../src/narration/narrator.js');
    const read = gmOf(table).run(() => getRecentSceneForReading(stored().currentSessionId, stored()));
    expect(read.startsWith(HEAD)).toBe(true);
    expect(read).toContain('Prose number 3 of the story.');
    expect(read).not.toContain('Prose number 2 of the story.');
    expect(read.split('THIS SCENE:')[1]).toContain('Prose number 4 of the story.');
    // Without the scene it is read in, the session's.
    const session = gmOf(table).run(() => getRecentSceneForReading(stored().currentSessionId));
    expect(session).not.toContain('THE SCENE BEFORE');
    expect(session).toContain('Prose number 2 of the story.');
  }, 120_000);

  it('an @scene question reads the session\'s ring', async () => {
    await aSceneThenATurn();
    await narrateLine('I step off at the Spire.');
    const { interrogateScene } = await gmOf(table).import('../../src/narration/narrator.js');
    table.replies = () => ({ prose: 'You are on the Spire docks.', sidecar: {} });
    await onGm(table, () => interrogateScene('Where am I?', foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState'))));
    const asked = lastUser();
    // The session's last cards (sceneContextCards, 3), plain — no scene's heading.
    expect(asked).not.toContain('THE SCENE BEFORE');
    expect(asked).not.toContain('THIS SCENE:');
    expect(asked).toContain('Prose number 2 of the story.');
    expect(asked).toContain('Prose number 4 of the story.');
  }, 120_000);

  it('cards from before the stamp: the session\'s ring', async () => {
    await aSceneThenATurn();
    gmOf(table).run(() => { for (const m of game.messages.contents) delete m.flags?.[MODULE_ID]?.sceneId; });
    await narrateLine('I step off at the Spire.');
    const ring = ringOf(lastUser());
    expect(ring).not.toContain('THE SCENE BEFORE');
    expect(ring).toContain('Prose number 1 of the story.');
  }, 120_000);
});

describe('overhaul 2 §8 — with the session summary off, the ring is the session\'s', () => {
  let table;
  let restore;
  beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
  afterAll(() => table?.teardown());
  beforeEach(async () => {
    restore = await resetSkeletonTable(table, { narratorSessionSummary: false }, {
      currentSceneId: null, sceneFrame: null, sceneState: { bySubject: {}, sceneId: null },
      currentLocationId: BLEAKHOLD, currentLocationType: 'settlement',
    });
  });
  afterEach(() => restore?.());

  it('a turn leaves the ring as it was', async () => {
    let n = 0;
    table.replies = () => {
      n += 1;
      return { prose: `Prose number ${n} of the story.`, sidecar: { newTruths: [], stateChanges: [],
        sceneFrame: { location: 'the market deck', present: ['Kira'], situation: 'Kira walks' } } };
    };
    const { narratePacedInput } = await gmOf(table).import('../../src/narration/narrator.js');
    const line = (text) => onGm(table, () => narratePacedInput(text,
      foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')), { speakerActorId: 'pc-kira' }));
    for (const text of ['I walk the deck.', 'I look at the stalls.', 'I buy a drink.']) await line(text);
    const first = gmOf(table).run(() => game.settings.get(MODULE_ID, 'campaignState')).currentSceneId;
    await gmOf(table).run(async () => {
      const cs = foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState'));
      await game.settings.set(MODULE_ID, 'campaignState', { ...cs, currentLocationId: HOLLOW, currentLocationType: 'settlement' });
    });
    await table.settle();
    await line('I step off at the Spire.');
    expect(gmOf(table).run(() => game.settings.get(MODULE_ID, 'campaignState')).currentSceneId).not.toBe(first);
    const user = narrationCallsOf(table).at(-1).userText ?? '';
    expect(user).not.toContain('THE SCENE BEFORE');
    expect(user).toContain('Prose number 1 of the story.');
  }, 120_000);
});
