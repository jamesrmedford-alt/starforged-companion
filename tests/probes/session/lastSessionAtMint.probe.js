/**
 * STARFORGED COMPANION — twelfth bug audit, session area (SESS)
 * tests/probes/session/lastSessionAtMint.probe.js
 *
 * Two residuals of issue #342 Z41 (XCARD-AFTER-END-LOSES-LAST-SESSION). The
 * mint (rollSessionIfDue, src/session/lifecycle.js:328-352) keeps the closing
 * session's rolling summary as `previousSessionSummary` — the narrator's LAST
 * SESSION block (mintSession, lifecycle.js:259-305). Z41 made the mint bring
 * an ENDED session's summary up to date, but only when it has no text
 * (lifecycle.js:332-334: `closing && (!ended || !summarised)`), on the
 * premise (lifecycle.js:317-318) that an End "left with text … lacks only
 * End's own closing vignette".
 *
 *   SESS-1  End a Session's own summary refresh did not land — the summary
 *           call failed (a 529 overload, a network error) or the GM closed the
 *           tab during it (sessionLifecycleDialogs.js:649-654 catches and goes
 *           on). The summary still has the text of its last debounced regen
 *           (every ~1.5× ring depth = 30 cards by default), so the mint keeps
 *           it as it is: LAST SESSION is missing the session's final beats.
 *           finalizeSessionSummary (narrator.js:2341-2353) would have
 *           regenerated it (covered < total) but is never called.
 *
 *   SESS-2  The X-Card played on End's closing vignette is still paused when
 *           the next session starts (only a GM resumes; the table had left).
 *           Z41's finalise runs, but getRollingSessionSummary discards any
 *           reply while the X-Card is active (narrator.js:2234), so the
 *           emptied summary stays empty and mintSession keeps the OLDER
 *           LAST SESSION (lifecycle.js:270 needs text) — the narrator is told
 *           the session before last was the last one; nothing regenerates it
 *           once the GM resumes (only the mint writes previousSessionSummary).
 *           The Z41 regression test resumes before the mint
 *           (tests/unit/xcardAfterEndLastSession.test.js: "the GM resumes
 *           before the next session").
 *
 * Production entry points: the narrator cards' rolling-summary refresh hook
 * (narrator.js:2302-2308), the End a Session and Begin a Session relays
 * (session.end / session.begin), a player's typed `!x`, and the GM's resume.
 * Claude is answered by the harness.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude, claudeFault } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

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

describe('SESS-1 — End a Session whose own summary refresh did not land', () => {
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
  }, 60_000);

  it("control: End's refresh landed — LAST SESSION is End's summary, and the mint asks for no second one", async () => {
    await resetWorld();
    const s = script();
    for (const [tag, prose] of [['A1', 'The dockmaster waves the Wayfarer in.'], ['A2', 'Kira trades the coolant.'],
      ['A3', 'The patrol hails the docks.'], ['A4', 'The reactor breach seals with Kira inside.']]) await narrate(tag, prose);
    await endSession();
    const afterEnd = s.summaryCalls();
    expect(world().sessionSummary.text).toMatch(/\[A4\]/);
    await beginSession();
    expect(world().previousSessionSummary).toMatchObject({ sessionId: S1, sessionNumber: 3 });
    expect(world().previousSessionSummary.text).toMatch(/\[A1\].*\[A4\]/);
    expect(s.summaryCalls()).toBe(afterEnd);
  }, 60_000);
});

describe('SESS-2 — the X-Card on End a Session\'s closing vignette, still paused when the next session starts', () => {
  async function playEndAndXCard() {
    await resetWorld();
    const s = script();
    await narrate('B1', 'The dockmaster owes the crew a favour now.');
    // Someone speaks between the two narrations (an emote: table talk the
    // pipeline does not narrate) — the X-Card's beat starts after it.
    await table.client('pl-1').chat('heads for the cells.', { style: 3 });
    await table.settle();
    await narrate('B2', 'The interrogator lifts the cutting torch to the prisoner\'s hand.');
    await endSession();
    expect(world().sessionSummary?.text ?? '').toMatch(/\[B2\]/);          // End's summary covered the last beat
    const vignette = table.cards(f => f.vignetteKind === 'npc_end');
    expect(vignette).toHaveLength(1);                                       // the closing vignette posted
    await table.client('pl-1').chat('!x');                                  // a player X-cards it
    await table.settle(); await table.drain();
    expect(world().xCardActive).toBe(true);
    expect(table.cards(f => f.xCarded).map(m => m.flags[MODULE_ID].narrationId)).toContain('nar-B2');
    expect(world().sessionSummary?.text ?? '').toBe('');                    // the summary emptied, a regen due
    return s;
  }

  it("the next session's LAST SESSION is the ended session (without the removed beat), not the session before it", async () => {
    await playEndAndXCard();
    // Nobody resumed: the table had left. The next session starts paused.
    await beginSession();
    expect(world().currentSessionId).not.toBe(S1);
    // The GM notices the pause and resumes.
    const { clearXCard } = await table.client('gm-1').import('../../src/context/safety.js');
    await table.client('gm-1').run(() => clearXCard());
    await table.settle(); await table.drain();

    const last = world().previousSessionSummary;
    expect.soft(last?.text ?? '', 'LAST SESSION text').not.toMatch(/\[B2\]|cutting torch/);
    expect(last?.sessionId ?? null, "LAST SESSION is the session just played, not session 2's").toBe(S1);
    expect(last?.text ?? '').toMatch(/\[B1\]/);
  }, 60_000);

  it('control: the GM resumed before the next session — the mint regenerates LAST SESSION without the removed beat (Z41)', async () => {
    await playEndAndXCard();
    const { clearXCard } = await table.client('gm-1').import('../../src/context/safety.js');
    await table.client('gm-1').run(() => clearXCard());
    await table.settle(); await table.drain();
    await beginSession();
    const last = world().previousSessionSummary;
    expect(last?.sessionId).toBe(S1);
    expect(last?.text).toMatch(/\[B1\]/);
    expect(last?.text).not.toMatch(/\[B2\]/);
  }, 60_000);
});
