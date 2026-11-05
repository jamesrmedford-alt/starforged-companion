/**
 * STARFORGED COMPANION
 * tests/unit/readyMintCopy.test.js
 *
 * Issue #331 X40 (READY-MINT-CACHED-MUTATE). The ready hook took the cached
 * campaignState by reference, cleared a stale lock on it and let
 * initSessionId → mintSession mint the new session ON IT (new id,
 * sessionNumber + 1, gate closed), then wrote the owned fields. A refused
 * write logged "Failed to persist session ID" and left the GM's cache on a
 * session the world never minted: the panel said "Session #8 · Inactive",
 * the gate was closed while the world and the players had session 7 active,
 * and the next whole-object write carried the mint in after all. The mint
 * runs on a deep copy now, as applyBeginSession's does (issue #309 N09); the
 * next load or Begin retries it.
 */

/* global expectConsoleError */
import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('../../src/narration/narrator.js', async (orig) => ({
  ...(await orig()),
  finalizeSessionSummary: vi.fn(async () => {}),
  getCampaignRecap:       vi.fn(async () => ''),
  postCampaignRecap:      vi.fn(async () => ''),
}));

import { simulateTable, USERS } from '../helpers/multiClient.js';
import { failWrites, campaignStateWrite } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const DAY = 24 * 3_600_000;
let table;
afterEach(() => table?.teardown());

function lastWeeksSession() {
  const now = Date.now();
  return {
    ...CampaignStateSchema,
    currentSessionId: 'S7', sessionNumber: 7, sessionStartedId: 'S7', sessionEndedId: null,
    sessionActive: true, sessionActiveStartedAt: new Date(now - DAY - 3_600_000).toISOString(),
    lastSessionTimestamp: new Date(now - DAY).toISOString(),
    currentSceneId: null, sceneTruths: [], clocks: [],
  };
}

async function openWorld({ refuseMint }) {
  table = await simulateTable({
    users: [USERS.GM, USERS.P1], boot: false,
    world: { settings: { chronicleAutoEntry: false, narratorSessionSummary: false, autoRecapEnabled: false, campaignState: lastWeeksSession() } },
  });
  // The server refuses this GM's campaignState writes while the world loads
  // (every one of them: a later ready-time writer — the truths reconcile,
  // the folder migrations — would otherwise write the whole mutated cache and
  // carry the refused mint into the world after all, which is the other half
  // of the same defect).
  const fault = refuseMint ? failWrites(table, campaignStateWrite('gm-1'), { times: 50 }) : null;
  await table.client('gm-1').boot();
  await table.client('pl-1').boot();
  await table.settle(); await table.drain();
  // The refusal stays in force through the assertions (a ready-time writer on
  // a longer timer must not carry the cache in behind our back); teardown
  // discards the table.
  return fault;
}

const gmCache = () => table.client('gm-1').getSetting('campaignState');
const world   = () => table.world.campaignState();
const pick    = (cs) => ({ id: cs.currentSessionId, number: cs.sessionNumber, active: cs.sessionActive });

describe('X40 — the ready hook mints the new session on a copy', () => {
  it("the mint's write refused: the GM's cache stays on the session the world has", async () => {
    expectConsoleError();   // "Failed to persist session ID", and whatever else the refused writes make the ready hook log
    const fault = await openWorld({ refuseMint: true });
    expect(fault.refused).toBeGreaterThanOrEqual(1);
    expect(pick(world())).toEqual({ id: 'S7', number: 7, active: true });   // the world kept last week's session
    // The cache said session 8, inactive.
    expect(pick(gmCache())).toEqual(pick(world()));
  }, 60_000);

  it('control: with the write accepted the GM\'s cache and the world agree on the new session', async () => {
    await openWorld({ refuseMint: false });
    expect(world().sessionNumber).toBe(8);
    expect(world().sessionActive).toBe(false);
    expect(pick(gmCache())).toEqual(pick(world()));
  }, 60_000);
});
