/**
 * STARFORGED COMPANION
 * tests/unit/onePlace.test.js
 *
 * Overhaul 2, slice 4 (§6) — one place. Three stores, three facts: the
 * characters' recorded place (`currentLocationId`), where the ship is (its
 * position record), where in that place the narration has them (the frame's
 * Where — colour). No store restates another's; the scene block composes them.
 * On the simulated table, the real narrations and stores:
 *
 *   - the fourth live run's a34→a41: the ship docked at Bleakhold Station, a
 *     fight begun — the beat that opens the fight's scene is told NOT SO
 *     [place] (if the fight is the ship's, she is no longer docked: say where
 *     she is); the narration's frame says "the cockpit", the Ship line is the
 *     store's;
 *   - only a beat of play moves the ship: a bookend's, a clock vignette's and
 *     the oath scene's ship/position are dropped; the inciting incident's
 *     starting position stands;
 *   - "I take the lift down to Hollow Spire" with the frame naming it: the
 *     current location moves in the frame's persist, `place.arrived` is
 *     recorded `how: "line"`, the next beat turns the scene, the ship stays;
 *     the frame naming it with no line naming it moves nothing; a word of its
 *     name another place in the sector shares names nothing; a Set a Course's
 *     beat walks nowhere — its arrival is the move's own.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { MODULE_ID, resetSkeletonTable, gmOf, onGm, narrationCallsOf } from '../helpers/skeletonTable.js';
import { groundOf } from '../../src/factContinuity/provenance.js';

const BLEAKHOLD = 'set-bleak';
const HOLLOW = 'set-hollow';
const SPIRE_POINT = 'loc-spire-point';
const SHIP = 'ship-kob';
const DOCKED = { nearestSettlementId: BLEAKHOLD, sectorId: 'sec-1', updatedBy: 'at_command', freeText: '' };

describe('overhaul 2 §6 — one place, on the table', () => {
  let table;
  let restore;
  let ship;
  beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
  afterAll(() => table?.teardown());
  beforeEach(async () => {
    restore = await resetSkeletonTable(table, {}, {
      currentSceneId: null, sceneFrame: null, sceneState: { bySubject: {}, sceneId: null },
      currentLocationId: BLEAKHOLD, currentLocationType: 'settlement', activeSectorId: 'sec-1',
      settlementIds: [BLEAKHOLD, HOLLOW], locationIds: [], shipIds: [SHIP],
    });
    for (const [id, name] of [[BLEAKHOLD, 'Bleakhold Station'], [HOLLOW, 'Hollow Spire']]) {
      table.addActor({ id, type: 'location', name,
        flags: { [MODULE_ID]: { entityType: 'settlement', settlement: { _id: `rec-${id}`, name, sectorId: 'sec-1' } } } });
    }
    ship = table.addActor({ id: SHIP, type: 'starship', name: 'Kobayashi IV',
      flags: { [MODULE_ID]: { entityType: 'ship', ship: { _id: 'rec-kob', name: 'Kobayashi IV', isCommandVehicle: true, position: { ...DOCKED } } } } });
  });
  afterEach(() => restore?.());

  const stored = () => gmOf(table).run(() => game.settings.get(MODULE_ID, 'campaignState'));
  const lastSystem = () => narrationCallsOf(table).at(-1).system;
  const lastUser = () => narrationCallsOf(table).at(-1).userText ?? '';
  const reply = (frame = {}, stateChanges = []) => () => ({ prose: 'The ring lamps hum.', sidecar: { newTruths: [], stateChanges,
    sceneFrame: { location: 'Bleakhold Station docking ring', present: ['Kira'], situation: 'Kira waits at the lock', ...frame } } });
  async function narrateLine(line) {
    const { narratePacedInput } = await gmOf(table).import('../../src/narration/narrator.js');
    return onGm(table, () => narratePacedInput(line,
      foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')), { speakerActorId: 'pc-kira' }));
  }
  async function addTrack(data) {
    const store = await gmOf(table).import('../../src/ui/progressTracks.js');
    const track = await gmOf(table).run(() => store.addProgressTrack({ rank: 'dangerous', ...data }));
    await table.settle();
    return track;
  }
  /** The record's events written while `work` runs. */
  async function recorded(work) {
    const { onRecordWritten } = await gmOf(table).import('../../src/record/store.js');
    const events = [];
    const stop = onRecordWritten((_sessions, written) => events.push(...written));
    try { await work(); await table.drain(); } finally { stop(); }
    return events;
  }
  /** Apply a fact block on the GM as a narration of `mode` applies it. */
  async function applyBlock(sidecar, ctx) {
    const { applyNarratorSidecar } = await gmOf(table).import('../../src/narration/narrator.js');
    const raw = `The ring lamps hum.\n\`\`\`json\n${JSON.stringify(sidecar)}\n\`\`\``;
    await onGm(table, () => applyNarratorSidecar(raw, foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')),
      { moveId: null, matchedEntityIds: [], narrationId: `nar-${Math.random().toString(36).slice(2, 8)}`, ...ctx }));
  }
  const shipTo = (value) => ({ newTruths: [], stateChanges: [{ subject: 'ship', attribute: 'position', value }] });
  const shipLine = (value) => ({ newTruths: [], stateChanges: [{ subject: 'ship', attribute: 'position', value, from: 'line' }] });

  it('a34→a41: docked, then a fight begun — [place] is told; the frame says the cockpit, the Ship line is the store\'s', async () => {
    table.replies = reply({ location: 'Bleakhold Station docking ring, at the Kobayashi IV\'s lock' });
    await narrateLine('I wait at the lock for Tamsin.');
    expect(lastSystem()).toContain('  Ship:     Kobayashi IV docked at Bleakhold Station');

    await addTrack({ label: 'The Ashen Wake', type: 'combat' });
    table.replies = reply({ location: 'the cockpit', situation: 'The Ashen Wake has the initiative' });
    await narrateLine('I spin the Kobayashi IV to face her.');
    expect(stored().sceneBegan).toMatchObject({ cause: 'fight' });
    expect(lastUser()).toContain('- [place] Kobayashi IV is docked at Bleakhold Station by the ship\'s record. If this fight is the '
      + 'ship\'s, she is no longer docked: say where she is in your fact block (ship/position). If it is fought on foot, she stays docked.');

    // The next beat: the frame's Where is the narration's, the Ship line the record's; no [place] again.
    table.replies = reply({ location: 'the cockpit', situation: 'The Ashen Wake rakes the hull' });
    await narrateLine('I return fire.');
    expect(lastSystem()).toContain('  Where:    the cockpit — as the narration has it');
    expect(lastSystem()).toContain('  Ship:     Kobayashi IV docked at Bleakhold Station');
    expect(lastUser()).not.toContain('[place]');
  }, 90_000);

  it('control: a fight begun while the ship is under way is told no [place]', async () => {
    ship.flags[MODULE_ID].ship.position = { freeText: 'under way off Bleakhold\'s ring', updatedBy: 'narrator', sectorId: 'sec-1' };
    table.replies = reply();
    await narrateLine('I wait at the lock for Tamsin.');
    await addTrack({ label: 'The Ashen Wake', type: 'combat' });
    await narrateLine('I spin the Kobayashi IV to face her.');
    expect(stored().sceneBegan).toMatchObject({ cause: 'fight' });
    expect(lastUser()).toContain('[scene]');
    expect(lastUser()).not.toContain('[place]');
  }, 60_000);

  it('only a beat of play moves the ship: a bookend\'s, a clock vignette\'s and the oath scene\'s ship/position are dropped', async () => {
    table.replies = reply();
    await narrateLine('I wait at the lock.');
    for (const ctx of [{ mode: 'session_vignette', bookend: true }, { mode: 'clock_advance' }, { mode: 'vow_swearing' }]) {
      await applyBlock(shipTo('Hollow Spire'), ctx);
      expect(ship.flags[MODULE_ID].ship.position, ctx.mode).toMatchObject(DOCKED);
    }
    // A beat of play's colour does not (issue #388 #2: the fifth live long haul's a25 moved her on no tag)…
    await applyBlock(shipTo('Hollow Spire'), { mode: 'paced_narrative', ground: { line: 'I wait at the lock.', decided: '' } });
    expect(ship.flags[MODULE_ID].ship.position, 'colour').toMatchObject(DOCKED);
    // …its player's line does: a paced line's narration, the place in the line.
    await applyBlock(shipLine('Hollow Spire'), { mode: 'paced_narrative', ground: { line: 'I take the Kobayashi IV across to Hollow Spire.', decided: '' } });
    expect(ship.flags[MODULE_ID].ship.position).toMatchObject({ nearestSettlementId: HOLLOW });
  }, 60_000);

  it('the inciting incident\'s starting position stands (the premise\'s)', async () => {
    ship.flags[MODULE_ID].ship.position = null;
    await applyBlock(shipTo('Hollow Spire'), { mode: 'inciting_incident' });
    expect(ship.flags[MODULE_ID].ship.position).toMatchObject({ nearestSettlementId: HOLLOW });
  }, 60_000);

  it('"I take the lift down to Hollow Spire": the current location moves with the frame, recorded; the next beat turns; the ship stays', async () => {
    table.replies = reply();
    await narrateLine('I wait at the lock.');
    const first = stored().currentSceneId;

    table.replies = reply({ location: 'the Hollow Spire docks', situation: 'Kira steps out of the lift' });
    const events = await recorded(() => narrateLine('I take the lift down to Hollow Spire.'));
    expect(stored()).toMatchObject({ currentLocationId: HOLLOW, currentLocationType: 'settlement', currentSceneId: first });
    expect(events.filter(e => e.k === 'place.arrived')).toEqual([
      expect.objectContaining({ ref: expect.objectContaining({ place: HOLLOW }), d: expect.objectContaining({ how: 'line', name: 'Hollow Spire' }) }),
    ]);
    // The ship stays where its record says (D17).
    expect(ship.flags[MODULE_ID].ship.position).toMatchObject(DOCKED);

    table.replies = reply({ location: 'the Hollow Spire docks' });
    await narrateLine('I look for a drink.');
    expect(stored().currentSceneId).not.toBe(first);
    expect(stored().sceneBegan).toMatchObject({ cause: 'place', place: { id: HOLLOW } });
  }, 90_000);

  it('a telling word of its name the line names walks them too; a word another place in the sector shares does not', async () => {
    table.replies = reply();
    await narrateLine('I wait at the lock.');
    table.replies = reply({ location: 'the Hollow Spire docks' });
    await narrateLine('I ride the lift down to the Spire.');
    expect(stored().currentLocationId).toBe(HOLLOW);

    // A second place in the sector with "Spire" in its name: the word names neither.
    await gmOf(table).run(async () => {
      const cs = foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState'));
      await game.settings.set(MODULE_ID, 'campaignState', { ...cs, currentLocationId: BLEAKHOLD, locationIds: [SPIRE_POINT] });
    });
    table.addActor({ id: SPIRE_POINT, type: 'location', name: 'Spire Point',
      flags: { [MODULE_ID]: { entityType: 'location', location: { _id: 'rec-sp', name: 'Spire Point', sectorId: 'sec-1' } } } });
    await table.settle();
    table.replies = reply();
    await narrateLine('I wait at the lock again.');
    table.replies = reply({ location: 'the Hollow Spire docks' });
    await narrateLine('I ride the lift down to the Spire.');
    expect(stored().currentLocationId).toBe(BLEAKHOLD);
  }, 90_000);

  it('the frame naming another place that no line named moves nothing', async () => {
    table.replies = reply();
    await narrateLine('I wait at the lock.');
    const first = stored().currentSceneId;
    table.replies = reply({ location: 'the Hollow Spire docks' });
    const events = await recorded(() => narrateLine('I look over the stalls.'));
    expect(stored().currentLocationId).toBe(BLEAKHOLD);
    expect(events.filter(e => e.k === 'place.arrived')).toEqual([]);
    await narrateLine('I find a bench.');
    expect(stored().currentSceneId).toBe(first);
    // The scene block goes on saying where the table's record has them.
    expect(lastSystem()).toContain('  Place:    Bleakhold Station — where the characters are, by the table\'s record');
  }, 60_000);

  it('a Set a Course\'s beat walks nowhere: a miss\'s frame "en route to Hollow Spire" under a line naming it moves nothing', async () => {
    table.replies = reply();
    await narrateLine('I wait at the lock.');
    const block = { newTruths: [], stateChanges: [],
      sceneFrame: { location: 'en route to Hollow Spire', present: ['Kira'], situation: 'Raiders cut across the lane' } };
    const line = 'We set a course for Hollow Spire and burn hard.';
    const events = await recorded(() => applyBlock(block, { mode: 'move_resolution', moveId: 'set_a_course', ground: groundOf({ line }) }));
    expect(stored().currentLocationId).toBe(BLEAKHOLD);
    expect(events.filter(e => e.k === 'place.arrived')).toEqual([]);
    // Control: the same line from a beat with no move, its frame naming the place, walks them there.
    const docks = { ...block, sceneFrame: { ...block.sceneFrame, location: 'the Hollow Spire docks', situation: 'Kira steps off the ramp' } };
    await recorded(() => applyBlock(docks, { mode: 'paced_narrative', ground: groundOf({ line }) }));
    expect(stored().currentLocationId).toBe(HOLLOW);
  }, 60_000);
});
