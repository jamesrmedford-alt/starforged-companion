/**
 * STARFORGED COMPANION
 * tests/unit/xcardDraftCardPending.test.js
 *
 * Issue #338 D6(i) (option A) — the X-Card withdraws the draft rows its
 * removed narration queued.
 *
 * A narration introduces "Brother Calloway"; its capture queues him on the
 * GM's ◈ New Entities Detected card. The table plays the X-Card on that
 * narration. The card used to stay pending: its Confirm still minted the NPC
 * (an Actor, a bond Item, a portrait) from the removed beat, and the pending
 * name suppressed re-detection and rode every detection prompt's PENDING
 * DRAFTS. The card now carries its narration's id (Y02's hop) and the X-Card's
 * finish marks its pending rows `xCarded` — re-rendered without Confirm /
 * Dismiss, not pending, and not added to `dismissedEntities`, so a later
 * genuine mention proposes the name again (U07 full exclusion).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const probe = vi.hoisted(() => ({ entities: null }));
vi.mock('../../src/api-proxy.js', () => ({
  apiPost: vi.fn(async (_url, _headers, body) => {
    const prompt = String(body?.messages?.[0]?.content ?? '');
    const text = prompt.includes('ENTITY TYPES TO DETECT')
      ? JSON.stringify({ entities: probe.entities ?? [], renames: [],
          worldJournal: { lore: [], threats: [], factionUpdates: [], locationUpdates: [], stateTransitions: [] } })
      : '{"contradictions":[]}';
    return { content: [{ type: 'text', text }], stop_reason: 'end_turn' };
  }),
}));

import { applyNarratorSidecar, postNarrationCard, runPacedDetection } from '../../src/narration/narrator.js';
import { suppressScene } from '../../src/context/safety.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const SESSION = 'sess-7';
const stored   = () => game.settings.get(MODULE_ID, 'campaignState');
const syncChat = () => {
  const contents = ChatMessage._created.slice();
  global.game.messages = { contents, get: (id) => contents.find(m => m.id === id) ?? null };
};

const CALLOWAY = { type: 'connection', name: 'Brother Calloway', description: 'A cultist with a branded palm', pronouns: 'he/him', confidence: 'high' };
const MARA     = { type: 'connection', name: 'Mara Quell', description: 'The cult\'s quartermaster', pronouns: 'she/her', confidence: 'high' };

beforeEach(() => {
  ChatMessage._reset();
  game.settings._store.clear();
  game.actors._reset();
  global.game.messages = { contents: [], get: () => null };
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
  probe.entities = [CALLOWAY];
});

const PROSE = 'Brother Calloway shows the crew his branded palm and smiles.';
const draftCards   = () => ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.draftEntityCard);
const draftCard    = () => draftCards()[0];
const pendingNames = (card = draftCard()) => (card?.flags?.[MODULE_ID]?.drafts ?? []).filter(d => !d.status || d.status === 'pending').map(d => d.name);

async function narrateAndCapture(narrationId, prose = PROSE) {
  const text = applyNarratorSidecar(`${prose}\n\`\`\`json\n${JSON.stringify({ newTruths: [], stateChanges: [] })}\n\`\`\``,
    stored(), { narrationId, matchedEntityIds: [] });
  await postNarrationCard(text, { moveId: 'paced_narrative', outcome: 'n/a', _id: `res-${narrationId}` },
    stored(), { playerText: 'I approach the altar.', playerName: 'Kira', narrationId });
  syncChat();
  await runPacedDetection(text, stored(), { narrationId });
  syncChat();
}

describe('issue #338 D6(i) — the draft rows an X-carded narration queued are withdrawn', () => {
  it('control: before the X-Card the capture queued the cultist for the GM\'s review', async () => {
    await narrateAndCapture('nar-altar');
    expect(pendingNames()).toEqual(['Brother Calloway']);
  });

  it('the draft card carries the narration whose capture queued it', async () => {
    await narrateAndCapture('nar-altar');
    expect(draftCard().flags[MODULE_ID].narrationId).toBe('nar-altar');
  });

  it('after the X-Card the removed narration\'s draft row is no longer pending — and offers no Confirm', async () => {
    await narrateAndCapture('nar-altar');
    expect(await suppressScene({}, { local: true })).toBe(true);
    expect(stored().xCardedNarrationIds).toContain('nar-altar');   // the X-Card picked the narration
    expect.soft(stored().dismissedEntities, 'the name is not blacklisted').not.toContain('Brother Calloway');
    expect(pendingNames(), 'pending rows on the draft card').toEqual([]);
    expect(draftCard().flags[MODULE_ID].drafts[0].status).toBe('xCarded');
    expect(draftCard().content).not.toContain('sf-draft-confirm');
    expect(draftCard().content).toContain('Withdrawn');
  });

  it('a later, genuine mention of the name proposes it again', async () => {
    await narrateAndCapture('nar-altar');
    expect(await suppressScene({}, { local: true })).toBe(true);
    // A GM resumes, and a later narration names him for real.
    game.settings._store.set(KEY, { ...stored(), xCardActive: false });
    await ChatMessage.create({ content: 'We go back to the shrine.', flags: {} });
    await narrateAndCapture('nar-shrine', 'At the shrine, Brother Calloway waits with folded hands.');
    expect(draftCards()).toHaveLength(2);
    expect(pendingNames(draftCards()[1])).toEqual(['Brother Calloway']);
  });

  it('only the pending rows are withdrawn — a row the GM already dismissed stands', async () => {
    probe.entities = [CALLOWAY, MARA];
    await narrateAndCapture('nar-altar');
    const card = draftCard();
    // The GM dismissed Mara before the X-Card was played.
    await card.setFlag(MODULE_ID, 'drafts', card.flags[MODULE_ID].drafts.map(d =>
      d.name === 'Mara Quell' ? { ...d, status: 'dismissed' } : d));
    syncChat();

    expect(await suppressScene({}, { local: true })).toBe(true);
    const statuses = Object.fromEntries(draftCard().flags[MODULE_ID].drafts.map(d => [d.name, d.status]));
    expect(statuses).toEqual({ 'Brother Calloway': 'xCarded', 'Mara Quell': 'dismissed' });
  });
});
