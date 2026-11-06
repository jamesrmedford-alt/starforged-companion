/**
 * STARFORGED COMPANION
 * tests/unit/beginClockTriggerRetryNarrated.test.js
 *
 * Issue #342 Z63 (BEGIN-CLOCK-TRIGGER-RETRY-UNNARRATED) — a regression of
 * TRIGGER-VIGNETTE-LATE-POST at its Begin a Session site.
 *
 * Begin a Session rolls Ask the Oracle for each campaign clock. A clock one
 * segment from full rolls YES: the clock card reads "(TRIGGERED)". When the
 * world refuses that clock write, the roll is kept (issue #316 T04): the card
 * adds "not saved: see the GMs' Retry card", and the GMs' Retry saves the
 * rolled fill later. Its trigger vignette was narrated meanwhile — and since
 * TRIGGER-VIGNETTE-LATE-POST a trigger is narrated only "while its clock is
 * still full when its reply comes in": the store was not full (the write was
 * refused), so the vignette was dropped as a rewound trigger. The Retry then
 * filled the clock and fired no vignette: the trigger landed and its moment
 * was never narrated.
 *
 * A refused fill is owed, not taken back: Begin now leaves an unsaved trigger
 * to the Retry, whose fill narrates it once its write lands
 * (clocks.applyClockAdvances).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../src/oracles/roller.js', async (original) => ({
  ...(await original()), rollYesNo: vi.fn(() => ({ answer: 'yes', roll: 1, isMatch: false })),
}));

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

let table;
const world = () => table.world.campaignState();
const clock = () => world().clocks.find(c => c._id === 'campaign-a');
const retryCards = () => table.cards(f => f.payoffFailureCard && f.source === 'sessionClocks');
const clockCards = () => table.cards(f => f.clockCard && f.beginSessionAdvance).map(m => m.content);
const triggerVignettes = () => table.cards(f => f.clockVignetteCard && f.clockId === 'campaign-a');
const clockVignettes = () => table.cards(f => f.clockVignetteCard);

async function begin(userId = 'gm-1') {
  const api = await table.client(userId).import('../../src/multiplayer/gmRelay.js');
  await table.client(userId).run(() => api.requestGmAction('session.begin', { vignetteRolled: false, includeGalley: false }));
  await table.settle(); await table.drain();
}

/** Refuse the first campaign-state write that saves the clock at `filled`. */
function refuseClockWrite(filled, id = 'campaign-a') {
  const seen = { refused: false };
  table.interceptWrites(w => {
    if (!seen.refused && w.kind === 'setting' && w.key === `${MODULE_ID}.campaignState`
        && w.value?.clocks?.find(c => c._id === id)?.filled === filled) {
      seen.refused = true;
      return new Error('test: refuse the session-start clock write once');
    }
    return undefined;
  });
  return seen;
}

async function retry(card, userId = 'gm-1') {
  table.client(userId).click(card._id, '[data-action="sf-payoff-retry"]');
  await table.settle(); await table.drain();
}

const CLOCK = { _id: 'campaign-a', name: 'Hostile expansion', type: 'campaign', segments: 6, filled: 5, active: true, advanceOdds: 'likely' };

async function resetWith(clocks) {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false,
    campaignState: { ...CampaignStateSchema, sessionActive: false, sessionStartedId: null, currentSessionId: 'bct-s1',
      sessionNumber: 1, lastSessionTimestamp: new Date().toISOString(), currentSceneId: null, sceneTruths: [],
      clocks },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  scriptClaude(table, { fallback: () => 'The Hegemony fleet crosses the last buoy line and opens fire.' });
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => { await resetWith([CLOCK]); });

describe('issue #342 Z63 — a session-start campaign clock trigger whose write was refused, then retried', () => {
  it('the trigger the Retry saves is narrated once (its TRIGGERED vignette)', async () => {
    const fault = refuseClockWrite(6);
    await begin();
    expect(fault.refused).toBe(true);                                         // sanity: refused
    expect(clockCards().at(-1)).toMatch(/6\/6.*TRIGGERED.*not saved: see the GMs' Retry card/);
    expect(clock().filled).toBe(5);
    expect(triggerVignettes()).toHaveLength(0);                               // owed: nothing narrated ahead of the fill

    const [card] = retryCards();
    expect(card).toBeTruthy();
    await retry(card);
    expect(clock().filled).toBe(6);                                           // the trigger landed

    expect(triggerVignettes()).toHaveLength(1);
    expect(triggerVignettes()[0].content).toMatch(/Hegemony fleet/);
  }, 30_000);

  it('a Retry whose clock a GM already filled by hand narrates nothing more', async () => {
    refuseClockWrite(6);
    await begin();
    const [card] = retryCards();
    // The GM fills it by hand meanwhile (`!clock fill`, the panel's +): its own trigger vignette.
    const clocks = await table.client('gm-1').import('../../src/clocks/clocks.js');
    await table.client('gm-1').run(() => clocks.handleClockCommand({ content: '!clock fill "Hostile expansion"' }));
    await table.settle(); await table.drain();
    expect(clock().filled).toBe(6);
    expect(triggerVignettes()).toHaveLength(1);
    await retry(card);
    expect(clock().filled).toBe(6);
    expect(triggerVignettes()).toHaveLength(1);                               // the Retry saved nothing, so narrated nothing
  }, 30_000);

  it('control: the write accepted — one TRIGGERED vignette at Begin, naming its clock', async () => {
    await begin();
    expect(clock().filled).toBe(6);
    expect(triggerVignettes()).toHaveLength(1);
    expect(triggerVignettes()[0].content).toMatch(/TRIGGERED/);
    expect(retryCards()).toHaveLength(0);
  }, 30_000);

  it('control: an advance short of the trigger whose write was refused is still narrated at Begin, and its Retry adds no vignette', async () => {
    await resetWith([{ ...CLOCK, filled: 3 }]);
    refuseClockWrite(4);
    await begin();
    expect(clock().filled).toBe(3);
    expect(clockVignettes()).toHaveLength(1);                                 // the "grows by a notch" vignette, as before
    expect(triggerVignettes()).toHaveLength(0);
    const [card] = retryCards();
    await retry(card);
    expect(clock().filled).toBe(4);
    expect(clockVignettes()).toHaveLength(1);
  }, 30_000);
});
