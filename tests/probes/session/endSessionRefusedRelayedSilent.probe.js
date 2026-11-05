/**
 * PROBE — SESSION-01 END-REFUSED-RELAYED-SILENT (tenth audit, area session)
 *
 * What the user does: a player types `!end-session` (or presses End Session
 * on the Session panel — the same dialog, issue #326 W85), notes a quest
 * focus and presses End Session. The world refuses the canonical GM's
 * session-end write (a server error, a dropped socket — the fault the fault
 * matrix already drives).
 *
 * What happens: the player's own card ("End a Session — Quest focus: … You
 * take +1 momentum") posts right after the relay returns `{ ok: true,
 * relayed: true }` (postEndSessionCard, src/safety/sessionLifecycleDialogs.js:
 * 418-443 — a relay has no ack). On the GM, endSessionOnce throws at its gate
 * write (:532, "A write failure still throws (the card says so)") — but the
 * card that says so is the LOCAL path's (requestGmActionSafely, :668-676);
 * on the relayed path the socket listener only console.errors the throw
 * (src/multiplayer/gmRelay.js:393-405). The session stays active, no
 * momentum is paid, no Session Log is written — and no card or notification
 * on any client says so: the player's "+1 momentum" is the last word. Issue
 * #329 X13 fixed exactly this shape for Begin (postSessionNotStartedCard,
 * :350-356, posted from the GM's side); End's refused write is the sibling
 * path the fix did not reach.
 *
 * What should happen: the table is told the session was not ended and no
 * momentum was taken — decisions.md "No silent no-op on a player's action"
 * [X13, X14]; the help's Chat Commands page: "Anything a command changes in
 * the shared campaign (… sessions …) is saved by the GM's client … if none
 * is, you are told the change could not be saved".
 *
 * Control: the GM's own End under the same refusal says "could not be ended"
 * (the local path); without the refusal a player's End ends the session, pays
 * the momentum once and the card's "+1 momentum" is true.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/session/endSessionRefusedRelayedSilent.probe.js
 */

/* global expectConsoleError */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../../src/narration/narrator.js', async (orig) => ({
  ...(await orig()),
  narrateSessionVignette:   vi.fn(async () => null),
  narrateClockAdvancement:  vi.fn(async () => null),
  getRollingSessionSummary: vi.fn(async () => null),
  finalizeSessionSummary:   vi.fn(async () => null),
  getCampaignRecap:         vi.fn(async () => ''),
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
const FOCUS = { 'input[name="questFocus"]': 'Find the beacon', 'input[name="connectionFocus"]': '' };

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false, autoRecapEnabled: false,
    campaignState: {
      ...CampaignStateSchema, sessionActive: true, sessionActiveStartedAt: new Date().toISOString(),
      sessionStartedId: 'es-s1', sessionEndedId: null, currentSessionId: 'es-s1', sessionNumber: 1,
      lastSessionTimestamp: new Date().toISOString(), currentSceneId: null, sceneTruths: [], clocks: [], safetyFlags: [],
    },
  } } });
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  applyMeterChanges.mockClear();
});

async function end(userId) {
  table.client(userId).answerDialogs(d => d.submit(FOCUS));
  await table.client(userId).chat('!end-session');
  await table.settle(); await table.drain();
}

/** The gate write End a Session makes first: the one carrying `sessionEndedId` for this session. */
const endGateWrite = (w) => campaignStateWrite('gm-1')(w) && w.value?.sessionEndedId === 'es-s1';

/** Anything the table could see saying the session did not end. */
function someoneWasTold() {
  const said = /not (be )?ended|could not (be )?end|was not ended|failed to end|not saved|could not be saved/i;
  const onACard = table.world.messages().some(m => said.test(m.content ?? ''));
  const asANotice = ['gm-1', 'pl-1'].some(id =>
    table.client(id).notifications.some(n => /session/i.test(n.message) && said.test(n.message)));
  return onACard || asANotice;
}

