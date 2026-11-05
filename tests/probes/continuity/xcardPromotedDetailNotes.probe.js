/**
 * PROBE — CONT-D2 XCARD-PROMOTED-DETAIL-STAYS-IN-NOTES (needs a decision)
 *
 * What the user does: a narration's capture adds "Held the prisoner down for
 * the torch" to Vex's card as a Narrator-added detail. The GM, liking it,
 * presses Promote on the Entities panel: the detail is appended to Vex's
 * sheet Notes tab — "what the narrator reads" (issue #329 X12) — and marked
 * promoted on the tier. Then the table plays the X-Card on that narration.
 *
 * What happens: the X-Card drops the tier entry (it carries the narration's
 * id — retractNarrationCapture drops it, promoted or not), but the copy the
 * Promote appended to `system.notes` carries no provenance and stays: the
 * next prompt's ENTITIES IN SCENE card shows the removed beat on its Notes
 * row, and the Entities panel's Notes do too. The tier's own `promoted`
 * entry is gone, so nothing records that the notes line came from the
 * removed narration.
 *
 * Decision: A — the X-Card also removes the promoted copy from the sheet
 * notes (the text is the removed narration's; the GM's Promote was made
 * before the card was played, so it is not a ruling on the X-Card); or B —
 * a Promote is the GM's own authorship and the notes stand (record it, and
 * have retractNarrationCapture keep a promoted entry so the tier still
 * says where the line came from). Recommended A — U07 chose full
 * exclusion and the Notes row is a narrator surface. This probe asserts A.
 *
 * Control: before the X-Card the Promote put the detail on the Notes tab and
 * the narrator's record reads it there (getConnection → withSheetNotes).
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/continuity/xcardPromotedDetailNotes.probe.js
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/api-proxy.js', () => ({ apiPost: vi.fn(async () => ({ content: [{ type: 'text', text: '{"contradictions":[]}' }] })) }));

import { applyNarratorSidecar, postNarrationCard } from '../../../src/narration/narrator.js';
import { suppressScene } from '../../../src/context/safety.js';
import { appendDetailToTier } from '../../../src/entities/entityExtractor.js';
import { applyEntityEditFromRelay } from '../../../src/ui/entityPanel.js';
import { getConnection } from '../../../src/entities/connection.js';

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

/** The narration posts; its capture adds the detail to Vex's card, stamped; the GM promotes it. */
async function narrateCapturePromote() {
  const text = applyNarratorSidecar(`Vex pins the prisoner's wrist.\n\`\`\`json\n${JSON.stringify({ newTruths: [], stateChanges: [] })}\n\`\`\``,
    stored(), { narrationId: 'nar-torch', matchedEntityIds: ['npc-vex'] });
  await postNarrationCard(text, { moveId: 'compel', outcome: 'weak_hit', _id: 'res-torch' }, stored(),
    { playerText: 'I press the prisoner.', playerName: 'Kira', narrationId: 'nar-torch' });
  const ref = { journalId: 'npc-vex', type: 'connection', record: vex.getFlag(MODULE_ID, 'connection') };
  expect(await appendDetailToTier(ref, DETAIL, SESSION, 7, { narrationId: 'nar-torch' })).toBe(true);
  expect(await applyEntityEditFromRelay({ op: 'promote', entityId: 'npc-vex', detail: DETAIL })).toMatchObject({ applied: true });
}

describe('CONT-D2 — a promoted detail of an X-carded narration (decision; asserts option A)', () => {
  it('control: the Promote put the detail on Vex\'s Notes tab, where the narrator reads it', async () => {
    await narrateCapturePromote();
    expect(tier()).toEqual([expect.objectContaining({ detail: DETAIL, promoted: true, narrationId: 'nar-torch' })]);
    expect(vex.system.notes).toContain(DETAIL);
    expect(getConnection('npc-vex').notes).toContain(DETAIL);
  });

  it('after the X-Card the removed narration\'s line is gone from the Notes tab too', async () => {
    await narrateCapturePromote();
    syncChat();
    expect(await suppressScene({}, { local: true })).toBe(true);
    expect(tier(), 'control: the tier entry is dropped').toEqual([]);
    expect.soft(vex.system.notes, 'the sheet Notes tab').not.toContain(DETAIL);
    expect(getConnection('npc-vex').notes, 'the Notes row the narrator reads').not.toContain(DETAIL);
  });
});
