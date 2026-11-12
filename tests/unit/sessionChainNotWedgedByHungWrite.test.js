/**
 * STARFORGED COMPANION
 * tests/unit/sessionChainNotWedgedByHungWrite.test.js
 *
 * A Begin or End a Session whose write the server never answers does not
 * hold every later one (issue #347 AB05).
 *
 * Begin and End each run one at a time on the canonical GM (`_beginChain` /
 * `_endChain`), holding "even past the relay queue's wait cap" so two never
 * both apply the start effects. Behind a handler that never settled — a write
 * lost with its connection — every later Begin (End) never ran: no card, no
 * state change, until a reload. Each now waits for the one ahead of it for at
 * most five minutes.
 */
/* global silenceConsoleErrors */
import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('../../src/narration/narrator.js', async (orig) => ({
  ...(await orig()),
  narrateSessionVignette:   vi.fn(async () => null),
  narrateClockAdvancement:  vi.fn(async () => null),
  getRollingSessionSummary: vi.fn(async () => ''),
  finalizeSessionSummary:   vi.fn(async () => {}),
  getCampaignRecap:         vi.fn(async () => ''),
}));

import { simulateTable, USERS } from '../helpers/multiClient.js';
import { campaignStateWrite } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

let table = null;
const world = () => table.world.campaignState();
const sessionCards = () => table.cards(f => f.sessionLifecycleCard);

afterEach(async () => {
  vi.useRealTimers();
  const t = table;
  table = null;
  await t?.teardown();
});

async function bootTable(state) {
  table = await simulateTable({
    users: [USERS.GM, USERS.P1],
    world: { settings: {
      chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false,
      campaignState: {
        ...CampaignStateSchema, currentSessionId: 'ch-s1', sessionNumber: 1,
        lastSessionTimestamp: new Date().toISOString(), clocks: [], safetyFlags: [], ...state,
      },
    } },
  });
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
}

/** The server never answers the first canonical-GM campaignState write that matches. */
function neverAnswer(match) {
  const seen = { arrived: false };
  table.interceptWrites((w) => {
    if (seen.arrived || !campaignStateWrite('gm-1')(w) || !match(w.value ?? {})) return undefined;
    seen.arrived = true;
    return new Promise(() => {});
  });
  return seen;
}

/** A player's relayed session action (the dialog's own apply path). */
async function relayFromPlayer(kind, payload) {
  const player = table.client('pl-1');
  const api = await player.import('../../src/multiplayer/gmRelay.js');
  await player.run(() => api.requestGmAction(kind, payload));
  await table.settle();
}

async function pass(ms) {
  await vi.advanceTimersByTimeAsync(ms);
  await table.settle();
}

describe('Begin a Session behind a Begin whose handler never settles', () => {
  it('control: two Begins ten minutes apart — the first begins the session, the second says it has already begun', async () => {
    await bootTable({ sessionActive: false, sessionStartedId: null });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    await relayFromPlayer('session.begin', { vignetteRolled: false, includeGalley: false });
    await pass(1_000);
    expect(world()).toMatchObject({ sessionActive: true, sessionStartedId: 'ch-s1' });

    await pass(10 * 60_000);
    await relayFromPlayer('session.begin', { vignetteRolled: false, includeGalley: false });
    await pass(1_000);
    expect(sessionCards().map(c => c.content).join(' ')).toMatch(/already begun/);
  }, 60_000);

  it('a Begin pressed ten minutes after one whose session-start write was never answered has an outcome', async () => {
    await bootTable({ sessionActive: false, sessionStartedId: null });
    silenceConsoleErrors();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const hung = neverAnswer(v => v.sessionActive === true);

    await relayFromPlayer('session.begin', { vignetteRolled: false, includeGalley: false });
    await pass(1_000);
    expect(hung.arrived, 'the session-start write was sent and is unanswered (setup)').toBe(true);
    expect(world().sessionActive, 'the world did not begin (setup)').toBe(false);

    // Ten minutes on — the relay queue passed the hung handler at 270 s — the
    // table presses Begin a Session again. No write is held any more.
    await pass(10 * 60_000);
    await relayFromPlayer('session.begin', { vignetteRolled: false, includeGalley: false });
    await pass(10 * 60_000);

    const told = sessionCards().some(c => /not started|already begun/i.test(c.content));
    expect(
      { begunOrTold: world().sessionActive === true || told },
      'the second Begin never ran: it is queued on _beginChain behind the handler that never settles',
    ).toEqual({ begunOrTold: true });
  }, 60_000);
});

describe('End a Session behind an End whose handler never settles', () => {
  it('control: an End ends the session', async () => {
    await bootTable({ sessionActive: true, sessionStartedId: 'ch-s1', sessionActiveStartedAt: new Date().toISOString() });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    await relayFromPlayer('session.end', { questFocus: '', connectionFocus: '' });
    await pass(1_000);
    expect(world()).toMatchObject({ sessionActive: false, sessionEndedId: 'ch-s1' });
  }, 60_000);

  it('an End pressed ten minutes after one whose gate write was never answered has an outcome', async () => {
    await bootTable({ sessionActive: true, sessionStartedId: 'ch-s1', sessionActiveStartedAt: new Date().toISOString() });
    silenceConsoleErrors();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const hung = neverAnswer(v => v.sessionEndedId === 'ch-s1');

    await relayFromPlayer('session.end', { questFocus: '', connectionFocus: '' });
    await pass(1_000);
    expect(hung.arrived, 'the gate write was sent and is unanswered (setup)').toBe(true);
    expect(world().sessionActive, 'the session is still open (setup)').toBe(true);

    await pass(10 * 60_000);
    await relayFromPlayer('session.end', { questFocus: '', connectionFocus: '' });
    await pass(10 * 60_000);

    const told = sessionCards().some(c => /not ended|already ended/i.test(c.content));
    expect(
      { endedOrTold: world().sessionActive === false || told },
      'the second End never ran: it is queued on _endChain behind the handler that never settles',
    ).toEqual({ endedOrTold: true });
  }, 60_000);
});
