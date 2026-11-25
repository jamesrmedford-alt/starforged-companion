/**
 * STARFORGED COMPANION
 * tests/unit/cardsAndDraftsSayNoCrewOrPlayer.test.js
 *
 * Issue #388, the smaller observations: the fifth live long haul's one
 * character was told "The crew reach a place no chart showed before" by the
 * Site Discovered card (a26), and an entity draft described Ilse as "The
 * player character's sister" (a13) — the narration says "you", and the
 * detector was given no name for the character.
 */

/* global makeTestActor */
import { describe, it, expect, beforeEach } from 'vitest';
import { postSiteDiscoveryCard, UNCHARTED_SITE_TYPE } from '../../src/sectors/siteDiscovery.js';
import { buildCombinedDetectionPrompt } from '../../src/entities/entityExtractor.js';

beforeEach(() => {
  ChatMessage._reset();
  game.actors._reset();
});

describe('no crew for a character who flies alone, no "player" in the story', () => {
  it('the Site Discovered card for an uncharted place says nothing of a crew', async () => {
    await postSiteDiscoveryCard({ site: { id: 'site-u', type: UNCHARTED_SITE_TYPE, name: 'The signal\'s source', discovered: true } });
    const [card] = ChatMessage._created;
    expect(card.content).toContain('No chart showed this place before. It is now charted on the sector map');
    expect(card.content).not.toMatch(/\bcrew\b/i);
  });

  it('the detector is told whom the narration\'s "you" is, and never to write "the player character"', () => {
    game.actors._set('pc-mira', makeTestActor({ id: 'pc-mira', name: 'Mira Kestrel' }));
    const prompt = buildCombinedDetectionPrompt('You turn the compass over; Ilse left it behind.', 'paced_narrative', 'none', { connectionIds: [] });
    expect(prompt).toContain('The\nnarration\'s "you" is Mira Kestrel: name them so, and never\nwrite "the player", "the player character" or "the PC".');
  });
});
