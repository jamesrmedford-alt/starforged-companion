/**
 * STARFORGED COMPANION
 * tests/unit/tierDetailNegationList.test.js
 *
 * Issue #347 residual TIER-DETAIL-NEGATION-LIST (AB11's). A detail restates
 * another only as whole words, in order, with nothing around them that
 * negates or reverses them — and AB11's list of reversing words was short: a
 * reversal phrased past it ("Gave up being the Syndicate's informant" beside
 * "The Syndicate's informant", "Trusted the crew, then distrusted them"
 * beside "Trusted the crew") was counted as the same detail, so the new fact
 * was written nowhere. The list now covers quit / stopped / ceased, gave up,
 * turned against, lost, broke, betrayed, abandoned and the like, and a
 * dis- / un- / mis- / non- form of one of the detail's own words around it.
 * An exact restatement still dedupes.
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn(async () => ({ content: [{ type: 'text', text: '{"contradictions":[]}' }] })) }));

import { appendMigratedTruthToTier, appendDetailToTier } from '../../src/entities/entityExtractor.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;

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

const vexDetails = () => (vex.getFlag(MODULE_ID, 'connection').generativeTier ?? []).map(e => e.detail);
const migrated   = (detail) => ({ sessionId: 'sess-7', sessionNum: 7, detail, source: 'fact_continuity', pinned: false, promoted: false, promotedAt: null, createdAt: 2000 });
const vexRef     = () => ({ journalId: 'npc-vex', type: 'connection', record: vex.getFlag(MODULE_ID, 'connection') });

describe('a reversal phrased past the first list is never the same detail (issue #347 residual)', () => {
  it.each([
    ["The Syndicate's informant", "Gave up being the Syndicate's informant"],
    ['Trusted the crew', 'Trusted the crew, then distrusted them'],
    ['The Iron Accord', 'Turned against the Iron Accord'],
    ['The Syndicate', 'Quit the Syndicate'],
    ['Captain of the Wayfarer', 'Broke with the captain of the Wayfarer'],
    ['Sworn to the crew', 'Betrayed her oath, sworn to the crew'],
    ['The outpost on Ash', 'Abandoned the outpost on Ash'],
    ['Liked by the dockhands', 'Liked by the dockhands, then disliked'],
  ])('beside "%s", the scene-end migration files "%s"', async (older, fact) => {
    seed([older]);
    expect(await appendMigratedTruthToTier('npc-vex', 'connection', migrated(fact))).toBe(true);
    expect(vexDetails()).toEqual([older, fact]);
  });

  it('the live tier pass saves "Gave up being the Syndicate\'s informant" beside "The Syndicate\'s informant"', async () => {
    seed(["The Syndicate's informant"]);
    expect(await appendDetailToTier(vexRef(), "Gave up being the Syndicate's informant", 'sess-7', 7)).toBe(true);
    expect(vexDetails()).toEqual(["The Syndicate's informant", "Gave up being the Syndicate's informant"]);
  });

  it.each([
    ['Quit the Syndicate', 'quit the Syndicate.'],
    ['Captain of the Wayfarer', 'Vex, captain of the Wayfarer'],
    ['Vex runs the lower docks', 'Runs the lower docks'],
    ['Broke her oath to the crew', 'Broke her oath to the crew'],
  ])('control: beside "%s", "%s" is the same detail — not filed twice', async (older, fact) => {
    seed([older]);
    expect(await appendMigratedTruthToTier('npc-vex', 'connection', migrated(fact)), 'the truth is on the card').toBe(true);
    expect(vexDetails()).toEqual([older]);
  });

  it('control: a prefixed word around the detail that is no form of its own words reverses nothing', async () => {
    seed(['Runs the lower docks']);
    expect(await appendDetailToTier(vexRef(), 'Runs the lower docks, unarmed', 'sess-7', 7)).toBe(false);
    expect(vexDetails()).toEqual(['Runs the lower docks']);
  });
});
