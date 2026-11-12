/**
 * TIER-DETAIL-NEGATION-WORDS (known-issues; TIER-DETAIL-NEGATION-LIST's
 * residual). Both tier writers (the live tier pass, the scene-end migration)
 * skip a detail the card already states — one detail's words, in order, as
 * whole words inside the other's, with no reversing word around them. The
 * reversing words were a list, so a reversal worded past it read as a repeat
 * and the new fact was written nowhere: "Used to run the lower docks" beside
 * "Run the lower docks", "Feigned loyalty to the Compact" beside "Loyalty to
 * the Compact". A restatement may now lead only with the entity's own name or
 * role words, a pronoun or filler; anything else ahead of the fact keeps the
 * detail (a duplicate kept is the safer miss).
 *
 * Harness: tierDetailNegationList.test.js's.
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn(async () => ({ content: [{ type: 'text', text: '{"contradictions":[]}' }] })) }));

import { appendMigratedTruthToTier, appendDetailToTier } from '../../src/entities/entityExtractor.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;

let orig, vex;
function seed(olderDetails) {
  vex = makeTestActor({ id: 'npc-vex', name: 'Vex Marrow', type: 'character', hasPlayerOwner: false,
    flags: { [MODULE_ID]: { entityType: 'connection', connection: {
      name: 'Vex Marrow', role: 'Dockmaster',
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

describe('TIER-DETAIL-NEGATION-WORDS — a reversal worded past any list is not a repeat', () => {
  it.each([
    ['Run the lower docks', 'Used to run the lower docks'],
    ['Loyalty to the Compact', 'Feigned loyalty to the Compact'],
    ['Suspected of smuggling', 'Wrongly suspected of smuggling'],
    ['The Syndicate\'s informant', 'Escaped being the Syndicate\'s informant'],
    ['Owes the crew a favour', 'Owes the crew a favour until the job is done'],
  ])('beside "%s", the scene-end migration files "%s"', async (older, fact) => {
    seed([older]);
    expect(await appendMigratedTruthToTier('npc-vex', 'connection', migrated(fact))).toBe(true);
    expect(vexDetails()).toEqual([older, fact]);
  });

  it('the live tier pass saves "Used to run the lower docks" beside "Run the lower docks"', async () => {
    seed(['Run the lower docks']);
    expect(await appendDetailToTier(vexRef(), 'Used to run the lower docks', 'sess-7', 7)).toBe(true);
    expect(vexDetails()).toEqual(['Run the lower docks', 'Used to run the lower docks']);
  });

  it.each([
    ['Runs the lower docks', 'Vex Marrow runs the lower docks'],
    ['Runs the lower docks', 'The dockmaster runs the lower docks'],
    ['Runs the lower docks', 'She still runs the lower docks'],
    ["Ship is fast", "Vex's ship is fast"],
    ['Agreed to smuggle the cargo', 'Vex agreed to smuggle the cargo for the crew'],
  ])('control: beside "%s", "%s" is the same detail — not filed twice', async (older, fact) => {
    seed([older]);
    expect(await appendMigratedTruthToTier('npc-vex', 'connection', migrated(fact)), 'the truth is on the card').toBe(true);
    expect(vexDetails()).toEqual([older]);
  });
});
