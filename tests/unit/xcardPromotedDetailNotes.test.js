/**
 * STARFORGED COMPANION
 * tests/unit/xcardPromotedDetailNotes.test.js
 *
 * Issue #338 D7 (option A) — the X-Card also takes a promoted copy of the
 * removed detail out of the notes.
 *
 * A narration's capture adds "Held the prisoner down for the torch." to Vex's
 * card; the GM presses ⤴ Promote, which appends it to Vex's sheet Notes tab
 * (issue #329 X12 — what the narrator reads) and marks the tier entry
 * promoted. The table then X-cards the narration: the tier entry was dropped
 * by its narration id, but the Notes copy carried no provenance and stayed —
 * the ENTITIES IN SCENE card's Notes row kept the removed beat. The promoted
 * entry now keeps `{ narrationId, promotedText }`, and retractNarrationCapture
 * strips that paragraph when it drops the entry (U07 full exclusion; the
 * Promote predates the card, so it is not a ruling on it).
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn(async () => ({ content: [{ type: 'text', text: '{"contradictions":[]}' }] })) }));

import { applyNarratorSidecar, postNarrationCard } from '../../src/narration/narrator.js';
import { suppressScene } from '../../src/context/safety.js';
import { appendDetailToTier } from '../../src/entities/entityExtractor.js';
import { applyEntityEditFromRelay } from '../../src/ui/entityPanel.js';
import { getConnection } from '../../src/entities/connection.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const SESSION = 'sess-7';
const stored   = () => game.settings.get(MODULE_ID, 'campaignState');
const syncChat = () => { global.game.messages = { contents: ChatMessage._created.slice() }; };
const DETAIL   = 'Held the prisoner down for the torch.';
const KEPT     = 'Keeps a ledger of every debt on the docks.';

let vex;
beforeEach(() => {
  ChatMessage._reset();
  game.settings._store.clear();
  game.actors._reset();
  global.game.messages = { contents: [] };
  global.game.users = Object.assign([{ id: 'gm-1', isGM: true, active: true }], {
    get: (id) => (id === 'gm-1' ? { id: 'gm-1', isGM: true, active: true } : null),
  });
  global.game.user = global.game.users[0];
  vex = makeTestActor({ id: 'npc-vex', name: 'Vex', type: 'character', hasPlayerOwner: false, system: { notes: '<p>A dock enforcer.</p>' },
    flags: { [MODULE_ID]: { entityType: 'connection', connection: { name: 'Vex', generativeTier: [] } } } });
  game.actors._set(vex.id, vex);
  game.settings._store.set(KEY, {
    currentSessionId: SESSION, sessionNumber: 7, currentSceneId: 'sc-1',
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' }, sceneFrame: null,
    xCardActive: false, xCardPlays: 0, dismissedEntities: [],
    connectionIds: ['npc-vex'], factionIds: [], settlementIds: ['set-hold'], locationIds: [], planetIds: [], shipIds: [], creatureIds: [],
  });
});

const tier = (actor = vex, key = 'connection') => actor.getFlag(MODULE_ID, key).generativeTier ?? [];

/** A narration posts; its capture adds `detail` to the record, stamped; the GM promotes it. */
async function narrateCapturePromote({ narrationId = 'nar-torch', detail = DETAIL, entityId = 'npc-vex', type = 'connection', actor = vex } = {}) {
  const text = applyNarratorSidecar(`Vex pins the prisoner's wrist.\n\`\`\`json\n${JSON.stringify({ newTruths: [], stateChanges: [] })}\n\`\`\``,
    stored(), { narrationId, matchedEntityIds: [entityId] });
  await postNarrationCard(text, { moveId: 'compel', outcome: 'weak_hit', _id: `res-${narrationId}` }, stored(),
    { playerText: 'I press the prisoner.', playerName: 'Kira', narrationId });
  const ref = { journalId: entityId, type, record: actor.getFlag(MODULE_ID, type) };
  expect(await appendDetailToTier(ref, detail, SESSION, 7, { narrationId })).toBe(true);
  expect(await applyEntityEditFromRelay({ op: 'promote', entityId, detail })).toMatchObject({ applied: true });
}

describe('issue #338 D7 — a promoted detail of an X-carded narration leaves the notes too', () => {
  it('control: the Promote put the detail on Vex\'s Notes tab, where the narrator reads it', async () => {
    await narrateCapturePromote();
    expect(tier()).toEqual([expect.objectContaining({ detail: DETAIL, promoted: true, narrationId: 'nar-torch' })]);
    expect(vex.system.notes).toContain(DETAIL);
    expect(getConnection('npc-vex').notes).toContain(DETAIL);
  });

  it('the promoted entry keeps the narration it came from and the text it put in the notes', async () => {
    await narrateCapturePromote();
    expect(tier()[0]).toMatchObject({ narrationId: 'nar-torch', promotedText: DETAIL });
  });

  it('after the X-Card the removed narration\'s line is gone from the Notes tab — and only that line', async () => {
    await narrateCapturePromote();
    syncChat();
    expect(await suppressScene({}, { local: true })).toBe(true);
    expect(tier(), 'the tier entry is dropped').toEqual([]);
    expect(vex.system.notes, 'the sheet Notes tab').not.toContain(DETAIL);
    expect(getConnection('npc-vex').notes, 'the Notes row the narrator reads').not.toContain(DETAIL);
    expect(vex.system.notes).toBe('<p>A dock enforcer.</p>');
  });

  it('a detail a kept narration gave, promoted too, stays in the Notes — only the removed one goes', async () => {
    await narrateCapturePromote({ narrationId: 'nar-ledger', detail: KEPT });
    await ChatMessage.create({ content: 'We move on.', flags: {} });   // someone spoke: a new beat
    await narrateCapturePromote();
    syncChat();
    expect(await suppressScene({}, { local: true })).toBe(true);
    expect(stored().xCardedNarrationIds).toEqual(['nar-torch']);
    expect(vex.system.notes).toContain(KEPT);
    expect(vex.system.notes).not.toContain(DETAIL);
    expect(tier().map(e => e.detail)).toEqual([KEPT]);
  });

  it('a record without a Notes tab (a settlement) loses the promoted line from its own notes', async () => {
    const hold = makeTestActor({ id: 'set-hold', name: 'Bleakhold', type: 'location', hasPlayerOwner: false,
      flags: { [MODULE_ID]: { entityType: 'settlement', settlement: { name: 'Bleakhold', notes: 'A mining hold.', generativeTier: [] } } } });
    game.actors._set(hold.id, hold);
    await narrateCapturePromote({ entityId: 'set-hold', type: 'settlement', actor: hold, detail: 'The torch room is behind the smelter.' });
    expect(hold.getFlag(MODULE_ID, 'settlement').notes).toBe('A mining hold.\n\nThe torch room is behind the smelter.');
    syncChat();

    expect(await suppressScene({}, { local: true })).toBe(true);
    expect(hold.getFlag(MODULE_ID, 'settlement').notes).toBe('A mining hold.');
    expect(tier(hold, 'settlement')).toEqual([]);
  });
});
