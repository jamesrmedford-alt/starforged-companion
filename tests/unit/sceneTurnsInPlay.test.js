/**
 * STARFORGED COMPANION
 * tests/unit/sceneTurnsInPlay.test.js
 *
 * Overhaul 2, slice 2 (§4.3–4.6) — scenes that begin and end, on the
 * simulated table: the real narrations, the real scene lifecycle, the stores
 * written as their writers write them. The scene turns at the start of a
 * beat's narration, never on the narration's word:
 *
 *   - a change of place (as `!at` writes it) — the next line is narrated in a
 *     new scene, told so at the head of ACTIVE SCENE, recorded with its cause;
 *   - a fight begun (its track added) — the next beat opens the fight's scene;
 *     the move that ends it is narrated in that scene, and the next line in a
 *     new one ("the fight with … is over");
 *   - time the player's line skips;
 *   - an `@scene` question never turns one; a second GM's narration neither;
 *   - the anchor survives a reload (it is world state); an X-Card on a scene's
 *     first narration leaves the turn standing;
 *   - a turn carries the frame's cast, what play let go and the spotlight's
 *     last actor into the new scene.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import {
  MODULE_ID, resetSkeletonTable, gmOf, onGm, moveResolution, narrateMoveOn, narrationCallsOf, playXCard, patSpeaks,
} from '../helpers/skeletonTable.js';

const BLEAKHOLD = 'set-bleak';
const HOLLOW = 'set-hollow';

describe('overhaul 2 §4.3 — on the table: a scene turns when the stores say so', () => {
  let table;
  let restore;
  beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
  afterAll(() => table?.teardown());
  beforeEach(async () => {
    restore = await resetSkeletonTable(table, {}, {
      currentSceneId: null, sceneFrame: null, sceneState: { bySubject: {}, sceneId: null },
      currentLocationId: BLEAKHOLD, currentLocationType: 'settlement',
    });
  });
  afterEach(() => restore?.());

  const stored = () => gmOf(table).run(() => game.settings.get(MODULE_ID, 'campaignState'));
  const lastSystem = () => narrationCallsOf(table).at(-1).system;
  const lastUser = () => narrationCallsOf(table).at(-1).userText ?? '';
  const reply = (frame = {}) => () => ({ prose: 'The dock lamps hum.', sidecar: { newTruths: [], stateChanges: [],
    sceneFrame: { location: 'the market deck', present: ['Kira', 'Tamsin Vey'], situation: 'Kira haggles', ...frame } } });
  async function narrateLine(line) {
    const { narratePacedInput } = await gmOf(table).import('../../src/narration/narrator.js');
    return onGm(table, () => narratePacedInput(line,
      foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')), { speakerActorId: 'pc-kira' }));
  }
  /** A world write, as `!at` and the Entities panel make it: the characters' place. */
  async function placeAt(id) {
    await gmOf(table).run(async () => {
      const cs = foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState'));
      await game.settings.set(MODULE_ID, 'campaignState', { ...cs, currentLocationId: id, currentLocationType: 'settlement' });
    });
    await table.settle();
  }
  async function addTrack(data) {
    const store = await gmOf(table).import('../../src/ui/progressTracks.js');
    const track = await gmOf(table).run(() => store.addProgressTrack({ rank: 'dangerous', ...data }));
    await table.settle();
    return track;
  }
  async function completeTrack(id) {
    const store = await gmOf(table).import('../../src/ui/progressTracks.js');
    await gmOf(table).run(() => store.completeProgressTrack(id));
    await table.settle();
  }

  it('a scene begun here keeps its anchor; nothing changed, nothing turns', async () => {
    table.replies = reply();
    await narrateLine('I walk the market deck.');
    const first = stored();
    expect(first.currentSceneId).toBeTruthy();
    expect(first.sceneBegan).toMatchObject({ sceneId: first.currentSceneId, cause: 'first', place: { id: BLEAKHOLD } });
    await narrateLine('I look over the stalls.');
    expect(stored().currentSceneId).toBe(first.currentSceneId);
    // The anchor is world state: a reload reads it back.
    expect(table.world.campaignState().sceneBegan).toMatchObject({ sceneId: first.currentSceneId });
  }, 60_000);

  it('a change of place: the next line is narrated in a new scene, told so, and the record says why', async () => {
    table.replies = reply();
    await narrateLine('I walk the market deck.');
    const before = stored().currentSceneId;
    await placeAt(HOLLOW);

    table.replies = reply({ location: 'the Hollow Spire docks' });
    await narrateLine('I step off at the docks.');
    const after = stored();
    expect(after.currentSceneId).not.toBe(before);
    expect(after.sceneBegan).toMatchObject({ sceneId: after.currentSceneId, cause: 'place', place: { id: HOLLOW } });
    expect(after.sceneBegan.what).toMatch(/^the characters are at /);
    // Told so, in overhaul 4's block: TELL [scene].
    expect(lastUser()).toContain(`- [scene] This beat opens a new scene: ${after.sceneBegan.what}.`);
    expect(after.sceneFrame).toMatchObject({ location: 'the Hollow Spire docks', sceneId: after.currentSceneId });

    // The beat after is no opening.
    table.replies = reply({ location: 'the Hollow Spire docks' });
    await narrateLine('I find a bench.');
    expect(lastUser()).not.toContain('[scene]');
    expect(stored().currentSceneId).toBe(after.currentSceneId);
  }, 60_000);

  it('an @scene question after the place changed turns nothing', async () => {
    table.replies = reply();
    await narrateLine('I walk the market deck.');
    const before = stored().currentSceneId;
    await placeAt(HOLLOW);
    const { interrogateScene } = await gmOf(table).import('../../src/narration/narrator.js');
    table.replies = () => ({ prose: 'You are on the Hollow Spire docks.', sidecar: {} });
    await onGm(table, () => interrogateScene('Where am I?', foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState'))));
    expect(stored().currentSceneId).toBe(before);
  }, 60_000);

  it('time the player\'s line skips turns the scene before its narration', async () => {
    table.replies = reply();
    await narrateLine('I walk the market deck.');
    const before = stored().currentSceneId;
    await narrateLine('I rest aboard until the next morning.');
    expect(stored().currentSceneId).not.toBe(before);
    expect(stored().sceneBegan).toMatchObject({ cause: 'time', what: 'time has passed: "I rest aboard until the next morning."' });
  }, 60_000);

  it('a fight: begun, the next beat opens its scene; the blow that ends it is its last beat; the next line is a new scene', async () => {
    table.replies = reply();
    await narrateLine('I walk the market deck.');
    const market = stored().currentSceneId;

    const fight = await addTrack({ label: 'The Cinder Wren', type: 'combat' });
    table.replies = reply({ location: 'the docking ring' });
    await narrateLine('I draw on the Cinder Wren\'s pilot.');
    const fightScene = stored().currentSceneId;
    expect(fightScene).not.toBe(market);
    expect(stored().sceneBegan).toMatchObject({ cause: 'fight', what: 'a fight has begun: The Cinder Wren' });

    // Take Decisive Action ends it: the pipeline completes the track and names it on the resolution.
    await completeTrack(fight.id);
    await narrateMoveOn(table, moveResolution({ moveId: 'take_decisive_action', moveName: 'Take Decisive Action',
      outcome: 'strong_hit', outcomeLabel: 'Strong Hit', playerNarration: 'I end it with one shot.', endingTrackIds: [fight.id] }));
    expect(stored().currentSceneId).toBe(fightScene);

    await narrateLine('I holster the pistol.');
    expect(stored().currentSceneId).not.toBe(fightScene);
    expect(stored().sceneBegan).toMatchObject({ cause: 'fight', what: 'the fight with The Cinder Wren is over' });
  }, 90_000);

  it('a turn carries the cast, what play let go and the spotlight\'s last actor', async () => {
    table.replies = reply();
    await narrateLine('I walk the market deck.');
    // What play let go, and who acted last, as the scene's own writers leave them.
    await gmOf(table).run(async () => {
      const cs = foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState'));
      cs.sceneFrame = { ...cs.sceneFrame, letGo: [{ text: 'Who is hailing the ship?', stems: ['hail', 'ship'] }] };
      cs.spotlight = { ...cs.spotlight, lastActorId: 'pc-kira' };
      await game.settings.set(MODULE_ID, 'campaignState', cs);
    });
    await table.settle();
    await placeAt(HOLLOW);
    let carried = null;
    table.replies = () => {
      carried = gmOf(table).run(() => game.settings.get(MODULE_ID, 'campaignState'));
      return reply({ location: 'the Hollow Spire docks', present: ['Kira'] })();
    };
    await narrateLine('I step off at the docks.');
    // The new scene's first frame, before its narration wrote its own.
    expect(carried.sceneFrame).toMatchObject({ present: ['Kira', 'Tamsin Vey'], letGo: [{ text: 'Who is hailing the ship?' }] });
    expect(carried.spotlight.lastActorId).toBe('pc-kira');
    expect(lastSystem()).toContain('"Who is hailing the ship?"');
    expect(lastUser()).toContain('- [letgo] Play let this go: "Who is hailing the ship?".');
    // The narration's frame keeps the let-go list in its scene.
    expect(stored().sceneFrame.letGo.map(e => e.text)).toEqual(['Who is hailing the ship?']);
  }, 60_000);

  it('the X-Card on a new scene\'s first narration leaves the turn standing', async () => {
    table.replies = reply();
    await narrateLine('I walk the market deck.');
    await placeAt(HOLLOW);
    await patSpeaks(table);
    table.replies = reply({ location: 'the Hollow Spire docks' });
    await narrateLine('I step off at the docks.');
    const turned = stored().currentSceneId;
    await playXCard(table);
    expect(stored().currentSceneId).toBe(turned);
    expect(stored().sceneBegan).toMatchObject({ sceneId: turned, cause: 'place' });
  }, 60_000);
});

