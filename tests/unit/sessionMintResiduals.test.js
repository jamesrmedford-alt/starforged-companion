/**
 * STARFORGED COMPANION
 * tests/unit/sessionMintResiduals.test.js
 *
 * The session mint's residuals (issue #345 AA58's):
 *
 *   - SESSION-MINT-RACE: the world-load mint and a Begin a Session landing
 *     during its summary call both minted; the load's write then overwrote
 *     Begin's session id and its open gate. Mints now run one at a time on a
 *     client (lifecycle.js serialiseSessionMint): Begin waits for the load's
 *     to land and begins the session it minted.
 *   - BEGIN-MINT-LINE-WINDOW: Begin a Session's own mint — a session that went
 *     idle with its gate open while the GM's game stayed loaded — had AA58's
 *     window: a line typed during Begin's summary call was narrated into the
 *     closing session after its summary was taken. rollSessionIfDue now notes
 *     the session it replaces for every caller, so the chat gate (and the
 *     Batch Mode driver) treat it as over at once.
 *
 * Harness: lineTypedDuringLoadMintIsGated.test.js's (the GM's world load, a
 * player's typed line through the chat hook, the real paced narrator; the
 * summary call held).
 */

import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('../../src/pacing/router.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    routePacedInput: vi.fn(async ({ playerText, campaignState, speakerActorId }) => {
      const { narratePacedInput } = await import('../../src/narration/narrator.js');
      await narratePacedInput(playerText, globalThis.foundry.utils.deepClone(campaignState), { speakerActorId });
      return { runMove: false, decision: 'NARRATIVE', suggestedMove: null };
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { makeJournal } from '../helpers/fullStateFixture.js';
import { JOURNAL_NAMES } from '../../src/world/worldJournal.js';
import { playedBeats, citedSummaryReply } from '../helpers/sessionRecordSeed.js';

const hoursAgo = (h) => new Date(Date.now() - h * 3_600_000).toISOString();
const LINE = 'I check the airlock seals one more time.';
const NARRATION = 'The seals hiss and hold; frost creeps along the inner hatch.';
const isSummaryCall = (call) => /continuity scribe/.test(call?.system ?? '');
const lineNarrations = () => table.cards(f => f.narratorCard && /frost creeps/.test(f.narrationText ?? ''));

let table;
let closingSummary = () => null;
afterEach(async () => { await table?.teardown(); table = null; });

/**
 * The closing session's record on its Session Log page — what the mint's
 * summary call is made from (issue #382: the summary is a view of the record).
 */
async function seedClosingRecord(sessionId) {
  const log = makeJournal(JOURNAL_NAMES.sessionLog);
  table.journal._set(log.id, log);
  const events = playedBeats(sessionId, ['I bargain for passage codes.'], { number: 4 });
  await log.createEmbeddedDocuments('JournalEntryPage', [{ name: 'Session 4', flags: { [MODULE_ID]: {
    sessionLogPage: { sessionId, sessionNumber: 4, pageName: 'Session 4', createdAt: new Date(1).toISOString() },
    sessionRecord: { v: 1, sessionId, createdAt: 1, seq: Math.max(...events.map(e => e.seq)), views: {},
      events: Object.fromEntries(events.map(e => [e.id, e])) },
  } } }]);
  return () => log.pages.contents.find(p => p.flags?.[MODULE_ID]?.sessionLogPage?.sessionId === sessionId)
    ?.flags[MODULE_ID].sessionRecord.views?.summary ?? null;
}

async function seat({ idle }) {
  table = await simulateTable({
    users: [USERS.GM, USERS.P1], boot: false,
    clientSettings: { 'gm-1': { claudeApiKey: 'sk-ant-gina' } },
    world: { settings: {
      chronicleAutoEntry: false, sessionLogAutoWrite: false, autoRecapEnabled: false, narratorSessionSummary: true,
      campaignState: {
        ...CampaignStateSchema, currentSessionId: 'smr-s1', sessionNumber: 4,
        sessionActive: true, sessionStartedId: 'smr-s1', sessionActiveStartedAt: hoursAgo(idle ? 30 : 2),
        lastSessionTimestamp: hoursAgo(idle ? 26 : 1), sessionEndedId: null,
        currentSceneId: null, sceneTruths: [], xCardActive: false,
      },
    } },
  });
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  closingSummary = await seedClosingRecord('smr-s1');
  const claude = scriptClaude(table, {
    fallback: (call) => (isSummaryCall(call) ? citedSummaryReply(['Kira bargained for passage codes at the docks.'])
      : `${NARRATION}\n\`\`\`json\n{"newTruths":[],"stateChanges":[]}\n\`\`\``),
  });
  await table.client('pl-1').boot();
  await table.client('pl-1').run(() => globalThis.ChatMessage.create({
    content: '<p>Kira bargains for passage codes.</p>',
    flags: { [MODULE_ID]: { narratorCard: true, narrationText: 'Kira bargains for passage codes.', sessionId: 'smr-s1', narrationId: 'nar-old' } },
  }));
  await table.settle();
  return claude;
}

async function playerBegins() {
  const api = await table.client('pl-1').import('../../src/multiplayer/gmRelay.js');
  await table.client('pl-1').run(() => api.requestGmAction('session.begin', { vignetteRolled: false, includeGalley: false }));
  await table.settle();
}

describe('SESSION-MINT-RACE — a Begin a Session during the world load\'s mint begins the session the load minted', () => {
  it("Begin lands during the load's summary call: one mint, and the minted session is begun — gate open", async () => {
    const claude = await seat({ idle: true });
    const held = claude.hold(isSummaryCall);           // the load's LAST SESSION summary call
    const booting = table.client('gm-1').boot();
    await held.arrived;
    await playerBegins();                              // relayed to gm-1 while its mint is out
    held.release();
    await booting;
    await table.settle(); await table.drain();

    const cs = table.world.campaignState();
    expect(cs.currentSessionId, 'a new session').not.toBe('smr-s1');
    // LAST SESSION: the closing session's summary, made by the mint from its record.
    expect(closingSummary()?.text).toBe('Kira bargained for passage codes at the docks.');
    expect({ active: cs.sessionActive, startedId: cs.sessionStartedId }, 'the minted session is the one begun')
      .toEqual({ active: true, startedId: cs.currentSessionId });
    expect(cs.sessionNumber).toBe(5);
  }, 60_000);
});

describe('BEGIN-MINT-LINE-WINDOW — a line typed during Begin a Session\'s own mint is not narrated into the closing session', () => {
  it('the session went idle with the GM still loaded; Begin mints; a line typed during its summary call is gated', async () => {
    const claude = await seat({ idle: false });
    await table.client('gm-1').boot();
    await table.settle();
    // The table leaves for the night without End a Session; the GM's tab stays open.
    await table.client('gm-1').run(async () => {
      await game.settings.set(MODULE_ID, 'campaignState', { ...game.settings.get(MODULE_ID, 'campaignState'), lastSessionTimestamp: hoursAgo(26) });
      await game.settings.set(MODULE_ID, 'sessionActivity', null);
    });
    await table.settle();

    const held = claude.hold(isSummaryCall);           // Begin's LAST SESSION summary call
    const api = await table.client('pl-1').import('../../src/multiplayer/gmRelay.js');
    await table.client('pl-1').run(() => api.requestGmAction('session.begin', { vignetteRolled: false, includeGalley: false }));
    await held.arrived;
    await table.client('pl-1').chat(LINE, { speaker: { actor: 'pc-kira' } });
    await table.settle();
    held.release();
    await table.settle(); await table.drain();

    const cs = table.world.campaignState();
    expect(cs.currentSessionId, 'sanity: Begin minted the next session').not.toBe('smr-s1');
    expect(lineNarrations().map(m => m.flags[MODULE_ID].sessionId), 'not narrated into the closing session').toEqual([]);
    const notices = table.cards(f => f.sessionGateNotice);
    expect(notices).toHaveLength(1);
    expect(notices[0].whisper).toContain('pl-1');
  }, 60_000);
});
