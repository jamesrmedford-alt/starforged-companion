/**
 * A vow's and a bond's rank reach the narrator and the cards as a name
 * (issue #321 U62).
 *
 * foundry-ironsworn's ProgressModel stores `system.rank` as a ChallengeRank
 * NumberField (1 troublesome … 5 epic — fields/ChallengeRank.ts; a string
 * written by createCharacterProgressItem is cast to its number), so a live vow
 * reads `rank: 3`, not "formidable". readVows / readConnections passed it
 * straight through, and the narrator's CHARACTER block read
 * "Background vow: … (3, progress 2/10)". Both readers now map it with
 * rankName().
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));

import { readVows, readConnections, invalidateActorCache } from '../../src/character/actorBridge.js';
import { getActiveCharacter } from '../../src/narration/narrator.js';
import { buildNarratorSystemPrompt } from '../../src/narration/narratorPrompt.js';

const MODULE_ID = 'starforged-companion';

function vendorPc() {
  // What the vendor DataModel holds after Item.create({ system: { rank: "formidable" } })
  const vow  = { id: 'vow-1',  name: 'Find the Wanderer', type: 'progress', flags: { [MODULE_ID]: { sharedVow: true, vowId: 'm1' } },
    system: { subtype: 'vow',  rank: 3, current: 8, completed: false, hasClock: false } };
  const bond = { id: 'bond-1', name: 'Vance', type: 'progress', flags: {},
    system: { subtype: 'bond', rank: 2, current: 4, completed: false } };
  const a = makeTestActor({ id: 'pc-r', name: 'Kira', items: { contents: [vow, bond] } });
  game.actors._setAll([a]);
  invalidateActorCache(a.id);
  return a;
}

beforeEach(() => { game.actors._reset(); });

describe("a vendor vow's numeric rank reads as its name", () => {
  it('the snapshot carries the rank name for a vow and a bond', () => {
    const a = vendorPc();
    expect(readVows(a)[0].rank).toBe('formidable');
    expect(readConnections(a)[0].rank).toBe('dangerous');
  });

  it("the narrator's CHARACTER block names the vow's rank", () => {
    vendorPc();
    const cs = { safety: { lines: [], veils: [], privateLines: [] }, worldTruths: {}, connectionIds: [], characterIds: ['pc-r'] };
    const prompt = buildNarratorSystemPrompt(
      cs, { narrationTone: 'wry', narrationPerspective: 'second_person', narrationLength: 3 },
      getActiveCharacter(cs), '', { mode: 'paced_narrative' },
    );
    const line = prompt.split('\n').find(l => l.startsWith('Background vow:'));
    expect(line).toBe('Background vow: Find the Wanderer (formidable, progress 2/10)');
  });

  it('control: a string rank passes through and a missing rank still defaults to dangerous', () => {
    const a = makeTestActor({ id: 'pc-s', name: 'Ren', items: { contents: [
      { id: 'v1', name: 'Named rank', type: 'progress', system: { subtype: 'vow', rank: 'epic', current: 0 } },
      { id: 'v2', name: 'No rank',    type: 'progress', system: { subtype: 'vow', current: 0 } },
      { id: 'b1', name: 'No rank',    type: 'progress', system: { subtype: 'bond', current: 0 } },
    ] } });
    invalidateActorCache(a.id);
    expect(readVows(a).map(v => v.rank)).toEqual(['epic', 'dangerous']);
    expect(readConnections(a)[0].rank).toBe('dangerous');
  });
});
