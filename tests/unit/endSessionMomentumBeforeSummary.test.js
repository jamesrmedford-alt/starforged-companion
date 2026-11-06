/**
 * STARFORGED COMPANION
 * tests/unit/endSessionMomentumBeforeSummary.test.js
 *
 * Issue #342 Z64 (END-SESSION-MOMENTUM-AFTER-CLAUDE).
 *
 * End a Session ran on the canonical GM in this order: the gate write
 * (session ended, the focus noted), the scene close, the rolling summary's
 * Claude call (forceRefresh — seconds), the Session Log, and only then the +1
 * momentum a focus earns (sessionLifecycleDialogs.js endSessionOnce). A
 * player's End posts its card at once ("You take +1 momentum") — the relay
 * has no ack — while the GM's End is still in its Claude call. The session is
 * over, so the GM closes Foundry (or its tab reloads) during that call: the
 * session was marked ended and its focus noted, and the momentum never paid.
 * Nothing recorded it as owed: End again on the ended session is a focus
 * correction that pays only "the first focus noted" — the focus was noted, so
 * it paid nothing and said "No momentum — it was taken when the session
 * ended with a focus."
 *
 * The award needs nothing of the summary: it is now paid as soon as the gate
 * write lands, before the scene close and the Claude call — so the GM leaving
 * during that call leaves it paid, and the correction's "it was taken" is
 * true.
 *
 * The departed GM is modelled by a summary call that never returns (the tab
 * that was running it is gone) and the GM leaving; the co-GM is then
 * canonical and handles the player's second End.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ summary: null }));
vi.mock('../../src/narration/narrator.js', async (orig) => ({
  ...(await orig()),
  narrateSessionVignette:   vi.fn(async () => null),
  narrateClockAdvancement:  vi.fn(async () => null),
  // End a Session's summary call: held, as long as the test says (forever, for a tab that closed).
  getRollingSessionSummary: vi.fn(() => (control.summary ? control.summary : Promise.resolve(''))),
  finalizeSessionSummary:   vi.fn(async () => null),
  getCampaignRecap:         vi.fn(async () => ''),
}));
vi.mock('../../src/character/actorBridge.js', async (orig) => ({
  ...(await orig()),
  applyMeterChanges: vi.fn(async () => {}),
}));

import { simulateTable, USERS } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { applyMeterChanges } from '../../src/character/actorBridge.js';
import { getRollingSessionSummary } from '../../src/narration/narrator.js';

let table;
const world = () => table.world.campaignState();
const FOCUS = { 'input[name="questFocus"]': 'Find the beacon', 'input[name="connectionFocus"]': '' };
const momentumPaid = () => applyMeterChanges.mock.calls.filter(([, changes]) => changes?.momentum === 1).length;
const sessionCards = () => table.cards(f => f.sessionLifecycleCard).map(m => m.content);

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.GM2, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.summary = null;
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, sessionLogAutoWrite: false, autoRecapEnabled: false,
    campaignState: {
      ...CampaignStateSchema, sessionActive: true, sessionActiveStartedAt: new Date().toISOString(),
      sessionStartedId: 'eg-s1', sessionEndedId: null, currentSessionId: 'eg-s1', sessionNumber: 4,
      lastSessionTimestamp: new Date().toISOString(), currentSceneId: null, sceneTruths: [], clocks: [], safetyFlags: [],
    },
  } } });
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  applyMeterChanges.mockClear();
  getRollingSessionSummary.mockClear();
});

async function playerEnds() {
  table.client('pl-1').answerDialogs(d => d.submit(FOCUS));
  await table.client('pl-1').chat('!end-session');
  await table.settle();
}

describe("issue #342 Z64 — the GM goes during End a Session's summary call", () => {
  // The control runs first: the held call below never settles, and the table
  // keeps tracking it for the rest of the file (settle() only, never drain()).
  it('control: the GM stays — End pays the momentum once', async () => {
    await playerEnds();
    await table.settle();
    expect(world().sessionEndedId).toBe('eg-s1');
    expect(getRollingSessionSummary).toHaveBeenCalledTimes(1);   // the summary call ran
    expect(momentumPaid()).toBe(1);
  }, 30_000);

  it('the +1 momentum the focus earned is paid before the summary call, so it stands after the GM who ran End has gone', async () => {
    control.summary = new Promise(() => {});        // the call the closed tab was waiting on
    await playerEnds();

    // The End ran on gm-1 up to its Claude call — the session is ended, the focus noted —
    // the player's card promised the momentum, and it is already paid.
    expect(world().sessionEndedId).toBe('eg-s1');
    expect(world().questFocus).toBe('Find the beacon');
    expect(sessionCards().join(' ')).toMatch(/You take <strong>\+1 momentum<\/strong>/);
    expect(getRollingSessionSummary).toHaveBeenCalledTimes(1);   // the call is out…
    expect(momentumPaid()).toBe(1);                              // …and the award did not wait for it

    await table.leave('gm-1');                       // the GM closes Foundry: Gus is canonical now

    // The player tries again, as the table would once they notice.
    await playerEnds();
    await table.settle();

    // A focus correction: it was taken when the session ended with a focus — truly, now —
    // and it is not paid twice.
    expect(sessionCards().at(-1) ?? '').toMatch(/it was taken when the session ended with a focus/);
    expect(momentumPaid()).toBe(1);
  }, 30_000);
});
