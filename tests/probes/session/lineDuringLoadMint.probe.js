/**
 * STARFORGED COMPANION — twelfth bug audit, session area (SESS)
 * tests/probes/session/lineDuringLoadMint.probe.js
 *
 * SESS-4 — the free-flow sibling of issue #342 Z24
 * (BATCH-IDLE-ROUND-RECOVERED-LIVE).
 *
 * A session nobody ended goes idle (four hours, no chat) with its
 * session-active gate still open. At the next world load the canonical GM's
 * ready hook mints the next session (index.js:7385-7400 → initSessionId →
 * rollSessionIfDue, lifecycle.js:328-352), which first awaits the closing
 * session's summary call (finalizeSessionSummary) and its scene close — the
 * stored session still reads live (gate open, its id current) until the mint
 * lands. Z24 made the session a load is replacing "over at once" for Batch
 * Mode rounds (batch/driver.js:1617-1633 `_sessionBeingReplaced`; decisions.md
 * "Issue #342 audit": "the session a load is replacing is over at once (no
 * round reads, resolves or opens in it)"). The free-flow chat gate still reads
 * the gate alone (index.js:862-881 `isSessionActive`), so a player's line
 * typed while the GM's world is loading is narrated INTO the session being
 * closed: after its LAST SESSION summary was taken (so LAST SESSION never
 * holds it) and under its old id (so the new session's ring never shows it)
 * — a narration nobody remembers, made before anyone began the new session.
 *
 * Production entry points: the canonical GM's world load (boot → ready), a
 * player's typed line through the chat hook, the real paced narrator; the
 * pacing classifier's verdict is stubbed at routePacedInput (NARRATIVE), and
 * Claude is answered by the harness — the load's summary call held while the
 * player types.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ routed: [] }));
vi.mock('../../../src/pacing/router.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    // The classifier's verdict is NARRATIVE: the real paced narrator runs, on a
    // working copy, exactly as routePacedInput does.
    routePacedInput: vi.fn(async ({ playerText, campaignState, speakerActorId }) => {
      control.routed.push(campaignState?.currentSessionId ?? null);
      const { narratePacedInput } = await import('../../../src/narration/narrator.js');
      await narratePacedInput(playerText, globalThis.foundry.utils.deepClone(campaignState), { speakerActorId });
      return { runMove: false, decision: 'NARRATIVE', suggestedMove: null };
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const hoursAgo = (h) => new Date(Date.now() - h * 3_600_000).toISOString();
const LINE = 'I check the airlock seals one more time.';
const NARRATION = 'The seals hiss and hold; frost creeps along the inner hatch.';
const isSummaryCall = (call) => /continuity scribe/.test(call?.system ?? '');

let table;
afterEach(async () => { await table?.teardown(); table = null; control.routed = []; });

async function boot({ idle }) {
  table = await simulateTable({
    users: [USERS.GM, USERS.P1], boot: false,
    clientSettings: { 'gm-1': { claudeApiKey: 'sk-ant-gina' } },
    world: { settings: {
      chronicleAutoEntry: false, sessionLogAutoWrite: false, autoRecapEnabled: false, narratorSessionSummary: true,
      campaignState: {
        ...CampaignStateSchema, currentSessionId: 'ldm-s1', sessionNumber: 4,
        // Played, then everyone left without End a Session: the gate is still open.
        sessionActive: true, sessionStartedId: 'ldm-s1', sessionActiveStartedAt: hoursAgo(idle ? 30 : 2),
        lastSessionTimestamp: hoursAgo(idle ? 26 : 1), sessionEndedId: null,
        currentSceneId: null, sceneTruths: [], xCardActive: false,
      },
    } },
  });
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  const claude = scriptClaude(table, {
    fallback: (call) => (isSummaryCall(call) ? 'Kira bargained for passage codes at the docks.'
      : `${NARRATION}\n\`\`\`json\n{"newTruths":[],"stateChanges":[]}\n\`\`\``),
  });
  // The player is in the world first, and last session's narration is in chat.
  await table.client('pl-1').boot();
  await table.client('pl-1').run(() => globalThis.ChatMessage.create({
    content: '<p>Kira bargains for passage codes.</p>',
    flags: { [MODULE_ID]: { narratorCard: true, narrationText: 'Kira bargains for passage codes.', sessionId: 'ldm-s1', narrationId: 'nar-old' } },
  }));
  await table.settle();
  return claude;
}

const lineNarrations = () => table.cards(f => f.narratorCard && /frost creeps/.test(f.narrationText ?? ''));

describe('SESS-4 — a line typed while the world load closes the idle session', () => {
  it('is not narrated into the session the load is replacing (it is gated, as a round is since Z24)', async () => {
    const claude = await boot({ idle: true });
    const held = claude.hold(isSummaryCall);          // the load's LAST SESSION summary call
    const booting = table.client('gm-1').boot();      // the GM's world load
    await held.arrived;                               // the mint is under way, the store still reads live
    await table.client('pl-1').chat(LINE, { speaker: { actor: 'pc-kira' } });
    await table.settle();
    held.release();
    await booting;
    await table.settle(); await table.drain();

    const cs = table.world.campaignState();
    expect(cs.currentSessionId, 'sanity: the load minted the next session').not.toBe('ldm-s1');
    expect(cs.sessionActive).toBe(false);
    expect(cs.previousSessionSummary?.sessionId).toBe('ldm-s1');
    // What happened to the line: narrated in the old session, after its summary was taken.
    const narrated = lineNarrations().map(m => m.flags[MODULE_ID].sessionId);
    expect.soft(control.routed, 'the line reached the pacing router').toEqual([]);
    expect(narrated, 'narrated into the closing session (lost to LAST SESSION and to the new ring)').toEqual([]);
  }, 60_000);

  it('control: a reload inside a live session — the line is narrated, in that session', async () => {
    const claude = await boot({ idle: false });
    claude.hold(isSummaryCall);                       // nothing to hold: no mint
    await table.client('gm-1').boot();
    await table.settle();
    await table.client('pl-1').chat(LINE, { speaker: { actor: 'pc-kira' } });
    await table.settle(); await table.drain();

    expect(table.world.campaignState().currentSessionId).toBe('ldm-s1');
    expect(lineNarrations().map(m => m.flags[MODULE_ID].sessionId)).toEqual(['ldm-s1']);
  }, 60_000);
});
