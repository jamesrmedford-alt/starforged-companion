// STARFORGED COMPANION
// tests/unit/connectionFlowCreationPaths.test.js
//
// docs/flows/connection-flow.md §1 said "Five paths converge on
// createConnection()" and listed, fifth, "Manual sidebar creation —
// createActor hook + autoSeedConnection setting → seedConnectionActor …".
// No such path exists. The createActor seed hook seeds only a card that
// already carries the module's connection record (connectionNeedsSeed: the
// flags[MODULE].connection payload, not yet `seeded`) — a card a creator
// made. A character Actor the GM creates in the Actors sidebar has no module
// flag: it is never seeded, never listed in connectionIds, and the module
// takes it for a PLAYER CHARACTER (isPlayerCharacterActor — no entityType).
// The flow maps are source-verified write-through mirrors (CLAUDE.md step 6),
// so a reader trusting the map would make an NPC the module treats as a PC
// (issue #342 Z73, CONNECTION-FLOW-SIDEBAR-PATH).
//
// The control runs the real hook on a booted table.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const FLOW = fileURLToPath(new URL('../../docs/flows/connection-flow.md', import.meta.url));

let table;
beforeAll(async () => {
  table = await simulateTable({
    users: [USERS.GM, USERS.P1],
    world: { settings: {
      chronicleAutoEntry: false, autoSeedConnection: true, autoSeedStarship: false,
      campaignState: { ...CampaignStateSchema, connectionIds: [] },
    } },
  });
}, 30_000);
afterAll(() => table?.teardown());

describe('connection-flow.md §1 — the creation paths (issue #342 Z73)', () => {
  it('control: a character the GM creates in the sidebar (Auto-Seed NPC on) is not made a connection', async () => {
    const gm = table.client('gm-1');
    const actor = await gm.run(() => Actor.create({ name: 'Mara Quell', type: 'character' }));
    await table.settle();
    await table.drain();

    expect(actor.flags?.[MODULE_ID]?.connection).toBeUndefined();          // never seeded
    expect(table.world.campaignState().connectionIds).toEqual([]);         // never listed
    const bridge = await gm.import('../../src/character/actorBridge.js');
    expect(gm.run(() => bridge.isPlayerCharacterActor(actor))).toBe(true); // the module takes it for a PC
  }, 30_000);

  it('the flow map lists no "Manual sidebar creation" path the code does not have', () => {
    const doc = readFileSync(FLOW, 'utf8');
    expect(doc).not.toMatch(/\*\*Manual sidebar creation\*\*/);
    expect(doc).not.toMatch(/Five paths converge/);
  });

  it('the flow map says a sidebar-made character is a player character to the module', () => {
    const doc = readFileSync(FLOW, 'utf8').replace(/\s+/g, ' ');
    expect(doc).toMatch(/Four paths converge on `createConnection\(\)`/);
    expect(doc).toMatch(/made by hand in the Actors sidebar[^.]*never seeded[^.]*player character/);
  });
});
