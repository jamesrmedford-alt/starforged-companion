/**
 * STARFORGED COMPANION
 * tests/unit/relayedSessionWriteRefused.test.js
 *
 * Issue #335 Y06 (RELAYED-SESSION-WRITE-REFUSED-SILENT) — a player's End a
 * Session, Set a Flag and Take a Break → Move on whose world write the world
 * refused on the canonical GM say so.
 *
 * The three cards post on the player's client before the GM acts, and a relay
 * has no ack (`{ ok: true, relayed: true }`), so the cards' own "not recorded"
 * footnotes only ever saw `ok: false` (no GM, or a local throw). On the GM the
 * handler's write threw and the relay's listener only logged it: the session
 * stayed active, no momentum, flag or +1 was stored, and the player's card
 * ("You take +1 momentum" / "Flag set" / "Take +1 on the next move") was the
 * last word on every client. Now the handler posts a note where the player's
 * card is (issue #329 X13's shape — Begin's "the session was not started").
 * The local (GM's own) path's card still says so itself, once.
 *
 * (Converted from the tenth audit's probe
 * tests/probes/session/endSessionRefusedRelayedSilent.probe.js.)
 */

/* global expectConsoleError */
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
import { failWrites, campaignStateWrite } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { applyMeterChanges } from '../../src/character/actorBridge.js';

let table;
const world = () => table.world.campaignState();
const sessionCards = () => table.cards(f => f.sessionLifecycleCard);
const FOCUS = { 'input[name="questFocus"]': 'Find the beacon', 'input[name="connectionFocus"]': '' };

const NOT_ENDED   = /not (be )?ended|could not (be )?end|was not ended|failed to end|not saved|could not be saved/i;
const NOT_SAVED   = /not (be )?(saved|recorded)|could not (be )?(save|record)|was not (saved|recorded)/i;

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

function liveSession(extra = {}) {
  return {
    ...CampaignStateSchema, sessionActive: true, sessionActiveStartedAt: new Date().toISOString(),
    sessionStartedId: 'es-s1', sessionEndedId: null, currentSessionId: 'es-s1', sessionNumber: 1,
    lastSessionTimestamp: new Date().toISOString(), currentSceneId: null, sceneTruths: [], clocks: [], safetyFlags: [],
    ...extra,
  };
}

async function resetTable(campaignState = liveSession()) {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false, autoRecapEnabled: false,
    campaignState,
  } } });
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  applyMeterChanges.mockClear();
}

beforeEach(async () => { await resetTable(); });

async function end(userId) {
  table.client(userId).answerDialogs(d => d.submit(FOCUS));
  await table.client(userId).chat('!end-session');
  await table.settle(); await table.drain();
}

async function setFlag(userId, visibility = 'public') {
  const { openSetFlagDialog } = await table.client(userId).import('../../src/safety/sessionDialogs.js');
  table.client(userId).answerDialogs(d => d.submit({ 'textarea[name="text"]': 'No harm to the ship\'s cat', 'select[name="visibility"]': visibility }));
  await table.client(userId).run(() => openSetFlagDialog());
  await table.settle(); await table.drain();
}

async function takeABreak(userId) {
  const { openTakeABreakDialog } = await table.client(userId).import('../../src/safety/sessionDialogs.js');
  table.client(userId).answerDialogs(d => d.choose('move_on'));
  await table.client(userId).run(() => openTakeABreakDialog());
  await table.settle(); await table.drain();
}

/** The gate write End a Session makes first: the one carrying `sessionEndedId` for this session. */
const endGateWrite = (w) => campaignStateWrite('gm-1')(w) && w.value?.sessionEndedId === 'es-s1';

/** Every chat card saying `said` (any client could see it). */
const cardsSaying = (said) => table.world.messages().filter(m => said.test(m.content ?? ''));

/** Anything the table could see saying `said` — a card, or a notification on either client. */
function someoneWasTold(said, about = /./) {
  const asANotice = ['gm-1', 'pl-1'].some(id =>
    table.client(id).notifications.some(n => about.test(n.message) && said.test(n.message)));
  return cardsSaying(said).length > 0 || asANotice;
}

