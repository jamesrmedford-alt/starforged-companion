/**
 * STARFORGED COMPANION
 * tests/unit/lastSessionWhileXCardStillPaused.test.js
 *
 * Issue #345 AA57 XCARD-ACTIVE-AT-MINT-LOSES-LAST-SESSION (the twelfth
 * audit's SESS-2; a residual of issue #342 Z41).
 *
 * The X-Card played on End a Session's closing vignette is still paused when
 * the next session starts (only a GM resumes; the table had left). Z41's
 * finalise runs at the mint, but getRollingSessionSummary discarded any reply
 * while the X-Card was active, so the emptied summary stayed empty and
 * mintSession kept the OLDER LAST SESSION (it needs text) — the narrator was
 * told the session before last was the last one, and nothing regenerated it
 * once the GM resumed (only the mint writes previousSessionSummary). Now a
 * reply is discarded only when the X-Card was played during its call, or its
 * source still holds a narration the X-Card removed.
 *
 * Production entry points: the narrator cards' rolling-summary refresh hook,
 * the End a Session and Begin a Session relays (session.end /
 * session.begin), a player's typed `!x`, and the GM's resume. Claude is
 * answered by the harness.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
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

function script() {
  let summaryCalls = 0;
  const claude = scriptClaude(table, {
    fallback: (call) => {
      if (isSummaryCall(call)) {
        summaryCalls += 1;
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

describe('issue #345 AA57 — the X-Card on End a Session\'s closing vignette, still paused when the next session starts', () => {
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
