/**
 * STARFORGED COMPANION
 * tests/unit/tierDetailExtensionKept.test.js
 *
 * Issue #362 AC20 TIER-DETAIL-EXTENSION-COUNTED-AS-REPEAT (the audit's
 * ent/tierDetailExtensionDropped probe; ENT-08).
 *
 * Vex's card already holds the narrator-added detail "Owes the Syndicate a
 * debt" (the live tier pass). Later the scene establishes the fuller truth
 * "Vex owes the Syndicate a debt she means to settle by selling out the
 * crew"; at scene end it is migrated to her card (sceneLifecycle →
 * appendMigratedTruthToTier). Or the tier pass itself returns "Agreed to carry
 * the crew to Bleakhold in exchange for half the salvage" where the card says
 * "Agreed to carry the crew to Bleakhold".
 *
 * Both tier writers skip a detail the card already states (tierHasDetail).
 * In the direction "the new detail holds the card's line", only a REVERSING
 * word after the shared words kept it, so the longer detail was taken for a
 * repeat: appendMigratedTruthToTier answered true — the scene's truth marked
 * migrated — and appendDetailToTier false, and what the detail added was
 * recorded nowhere. A new detail now repeats a card line only when all it
 * adds is neutral (a name, a pronoun, "still", "yet"); "a duplicate kept is
 * the safer miss" (issue #347 AB11).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { appendMigratedTruthToTier, appendDetailToTier } from '../../src/entities/entityExtractor.js';
import { getConnection } from '../../src/entities/connection.js';

const MODULE = 'starforged-companion';
const tier = () => (global.game.actors.get('npc-vex').getFlag(MODULE, 'connection')?.generativeTier ?? []).map(e => e.detail);
const entry = (detail) => ({ sessionId: 's1', sessionNum: 1, detail, source: 'scene_truth', pinned: false, promoted: false, promotedAt: null, createdAt: 1 });

function seed(details) {
  global.game.actors._reset();
  global.game.actors._set('npc-vex', global.makeTestActor({
    id: 'npc-vex', type: 'character', name: 'Vex',
    flags: { [MODULE]: { entityType: 'connection', connection: {
      _id: 'rec-vex', name: 'Vex', role: 'smuggler', active: true,
      generativeTier: details.map(entry),
    } } },
  }));
}

beforeEach(() => {
  global.game.user = { isGM: true, id: 'gm-1' };
  seed(['Owes the Syndicate a debt', 'Agreed to carry the crew to Bleakhold']);
});

describe('issue #362 AC20 — a detail that restates a card line and adds to it is not a repeat', () => {
  it('control: the same fact led by her name is a repeat — nothing is added', async () => {
    expect(await appendMigratedTruthToTier('npc-vex', 'connection', entry('Vex owes the Syndicate a debt'))).toBe(true);
    expect(tier()).toEqual(['Owes the Syndicate a debt', 'Agreed to carry the crew to Bleakhold']);
  });

  it('control: a reversal after the shared words is kept (AB11)', async () => {
    await appendMigratedTruthToTier('npc-vex', 'connection', entry('Owes the Syndicate a debt no longer'));
    expect(tier()).toContain('Owes the Syndicate a debt no longer');
  });

  it('control: a shorter detail the card line already holds is a repeat — the card says more', async () => {
    expect(await appendDetailToTier({ journalId: 'npc-vex', type: 'connection', record: getConnection('npc-vex') },
      'Agreed to carry the crew', 's1', 1)).toBe(false);
    expect(tier()).toEqual(['Owes the Syndicate a debt', 'Agreed to carry the crew to Bleakhold']);
  });

  it('control: a neutral word after the card line\'s words adds nothing — "she still owes the Syndicate a debt yet"', async () => {
    expect(await appendMigratedTruthToTier('npc-vex', 'connection', entry('She still owes the Syndicate a debt yet'))).toBe(true);
    expect(tier()).toEqual(['Owes the Syndicate a debt', 'Agreed to carry the crew to Bleakhold']);
  });

  it('scene end: the fuller truth reaches the card — and is migrated because it was written', async () => {
    expect(await appendMigratedTruthToTier('npc-vex', 'connection',
      entry('Vex owes the Syndicate a debt she means to settle by selling out the crew'))).toBe(true);
    expect(tier().some(d => /selling out the crew/.test(d)), `what the card holds: ${JSON.stringify(tier())}`).toBe(true);
  });

  it('live tier pass: the price of the deal reaches the card', async () => {
    const ref = { journalId: 'npc-vex', type: 'connection', record: getConnection('npc-vex') };
    expect(await appendDetailToTier(ref, 'Agreed to carry the crew to Bleakhold in exchange for half the salvage', 's1', 1)).toBe(true);
    expect(tier().some(d => /half the salvage/.test(d)), `what the card holds: ${JSON.stringify(tier())}`).toBe(true);
  });

  it('a subject-led detail that says who it was for is kept beside the card line', async () => {
    seed(['Agreed to smuggle the cargo']);
    expect(await appendMigratedTruthToTier('npc-vex', 'connection', entry('Vex agreed to smuggle the cargo for the crew'))).toBe(true);
    expect(tier()).toEqual(['Agreed to smuggle the cargo', 'Vex agreed to smuggle the cargo for the crew']);
  });
});
