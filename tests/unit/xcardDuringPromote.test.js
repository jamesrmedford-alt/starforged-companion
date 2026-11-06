/**
 * Issue #342 Z44 XCARD-DURING-PROMOTE-LEAKS-NOTES (the eleventh audit's
 * ENT-4) — Y35's re-read meets D7.
 *
 * A narration's capture adds "Held the prisoner down for the torch." to Vex's
 * card (a tier entry stamped with the narration's id). The GM presses
 * ⤴ Promote: applyEntityEditFromRelay appends the line to Vex's sheet Notes
 * tab (`document.update({ 'system.notes': … })` — the narrator reads that tab,
 * issue #329 X12) and only then marks the tier entry promoted, re-reading the
 * record after the await (issue #337 Y35).
 *
 * A player plays the X-Card on that narration while the Notes write is in
 * flight (the X-Card runs unqueued on the canonical GM; the Promote is a
 * queued relay action, so nothing orders them). The X-Card's capture undo
 * (retractNarrationCapture) drops the tier entry — not promoted yet, so it
 * strips nothing from the Notes (issue #338 D7 strips only a `promoted`
 * entry's `promotedText`). The Promote's re-read then found no entry to mark
 * and wrote the record as it was, leaving the removed narration's line on the
 * Notes tab with no tier entry to trace it. Now the Promote checks the X-Card
 * before its Notes write (refused) and after it, taking its line back off.
 *
 * Controls: the X-Card AFTER the Promote strips the line (D7); a Promote with
 * no X-Card keeps it.
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
    connectionIds: ['npc-vex'], factionIds: [], settlementIds: [], locationIds: [], planetIds: [], shipIds: [], creatureIds: [],
  });
});

const tier = () => vex.getFlag(MODULE_ID, 'connection').generativeTier ?? [];

/** A narration posts and its capture adds DETAIL to Vex's card, stamped with the narration's id. */
async function narrateAndCapture(narrationId = 'nar-torch') {
  const text = applyNarratorSidecar(`Vex pins the prisoner's wrist.\n\`\`\`json\n${JSON.stringify({ newTruths: [], stateChanges: [] })}\n\`\`\``,
    stored(), { narrationId, matchedEntityIds: ['npc-vex'] });
  await postNarrationCard(text, { moveId: 'compel', outcome: 'weak_hit', _id: `res-${narrationId}` }, stored(),
    { playerText: 'I press the prisoner.', playerName: 'Kira', narrationId });
  const ref = { journalId: 'npc-vex', type: 'connection', record: vex.getFlag(MODULE_ID, 'connection') };
  expect(await appendDetailToTier(ref, DETAIL, SESSION, 7, { narrationId })).toBe(true);
  syncChat();
}

/** The X-Card lands while the Promote's Notes write is in flight (the write applies after it). */
function xCardDuringNotesWrite() {
  const realUpdate = vex.update.bind(vex);
  let played = false;
  vex.update = async (changes, ...rest) => {
    if (!played && typeof changes?.['system.notes'] === 'string' && changes['system.notes'].includes(DETAIL)) {
      played = true;
      expect(await suppressScene({}, { local: true })).toBe(true);
    }
    return realUpdate(changes, ...rest);
  };
}

describe('Z44 — the X-Card on a narration while the GM promotes its detail', () => {
  it('the removed narration\'s line does not stay on the Notes tab the narrator reads', async () => {
    await narrateAndCapture();
    xCardDuringNotesWrite();

    const res = await applyEntityEditFromRelay({ op: 'promote', entityId: 'npc-vex', detail: DETAIL });

    expect(stored().xCardedNarrationIds).toEqual(['nar-torch']);   // control: the X-Card was played on it
    expect(tier(), 'the tier entry is gone').toEqual([]);           // control: its capture undo ran
    expect.soft(vex.system.notes, 'the sheet Notes tab').not.toContain(DETAIL);
    expect(getConnection('npc-vex').notes, 'the Notes row ENTITIES IN SCENE reads').not.toContain(DETAIL);
    expect(res).toEqual({ applied: false, reason: 'no-detail' });   // the clicker is told the detail is gone
  });

  it('control: the X-Card after the Promote takes the line out of the notes (issue #338 D7)', async () => {
    await narrateAndCapture();
    expect(await applyEntityEditFromRelay({ op: 'promote', entityId: 'npc-vex', detail: DETAIL })).toMatchObject({ applied: true });
    expect(vex.system.notes).toContain(DETAIL);
    syncChat();
    expect(await suppressScene({}, { local: true })).toBe(true);
    expect(vex.system.notes).not.toContain(DETAIL);
    expect(tier()).toEqual([]);
  });

  it('control: a Promote with no X-Card keeps the line and marks the entry', async () => {
    await narrateAndCapture();
    expect(await applyEntityEditFromRelay({ op: 'promote', entityId: 'npc-vex', detail: DETAIL })).toMatchObject({ applied: true });
    expect(vex.system.notes).toContain(DETAIL);
    expect(tier()[0]).toMatchObject({ promoted: true, narrationId: 'nar-torch', promotedText: DETAIL });
  });

  it('pressed once the X-Card is recorded but before its undo reaches the card: refused, the Notes untouched', async () => {
    await narrateAndCapture();
    // The pause write has landed (the stored id list); the undo is still on its way to Vex's record.
    game.settings._store.set(KEY, { ...stored(), xCardedNarrationIds: ['nar-torch'] });
    const res = await applyEntityEditFromRelay({ op: 'promote', entityId: 'npc-vex', detail: DETAIL });
    expect(res).toEqual({ applied: false, reason: 'no-detail' });
    expect(vex.system.notes).toBe('<p>A dock enforcer.</p>');
    expect(tier()[0]).toMatchObject({ narrationId: 'nar-torch', detail: DETAIL });
    expect(tier()[0].promoted).toBeFalsy();
  });
});
