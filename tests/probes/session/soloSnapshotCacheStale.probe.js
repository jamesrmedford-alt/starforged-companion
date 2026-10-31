/**
 * PROBE — in solo-GM play the character snapshot cache is never dropped by a
 * sheet edit, so the narrator keeps describing the PC as it was.
 *
 * actorBridge.readCharacterSnapshot caches per actor id (`_snapshotCache`);
 * the only invalidation for edits made on the vendor sheet is the
 * `updateActor` hook in src/index.js registerActorHook():
 *
 *     Hooks.on("updateActor", (actor, changes, _options, userId) => {
 *       if (!actor.hasPlayerOwner) return;          // ← before the invalidation
 *       invalidateActorCache(actor.id);
 *
 * `Actor#hasPlayerOwner` is false for every PC when no non-GM user owns it —
 * i.e. every PC in solo-GM play, the module's primary use case (known-issues
 * RECAP-003: "hasPlayerOwner is always false in solo-GM play"; getPlayerActors
 * was fixed for it, this hook was not). Health / impacts / momentum / pronouns
 * / biography changed on the sheet stay stale in the CHARACTER block, galley
 * vignette and party roster until some module write or Item change drops it.
 *
 * Booted on the multi-client harness (the real ready-hook registrations).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { simulateTable, USERS } from '../../helpers/multiClient.js';

let table, gm, bridge;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM] });              // a solo GM
  gm = table.client('gm-1');
  bridge = await gm.import('../../src/character/actorBridge.js');  // resolved from tests/helpers
}, 30_000);
afterAll(() => table?.teardown());

describe('PROBE SOLO-SNAPSHOT-CACHE-STALE', () => {
  it("a sheet edit on the solo GM's PC reaches the next snapshot", async () => {
    const kira = table.addActor({ id: 'pc-solo', name: 'Kira', type: 'character', hasPlayerOwner: false,
      system: { pronouns: 'she/her' } });
    const before = await gm.run(() => bridge.readCharacterSnapshot(kira));
    expect(before.meters.health).toBe(5);

    // The GM drags health to 2, marks wounded and edits pronouns on the vendor sheet.
    await gm.run(() => kira.update({ 'system.health.value': 2, 'system.debility.wounded': true, 'system.pronouns': 'they/them' }));
    await table.settle();

    const after = await gm.run(() => bridge.readCharacterSnapshot(kira));
    expect({ health: after.meters.health, wounded: after.debilities.wounded, pronouns: after.pronouns })
      .toEqual({ health: 2, wounded: true, pronouns: 'they/them' });    // actual today: 5 / false / she/her
  });

  it('control: the same edit on a player-owned PC is seen', async () => {
    const mara = table.addActor({ id: 'pc-owned', name: 'Mara', type: 'character', hasPlayerOwner: true,
      system: { pronouns: 'she/her' } });
    await gm.run(() => bridge.readCharacterSnapshot(mara));
    await gm.run(() => mara.update({ 'system.health.value': 2, 'system.pronouns': 'they/them' }));
    await table.settle();
    const after = await gm.run(() => bridge.readCharacterSnapshot(mara));
    expect({ health: after.meters.health, pronouns: after.pronouns }).toEqual({ health: 2, pronouns: 'they/them' });
  });
});
