/**
 * STARFORGED COMPANION — bug-audit probe (area: fact continuity / scene lifecycle)
 * tests/probes/cont/sceneEndDropsFactInsideOlderDetail.probe.js
 *
 * CONT — a scene end discards an entity truth whose text sits inside an older
 * detail on the card as a raw substring — including the detail it reverses.
 *
 * Vex's card says "Distrusts the crew" (an earlier session). This scene the
 * crew earns her trust and the narrator's sidecar records the binding truth
 * "Vex — Trusts the crew". The scene ends: `migrateSceneTruth` →
 * `safeMigrateToEntityTier` (src/factContinuity/sceneLifecycle.js) hands the
 * truth to `appendMigratedTruthToTier`, whose dedupe (`tierHasDetail`,
 * entityExtractor.js) is `existing.includes(new) || new.includes(existing)`
 * on lowercase text — and "distrusts the crew" includes "trusts the crew". It
 * returns true ("the fact IS in the tier"), the scene end marks the truth
 * migrated, counts it, and clears the ledger: the new fact is in no store, and
 * the card goes on telling the narrator the opposite. Sidecar facts are short
 * subject-less phrases, so the same happens to "Is dead" beside "Is deadly
 * with a blade".
 *
 * Correct behaviour asserted here: a truth the card does not already state is
 * on the card after the scene ends.
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../src/api-proxy.js', () => ({ apiPost: vi.fn(async () => ({ content: [{ type: 'text', text: '{"contradictions":[]}' }] })) }));

import { applyNarratorSidecar, postNarrationCard } from '../../../src/narration/narrator.js';
import { endScene } from '../../../src/factContinuity/sceneLifecycle.js';

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

describe('CONT — a scene end files each entity truth on its card', () => {
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
