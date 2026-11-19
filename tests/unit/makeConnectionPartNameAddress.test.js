/**
 * STARFORGED COMPANION
 * tests/unit/makeConnectionPartNameAddress.test.js
 *
 * Issue #364 PART-NAME-CAPITAL-RULE-TWINS (left open by issue #362 D6 × AC18).
 *
 * Two rules read a one-word name in a typed line. Relevance, the fellow-PC
 * rule and the offer filter ask relevanceResolver.namesOneWordName (D6): a
 * whole word with its capital as typed, or in address position — its line's
 * first word, or a vocative set off by a comma. Make a Connection's
 * part-name naming (figuresNamedIn, AC18) kept a capital check of its own,
 * with no address position. So Ren's "archer, keep a berth open for me."
 * brought Vuldar Archer into the narrator's context, and the strong hit made
 * no connection: the line named nobody for it.
 *
 * figuresNamedIn now asks namesOneWordName too. A lowercase word mid-sentence
 * still names no one ("an archer watches from the gantry").
 *
 * Harness: makeConnectionPartName.test.js's — the multi-client table, a
 * player's chat line through the move pipeline, scripted Claude replies.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (narration) => ({
    moveId: 'make_a_connection', moveName: 'Make a Connection', statUsed: 'heart', adds: 0,
    rationale: 'a new contact', mischiefApplied: false,
    playerNarration: narration, inputMethod: 'chat',
  })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../src/moves/resolver.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    resolveMove: vi.fn((...args) => {
      // challenge dice 3 and 4, action die 6: a strong hit.
      const dice = vi.spyOn(Math, 'random').mockReturnValueOnce(0.25).mockReturnValueOnce(0.35).mockReturnValueOnce(0.9);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { namesOneWordName } from '../../src/context/relevanceResolver.js';

const NARRATION_MODEL = 'claude-sonnet-5-5';
const ARCHER = { type: 'connection', name: 'Vuldar Archer', description: 'The dockmaster of the Hollow Spire.',
  pronouns: 'he/him', role: 'dockmaster', goal: null, confidence: 'high' };
const VOSS = { type: 'connection', name: 'Mara Voss', description: 'A tug pilot working the Spire.',
  pronouns: 'she/her', role: 'pilot', goal: null, confidence: 'high' };
const DETECTION = (entities) => JSON.stringify({
  entities, renames: [],
  worldJournal: { lore: [], threats: [], factionUpdates: [], locationUpdates: [], stateTransitions: [] },
});
const sidecar = '\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

let table;
let narration = '';

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  narration = '';
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, autoSeedConnection: false, narratorSessionSummary: false,
    campaignState: {
      ...CampaignStateSchema,
      sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 3, currentSceneId: 'sc-1', sceneTruths: [],
      connectionIds: [],
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-pat',   name: 'Kira', ownership: { 'pl-1': 3 } });
  table.addActor({ id: 'pc-quinn', name: 'Ren',  ownership: { 'pl-2': 3 } });
  scriptClaude(table, { fallback: (call) => {
    if (/ENTITY TYPES TO DETECT/.test(call.userText)) return DETECTION([]);
    if (call.model === NARRATION_MODEL && /SIDECAR|NARRATOR ROLE/.test(call.system ?? '')) return narration + sidecar;
    return '{}';
  } });
});

const cards = () => table.actors.filter(a => a.flags?.[MODULE_ID]?.entityType === 'connection');
const bondNames = (actorId) => (table.actors.get(actorId)?.items?.contents ?? [])
  .filter(i => i.type === 'progress' && i.system?.subtype === 'bond').map(i => i.name);

/** An earlier narration of Kira's surfaced an NPC on a New Entities card, and the GM made them Kira's connection. */
async function kiraMeets(npc) {
  const gm = table.client('gm-1');
  const { routeEntityDrafts } = await gm.import('../../src/entities/entityExtractor.js');
  await gm.run(() => routeEntityDrafts([{ ...npc }], game.settings.get(MODULE_ID, 'campaignState'),
    { autoCreateConnection: false, actorId: 'pc-pat' }));
  await table.settle();
  gm.click(table.cards(f => f.draftEntityCard).at(-1)._id, '[data-action="sf-draft-confirm"]');
  await table.drain();
  expect(cards().map(a => a.name), `${npc.name} has a card (setup)`).toContain(npc.name);
}

async function renMakesConnection(line) {
  await table.client('pl-2').chat(line, { speaker: { actor: 'pc-quinn' } });
  await table.drain();
  expect(table.world.messages().some(m => /Connection made/.test(m.content ?? '')), 'the move card says "Connection made" (setup)').toBe(true);
}

// The narration names no one: only the player's line can say who the hit is with.
const UNNAMED_NARRATION = 'The dockmaster studies Ren a long moment, then nods: a berth will be kept open for him.';

describe('issue #364 PART-NAME-CAPITAL-RULE-TWINS — a part name in address position names the NPC for Make a Connection, as it does for relevance', () => {
  it('"archer, keep a berth open for me." makes Vuldar Archer the roller\'s connection (the line\'s first word)', async () => {
    const line = 'archer, keep a berth open for me.';
    expect(namesOneWordName(line, 'archer'), 'relevance reads the line as naming him (D6)').toBe(true);
    await kiraMeets(ARCHER);
    narration = UNNAMED_NARRATION;
    await renMakesConnection(line);

    expect(cards().map(a => a.name), 'no second card').toEqual(['Vuldar Archer']);
    expect(bondNames('pc-quinn'), "Ren's connections after \"Connection made\"").toEqual(['Vuldar Archer']);
    expect(table.cards(f => f.knownNpcsConnectionNotice), 'nothing to tell the GMs').toEqual([]);
  }, 60_000);

  it('a vocative set off by a comma names him too: "keep a berth open for me, archer."', async () => {
    await kiraMeets(ARCHER);
    narration = UNNAMED_NARRATION;
    await renMakesConnection('keep a berth open for me, archer.');

    expect(bondNames('pc-quinn')).toEqual(['Vuldar Archer']);
  }, 60_000);

  it('the line singles him out among the NPCs the narration names', async () => {
    await kiraMeets(ARCHER);
    await kiraMeets(VOSS);
    narration = 'Vuldar Archer and Mara Voss trade a look across the dock office; one of them nods at Ren.';
    await renMakesConnection('archer, keep a berth open for me.');

    expect(bondNames('pc-quinn'), 'the one the line addresses').toEqual(['Vuldar Archer']);
    expect(table.cards(f => f.knownNpcsConnectionNotice), 'no "several named" notice').toEqual([]);
  }, 60_000);

  it('control: the same word in lowercase mid-sentence names no one — no connection, and the GMs are told', async () => {
    const line = 'I ask whether an archer could keep a berth open for me.';
    expect(namesOneWordName(line, 'archer')).toBe(false);
    await kiraMeets(ARCHER);
    narration = UNNAMED_NARRATION;
    await renMakesConnection(line);

    expect(bondNames('pc-quinn')).toEqual([]);
    expect(table.cards(f => f.knownNpcsConnectionNotice), 'the "no connection made" notice').toHaveLength(1);
  }, 60_000);

  it('control: written with its capital mid-sentence, as before (issue #362 AC18)', async () => {
    await kiraMeets(ARCHER);
    narration = UNNAMED_NARRATION;
    await renMakesConnection('I ask Archer to keep a berth open for me.');

    expect(bondNames('pc-quinn')).toEqual(['Vuldar Archer']);
  }, 60_000);
});
