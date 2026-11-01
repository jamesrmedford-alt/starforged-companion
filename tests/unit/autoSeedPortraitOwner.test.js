/**
 * STARFORGED COMPANION
 * tests/unit/autoSeedPortraitOwner.test.js
 *
 * A new NPC card gets one portrait, whoever creates it (issue #321 U29).
 *
 * With "Auto-Seed NPC / Connection Details" (autoSeedConnection) on and an
 * OpenRouter key set, every connection the module created got two silent
 * portrait generations: the createActor seed hook (seedConnectionActor) and
 * the creator's own postCreationEnrichment — draft Confirm, the
 * make_a_connection auto-create, the inciting vow target. Two OpenRouter
 * image calls were billed per NPC. Now, with Auto-Seed on, the seed hook owns
 * the portrait (drawing on the creator's portrait source); with it off, the
 * creator does.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const art = vi.hoisted(() => ({ calls: [] }));
vi.mock('../../src/art/generator.js', async (importOriginal) => ({
  ...(await importOriginal()),
  generatePortrait: vi.fn(async (hostId, typeKey, record) => {
    art.calls.push({ hostId, typeKey, seeded: !!record?.seeded, source: record?.portraitSourceDescription ?? '' });
    return null;
  }),
}));

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';

let table;
beforeAll(async () => { table = await simulateTable({ users: [USERS.GM] }); }, 30_000);
afterAll(() => table?.teardown());

async function resetWith({ autoSeed }) {
  art.calls.length = 0;
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    autoSeedConnection: autoSeed,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', connectionIds: [] },
  } } });
  await table.client('gm-1').setSetting('openRouterApiKey', 'sk-or-test');
  await table.settle();
}

const VANCE = { type: 'connection', name: 'Vance Oduya', description: 'The dockmaster of the Hollow Spire.', confidence: 'high' };
const vance = () => table.actors.find(a => a.name === 'Vance Oduya' && a.flags?.[MODULE_ID]?.entityType === 'connection');
const portraitsOf = (actor) => art.calls.filter(c => c.hostId === actor.id);

/** The narration names Vance; the GM confirms him from the draft card. */
async function confirmDraft() {
  const gm = table.client('gm-1');
  const { routeEntityDrafts } = await gm.import('../../src/entities/entityExtractor.js');
  await gm.run(() => routeEntityDrafts([VANCE], game.settings.get(MODULE_ID, 'campaignState'), { autoCreateConnection: false }));
  await table.settle();
  const card = table.cards(f => f.draftEntityCard)[0];
  gm.click(card._id, '[data-action="sf-draft-confirm"]');
  await table.drain();
}

/** A Make a Connection hit auto-creates Vance (no draft card). */
async function autoCreate() {
  const gm = table.client('gm-1');
  const { routeEntityDrafts } = await gm.import('../../src/entities/entityExtractor.js');
  await gm.run(() => routeEntityDrafts([VANCE], game.settings.get(MODULE_ID, 'campaignState'), { autoCreateConnection: true }));
  await table.drain();
}

describe('with Auto-Seed NPC on, the seed owns the new card\'s portrait', () => {
  beforeEach(() => resetWith({ autoSeed: true }));

  it('confirming one NPC draft generates one portrait', async () => {
    await confirmDraft();

    expect(vance()).toBeTruthy();
    expect(portraitsOf(vance())).toHaveLength(1);
    expect(portraitsOf(vance())[0]).toMatchObject({ typeKey: 'connection', seeded: true });
  });

  it('a Make a Connection auto-create generates one portrait', async () => {
    await autoCreate();

    expect(vance()).toBeTruthy();
    expect(portraitsOf(vance())).toHaveLength(1);
    expect(portraitsOf(vance())[0].seeded).toBe(true);
  });

  it('control: the seed draws its portrait from the description the narration gave', async () => {
    await confirmDraft();

    expect(portraitsOf(vance())[0].source).toMatch(/dockmaster of the Hollow Spire/);
  });
});

describe('with Auto-Seed NPC off, the creator owns it', () => {
  beforeEach(() => resetWith({ autoSeed: false }));

  it('control: confirming one NPC draft generates one portrait', async () => {
    await confirmDraft();

    expect(portraitsOf(vance())).toHaveLength(1);
    expect(portraitsOf(vance())[0].seeded).toBe(false);
  });
});
