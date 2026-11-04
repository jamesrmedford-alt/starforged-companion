/**
 * PROBE — SESSION-08 READY-MINT-CACHED-MUTATE (ninth audit, area session)
 *
 * What the user does: the GM opens the world a day after the last session
 * (nobody pressed End; the session is idle past four hours, its gate still
 * open from last week's Begin).
 *
 * What happens: the ready hook (src/index.js:6946-7006) takes
 * `game.settings.get(MODULE_ID, "campaignState")` — the client's cached
 * object, by reference — clears a stale lock ON IT (:6950-6953), and
 * `initSessionId(prevState)` → `rollSessionIfDue` → `mintSession`
 * (src/session/lifecycle.js:189-207) mints the new session ON IT: new
 * `currentSessionId`, `sessionNumber + 1`, `sessionActive: false`. Then the
 * owned fields are written (:6966-6968). When the world refuses that write,
 * "Failed to persist session ID" is logged and the GM's cache now disagrees
 * with the world: the GM's panel shows "Session #N+1 · Inactive", their
 * session gate is closed (typed narration dropped) while the world — and
 * every player's panel — still says session N is active; the narrator cards
 * this client posts carry a session id the world never minted, until a
 * later whole-object write from this client carries the mint in after all.
 * rules/foundry-api.md's cached-by-reference rule; the issue #326 W51 family
 * (the ready hook's TRUTHS fallback is already known for this shape — this is
 * the mint beside it). Distinct from SESSION-MINT-RACE (the race with Begin).
 *
 * What should happen: the mint runs on a copy (`deepClone`, as
 * applyBeginSession does since issue #309 N09), so a refused write leaves
 * the cache equal to the world and the next Begin / load retries the mint.
 *
 * Control: with the write accepted the cache equals the world after boot
 * (today: passes).
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/session/readyMintCachedMutate.probe.js
 */

import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('../../../src/narration/narrator.js', async (orig) => ({
  ...(await orig()),
  finalizeSessionSummary: vi.fn(async () => {}),
  getCampaignRecap:       vi.fn(async () => ''),
  postCampaignRecap:      vi.fn(async () => ''),
}));

import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { failWrites, campaignStateWrite } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

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

describe('SESSION-08 the ready hook mints the new session on the cached campaignState', () => {
  it("the mint's write refused: the GM's cache holds a session the world never minted", async () => {
    expectConsoleError();   // "Failed to persist session ID", and whatever else the refused writes make the ready hook log
    const fault = await openWorld({ refuseMint: true });
    expect(fault.refused).toBeGreaterThanOrEqual(1);
    expect(pick(world())).toEqual({ id: 'S7', number: 7, active: true });   // the world kept last week's session
    // FAILS today: the cache says session 8, inactive.
    expect(pick(gmCache())).toEqual(pick(world()));
  }, 60_000);

  it('control: with the write accepted the GM\'s cache and the world agree on the new session', async () => {
    await openWorld({ refuseMint: false });
    expect(world().sessionNumber).toBe(8);
    expect(world().sessionActive).toBe(false);
    expect(pick(gmCache())).toEqual(pick(world()));
  }, 60_000);
});
