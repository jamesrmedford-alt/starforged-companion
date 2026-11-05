/**
 * PROBE — CONT-D1 XCARD-DRAFT-CARD-STAYS-PENDING (needs a decision)
 *
 * What the user does: a narration introduces "Brother Calloway", a cultist;
 * the capture queues him on the GM's ◈ New Entities Detected card. The table
 * plays the X-Card on that narration.
 *
 * What happens: the draft card — whispered to the GMs, carrying the removed
 * narration's name and description — stays pending. Its Confirm still creates
 * the NPC (an Actor, a bond Item on the PC's sheet, a portrait) from the
 * removed beat; its names keep suppressing re-detection
 * (collectPendingDraftNames) and keep appearing in every detection prompt's
 * PENDING DRAFTS list. The card carries no narration id (routeEntityDrafts
 * receives none — see CONT-02), so nothing could tie it to the narration.
 *
 * Decision: A — the X-Card withdraws the rows its removed narration queued
 * (mark them `xCarded` / not pending, without adding the names to
 * dismissedEntities, so a later genuine mention can propose them again); or
 * B — leave the GM's review surface as it is and record that in decisions.md.
 * Recommended A: U07 chose full exclusion, and a Confirm from this card mints
 * an entity from content the table removed. This probe asserts A.
 *
 * Control: before the X-Card the row is pending (the GM can confirm it).
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/continuity/xcardDraftCardPending.probe.js
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/api-proxy.js', () => ({
  apiPost: vi.fn(async (_url, _headers, body) => {
    const prompt = String(body?.messages?.[0]?.content ?? '');
    const text = prompt.includes('ENTITY TYPES TO DETECT')
      ? JSON.stringify({ entities: [{ type: 'connection', name: 'Brother Calloway', description: 'A cultist with a branded palm', pronouns: 'he/him', confidence: 'high' }],
          renames: [], worldJournal: { lore: [], threats: [], factionUpdates: [], locationUpdates: [], stateTransitions: [] } })
      : '{"contradictions":[]}';
    return { content: [{ type: 'text', text }], stop_reason: 'end_turn' };
  }),
}));

import { applyNarratorSidecar, postNarrationCard, runPacedDetection } from '../../../src/narration/narrator.js';
import { suppressScene } from '../../../src/context/safety.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const SESSION = 'sess-7';
const stored   = () => game.settings.get(MODULE_ID, 'campaignState');
const syncChat = () => { global.game.messages = { contents: ChatMessage._created.slice() }; };

beforeEach(() => {
  ChatMessage._reset();
  game.settings._store.clear();
  game.actors._reset();
  global.game.messages = { contents: [] };
  global.game.users = Object.assign([{ id: 'gm-1', isGM: true, active: true }], {
    get: (id) => (id === 'gm-1' ? { id: 'gm-1', isGM: true, active: true } : null),
  });
  global.game.user = global.game.users[0];
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-probe');
  game.settings._store.set(KEY, {
    currentSessionId: SESSION, sessionNumber: 7, currentSceneId: 'sc-1',
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' }, sceneFrame: null,
    xCardActive: false, xCardPlays: 0, dismissedEntities: [], sectors: [],
    connectionIds: [], factionIds: [], settlementIds: [], locationIds: [], planetIds: [], shipIds: [], creatureIds: [],
  });
});

const PROSE = 'Brother Calloway shows the crew his branded palm and smiles.';
const draftCard = () => ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.draftEntityCard);
const pendingNames = () => (draftCard()?.flags?.[MODULE_ID]?.drafts ?? []).filter(d => !d.status || d.status === 'pending').map(d => d.name);

async function narrateAndCapture(narrationId) {
  const text = applyNarratorSidecar(`${PROSE}\n\`\`\`json\n${JSON.stringify({ newTruths: [], stateChanges: [] })}\n\`\`\``,
    stored(), { narrationId, matchedEntityIds: [] });
  await postNarrationCard(text, { moveId: 'paced_narrative', outcome: 'n/a', _id: `res-${narrationId}` },
    stored(), { playerText: 'I approach the altar.', playerName: 'Kira', narrationId });
  await runPacedDetection(text, stored(), { narrationId });
}

describe('CONT-D1 — the draft card rows an X-carded narration queued (decision; asserts option A)', () => {
  it('control: before the X-Card the capture queued the cultist for the GM\'s review', async () => {
    await narrateAndCapture('nar-altar');
    expect(pendingNames()).toEqual(['Brother Calloway']);
  });

  it('after the X-Card the removed narration\'s draft row is no longer pending', async () => {
    await narrateAndCapture('nar-altar');
    syncChat();
    expect(await suppressScene({}, { local: true })).toBe(true);
    expect(stored().xCardedNarrationIds).toContain('nar-altar');   // the X-Card picked the narration
    expect.soft(stored().dismissedEntities, 'the name is not blacklisted').not.toContain('Brother Calloway');
    expect(pendingNames(), 'pending rows on the draft card').toEqual([]);
  });
});
