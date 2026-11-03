/**
 * PROBE — CONN-DISPOSITION-NEUTRAL (EN)
 *
 * What the user does: a sector is created (its local connection's rolled
 * Initial Disposition is passed to createConnection — issue #322 V27), or an
 * NPC card is seeded (✦ Finalise / Auto-Seed rolls the Character Disposition
 * oracle into `record.disposition`). The NPC then appears in a scene.
 *
 * What happens: the narrator's ENTITIES IN SCENE card always says
 * "Disposition: neutral". formatEntityCard's connection field table
 * (src/narration/narratorPrompt.js ~726) labels `relationshipType` as
 * "Disposition", and `relationshipType` is only ever the ConnectionSchema
 * default "neutral" (src/schemas.js ~279) — no production code writes it
 * (the unit test that shows another value hand-sets it). The record's real
 * `disposition` — written by seedConnectionActor (src/entities/connection.js
 * ~425/439) and the sector generator — never reaches the card, while the
 * active-sector roster (formatSectorNpcProfile) renders it: one prompt tells
 * the narrator "Disposition: Hostile" and "Disposition: neutral" for the
 * same NPC.
 *
 * What should happen: the card's Disposition row shows the disposition the
 * record holds (the rolled / established one), never a default nothing set.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createConnection, getConnection, seedConnectionActor } from '../../../src/entities/connection.js';
import { formatEntityCard } from '../../../src/narration/narratorPrompt.js';
import { formatSectorNpcProfile } from '../../../src/narration/narrator.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const MODULE = 'starforged-companion';

beforeEach(() => {
  global.game.actors._reset();
  global.game.folders._reset?.();
  global.game.user = { isGM: true, id: 'test-user-gm' };
  const store = global.game.settings._store;
  store.clear();
  store.set(`${MODULE}.campaignState`, { ...CampaignStateSchema, connectionIds: [], sectors: [] });
});

describe('PROBE CONN-DISPOSITION-NEUTRAL', () => {
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
});
