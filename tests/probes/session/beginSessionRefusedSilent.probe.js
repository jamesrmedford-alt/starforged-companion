/**
 * PROBE — SESSION-01 BEGIN-REFUSED-SILENT (ninth audit, area session)
 *
 * What the user does: a player (or the GM) presses Begin a Session — the
 * Session panel, or `!begin-session` — with the Spotlight Vignette box
 * ticked. The dialog opens on their screen, their card posts first ("Flagged
 * content reviewed; scene set." … "All players take +1 momentum."), and the
 * world writes relay to the canonical GM (`session.begin`).
 *
 * What happens: the world refuses the GM's session-start write (a server
 * error, a dropped socket). `beginSessionOnce`
 * (src/safety/sessionLifecycleDialogs.js:194-219) catches it, `console.warn`s
 * "beginSession state flip failed — start effects skipped" and RETURNS: no
 * momentum, no clock advance, no galley vignette — and no card, no
 * notification, nothing on any client but the GM's console. The player's own
 * card stands uncorrected, promising a session that never began and +1
 * momentum nobody received; the Session panel still says "Inactive —
 * narration is gated"; their next typed narration is dropped by the session
 * gate (src/index.js:783). `requestGmAction` is fire-and-forget on the relay
 * path and returns `{ ok: true }` on the local one (the handler swallowed
 * the throw), so `requestGmActionSafely`'s honest-card footnote never fires.
 *
 * What should happen: "No silent failures" (decisions.md) — a path that was
 * supposed to act and didn't must say so where the table can see it: End a
 * Session lets its write failure throw so the card says so; the already-begun
 * case posts a note card (postSessionAlreadyBegunCard); a refused session
 * clock goes on the GMs' Retry card (issue #316 T04). A refused Begin should
 * post the same kind of note (the session was not started; no momentum was
 * applied; try again) so the player's card does not stand as the last word.
 *
 * Controls: without the refusal the session begins, the card promises the
 * momentum and the GM pays it (today: passes).
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/session/beginSessionRefusedSilent.probe.js
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../../src/narration/narrator.js', async (orig) => ({
  ...(await orig()),
  narrateSessionVignette:   vi.fn(async () => null),
  narrateClockAdvancement:  vi.fn(async () => null),
  getRollingSessionSummary: vi.fn(async () => null),
  finalizeSessionSummary:   vi.fn(async () => null),
}));
vi.mock('../../../src/character/actorBridge.js', async (orig) => ({
  ...(await orig()),
  applyMeterChanges: vi.fn(async () => {}),
}));

import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { failWrites, campaignStateWrite } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';
import { applyMeterChanges } from '../../../src/character/actorBridge.js';

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

describe('SESSION-01 a Begin a Session whose session-start write the world refused', () => {
  it("a player's Begin: the session did not start, and nothing tells the table — their card promises a session and +1 momentum", async () => {
    const fault = failWrites(table, w => campaignStateWrite('gm-1')(w) && w.value?.sessionActive === true);
    await begin('pl-1');

    expect(fault.refused).toBe(1);                       // the start write was the one refused
    expect(world().sessionActive).toBe(false);           // the world is honest …
    expect(applyMeterChanges).not.toHaveBeenCalled();    // … and no momentum was paid
    // FAILS today: nobody is told — no note card, no notification; the player's
    // card ("scene set", "+1 momentum") is the last word on the session.
    expect.soft(someoneWasTold()).toBe(true);
    expect.soft(sessionCards().at(-1).content).not.toMatch(/\+1 momentum/);
  }, 30_000);

  it("the GM's own Begin: the same silence on the local path", async () => {
    const fault = failWrites(table, w => campaignStateWrite('gm-1')(w) && w.value?.sessionActive === true);
    await begin('gm-1');

    expect(fault.refused).toBe(1);
    expect(world().sessionActive).toBe(false);
    expect.soft(someoneWasTold()).toBe(true);
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
