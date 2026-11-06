/**
 * STARFORGED COMPANION
 * tests/unit/activityStampKeepsRelayedWrites.test.js
 *
 * Issue #342 Z01 ACTIVITY-STAMP-REVERTS-RELAYED-WRITE (the session auditor's
 * SESS-1 probe).
 *
 * The canonical GM refreshes the session's activity stamp on chat activity,
 * at most every ten minutes (registerSessionActivityHook →
 * touchSessionActivity, src/session/lifecycle.js). It used to write the WHOLE
 * campaignState — `{ ...latest, lastSessionTimestamp }` — built from this
 * client's cached value. A player's relayed action (the X-Card, Set a Flag,
 * Take a Break, End a Session) emits its relay first and posts its card right
 * after: the GM runs the handler (its write leaves for the server) and THEN
 * hears the card's createChatMessage — before its own write has come back, so
 * its cache is still the old value. When the stamp was due, the refresh's
 * whole-object write, built from that old value, reached the server second
 * and undid the handler's write: the X-Card pause, the flag, the +1, the
 * session's end. The stamp now has its own world setting (`sessionActivity`,
 * `{ sessionId, at }`), so a chat message never writes campaignState.
 *
 * The harness applies a world-setting write synchronously, so the server
 * round trip is modelled with interceptWrites: every campaignState write is
 * held and the server applies them in the order they were sent, the echoes
 * arriving in that order (as Foundry's socket delivers them). The player's
 * card is created once the GM has sent its handler's write (the relay reaches
 * the GM before the card's broadcast does; a table's production order).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../src/narration/narrator.js', async (orig) => ({
  ...(await orig()),
  narrateSessionVignette:   vi.fn(async () => null),
  narrateClockAdvancement:  vi.fn(async () => null),
  getRollingSessionSummary: vi.fn(async () => null),
  finalizeSessionSummary:   vi.fn(async () => null),
  getCampaignRecap:         vi.fn(async () => ''),
}));
vi.mock('../../src/character/actorBridge.js', async (orig) => ({
  ...(await orig()),
  applyMeterChanges: vi.fn(async () => {}),
}));

import { simulateTable, USERS } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const MODULE_ID = 'starforged-companion';
const CS_KEY = `${MODULE_ID}.campaignState`;

let table;
const world = () => table.world.campaignState();
const activity = () => table.world.getSetting('sessionActivity') ?? null;

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

const minutesAgo = (m) => new Date(Date.now() - m * 60_000).toISOString();

function liveSession(stampAgeMinutes) {
  return {
    ...CampaignStateSchema, sessionActive: true, sessionActiveStartedAt: minutesAgo(90),
    sessionStartedId: 'st-s1', sessionEndedId: null, currentSessionId: 'st-s1', sessionNumber: 3,
    lastSessionTimestamp: minutesAgo(stampAgeMinutes), currentSceneId: null, sceneTruths: [],
    clocks: [], safetyFlags: [], xCardActive: false,
  };
}

async function resetTable(stampAgeMinutes) {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false, autoRecapEnabled: false,
    campaignState: liveSession(stampAgeMinutes),
  } } });
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
}

/** The stamp ran: the session's activity stamp names it and is fresh. */
function expectFreshStamp() {
  expect(activity()?.sessionId).toBe('st-s1');
  expect(Date.now() - Date.parse(activity()?.at ?? '')).toBeLessThan(60_000);
}

/**
 * The server: every campaignState write is held, then applied in the order it
 * was sent. A card the player posts after a relay (`cardAfter` matches it) is
 * created once the GM has sent the write the relay asked for (`relayWrite`).
 */
function serverOrder({ relayWrite, cardAfter }) {
  const sent = [];
  let relayWriteSent;
  const relayWriteArrived = new Promise(r => { relayWriteSent = r; });
  table.interceptWrites((w) => {
    if (w.kind === 'message.create' && cardAfter(w)) return relayWriteArrived;
    if (w.kind !== 'setting' || w.key !== CS_KEY) return undefined;
    let release;
    const held = new Promise(r => { release = r; });
    sent.push({ client: w.client, value: w.value, release });
    if (relayWrite(w)) relayWriteSent();
    return held;
  });
  return {
    sent,
    /** Apply every held write in the order sent (and any sent meanwhile), until none is left. */
    async applyAll() {
      for (let i = 0; i < 50; i++) {
        const batch = sent.filter(s => !s.applied);
        if (!batch.length) break;
        for (const s of batch) { s.applied = true; s.release(); }
        await table.settle();
      }
    },
  };
}

