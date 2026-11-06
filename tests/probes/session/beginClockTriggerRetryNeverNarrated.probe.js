/**
 * SESS-2 BEGIN-CLOCK-TRIGGER-RETRY-UNNARRATED (eleventh audit, session).
 *
 * Begin a Session rolls Ask the Oracle for each campaign clock. A clock one
 * segment from full rolls YES: the clock card reads "(TRIGGERED)". When the
 * world refuses that clock write, the roll is kept (issue #316 T04): the card
 * adds "not saved: see the GMs' Retry card", and the GMs' Retry saves the
 * rolled fill later. Its trigger vignette is narrated meanwhile — and since
 * TRIGGER-VIGNETTE-LATE-POST it is narrated only "while its clock is still
 * full when its reply comes in": the store is not full (the write was
 * refused), so the vignette is dropped as a rewound trigger. The Retry then
 * fills the clock and fires no vignette. The trigger lands — the clock is
 * full — and its moment is never narrated, where before the fix it was.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../../src/oracles/roller.js', async (original) => ({
  ...(await original()), rollYesNo: vi.fn(() => ({ answer: 'yes', roll: 1, isMatch: false })),
}));

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

let table;
const world = () => table.world.campaignState();
const clock = () => world().clocks.find(c => c._id === 'campaign-a');
const retryCards = () => table.cards(f => f.payoffFailureCard && f.source === 'sessionClocks');
const clockCards = () => table.cards(f => f.clockCard && f.beginSessionAdvance).map(m => m.content);
const triggerVignettes = () => table.cards(f => f.clockVignetteCard && f.clockId === 'campaign-a');

async function begin(userId = 'gm-1') {
  const api = await table.client(userId).import('../../src/multiplayer/gmRelay.js');
  await table.client(userId).run(() => api.requestGmAction('session.begin', { vignetteRolled: false, includeGalley: false }));
  await table.settle(); await table.drain();
}

/** Refuse the first campaign-state write that saves the clock at `filled`. */
function refuseClockWrite(filled) {
  const seen = { refused: false };
  table.interceptWrites(w => {
    if (!seen.refused && w.kind === 'setting' && w.key === `${MODULE_ID}.campaignState`
        && w.value?.clocks?.find(c => c._id === 'campaign-a')?.filled === filled) {
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

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false,
    campaignState: { ...CampaignStateSchema, sessionActive: false, sessionStartedId: null, currentSessionId: 'bct-s1',
      sessionNumber: 1, lastSessionTimestamp: new Date().toISOString(), currentSceneId: null, sceneTruths: [],
      clocks: [{ _id: 'campaign-a', name: 'Hostile expansion', type: 'campaign', segments: 6, filled: 5, active: true, advanceOdds: 'likely' }] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  scriptClaude(table, { fallback: () => 'The Hegemony fleet crosses the last buoy line and opens fire.' });
});

describe('SESS-2 — a session-start campaign clock trigger whose write was refused, then retried', () => {
  it('the trigger the Retry saves is narrated once (its TRIGGERED vignette)', async () => {
    const fault = refuseClockWrite(6);
    await begin();
    expect(fault.refused).toBe(true);                                         // sanity: refused
    expect(clockCards().at(-1)).toMatch(/6\/6.*TRIGGERED.*not saved: see the GMs' Retry card/);
    expect(clock().filled).toBe(5);

    const [card] = retryCards();
    expect(card).toBeTruthy();
    await retry(card);
    expect(clock().filled).toBe(6);                                           // the trigger landed

    expect(triggerVignettes()).toHaveLength(1);
  }, 30_000);

  it('control: the write accepted — one TRIGGERED vignette, naming its clock', async () => {
    await begin();
    expect(clock().filled).toBe(6);
    expect(triggerVignettes()).toHaveLength(1);
    expect(triggerVignettes()[0].content).toMatch(/TRIGGERED/);
  }, 30_000);
});
