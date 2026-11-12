/**
 * STARFORGED COMPANION
 * tests/unit/tierDetailDedupeWholeWords.test.js
 *
 * Issue #347 AB11 (SCENE-END-DROPS-FACT-INSIDE-OLDER-DETAIL; the audit's
 * sceneEndDropsFactInsideOlderDetail probe). Both generative-tier writers —
 * the scene-end migration (appendMigratedTruthToTier) and the live tier pass
 * (appendDetailToTier → persistGenerativeTier) — skip a detail the card
 * already holds (tierHasDetail). The check was raw substring containment on
 * lowercase text, either way round:
 *
 *   Vex's card says "Distrusts the crew". This scene the crew earns her trust
 *   and the sidecar records "Vex — Trusts the crew". At scene end
 *   "distrusts the crew".includes("trusts the crew") — the truth is "already
 *   there", counted as migrated, and the scene's truths cleared: the new fact
 *   is in no store the narrator reads, and the card says the opposite.
 *
 * Likewise "Is dead" beside "Is deadly with a blade", "locker 7" beside
 * "locker 71" — and, as whole words, "Paid the debt" beside "Has not paid the
 * debt". A detail now restates another only as whole words, in order, with no
 * negating or reversing word around them; the duplicate the check exists for
 * ("Vex runs the lower docks" / "Runs the lower docks") is still caught.
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn(async () => ({ content: [{ type: 'text', text: '{"contradictions":[]}' }] })) }));

import { applyNarratorSidecar, postNarrationCard } from '../../src/narration/narrator.js';
import { endScene } from '../../src/factContinuity/sceneLifecycle.js';
import { appendMigratedTruthToTier, appendDetailToTier } from '../../src/entities/entityExtractor.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const stored = () => game.settings.get(MODULE_ID, 'campaignState');

let orig, vex;
function seed(olderDetails) {
  vex = makeTestActor({ id: 'npc-vex', name: 'Vex', type: 'character', hasPlayerOwner: false,
    flags: { [MODULE_ID]: { entityType: 'connection', connection: {
      name: 'Vex',
      generativeTier: olderDetails.map((detail, i) => ({
        sessionId: 'sess-3', sessionNum: 3, detail, source: 'tier_update', pinned: false, promoted: false,
        promotedAt: null, createdAt: 1000 + i,
      })),
    } } } });
  game.actors._set(vex.id, vex);
}
beforeEach(() => {
  orig = { getName: game.journal.getName, find: game.journal.find };
  game.journal.getName = () => null;
  game.journal.find    = () => null;
  ChatMessage._reset();
  game.settings._store.clear();
  game.actors._reset();
  global.game.messages = { contents: [] };
  global.game.users = Object.assign([{ id: 'gm-1', isGM: true, active: true }], {
    get: (id) => (id === 'gm-1' ? { id: 'gm-1', isGM: true, active: true } : null),
  });
  global.game.user = global.game.users[0];
  game.settings._store.set(KEY, {
    currentSessionId: 'sess-7', sessionNumber: 7, currentSceneId: 'sc-1',
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' }, sceneFrame: null,
    xCardActive: false, xCardPlays: 0, dismissedEntities: [],
    connectionIds: ['npc-vex'], factionIds: [], settlementIds: [], locationIds: [], planetIds: [], shipIds: [], creatureIds: [],
  });
});
afterEach(() => { game.journal.getName = orig.getName; game.journal.find = orig.find; });

/** A narration as the narrator makes one: its sidecar applied (on the canonical GM), then its card. */
async function narrate(narrationId, prose, facts) {
  const sidecar = { newTruths: facts.map(fact => ({ subject: 'Vex', fact })), stateChanges: [] };
  const text = applyNarratorSidecar(`${prose}\n\`\`\`json\n${JSON.stringify(sidecar)}\n\`\`\``, stored(),
    { narrationId, matchedEntityIds: ['npc-vex'] });
  await postNarrationCard(text, { moveId: 'compel', outcome: 'strong_hit', _id: `res-${narrationId}` }, stored(),
    { playerText: 'A line.', playerName: 'Kira', narrationId });
  await new Promise(r => setTimeout(r, 0));   // the chained sidecar persist lands
}
const endTheScene = () => endScene(foundry.utils.deepClone(stored()), { reason: 'scene_command' });
const vexDetails  = () => (vex.getFlag(MODULE_ID, 'connection').generativeTier ?? []).map(e => e.detail);
const migrated    = (detail) => ({ sessionId: 'sess-7', sessionNum: 7, detail, source: 'fact_continuity', pinned: false, promoted: false, promotedAt: null, createdAt: 2000 });
const vexRef      = () => ({ journalId: 'npc-vex', type: 'connection', record: vex.getFlag(MODULE_ID, 'connection') });