describe("issue #335 Y06 — a player's session write the world refused on the GM", () => {
  it("a player's End: the GM posts that the session was not ended — the player's \"+1 momentum\" is not the last word", async () => {
    expectConsoleError(/session\.end/);                  // the relay's listener still logs the refusal
    const fault = failWrites(table, endGateWrite);
    await end('pl-1');

    expect(fault.refused).toBe(1);                       // the gate write was the one refused
    expect(world().sessionActive).toBe(true);            // the world is honest …
    expect(world().sessionEndedId).toBeNull();
    expect(applyMeterChanges).not.toHaveBeenCalled();    // … and no momentum was paid

    expect(someoneWasTold(NOT_ENDED, /session/i)).toBe(true);
    const [note] = cardsSaying(/The session was not ended/);
    expect(note.author).toBe('gm-1');                    // the GM's own card …
    expect(note.whisper ?? []).toEqual([]);              // … public, as the player's End card
    expect(note.content).toMatch(/No focus or momentum was recorded/);
    expect(sessionCards().at(-1)?.content ?? '').not.toMatch(/\+1 momentum/);
  }, 30_000);

  it("a player's End on a session already ended: the refused focus correction says so (the player's client posts no card)", async () => {
    await resetTable(liveSession({ sessionActive: false, sessionEndedId: 'es-s1' }));
    expectConsoleError(/session\.end/);
    const fault = failWrites(table, w => campaignStateWrite('gm-1')(w) && w.value?.questFocus === 'Find the beacon');
    await end('pl-1');

    expect(fault.refused).toBe(1);
    expect(world().questFocus ?? '').toBe('');
    expect(applyMeterChanges).not.toHaveBeenCalled();
    expect(sessionCards()).toHaveLength(1);              // the GM's note is the only card
    expect(sessionCards()[0].content).toMatch(/focus for next session was not updated/);
  }, 30_000);

  it("a player's public Set a Flag: the GM posts that the flag was not saved", async () => {
    expectConsoleError(/safety\.setFlag/);
    const fault = failWrites(table, w => campaignStateWrite('gm-1')(w) && (w.value?.safetyFlags?.length ?? 0) > 0);
    await setFlag('pl-1');

    expect(fault.refused).toBe(1);
    expect(world().safetyFlags ?? []).toHaveLength(0);     // the world has no flag …
    const flagCards = table.cards(f => f.safetyFlagCard);
    expect(flagCards.find(c => c.author === 'pl-1')?.content ?? '').toMatch(/Flag set/);   // … the player's card says it was set
    expect(someoneWasTold(NOT_SAVED)).toBe(true);
    const note = flagCards.find(c => c.author === 'gm-1');
    expect(note.content).toMatch(/The flag was not saved/);
    expect(note.whisper ?? []).toEqual([]);                // public, as the player's card
  }, 30_000);

  it("a player's private Set a Flag: the note is whispered to the player and the GMs, and never repeats the flag's text", async () => {
    expectConsoleError(/safety\.setFlag/);
    failWrites(table, w => campaignStateWrite('gm-1')(w) && (w.value?.safetyFlags?.length ?? 0) > 0);
    await setFlag('pl-1', 'private');

    const note = table.cards(f => f.safetyFlagCard).find(c => c.author === 'gm-1');
    expect(note.content).toMatch(/The flag was not saved/);
    expect(note.content).not.toMatch(/ship's cat|ship&#39;s cat/);
    expect([...note.whisper].sort()).toEqual(['gm-1', 'pl-1']);
  }, 30_000);

  it("a player's Take a Break → Move on: the GM posts that the +1 was not recorded", async () => {
    expectConsoleError(/session\.takeBreak/);
    const fault = failWrites(table, w => campaignStateWrite('gm-1')(w) && w.value?.nextMoveAdd?.source === 'take_a_break');
    await takeABreak('pl-1');

    expect(fault.refused).toBe(1);
    expect(world().nextMoveAdd ?? null).toBeNull();        // no +1 is pending in the world …
    const breakCards = table.cards(f => f.takeBreakCard);
    expect(breakCards.find(c => c.author === 'pl-1')?.content ?? '').toMatch(/\+1 on the next move/);   // … the player's card promised it
    expect(someoneWasTold(NOT_SAVED)).toBe(true);
    expect(breakCards.find(c => c.author === 'gm-1')?.content ?? '').toMatch(/was not recorded/);
  }, 30_000);

  it("control: the GM's own End under the same refusal says the session could not be ended — once (the local path's card)", async () => {
    expectConsoleError(/session\.end/);
    const fault = failWrites(table, endGateWrite);
    await end('gm-1');

    expect(fault.refused).toBe(1);
    expect(world().sessionActive).toBe(true);
    expect(someoneWasTold(NOT_ENDED, /session/i)).toBe(true);
    expect(sessionCards()).toHaveLength(1);
    expect(sessionCards()[0].content).toMatch(/could not be ended/);
  }, 30_000);

  it("control: the GM's own Set a Flag and Take a Break under a refusal carry their own footnote — no second note", async () => {
    expectConsoleError(/safety\.setFlag|session\.takeBreak/);
    failWrites(table, w => campaignStateWrite('gm-1')(w) && (w.value?.safetyFlags?.length ?? 0) > 0);
    await setFlag('gm-1');
    const flagCards = table.cards(f => f.safetyFlagCard);
    expect(flagCards).toHaveLength(1);
    expect(flagCards[0].content).toMatch(/The flag was not saved/);

    failWrites(table, w => campaignStateWrite('gm-1')(w) && w.value?.nextMoveAdd?.source === 'take_a_break');
    await takeABreak('gm-1');
    const breakCards = table.cards(f => f.takeBreakCard);
    expect(breakCards).toHaveLength(1);
    expect(breakCards[0].content).toMatch(/The \+1 was not recorded/);
  }, 30_000);

  it("control: without the refusal a player's End ends the session, pays the momentum once and the card is true", async () => {
    await end('pl-1');

    expect(world().sessionActive).toBe(false);
    expect(world().sessionEndedId).toBe('es-s1');
    expect(world().questFocus).toBe('Find the beacon');
    expect(applyMeterChanges).toHaveBeenCalledTimes(1);   // one PC at the table
    expect(sessionCards()).toHaveLength(1);
    expect(sessionCards()[0].content).toMatch(/\+1 momentum/);
  }, 30_000);

  it("control: without the refusal a player's flag and break land and only their own cards post", async () => {
    await setFlag('pl-1');
    await takeABreak('pl-1');

    expect(world().safetyFlags).toHaveLength(1);
    expect(world().nextMoveAdd?.source).toBe('take_a_break');
    expect(table.cards(f => f.safetyFlagCard)).toHaveLength(1);
    expect(table.cards(f => f.takeBreakCard)).toHaveLength(1);
    expect(cardsSaying(NOT_SAVED)).toHaveLength(0);
  }, 30_000);
});