describe('Z01 — the activity stamp never undoes a relayed write it raced', () => {
  beforeEach(async () => { await resetTable(11); });   // the stamp is due (≥ 10 minutes old)

  it("a player's X-Card: the pause stays recorded after the GM's activity stamp", async () => {
    // The narration the X-Card answers, in chat (posted by the GM's pipeline).
    await table.client('gm-1').run(() => globalThis.ChatMessage.create({
      content: '<p>The airlock tears open and the crewman is dragged into the void.</p>',
      flags: { [MODULE_ID]: { narratorCard: true, narrationText: 'The airlock tears open and the crewman is dragged into the void.', sessionId: 'st-s1', narrationId: 'nar-void' } },
    }));
    await table.settle();
    // The table read it for a couple of minutes: the stamp is due again.
    table.world.setSetting('campaignState', { ...world(), lastSessionTimestamp: minutesAgo(11) });
    table.world.setSetting('sessionActivity', { sessionId: 'st-s1', at: minutesAgo(11) });

    const server = serverOrder({
      relayWrite: (w) => w.client === 'gm-1' && w.value?.xCardActive === true,
      cardAfter:  (w) => w.client === 'pl-1' && w.data?.flags?.[MODULE_ID]?.xcardCard === true,
    });
    await table.client('pl-1').chat('!x');
    await table.settle();

    // The X-Card's write is sent first, with the pause and the removal.
    expect(server.sent[0].client).toBe('gm-1');
    expect(server.sent[0].value.xCardActive).toBe(true);
    expect(server.sent[0].value.xCardedNarrationIds).toEqual(['nar-void']);

    await server.applyAll();
    // The player's card says "Scene paused … suppressed" …
    expect(table.cards(f => f.xcardCard && f.xcardRecorded === true)).toHaveLength(1);
    // … and the world must say so too: the pause, the removed narration, the redirect.
    expect.soft(world().xCardedNarrationIds ?? []).toEqual(['nar-void']);
    expect.soft(world().xCardRedirect?.sessionId ?? null).toBe('st-s1');
    expect(world().xCardActive).toBe(true);
    // The card's message still kept the session alive — on its own setting,
    // so no campaignState write followed the pause.
    expectFreshStamp();
    expect(server.sent.map(s => s.value.xCardActive)).toEqual([true]);
    expect(Date.now() - Date.parse(world().lastSessionTimestamp)).toBeGreaterThan(10 * 60_000);   // the mint's, untouched
  }, 30_000);

  it("a player's Set a Flag: the flag stays recorded after the GM's activity stamp", async () => {
    const server = serverOrder({
      relayWrite: (w) => w.client === 'gm-1' && (w.value?.safetyFlags ?? []).length === 1,
      cardAfter:  (w) => w.client === 'pl-1' && w.data?.flags?.[MODULE_ID]?.safetyFlagCard === true,
    });
    const { openSetFlagDialog } = await table.client('pl-1').import('../../src/safety/sessionDialogs.js');
    table.client('pl-1').answerDialogs(d => d.submit({ 'textarea[name="text"]': 'No harm to the ship\'s cat', 'select[name="visibility"]': 'public' }));
    const flagging = table.client('pl-1').run(() => openSetFlagDialog());
    await table.settle();

    expect(server.sent[0].value.safetyFlags).toHaveLength(1);           // the flag's write goes first

    await server.applyAll();
    await flagging;
    expect(table.cards(f => f.safetyFlagCard).map(c => c.content).join(' ')).toMatch(/Flag set/);
    expect((world().safetyFlags ?? []).map(f => f.text)).toEqual(['No harm to the ship\'s cat']);
    expectFreshStamp();
  }, 30_000);

  it("a player's Take a Break → Move on: the +1 stays recorded after the GM's activity stamp", async () => {
    const server = serverOrder({
      relayWrite: (w) => w.client === 'gm-1' && w.value?.nextMoveAdd?.source === 'take_a_break',
      cardAfter:  (w) => w.client === 'pl-1' && w.data?.flags?.[MODULE_ID]?.takeBreakCard === true,
    });
    const { openTakeABreakDialog } = await table.client('pl-1').import('../../src/safety/sessionDialogs.js');
    table.client('pl-1').answerDialogs(d => d.choose('move_on'));
    const breaking = table.client('pl-1').run(() => openTakeABreakDialog());
    await table.settle();

    expect(server.sent[0].value.nextMoveAdd?.source).toBe('take_a_break');   // the break's write goes first

    await server.applyAll();
    await breaking;
    expect(table.cards(f => f.takeBreakCard).map(c => c.content).join(' ')).toMatch(/\+1 on the next move/);
    expect(world().nextMoveAdd).toMatchObject({ value: 1, source: 'take_a_break' });
    expectFreshStamp();
  }, 30_000);

  it("a player's End a Session from the Session panel: the session stays ended after the GM's activity stamp", async () => {
    const server = serverOrder({
      relayWrite: (w) => w.client === 'gm-1' && w.value?.sessionEndedId === 'st-s1',
      cardAfter:  (w) => w.client === 'pl-1' && w.data?.flags?.[MODULE_ID]?.sessionLifecycleCard === true,
    });
    // The panel's End button opens the dialog with no chat line of its own (a
    // typed `!end-session` line is itself a message, whose stamp lands first).
    const { openEndSessionDialog } = await table.client('pl-1').import('../../src/safety/sessionLifecycleDialogs.js');
    table.client('pl-1').answerDialogs(d => d.submit({ 'input[name="questFocus"]': 'Find the beacon', 'input[name="connectionFocus"]': '' }));
    const ending = table.client('pl-1').run(() => openEndSessionDialog());
    await table.settle();

    expect(server.sent[0].value.sessionEndedId).toBe('st-s1');   // End's gate write goes first

    await server.applyAll();
    await ending;
    await table.drain();
    await server.applyAll();
    expect(table.cards(f => f.sessionLifecycleCard).map(c => c.content).join(' ')).toMatch(/\+1 momentum/);
    expect(world().sessionEndedId).toBe('st-s1');
    expect(world().sessionActive).toBe(false);
    expect(world().questFocus).toBe('Find the beacon');
  }, 30_000);
});

