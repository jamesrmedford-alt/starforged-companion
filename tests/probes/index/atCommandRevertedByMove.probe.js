/**
 * PROBE — MOVE-PERSIST-REVERTS-AT
 *
 * The move pipeline (src/index.js registerChatHook) reads campaignState before
 * its confirm dialog and its Claude calls, and persistResolution merges onto
 * the latest store with "every other field keeps the working copy"
 * (src/moves/persistResolution.js mergeWithLatestState — STORE_OWNED_FIELDS
 * omits currentLocationId / currentLocationType and sectors). The decision
 * ("Long-running pipeline writes merge relay-owned fields") assumes those are
 * the pipeline's own writes (arrival, site reveal), but `!at`, `!reveal-site`,
 * `!clear-site` and the Sector Creator write them too. A GM's `!at` typed
 * while a player's move waits at the confirm dialog (or is being narrated) is
 * silently reverted when the move persists — even though this move never
 * touched the location.
 *
 * Correct behaviour (asserted): a Face Danger that does not travel leaves the
 * location the GM set mid-move.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ confirm: null }));
vi.mock('../../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => ({
    moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'iron', adds: 0, rationale: 'test', mischiefApplied: false,
  })),
}));
vi.mock('../../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(() => (control.confirm ? control.confirm.promise : Promise.resolve(true))),
}));

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const REPLY = 'The hull groans and holds.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }

let table;
const world = () => table.world.campaignState();

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.confirm = null;
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    campaignState: {
      ...CampaignStateSchema,
      sessionActive: true, currentSessionId: 'sess-1', currentSceneId: 'sc-1', sceneTruths: [],
      settlementIds: ['set-bleak'], currentLocationId: null, currentLocationType: null,
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.claude.respond(() => REPLY);
  table.addActor({ id: 'pc-pat', name: 'Kira', ownership: { 'pl-1': 3 } });
  table.addActor({
    id: 'set-bleak', name: 'Bleakhold', type: 'location', hasPlayerOwner: false,
    flags: { [MODULE_ID]: { entityType: 'settlement', settlement: { _id: 'rec-bleak', name: 'Bleakhold' } } },
  });
  silenceConsoleErrors();
});

describe('PROBE MOVE-PERSIST-REVERTS-AT', () => {
  it("a GM's !at during a player's move survives that move's persist", async () => {
    control.confirm = deferred();
    await table.client('pl-1').chat('I brace against the hull and push through the breach.', { speaker: { actor: 'pc-pat' } });
    await table.settle();
    expect(world().pendingMove).toBe(true);           // the move is waiting at its confirm dialog

    await table.client('gm-1').chat('!at Bleakhold');
    await table.settle();
    expect(world().currentLocationId).toBe('set-bleak');   // the GM's !at landed

    control.confirm.resolve(true);
    await table.settle(); await table.drain();

    expect(table.cards(f => f.moveResolution)).toHaveLength(1);
    expect(world().pendingMove).toBe(false);
    // Expected: still Bleakhold. Actual: reverted to the move's pre-dialog snapshot (null).
    expect(world().currentLocationId).toBe('set-bleak');
    expect(world().currentLocationType).toBe('settlement');
  }, 30_000);

  // `sectors` has the same exposure: a `!clear-site` (or `!reveal-site`, or the
  // Sector Creator's new sector) landing mid-move is written back over.
  it("a GM's !clear-site during a player's move survives that move's persist", async () => {
    table.world.setSetting('campaignState', {
      ...world(),
      sectors: [{ id: 's1', name: 'Veil', mapData: { discoveries: [
        { id: 'site-1', name: 'The Hollow Vault', type: 'vault', discovered: true, cleared: false },
      ] } }],
      activeSectorId: 's1',
    });
    control.confirm = deferred();
    await table.client('pl-1').chat('I brace against the hull and push through the breach.', { speaker: { actor: 'pc-pat' } });
    await table.settle();
    expect(world().pendingMove).toBe(true);

    await table.client('gm-1').chat('!clear-site Hollow Vault');
    await table.settle();
    expect(world().sectors[0].mapData.discoveries[0].cleared).toBe(true);   // the clear landed
    expect(table.cards(f => f.siteCleared)).toHaveLength(1);

    control.confirm.resolve(true);
    await table.settle(); await table.drain();

    expect(table.cards(f => f.moveResolution)).toHaveLength(1);
    // Expected: the site stays cleared. Actual: the move's snapshot (cleared: false) is written back.
    expect(world().sectors[0].mapData.discoveries[0].cleared).toBe(true);
  }, 30_000);
});
