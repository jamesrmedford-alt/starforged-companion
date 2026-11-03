/**
 * PROBE — SEED-REROLLS-NARRATED-IDENTITY (EN)
 *
 * What the user does: the narration introduces "Mira Kade — a courier with a
 * burned hand, who wants to pay off her debt to the Hollow Spire". Either
 * (a) a Make a Connection hit auto-creates her and the GM later presses
 * ✦ Finalise in the Entities panel, or (b) the GM confirms her draft card with
 * "Auto-Seed NPC / Connection Details" on (the createActor seed hook).
 *
 * What happens: the card ends up with a freshly rolled Character Goal and
 * First Look that contradict the narration. buildConnectionSeedData
 * (src/entities/entityExtractor.js ~749) puts the narrated goal — or the
 * Make a Connection seed's goal the narration was written from — in
 * `motivation`, never `goal`, and folds the first look into `description`
 * (Confirm drops the rolled look when the narration described her — issue
 * #286 D3). seedConnectionActor (src/entities/connection.js ~422-424) then
 * reads only `existing.goal` / `existing.firstLook`, finds them blank and
 * rolls both: "Goal: <rolled>" sits beside "Motivation: <narrated goal>",
 * and a rolled first look goes into the record, the Characteristics field,
 * the Notes intro and the narrator's sector roster ("First look: …") next to
 * the description's narrated look.
 *
 * What should happen (decisions.md, issue #286 D3): what the narration
 * established wins over oracle rolls — the record's goal is the narrated
 * goal, and no first look is rolled for an NPC the narration described.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const ROLLED = {
  character_goal:        'ROLLED GOAL find a lost relic',
  character_first_look:  'ROLLED LOOK towering chrome-plated',
  character_role:        'ROLLED ROLE',
  character_disposition: 'Suspicious',
};
vi.mock('../../../src/oracles/roller.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    rollOracle: (id, opts) => (ROLLED[id]
      ? { tableId: id, tableName: id, die: 100, roll: 50, result: ROLLED[id], isRef: false, sufferRoutes: [] }
      : actual.rollOracle(id, opts)),
  };
});

import { routeEntityDrafts } from '../../../src/entities/entityExtractor.js';
import { finalizeEntity } from '../../../src/entities/finalize.js';
import { formatSectorNpcProfile } from '../../../src/narration/narrator.js';
import { CampaignStateSchema } from '../../../src/schemas.js';
import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';

const MODULE = 'starforged-companion';
const NARRATED_GOAL = 'pay off her debt to the Hollow Spire';
const MIRA = {
  type: 'connection', name: 'Mira Kade', description: 'A courier with a burned hand.',
  pronouns: 'she/her', role: 'courier', goal: NARRATED_GOAL, confidence: 'high',
};

describe('PROBE SEED-REROLLS-NARRATED-IDENTITY (a): Make a Connection, then ✦ Finalise', () => {
  beforeEach(() => {
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
  });

  it('Finalise keeps the goal and first look the Make a Connection narration was written from', async () => {
    const state = global.game.settings.get(MODULE, 'campaignState');
    // The Make a Connection seed the narration was written from (resolver
    // buildOracleSeeds → connectionSeed); the detection read the narrated goal.
    const connectionSeed = { role: 'Courier', goal: 'Seed goal: protect a secret',
      firstLook: 'Seed look: burned hand wrapped in gauze', givenName: 'Ana' };
    const { created } = await routeEntityDrafts([MIRA], state, { autoCreateConnection: true, connectionSeed, sessionId: 'sess-1' });
    expect(created).toHaveLength(1);                     // control: the auto-create ran

    const hostId = state.connectionIds[0];
    const result = await finalizeEntity('connection', hostId, state);
    expect(result.ok).toBe(true);                        // control: the seed ran

    const actor  = global.game.actors.get(hostId);
    const record = actor.flags[MODULE].connection;
    const roster = formatSectorNpcProfile(record);
    expect({
      goal:         record.goal,
      firstLook:    record.firstLook,
      rolledInCard: /ROLLED/.test(actor.system.biography),
      rolledInRoster: /ROLLED/.test(roster),
    }).toEqual({
      goal:         NARRATED_GOAL,
      firstLook:    expect.not.arrayContaining([ROLLED.character_first_look]),
      rolledInCard: false,
      rolledInRoster: false,
    });
  });
});

describe('PROBE SEED-REROLLS-NARRATED-IDENTITY (b): draft Confirm with Auto-Seed on', () => {
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
    expect(record.seeded).toBe(true);                    // control: the Auto-Seed hook ran
    expect({
      goal:         record.goal,
      motivation:   record.motivation,
      firstLook:    record.firstLook,
      rolledInCard: /ROLLED/.test(actor.system.biography ?? ''),
    }).toEqual({
      goal:         NARRATED_GOAL,
      motivation:   expect.anything(),
      firstLook:    expect.not.arrayContaining([ROLLED.character_first_look]),
      rolledInCard: false,
    });
  });
});
