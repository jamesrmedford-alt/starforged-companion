/**
 * STARFORGED COMPANION
 * tests/unit/lastSessionAfterEndRefreshFailed.test.js
 *
 * Issue #345 AA21 LAST-SESSION-MISSES-SESSION-END (the twelfth audit's SESS-1).
 *
 * The mint (rollSessionIfDue, src/session/lifecycle.js) keeps the closing
 * session's rolling summary as `previousSessionSummary` — the narrator's LAST
 * SESSION block. Issue #342 Z41 made the mint bring an ENDED session's
 * summary up to date, but only when it had no text, on the premise that an
 * End "left with text … lacks only End's own closing vignette".
 *
 * End a Session's own summary refresh need not land: the summary call fails
 * (a 529 overload, a network error) or the GM closes the tab during it (End
 * catches and goes on). The summary still had the text of its last debounced
 * regen, so the mint kept it as it was: LAST SESSION missed the session's
 * final beats. Now the mint brings every closing session's summary up to date
 * (finalizeSessionSummary) — no call when the only card it misses is End's
 * own closing vignette.
 *
 * Production entry points: the narrator cards' rolling-summary refresh hook,
 * the End a Session and Begin a Session relays (session.end / session.begin).
 * Claude is answered by the harness.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude, claudeFault } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const S1 = 'lsm-s1';
const OLDER = { sessionId: 'lsm-s0', sessionNumber: 2, text: 'SESSION TWO — the crew slipped out of Bleakhold.', updatedAt: '2026-11-01T00:00:00.000Z' };

let table;
const world = () => table.world.campaignState();
const isSummaryCall = (call) => /continuity scribe/.test(call?.system ?? '');

/** The scripted summary: the tags of the passages it was given, in order. */
function summaryOf(call) {
  const tags = [...String(call?.userText ?? '').matchAll(/\[([AB]\d)\]/g)].map(m => m[1]);
  return `Summary of ${[...new Set(tags)].map(t => `[${t}]`).join(' ')}.`;
}

function script({ failSummaryCall = null } = {}) {
  let summaryCalls = 0;
  const claude = scriptClaude(table, {
    fallback: (call) => {
      if (isSummaryCall(call)) {
        summaryCalls += 1;
        if (failSummaryCall === summaryCalls) return claudeFault.overloaded();
        return summaryOf(call);
      }
      return 'Vex polishes a rifle in the galley, humming.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
    },
  });
  return { claude, summaryCalls: () => summaryCalls };
}

async function resetWorld() {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, sessionLogAutoWrite: false, autoRecapEnabled: false,
    narratorSessionSummary: true,
    narratorContextCards: 2,             // the regen debounce: round(1.5 × 2) = 3 cards
    campaignState: {
      ...CampaignStateSchema, currentSessionId: S1, sessionNumber: 3, sessionActive: true,
      sessionStartedId: S1, sessionActiveStartedAt: new Date().toISOString(),
      lastSessionTimestamp: new Date().toISOString(), sessionEndedId: null,
      currentSceneId: null, sceneTruths: [], previousSessionSummary: OLDER, sessionSummary: null,
      xCardActive: false, xCardPlays: 0, clocks: [],
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
}

/** A narration the GM's pipeline posted in the session (the narrator card's flag family). */
async function narrate(tag, prose) {
  const text = `${prose} [${tag}]`;
  await table.client('gm-1').run(() => globalThis.ChatMessage.create({
    content: `<p>${text}</p>`,
    flags: { [MODULE_ID]: { narratorCard: true, narrationText: text, sessionId: S1, narrationId: `nar-${tag}` } },
  }));
  await table.settle(); await table.drain();
}

async function relay(kind, payload, userId = 'gm-1') {
  const api = await table.client(userId).import('../../src/multiplayer/gmRelay.js');
  const res = await table.client(userId).run(() => api.requestGmAction(kind, payload));
  await table.settle(); await table.drain();
  return res;
}

const endSession   = () => relay('session.end', { questFocus: '', connectionFocus: '' });
const beginSession = () => relay('session.begin', { vignetteRolled: false, includeGalley: false });

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

describe('issue #345 AA21 — End a Session whose own summary refresh did not land', () => {
  it("the next session's LAST SESSION covers the session's final beat (the mint brings the stale summary up to date)", async () => {
    await resetWorld();
    const s = script({ failSummaryCall: 2 });           // call 1: the debounced regen; call 2: End's refresh → 529
    await narrate('A1', 'The dockmaster waves the Wayfarer in.');
    await narrate('A2', 'Kira trades the coolant for passage codes.');
    await narrate('A3', 'The Hegemony patrol hails the docks.');
    expect(world().sessionSummary).toMatchObject({ sessionId: S1, coveredCount: 3 });   // the debounced regen ran
    await narrate('A4', 'The reactor breach seals with Kira still inside.');
    expect(world().sessionSummary.coveredCount).toBe(3);                                 // below the debounce

    await endSession();
    expect(s.summaryCalls()).toBe(2);                                                    // End's refresh was made …
    expect(world().sessionEndedId).toBe(S1);
    expect(world().sessionSummary.text).not.toMatch(/\[A4\]/);                            // … and failed

    await beginSession();                                                                 // the next session's mint
    expect(world().currentSessionId).not.toBe(S1);
    expect(world().previousSessionSummary?.sessionId, 'LAST SESSION is the ended session').toBe(S1);
    expect(world().previousSessionSummary?.text ?? '', "LAST SESSION holds the session's final beat").toMatch(/\[A4\]/);
    expect(s.summaryCalls(), 'the mint made the one summary call that brought it up to date').toBe(3);
  }, 60_000);

  it("control: End's refresh landed — LAST SESSION is End's summary, and the mint asks for no second one", async () => {
    await resetWorld();
    const s = script();
    for (const [tag, prose] of [['A1', 'The dockmaster waves the Wayfarer in.'], ['A2', 'Kira trades the coolant.'],
      ['A3', 'The patrol hails the docks.'], ['A4', 'The reactor breach seals with Kira inside.']]) await narrate(tag, prose);
    await endSession();
    const afterEnd = s.summaryCalls();
    expect(world().sessionSummary.text).toMatch(/\[A4\]/);
    expect(table.cards(f => f.vignetteKind === 'npc_end'), "End's closing vignette posted after its refresh").toHaveLength(1);
    await beginSession();
    expect(world().previousSessionSummary).toMatchObject({ sessionId: S1, sessionNumber: 3 });
    expect(world().previousSessionSummary.text).toMatch(/\[A1\].*\[A4\]/);
    expect(s.summaryCalls()).toBe(afterEnd);
  }, 60_000);
});