describe('overhaul 2 §4.3 — only the canonical GM turns a scene', () => {
  let table;
  let restore;
  beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.GM2, USERS.P1] }); }, 30_000);
  afterAll(() => table?.teardown());
  beforeEach(async () => {
    restore = await resetSkeletonTable(table, {}, {
      currentSceneId: 'sc-1', currentLocationId: HOLLOW, currentLocationType: 'settlement',
      sceneBegan: { sceneId: 'sc-1', at: 1, cause: 'first', what: '', place: { id: BLEAKHOLD, type: 'settlement', name: 'Bleakhold' },
        ship: null, tracks: { combat: [], expedition: [], scene_challenge: [] } },
    });
    await table.setClaudeKey('gm-2', 'sk-ant-test');
  });
  afterEach(() => restore?.());

  it('the second GM\'s narration leaves the scene as it is; the canonical GM\'s turns it', async () => {
    const { narratePacedInput } = await table.client('gm-2').import('../../src/narration/narrator.js');
    table.replies = () => ({ prose: 'The docks creak.', sidecar: { newTruths: [], stateChanges: [] } });
    await table.client('gm-2').run(() => narratePacedInput('I look around.',
      foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')), { speakerActorId: 'pc-kira' }));
    await table.settle();
    await table.drain();
    expect(table.world.campaignState().currentSceneId).toBe('sc-1');

    const gm = gmOf(table);
    const { narratePacedInput: onCanonical } = await gm.import('../../src/narration/narrator.js');
    await onGm(table, () => onCanonical('I look around again.',
      foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')), { speakerActorId: 'pc-kira' }));
    expect(table.world.campaignState().currentSceneId).not.toBe('sc-1');
    expect(table.world.campaignState().sceneBegan).toMatchObject({ cause: 'place' });
  }, 60_000);
});
