/**
 * An NPC's entity card shows the disposition its record holds (issue #325
 * W22).
 *
 * formatEntityCard's connection table labelled `relationshipType` as
 * "Disposition", and `relationshipType` was only ever the ConnectionSchema
 * default "neutral" — no production code wrote it. The record's real
 * `disposition` (rolled by the seed, passed by the sector generator since
 * issue #322 V27) never reached the card, while the ACTIVE SECTOR roster
 * rendered it: one prompt said "Disposition: Hostile" and "Disposition:
 * neutral" for the same NPC. relationshipType is retired; the card, the
 * pacing classifier's connection line and the journal page show `disposition`.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createConnection, getConnection, seedConnectionActor } from '../../src/entities/connection.js';
import { formatEntityCard } from '../../src/narration/narratorPrompt.js';
import { formatSectorNpcProfile } from '../../src/narration/narrator.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const MODULE = 'starforged-companion';

beforeEach(() => {
  global.game.actors._reset();
  global.game.folders._reset?.();
  global.game.user = { isGM: true, id: 'test-user-gm' };
  const store = global.game.settings._store;
  store.clear();
  store.set(`${MODULE}.campaignState`, { ...CampaignStateSchema, connectionIds: [], sectors: [] });
});

describe('an NPC card\'s disposition', () => {
  it('the sector connection’s rolled disposition is the one its entity card shows', async () => {
    const state = global.game.settings.get(MODULE, 'campaignState');
    // The sector generator's createConnection call (sectorGenerator.js ~375).
    await createConnection({
      name: 'Vance Oduya', role: 'Dockmaster', goal: 'Expose a conspiracy', rank: 'dangerous',
      disposition: 'Hostile', firstLook: ['Scarred, grease-stained coat'],
    }, state, { persist: false });
    const record = getConnection(state.connectionIds[0]);

    // control: the roster line the same prompt carries says Hostile
    expect(formatSectorNpcProfile(record)).toContain('Disposition: Hostile');

    const card = formatEntityCard(record, 'connection');
    expect({ hostile: card.includes('Disposition: Hostile'), neutral: card.includes('Disposition: neutral') })
      .toEqual({ hostile: true, neutral: false });
  });

  it('a seeded NPC’s rolled disposition reaches its entity card', async () => {
    const state = global.game.settings.get(MODULE, 'campaignState');
    await createConnection({ name: 'Mira Kade', role: 'Courier', goal: 'Pay a debt', firstLook: ['Burned hand'],
      disposition: 'Suspicious', pronouns: 'she/her' }, state, { persist: false });
    const hostId = state.connectionIds[0];
    await seedConnectionActor(global.game.actors.get(hostId), state);   // ✦ Finalise / Auto-Seed
    const record = getConnection(hostId);
    expect(record.disposition).toBe('Suspicious');        // control: the record holds it

    const card = formatEntityCard(record, 'connection');
    expect(card).toContain('Disposition: Suspicious');
    expect(card).not.toContain('Disposition: neutral');
  });

  it('a record with no disposition shows no Disposition row — never a default', () => {
    const card = formatEntityCard({ _id: 'c-1', name: 'Sable', role: 'Pilot' }, 'connection');
    expect(card).not.toMatch(/Disposition:/);
  });
});
