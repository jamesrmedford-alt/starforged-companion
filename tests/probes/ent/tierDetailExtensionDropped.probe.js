/**
 * ENT-08 · TIER-DETAIL-EXTENSION-COUNTED-AS-REPEAT
 *
 * Scenario: Vex's card already holds the narrator-added detail "Owes the
 * Syndicate a debt" (the live tier pass). Later the scene establishes the
 * fuller truth "Vex owes the Syndicate a debt she means to settle by selling
 * out the crew"; at scene end it is migrated to her card
 * (sceneLifecycle → appendMigratedTruthToTier). Or the tier pass itself
 * returns "Agreed to carry the crew to Bleakhold in exchange for half the
 * salvage" where the card says "Agreed to carry the crew to Bleakhold".
 *
 * Correct: the new part is a new fact — it reaches the card (appended, or in
 * place of the shorter line). The duplicate check's own rule: "a duplicate
 * kept is the safer miss" (tierHasDetail; issue #347 AB11 — "each new truth
 * was counted as migrated and written nowhere").
 *
 * Today: tierHasDetail asks restatesDetail both ways round, and the
 * "new detail contains the old one" direction accepts any words AFTER the
 * shared ones that are not on the reversing list. The longer detail is taken
 * for a repeat: appendMigratedTruthToTier returns true — the scene's truth is
 * marked migrated — and appendDetailToTier returns false; nothing is written,
 * and what the detail added is recorded nowhere.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { appendMigratedTruthToTier, appendDetailToTier } from '../../../src/entities/entityExtractor.js';
import { getConnection } from '../../../src/entities/connection.js';

const MODULE = 'starforged-companion';
const tier = () => (global.game.actors.get('npc-vex').getFlag(MODULE, 'connection')?.generativeTier ?? []).map(e => e.detail);
const entry = (detail) => ({ sessionId: 's1', sessionNum: 1, detail, source: 'scene_truth', pinned: false, promoted: false, promotedAt: null, createdAt: 1 });

beforeEach(() => {
  global.game.actors._reset();
  global.game.user = { isGM: true, id: 'gm-1' };
  global.game.actors._set('npc-vex', global.makeTestActor({
    id: 'npc-vex', type: 'character', name: 'Vex',
    flags: { [MODULE]: { entityType: 'connection', connection: {
      _id: 'rec-vex', name: 'Vex', role: 'smuggler', active: true,
      generativeTier: [entry('Owes the Syndicate a debt'), entry('Agreed to carry the crew to Bleakhold')],
    } } },
  }));
});

describe('ENT-08 — a detail that restates a card line and adds to it is not a repeat', () => {
  it('control: the same fact led by her name is a repeat — nothing is added', async () => {
    expect(await appendMigratedTruthToTier('npc-vex', 'connection', entry('Vex owes the Syndicate a debt'))).toBe(true);
    expect(tier()).toEqual(['Owes the Syndicate a debt', 'Agreed to carry the crew to Bleakhold']);
  });

  it('control: a reversal after the shared words is kept (AB11)', async () => {
    await appendMigratedTruthToTier('npc-vex', 'connection', entry('Owes the Syndicate a debt no longer'));
    expect(tier()).toContain('Owes the Syndicate a debt no longer');
  });

  it('scene end: the fuller truth reaches the card', async () => {
    await appendMigratedTruthToTier('npc-vex', 'connection',
      entry('Vex owes the Syndicate a debt she means to settle by selling out the crew'));
    expect(tier().some(d => /selling out the crew/.test(d)), `what the card holds: ${JSON.stringify(tier())}`).toBe(true);
  });

  it('live tier pass: the price of the deal reaches the card', async () => {
    const ref = { journalId: 'npc-vex', type: 'connection', record: getConnection('npc-vex') };
    await appendDetailToTier(ref, 'Agreed to carry the crew to Bleakhold in exchange for half the salvage', 's1', 1);
    expect(tier().some(d => /half the salvage/.test(d)), `what the card holds: ${JSON.stringify(tier())}`).toBe(true);
  });
});