describe('Z01 controls — the same writes with no stamp due, and the GM\'s own X-Card', () => {
  it('control: the stamp not due (1 minute old) — a player\'s X-Card stays recorded, no stamp written', async () => {
    await resetTable(1);
    const server = serverOrder({
      relayWrite: (w) => w.client === 'gm-1' && w.value?.xCardActive === true,
      cardAfter:  (w) => w.client === 'pl-1' && w.data?.flags?.[MODULE_ID]?.xcardCard === true,
    });
    await table.client('pl-1').chat('!x');
    await table.settle();
    expect(server.sent).toHaveLength(1);              // the pause alone
    await server.applyAll();
    expect(world().xCardActive).toBe(true);
    expect(activity()).toBeNull();                    // not due: nothing stamped
  }, 30_000);

  it("control: a typed `!end-session` — the session is ended and stays ended", async () => {
    await resetTable(11);
    const server = serverOrder({
      relayWrite: (w) => w.client === 'gm-1' && w.value?.sessionEndedId === 'st-s1',
      cardAfter:  (w) => w.client === 'pl-1' && w.data?.flags?.[MODULE_ID]?.sessionLifecycleCard === true,
    });
    table.client('pl-1').answerDialogs(d => d.submit({ 'input[name="questFocus"]': 'Find the beacon', 'input[name="connectionFocus"]': '' }));
    const typing = table.client('pl-1').chat('!end-session');
    await table.settle();
    expect(server.sent.some(s => s.value.sessionEndedId === 'st-s1')).toBe(true);   // End's write was sent
    await server.applyAll();
    await typing;
    await table.drain();
    await server.applyAll();
    expect(world().sessionEndedId).toBe('st-s1');
    expect(world().questFocus).toBe('Find the beacon');
  }, 30_000);

  it("control: the GM's own X-Card with the stamp due — the pause stands and the session is kept alive", async () => {
    await resetTable(11);
    const server = serverOrder({
      relayWrite: (w) => w.client === 'gm-1' && w.value?.xCardActive === true,
      cardAfter:  () => false,
    });
    const typing = table.client('gm-1').chat('!x');
    await table.settle();
    await server.applyAll();
    await typing;
    await table.settle();
    await server.applyAll();
    expect(world().xCardActive).toBe(true);
    // The card's message refreshed when the session was last seen live.
    const seen = [Date.parse(world().lastSessionTimestamp ?? ''), Date.parse(activity()?.at ?? '')].filter(Number.isFinite);
    expect(Date.now() - Math.max(...seen)).toBeLessThan(60_000);
  }, 30_000);
});