describe('a scene end files each entity truth on its card', () => {
  it('control: a truth no older detail contains is on the card after the scene ends', async () => {
    seed(['Distrusts the crew']);
    await narrate('nar-1', 'Vex hands over the nav keys.', ['Gave the crew her nav keys']);
    expect(stored().sceneTruths.map(t => t.fact)).toEqual(['Gave the crew her nav keys']);
    const counts = await endTheScene();
    expect(counts.migrated).toBe(1);
    expect(stored().sceneTruths).toEqual([]);
    expect(vexDetails()).toEqual(['Distrusts the crew', 'Gave the crew her nav keys']);
  });

  it('"Trusts the crew" is on Vex\'s card after the scene ends, though the card said "Distrusts the crew"', async () => {
    seed(['Distrusts the crew']);
    await narrate('nar-1', 'Vex lowers the rifle. "You came back for me."', ['Trusts the crew']);
    expect(stored().sceneTruths.map(t => t.fact)).toEqual(['Trusts the crew']);

    const counts = await endTheScene();
    expect(stored().sceneTruths, 'the scene ledger is cleared').toEqual([]);
    expect(counts.migrated, 'the scene end reports the truth migrated').toBe(1);
    expect(vexDetails(), 'Narrator-added details on Vex\'s card').toContain('Trusts the crew');
  });

  it('"Is dead" is on Vex\'s card after the scene ends, though the card said "Is deadly with a blade"', async () => {
    seed(['Is deadly with a blade']);
    await narrate('nar-1', 'The shot takes Vex in the throat.', ['Is dead']);
    await endTheScene();
    expect(stored().sceneTruths).toEqual([]);
    expect(vexDetails(), 'Narrator-added details on Vex\'s card').toContain('Is dead');
  });
});

describe('what counts as the same detail (both tier writers)', () => {
  it.each([
    ['Has not paid the debt', 'Paid the debt'],
    ['Paid the debt', 'Has not paid the debt'],
    ['No longer trusts the crew', 'Trusts the crew'],
    ["Doesn't owe Kira anything", 'Owe Kira anything'],
    ['Keeps her stash in locker 71', 'Keeps her stash in locker 7'],
  ])('beside "%s", the scene-end migration files "%s"', async (older, fact) => {
    seed([older]);
    expect(await appendMigratedTruthToTier('npc-vex', 'connection', migrated(fact))).toBe(true);
    expect(vexDetails()).toEqual([older, fact]);
  });

  it.each([
    ['Vex runs the lower docks', 'Runs the lower docks'],
    ['Runs the lower docks', 'Vex runs the lower docks'],
    ['Is dead.', 'is dead'],
    ['Has not paid the debt', 'Has not paid the debt yet'],
  ])('control: beside "%s", "%s" is the same detail — not filed twice', async (older, fact) => {
    seed([older]);
    expect(await appendMigratedTruthToTier('npc-vex', 'connection', migrated(fact)), 'the truth is on the card').toBe(true);
    expect(vexDetails()).toEqual([older]);
  });

  it('the live tier pass saves "Trusts the crew" beside "Distrusts the crew"', async () => {
    seed(['Distrusts the crew']);
    expect(await appendDetailToTier(vexRef(), 'Trusts the crew', 'sess-7', 7)).toBe(true);
    expect(vexDetails()).toEqual(['Distrusts the crew', 'Trusts the crew']);
  });

  it('control: the live tier pass skips a detail the card already states', async () => {
    seed(['Runs the lower docks']);
    expect(await appendDetailToTier(vexRef(), 'Vex runs the lower docks.', 'sess-7', 7)).toBe(false);
    expect(vexDetails()).toEqual(['Runs the lower docks']);
  });
});