describe('SESSION-01 a player\'s End a Session whose session-end write the world refused', () => {
  it("a player's End: the session did not end, and nothing tells the table — their card promises +1 momentum", async () => {
    expectConsoleError(/session\.end/);                  // the relay's console.error is the only trace today
    const fault = failWrites(table, endGateWrite);
    await end('pl-1');

    // Sanity: the gate write was the one refused; the world is honest; no momentum was paid.
    expect(fault.refused).toBe(1);
    expect(world().sessionActive).toBe(true);
    expect(world().sessionEndedId).toBeNull();
    expect(applyMeterChanges).not.toHaveBeenCalled();

    // Expected: the table is told the session was not ended (as a refused Begin says
    // "the session was not started" since X13). Actual: no card, no notification.
    expect(someoneWasTold()).toBe(true);
    // The player's card ("You take +1 momentum") must not be the last word.
    expect.soft(sessionCards().at(-1)?.content ?? '').not.toMatch(/\+1 momentum/);
  }, 30_000);

  // The same shape at the two other relayed session writes a player's card reports on
  // (sessionDialogs.js notRecordedNote only knows `ok: false` — no GM, or a local throw).
  it("same shape — a player's Set a Flag whose GM write is refused: the card says \"Flag set\", nobody is told", async () => {
    expectConsoleError(/safety\.setFlag/);
    const fault = failWrites(table, w => campaignStateWrite('gm-1')(w) && (w.value?.safetyFlags?.length ?? 0) > 0);
    const { openSetFlagDialog } = await table.client('pl-1').import('../../src/safety/sessionDialogs.js');
    table.client('pl-1').answerDialogs(d => d.submit({ 'textarea[name="text"]': 'No harm to the ship\'s cat', 'select[name="visibility"]': 'public' }));
    await table.client('pl-1').run(() => openSetFlagDialog());
    await table.settle(); await table.drain();

    expect(fault.refused).toBe(1);
    expect(world().safetyFlags ?? []).toHaveLength(0);     // the world has no flag …
    const card = table.cards(f => f.safetyFlagCard).at(-1);
    expect(card?.content ?? '').toMatch(/Flag set/);       // … the card says it was set
    // Expected: the card, or a notice, says the flag was not saved. Actual: nothing does.
    const said = /not (be )?(saved|recorded)|could not (be )?(save|record)|was not (saved|recorded)/i;
    expect(said.test(card?.content ?? '') || ['gm-1', 'pl-1'].some(id => table.client(id).notifications.some(n => said.test(n.message)))).toBe(true);
  }, 30_000);

  it("same shape — a player's Take a Break → Move on whose GM write is refused: the card promises the +1, nobody is told", async () => {
    expectConsoleError(/session\.takeBreak/);
    const fault = failWrites(table, w => campaignStateWrite('gm-1')(w) && w.value?.nextMoveAdd?.source === 'take_a_break');
    const { openTakeABreakDialog } = await table.client('pl-1').import('../../src/safety/sessionDialogs.js');
    table.client('pl-1').answerDialogs(d => d.choose('move_on'));
    await table.client('pl-1').run(() => openTakeABreakDialog());
    await table.settle(); await table.drain();

    expect(fault.refused).toBe(1);
    expect(world().nextMoveAdd ?? null).toBeNull();        // no +1 is pending in the world …
    const card = table.cards(f => f.takeBreakCard).at(-1);
    expect(card?.content ?? '').toMatch(/\+1 on the next move/);   // … the card promises it
    const said = /not (be )?(saved|recorded)|could not (be )?(save|record)|was not (saved|recorded)/i;
    expect(said.test(card?.content ?? '') || ['gm-1', 'pl-1'].some(id => table.client(id).notifications.some(n => said.test(n.message)))).toBe(true);
  }, 30_000);

  it("control: the GM's own End under the same refusal says the session could not be ended (the local path)", async () => {
    expectConsoleError(/session\.end/);
    const fault = failWrites(table, endGateWrite);
    await end('gm-1');

    expect(fault.refused).toBe(1);
    expect(world().sessionActive).toBe(true);
    expect(someoneWasTold()).toBe(true);
  }, 30_000);

  it("control: without the refusal a player's End ends the session, pays the momentum once and the card is true", async () => {
    await end('pl-1');

    expect(world().sessionActive).toBe(false);
    expect(world().sessionEndedId).toBe('es-s1');
    expect(world().questFocus).toBe('Find the beacon');
    expect(applyMeterChanges).toHaveBeenCalledTimes(1);   // one PC at the table
    expect(sessionCards().at(-1).content).toMatch(/\+1 momentum/);
  }, 30_000);
});
