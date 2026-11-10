/**
 * PROBE R2U-4 — COMPANION-HIT-IGNORES-NAMED-COMPANION (WRONG-TARGET)
 * Sibling of issue #342 Z53 (WITHSTAND-DAMAGE-COMMAND-VEHICLE-ONLY), on the
 * Companion Takes a Hit path.
 *
 * Vendored Companion Takes a Hit: "When your companion faces physical hardship,
 * they suffer -1 health … Then, if their health is 0 or you choose to test their
 * resilience, roll +your companion's health. On a strong hit … Give them +1
 * health … On a miss … They suffer an additional -1 health".
 *
 * Z53 made an integrity roll read the support vehicle the move or the
 * narration names (statEnrichment.selectNamedVehicleAsset, whole-word
 * `namedOnce`). The companion roll still ignores the narration:
 *   src/moves/statEnrichment.js:167-169  companion_health → companionItemId =
 *     selectCompanionAsset(actor) — "the one with the highest current track
 *     value" (:464-470), whatever the move or the narration names
 *   src/moves/statEnrichment.js:437-439 / :500-525 resolveCompanionHealth rolls
 *     that same companion's health and, with several, notifies "…using
 *     "<healthiest>" … Re-narrate if you meant a different companion." —
 *     re-narrating cannot change the pick; nothing reads the narration.
 *   The card's choices then change `companionItemId`'s track (issue #309 N03).
 *
 * Scenario:
 *   1. Kira has two companions: Glowcat (health 2) and Rockhorn (health 5).
 *   2. She types "The glowcat is clipped by a ricochet" → Companion Takes a Hit
 *      (+companion_health).
 *   3. The roll is +5 (the Rockhorn's health) and its harm / recovery land on
 *      the Rockhorn; the notice tells her to re-narrate, which picks the
 *      Rockhorn again.
 *   Expected: the Glowcat — statValue 2, companionItemId its asset.
 *   Actual: the Rockhorn — statValue 5, companionItemId the Rockhorn's.
 *
 * Control: with one companion the roll is that companion's (unchanged), and a
 * Heal for a named companion already reads the name (resolveHealPatient).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { enrichInterpretationStatValue, resolveHealPatient } from '../../../src/moves/statEnrichment.js';
import { invalidateActorCache } from '../../../src/character/actorBridge.js';

let seq = 0;
function kira(companions) {
  const id = `pc-r2u4-${++seq}`;
  invalidateActorCache(id);
  return {
    id, name: 'Kira', type: 'character',
    system: {
      iron: 1, edge: 2, heart: 2, shadow: 1, wits: 3,
      health: { value: 5, max: 5 }, spirit: { value: 5, max: 5 }, supply: { value: 3, max: 5 },
      momentum: { value: 2, max: 10, min: -6, resetValue: 2 },
      debility: {}, xp: 0,
    },
    items: { contents: companions.map(c => ({
      id: c.id, name: c.name, type: 'asset',
      system: { category: 'Companion', abilities: [], track: { enabled: true, name: 'Health', value: c.health, min: 0, max: 5 } },
    })) },
    getFlag: () => undefined,
  };
}

const NARRATION = 'The glowcat is clipped by a ricochet';

describe('R2U-4 COMPANION-HIT-IGNORES-NAMED-COMPANION — the hit companion is the healthiest, not the one named', () => {
  beforeEach(() => {
    global.ui.notifications.info = vi.fn();
  });

  it('Companion Takes a Hit for the named Glowcat rolls the Glowcat\'s health and targets it', () => {
    const actor = kira([
      { id: 'c-glowcat',  name: 'Glowcat',  health: 2 },
      { id: 'c-rockhorn', name: 'Rockhorn', health: 5 },
    ]);
    const interp = { moveId: 'companion_takes_a_hit', statUsed: 'companion_health', moveTarget: null, playerNarration: NARRATION };
    enrichInterpretationStatValue(actor, interp, {});
    expect({ statValue: interp.statValue, companionItemId: interp.companionItemId })
      .toEqual({ statValue: 2, companionItemId: 'c-glowcat' });
  });

  it('naming it as the move\'s target picks it too', () => {
    const actor = kira([
      { id: 'c-glowcat',  name: 'Glowcat',  health: 2 },
      { id: 'c-rockhorn', name: 'Rockhorn', health: 5 },
    ]);
    const interp = { moveId: 'companion_takes_a_hit', statUsed: 'companion_health', moveTarget: 'Glowcat', playerNarration: NARRATION };
    enrichInterpretationStatValue(actor, interp, {});
    expect(interp.companionItemId).toBe('c-glowcat');
  });

  it('control: one companion — the roll is that companion\'s', () => {
    const actor = kira([{ id: 'c-glowcat', name: 'Glowcat', health: 2 }]);
    const interp = { moveId: 'companion_takes_a_hit', statUsed: 'companion_health', moveTarget: null, playerNarration: NARRATION };
    enrichInterpretationStatValue(actor, interp, {});
    expect({ statValue: interp.statValue, companionItemId: interp.companionItemId })
      .toEqual({ statValue: 2, companionItemId: 'c-glowcat' });
  });

  it('control: a Heal for the named companion already resolves the name', () => {
    const actor = kira([
      { id: 'c-glowcat',  name: 'Glowcat',  health: 2 },
      { id: 'c-rockhorn', name: 'Rockhorn', health: 5 },
    ]);
    const interp = { moveId: 'heal', statUsed: 'heart', moveTarget: 'the glowcat', playerNarration: 'I get the glowcat to a vet' };
    resolveHealPatient(interp, actor, { players: [actor] });
    expect(interp.patientCompanionItemId).toBe('c-glowcat');
  });
});
