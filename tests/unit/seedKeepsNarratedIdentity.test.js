/**
 * STARFORGED COMPANION
 * tests/unit/seedKeepsNarratedIdentity.test.js
 *
 * Issue #325 W31: the seed rolled a goal and a first look over the narrated
 * ones. buildConnectionSeedData put the narrated goal (or the Make a
 * Connection seed's goal the narration was written from) in `motivation`,
 * never `goal`, and folded the first look into `description`;
 * seedConnectionActor read only `goal` / `firstLook`, found them blank and
 * rolled both — "Goal: <rolled>" beside "Motivation: <narrated>", and a rolled
 * first look in the record, the Characteristics, the Notes and the sector
 * roster beside the narrated look. decisions.md (issue #286 D3): what the
 * narration established wins over oracle rolls.
 *
 * Converted from the audit probe entities/seedRerollsNarratedIdentity
 * (both paths: Make a Connection then ✦ Finalise, and a draft Confirm with
 * Auto-Seed on), plus the control that an NPC nobody described still gets a
 * first look, and the session vignette's hint (a `motivation` reader) reading
 * the goal.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const ROLLED = {
  character_goal:        'ROLLED GOAL find a lost relic',
  character_first_look:  'ROLLED LOOK towering chrome-plated',
  character_role:        'ROLLED ROLE',
  character_disposition: 'Suspicious',
};
vi.mock('../../src/oracles/roller.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    rollOracle: (id, opts) => (ROLLED[id]
      ? { tableId: id, tableName: id, die: 100, roll: 50, result: ROLLED[id], isRef: false, sufferRoutes: [] }
      : actual.rollOracle(id, opts)),
  };
});

import { routeEntityDrafts } from '../../src/entities/entityExtractor.js';
import { finalizeEntity } from '../../src/entities/finalize.js';
import { createConnection, seedConnectionActor } from '../../src/entities/connection.js';
import { formatSectorNpcProfile } from '../../src/narration/narrator.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';

const MODULE = 'starforged-companion';
const NARRATED_GOAL = 'pay off her debt to the Hollow Spire';
const MIRA = {
  type: 'connection', name: 'Mira Kade', description: 'A courier with a burned hand.',
  pronouns: 'she/her', role: 'courier', goal: NARRATED_GOAL, confidence: 'high',
};

function resetSingleClient() {
  global.game.actors._reset();
  global.game.folders._reset?.();
  global.game.user = { isGM: true, id: 'test-user-gm' };
  global.game.users._set([{ id: 'test-user-gm', isGM: true, active: true }]);
  global.ChatMessage._reset();
  const store = global.game.settings._store;
  store.clear();
  store.set(`${MODULE}.campaignState`, {
    ...CampaignStateSchema, currentSessionId: 'sess-1', sessionNumber: 1, sceneTruths: [], connectionIds: [],
  });
}

describe('Make a Connection, then ✦ Finalise', () => {
  beforeEach(resetSingleClient);

  it('Finalise keeps the goal and first look the Make a Connection narration was written from', async () => {
    const state = global.game.settings.get(MODULE, 'campaignState');
    // The Make a Connection seed the narration was written from (resolver
    // buildOracleSeeds → connectionSeed); the detection read the narrated goal.
    const connectionSeed = { role: 'Courier', goal: 'Seed goal: protect a secret',
      firstLook: 'Seed look: burned hand wrapped in gauze', givenName: 'Ana' };
    const { created } = await routeEntityDrafts([MIRA], state, { autoCreateConnection: true, connectionSeed, sessionId: 'sess-1' });
    expect(created).toHaveLength(1);

    const hostId = state.connectionIds[0];
    const result = await finalizeEntity('connection', hostId, state);
    expect(result.ok).toBe(true);

    const actor  = global.game.actors.get(hostId);
    const record = actor.flags[MODULE].connection;
    const roster = formatSectorNpcProfile(record);
    expect({
      goal:           record.goal,
      firstLook:      record.firstLook,
      rolledInCard:   /ROLLED/.test(actor.system.biography),
      rolledInRoster: /ROLLED/.test(roster),
    }).toEqual({
      goal:           NARRATED_GOAL,
      firstLook:      [],
      rolledInCard:   false,
      rolledInRoster: false,
    });
    // The narrated look stands in the Characteristics instead of a rolled one.
    expect(actor.system.biography).toContain('Description: A courier with a burned hand.');
  });
});

describe('the seed rolls only what nobody established', () => {
  beforeEach(resetSingleClient);

  it('control: an NPC created with no description and no goal still gets a rolled goal and first look', async () => {
    const state = global.game.settings.get(MODULE, 'campaignState');
    await createConnection({ name: 'Tobias Venn', role: 'smuggler' }, state);
    const actor = global.game.actors.get(state.connectionIds[0]);

    const seeded = await seedConnectionActor(actor, state);

    expect({ goal: seeded.goal, firstLook: seeded.firstLook, role: seeded.role })
      .toEqual({ goal: ROLLED.character_goal, firstLook: [ROLLED.character_first_look], role: 'smuggler' });
    expect(actor.system.biography).toContain(`First look: ${ROLLED.character_first_look}`);
  });
});

describe('a draft Confirm with Auto-Seed on (booted table)', () => {
  let table;
  beforeAll(async () => {
    table = await simulateTable({ users: [USERS.GM, USERS.P1] });
  }, 30_000);
  afterAll(() => table?.teardown());

  beforeEach(async () => {
    await table.reset({ world: { settings: {
      chronicleAutoEntry: false,
      autoSeedConnection: true,
      campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1,
        currentSceneId: 'sc-1', sceneTruths: [], connectionIds: [] },
    } } });
    table.addActor({ id: 'pc-pat', name: 'Kira', ownership: { 'pl-1': 3 } });
  });

  it('the seeded card keeps the narrated goal and rolls no first look for a described NPC', async () => {
    const gm = table.client('gm-1');
    const { routeEntityDrafts: route } = await gm.import('../../src/entities/entityExtractor.js');
    await gm.run(() => route([MIRA], game.settings.get(MODULE_ID, 'campaignState'), { autoCreateConnection: false }));
    await table.settle();
    const card = table.cards(f => f.draftEntityCard)[0];
    expect(card).toBeTruthy();

    gm.click(card._id, '[data-action="sf-draft-confirm"]', { index: 0 });
    await table.drain();

    const actor = table.actors.find(a => a.name === 'Mira Kade' && a.flags?.[MODULE_ID]?.entityType === 'connection');
    expect(actor).toBeTruthy();
    const record = actor.flags[MODULE_ID].connection;
    expect(record.seeded).toBe(true);                    // the Auto-Seed hook ran
    expect({
      goal:         record.goal,
      firstLook:    record.firstLook,
      rolledInCard: /ROLLED/.test(actor.system.biography ?? ''),
    }).toEqual({
      goal:         NARRATED_GOAL,
      firstLook:    [],
      rolledInCard: false,
    });
  });
});
