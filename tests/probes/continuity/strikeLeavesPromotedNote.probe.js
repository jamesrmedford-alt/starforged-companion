/**
 * Probe — CONT-4 STRIKE-LEAVES-PROMOTED-NOTE (continuity auditor, eleventh audit).
 *
 * A narration says Vex has a ragged scar along his jaw: its sidecar records
 * the truth and its capture the same detail on Vex's card, and the GM presses
 * ⤴ Promote, which appends the detail to Vex's sheet Notes tab — the Notes
 * row the narrator reads (issue #329 X12) — and marks the tier entry promoted
 * (`promotedText`, issue #338 D7). The GM then strikes the truth. The strike
 * reaches the stores that copied the fact (propagateRetraction, issue #286
 * B6): dropTierDetails removes the promoted tier entry — and leaves its
 * paragraph in the Notes. The struck fact stays on Vex's card beside
 * CORRECTED's "do NOT re-assert", and nothing links the paragraph to a detail
 * any more: when the table then X-cards that narration, D7's undo
 * (retractNarrationCapture) finds no promoted entry of it, and the removed
 * narration's line stays on the Notes tab for good.
 *
 * Real producers: applyNarratorSidecar + postNarrationCard, the capture's
 * appendDetailToTier, the Entities panel's relayed Promote, the `!truth
 * strike` relay handler, the X-Card (suppressScene).
 *
 * Asserts the CORRECT behaviour: a strike that drops a promoted detail takes
 * its Notes line too, so the later X-Card has nothing of the narration left.
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/api-proxy.js', () => ({ apiPost: vi.fn(async () => ({ content: [{ type: 'text', text: '{"contradictions":[]}' }] })) }));

import { applyNarratorSidecar, postNarrationCard } from '../../../src/narration/narrator.js';
import { suppressScene } from '../../../src/context/safety.js';
import { appendDetailToTier } from '../../../src/entities/entityExtractor.js';
import { applyEntityEditFromRelay } from '../../../src/ui/entityPanel.js';
import { applyFactContinuityCommand } from '../../../src/factContinuity/chatCommands.js';
import { getConnection } from '../../../src/entities/connection.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const SESSION = 'sess-7';
const FACT   = 'Has a ragged scar along his jaw';
const DETAIL = 'Has a ragged scar along his jaw.';
const stored   = () => game.settings.get(MODULE_ID, 'campaignState');
const syncChat = () => { global.game.messages = { contents: ChatMessage._created.slice() }; };
const flush = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise(r => setTimeout(r, 0)); };

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
const scarTruth = () => (stored().sceneTruths ?? []).find(t => t.fact === FACT);

/** The narration states the scar (sidecar truth + captured detail); the GM promotes the detail. */
async function narrateCapturePromote() {
  const raw = `A ragged scar runs along Vex's jaw.\n\`\`\`json\n${JSON.stringify({
    newTruths: [{ subject: 'Vex', fact: FACT }], stateChanges: [],
  })}\n\`\`\``;
  const text = applyNarratorSidecar(raw, foundry.utils.deepClone(stored()), { narrationId: 'nar-scar', matchedEntityIds: ['npc-vex'] });
  await flush();
  await postNarrationCard(text, { moveId: 'compel', outcome: 'weak_hit', _id: 'res-scar' }, stored(),
    { playerText: 'I study him.', playerName: 'Kira', narrationId: 'nar-scar', matchedEntityIds: ['npc-vex'] });
  const ref = { journalId: 'npc-vex', type: 'connection', record: vex.getFlag(MODULE_ID, 'connection') };
  expect(await appendDetailToTier(ref, DETAIL, SESSION, 7, { narrationId: 'nar-scar' })).toBe(true);
  expect(await applyEntityEditFromRelay({ op: 'promote', entityId: 'npc-vex', detail: DETAIL })).toMatchObject({ applied: true });
  expect(scarTruth()).toMatchObject({ subject: { kind: 'entity', entityId: 'npc-vex' }, narrationId: 'nar-scar', retracted: false });
  expect(vex.system.notes).toContain(DETAIL);
}

const strikeScar = () => applyFactContinuityCommand({ text: `!truth strike ${scarTruth().id.slice(0, 8)}` }, { requesterIsGM: true });

describe('CONT-4 — a strike that drops a promoted detail', () => {
  it('takes its Notes line too — and the X-Card on that narration afterwards leaves nothing of it', async () => {
    await narrateCapturePromote();
    await strikeScar();
    expect(scarTruth().retracted).toBe(true);
    expect(tier(), 'the strike dropped the promoted tier entry').toEqual([]);
    expect.soft(getConnection('npc-vex').notes, 'the Notes row after the strike').not.toContain(DETAIL);

    syncChat();
    expect(await suppressScene({}, { local: true })).toBe(true);      // the table X-cards the narration
    expect(stored().xCardedNarrationIds).toEqual(['nar-scar']);
    expect(vex.system.notes, 'the sheet Notes tab after the X-Card').not.toContain(DETAIL);
  });

  it('control: with no strike first, the X-Card takes the promoted line off the Notes tab (D7)', async () => {
    await narrateCapturePromote();
    syncChat();
    expect(await suppressScene({}, { local: true })).toBe(true);
    expect(tier()).toEqual([]);
    expect(vex.system.notes).toBe('<p>A dock enforcer.</p>');
  });
});
