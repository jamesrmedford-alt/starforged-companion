/**
 * STARFORGED COMPANION
 * tests/unit/beginSessionRefusedWrite.test.js
 *
 * Issue #329 X13 (BEGIN-REFUSED-SILENT) — a Begin a Session whose
 * session-start write the world refused says so.
 *
 * A player (or the GM) presses Begin a Session with the Spotlight Vignette
 * ticked; the world refuses the canonical GM's session-start write.
 * beginSessionOnce caught it, warned in the console and returned: no
 * momentum, no clocks — and no card or notification on any client. The
 * player's own card ("scene set", "All players take +1 momentum") was the
 * last word, the panel stayed "Inactive" and their next line was dropped by
 * the session gate. Now the GM posts a note where the Begin card is: the
 * session was not started, no momentum was applied, try again.
 *
 * (Converted from the ninth audit's probe
 * tests/probes/session/beginSessionRefusedSilent.probe.js.)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../src/narration/narrator.js', async (orig) => ({
  ...(await orig()),
  narrateSessionVignette:   vi.fn(async () => null),
  narrateClockAdvancement:  vi.fn(async () => null),
  getRollingSessionSummary: vi.fn(async () => null),
  finalizeSessionSummary:   vi.fn(async () => null),
}));
vi.mock('../../src/character/actorBridge.js', async (orig) => ({
  ...(await orig()),
  applyMeterChanges: vi.fn(async () => {}),
}));

import { simulateTable, USERS } from '../helpers/multiClient.js';
import { failWrites, campaignStateWrite } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { applyMeterChanges } from '../../src/character/actorBridge.js';

let table;
const world = () => table.world.campaignState();
const sessionCards = () => table.cards(f => f.sessionLifecycleCard);
const VALUES = { 'input[name="vignette"]': true, 'input[name="galleyVignette"]': false };

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false,
    campaignState: {
      ...CampaignStateSchema, sessionActive: false, sessionStartedId: null, currentSessionId: 'bs-s1',
      sessionNumber: 1, lastSessionTimestamp: new Date().toISOString(), clocks: [], safetyFlags: [],
    },
  } } });
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  applyMeterChanges.mockClear();
});

async function begin(userId) {
  table.client(userId).answerDialogs(d => d.submit(VALUES));
  await table.client(userId).chat('!begin-session');
  await table.settle(); await table.drain();
}

/** Anything the table could see saying the session did not start. */
function someoneWasTold() {
  const said = /not (be )?(started|begun)|could not (be )?(start|begin)|was not started|failed to (start|begin)/i;
  const onACard = sessionCards().some(c => said.test(c.content));
  const asANotice = ['gm-1', 'pl-1'].some(id =>
    table.client(id).notifications.some(n => /session/i.test(n.message) && said.test(n.message)));
  return onACard || asANotice;
}

describe('issue #329 X13 — a Begin a Session whose session-start write the world refused', () => {
  it("a player's Begin: the session did not start, and nothing tells the table — their card promises a session and +1 momentum", async () => {
    const fault = failWrites(table, w => campaignStateWrite('gm-1')(w) && w.value?.sessionActive === true);
    await begin('pl-1');

    expect(fault.refused).toBe(1);                       // the start write was the one refused
    expect(world().sessionActive).toBe(false);           // the world is honest …
    expect(applyMeterChanges).not.toHaveBeenCalled();    // … and no momentum was paid
    // The table is told — the player's card ("scene set", "+1 momentum") is
    // not the last word on the session.
    expect(someoneWasTold()).toBe(true);
    expect(sessionCards().at(-1).content).not.toMatch(/\+1 momentum/);
    expect(sessionCards().at(-1).content).toMatch(/No momentum was applied/);
  }, 30_000);

  it("the GM's own Begin: the same silence on the local path", async () => {
    const fault = failWrites(table, w => campaignStateWrite('gm-1')(w) && w.value?.sessionActive === true);
    await begin('gm-1');

    expect(fault.refused).toBe(1);
    expect(world().sessionActive).toBe(false);
    expect(someoneWasTold()).toBe(true);
  }, 30_000);

  it('a retry after the refusal begins the session and pays the momentum once', async () => {
    const fault = failWrites(table, w => campaignStateWrite('gm-1')(w) && w.value?.sessionActive === true);
    await begin('pl-1');
    expect(fault.refused).toBe(1);
    await begin('pl-1');                                  // the fault refuses one write: this one lands
    expect(world().sessionActive).toBe(true);
    expect(applyMeterChanges).toHaveBeenCalledTimes(1);
  }, 30_000);

  it('control: without the refusal the session begins, the card promises the momentum and the GM pays it', async () => {
    await begin('pl-1');
    expect(world().sessionActive).toBe(true);
    expect(world().sessionStartedId).toBe('bs-s1');
    expect(sessionCards()).toHaveLength(1);
    expect(sessionCards()[0].content).toMatch(/\+1 momentum/);
    expect(applyMeterChanges).toHaveBeenCalledTimes(1);   // one PC at the table
  }, 30_000);
});
