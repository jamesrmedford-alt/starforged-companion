/**
 * STARFORGED COMPANION
 * tests/unit/connectionMadeOnlyByTheMove.test.js
 *
 * CONNECTION-MADE-BY-CONFIRMING-A-DRAFT (the long haul's fourth live run,
 * issue #383): the GM's rule confirmed Tamsin's draft row "as the player
 * character's connection", and a connection existed that no Make a
 * Connection had made — beats 2, 3, 19, 23 and 24 were lost to it, and
 * every later plea read as Develop. Overhaul 4, slice 3 (D4): a draft card
 * never makes a connection. Confirm records the person (an NPC card, no bond
 * Item on any sheet, no `connection.made`); the row offers 🤝 Make a
 * Connection, rolled as the row's PC with the person's card as its target;
 * its hit makes the bond — one bond Item, one `connection.made` recorded
 * `by: make_a_connection`.
 *
 * Harness: makeConnectionKnownNpcTarget.test.js's — the draft card's real
 * buttons on a booted table; the dice of the move mocked to a strong hit;
 * narration and detection answered by scripted replies.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

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
vi.mock('../../src/record/record.js', async (importOriginal) => {
  const original = await importOriginal();
  globalThis.__recorded = [];
  return { ...original, recordEvent: vi.fn((kind, payload) => { globalThis.__recorded.push({ kind, ...payload }); return original.recordEvent(kind, payload); }) };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-5-5';
const TAMSIN = { type: 'connection', name: 'Tamsin Vey', description: 'The quartermaster of the Hollow Spire.',
  pronouns: 'she/her', role: 'quartermaster', goal: null, confidence: 'high' };
const DETECTION = (entities) => JSON.stringify({
  entities, renames: [],
  worldJournal: { lore: [], threats: [], factionUpdates: [], locationUpdates: [], stateTransitions: [] },
});
const sidecar = '\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

let table;
let detected = [];

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  detected = [];
  globalThis.__recorded = [];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, autoSeedConnection: false, narratorSessionSummary: false,
    campaignState: {
      ...CampaignStateSchema,
      sessionActive: true, currentSessionId: 'sess-4', sessionNumber: 4, currentSceneId: 'sc-1', sceneTruths: [],
      connectionIds: [],
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-mira', name: 'Mira Kestrel', ownership: { 'pl-1': 3 } });
  scriptClaude(table, { fallback: (call) => {
    if (/ENTITY TYPES TO DETECT/.test(call.userText)) return DETECTION(detected);
    if (call.model === NARRATION_MODEL && /SIDECAR|NARRATOR ROLE/.test(call.system ?? '')) {
      return 'Tamsin Vey sets down the manifest and offers Mira a berth on the next supply run.' + sidecar;
    }
    return '{}';
  } });
});

const cardsNamed = (name) => table.actors.filter(a => a?.name === name && a.flags?.[MODULE_ID]?.entityType === 'connection');
const bondsOf = (actorId) => (table.actors.get(actorId)?.items?.contents ?? [])
  .filter(i => i.type === 'progress' && i.system?.subtype === 'bond');
const made = () => globalThis.__recorded.filter(e => e.kind === 'connection.made');

/** An earlier narration of Mira's surfaced Tamsin: her draft row, on the GM's card. */
async function tamsinsDraft() {
  const gm = table.client('gm-1');
  const { routeEntityDrafts } = await gm.import('../../src/entities/entityExtractor.js');
  await gm.run(() => routeEntityDrafts([{ ...TAMSIN }], game.settings.get(MODULE_ID, 'campaignState'),
    { autoCreateConnection: false, actorId: 'pc-mira' }));
  await table.settle();
  return table.cards(f => f.draftEntityCard).at(-1);
}

describe('D4 — a draft card records a person; only the move makes the connection', () => {
  it('the row offers Confirm and 🤝 Make a Connection — no "No one", no "whose connection?"', async () => {
    const card = await tamsinsDraft();
    expect(card.content).toMatch(/data-action="sf-draft-confirm"/);
    expect(card.content).toMatch(/data-action="sf-draft-make-connection"[^>]*data-actor-id="pc-mira"/);
    expect(card.content).not.toMatch(/No one|whose connection/i);
  }, 60_000);

  it("the GM's Confirm makes the NPC card — and no bond Item on any sheet, no connection.made", async () => {
    const card = await tamsinsDraft();
    table.client('gm-1').click(card._id, '[data-action="sf-draft-confirm"]');
    await table.drain();
    expect(cardsNamed('Tamsin Vey')).toHaveLength(1);
    expect(bondsOf('pc-mira')).toEqual([]);
    expect(made()).toEqual([]);
    // Recorded as a person.
    expect(globalThis.__recorded.filter(e => e.kind === 'entity.confirmed').map(e => e.d?.name)).toContain('Tamsin Vey');
    // The row still offers the move.
    expect(table.world.message(card._id).content).toMatch(/data-action="sf-draft-make-connection"/);
  }, 60_000);

  it('🤝 Make a Connection: rolled as the row\'s PC, the person its target; its strong hit makes one bond and records it as the move\'s', async () => {
    const card = await tamsinsDraft();
    detected = [];
    table.client('gm-1').click(card._id, '[data-action="sf-draft-make-connection"][data-actor-id="pc-mira"]');
    await table.drain();

    const [forced] = table.cards(f => f.forcedMoveId === 'make_a_connection');
    expect(forced, 'the move was posted').toBeTruthy();
    expect(forced.speaker?.actor).toBe('pc-mira');
    const host = cardsNamed('Tamsin Vey')[0];
    expect(host, 'the person was recorded first').toBeTruthy();
    expect(forced.flags[MODULE_ID]).toMatchObject({ forcedMoveTarget: 'Tamsin Vey', forcedMoveTargetId: host.id, bypassPacing: true });

    expect(bondsOf('pc-mira').map(b => b.name)).toEqual(['Tamsin Vey']);
    expect(made()).toHaveLength(1);
    expect(made()[0]).toMatchObject({ ref: { conn: host.id }, d: { name: 'Tamsin Vey', actorId: 'pc-mira', by: { move: 'make_a_connection' } } });
    // Pressed once: the row's button for Mira is gone.
    expect(table.world.message(card._id).content).not.toMatch(/data-action="sf-draft-make-connection"[^>]*data-actor-id="pc-mira"/);
  }, 60_000);
});
