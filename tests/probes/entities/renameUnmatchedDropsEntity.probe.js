/**
 * PROBE — RENAME-UNMATCHED-DROPS-NPC
 *
 * parseDetectionResponse (src/entities/entityExtractor.js) removes from
 * `entities` every name that any `renames[].to` mentions ("belt-and-braces
 * in case the model lists it in both places") — before anything checks that
 * the rename's `from` is one of the recorded placeholder connections. Then
 * applyEntityRenames finds no connection named `from` (or one that is not a
 * placeholder) and skips the rename. The newly named NPC is in neither path:
 * no card is renamed, no draft is offered, and nothing is logged.
 *
 * Scenario: one narration introduces "a hooded figure" who then gives the
 * name Vex. No card ever existed for the figure (the PLACEHOLDER FIGURES
 * list in the prompt is "(none)"), but the model reports both the rename
 * and the new connection.
 *
 * Correct behaviour (asserted): Vex reaches the GM — either a rename lands
 * or Vex is queued on the "New Entities Detected" card.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseDetectionResponse, applyEntityRenames, routeEntityDrafts,
} from '../../../src/entities/entityExtractor.js';

const MODULE = 'starforged-companion';

beforeEach(() => {
  global.game.actors._reset();
  global.game.user = { isGM: true, id: 'test-user-gm' };
  global.ChatMessage._reset();
  global.game.messages = { contents: [], get: () => null };
});

describe('PROBE RENAME-UNMATCHED-DROPS-NPC', () => {
  it('a rename from a figure that has no card does not swallow the new NPC', async () => {
    const cs = { connectionIds: [], dismissedEntities: [] };
    const reply = JSON.stringify({
      entities: [{ type: 'connection', name: 'Vex', description: 'A hooded courier with a voice like gravel.',
        pronouns: 'she/her', role: 'courier', goal: null, confidence: 'high' }],
      renames: [{ from: 'the hooded figure', to: 'Vex' }],
      worldJournal: { lore: [], threats: [], factionUpdates: [], locationUpdates: [], stateTransitions: [] },
    });

    const detection = parseDetectionResponse(reply, cs);
    const renamed   = await applyEntityRenames(detection.renames, cs);
    const routed    = await routeEntityDrafts(detection.entities, cs, { autoCreateConnection: false });

    const offered = [...renamed.map(r => r.to), ...routed.queued.map(e => e.name)];
    expect(offered).toContain('Vex');
  });
});
