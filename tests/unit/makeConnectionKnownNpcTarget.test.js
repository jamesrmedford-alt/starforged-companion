/**
 * KNOWN-NPC-CONNECTION-NO-TARGET (known-issues; AA19's residual).
 *
 * A Make a Connection hit with no new NPC makes the known NPC the move names
 * the roller's (issue #345 AA19): the one the player's line names, else the
 * one the narration names (issue #347 AB10). With several named and a line
 * that names none — "I win her over" — none was guessed and the GMs were
 * told, though the interpreter had read the move's target ("Sable Ortiz",
 * from the RECENT SCENE): no move target reached the capture. The move's
 * target now rides narrateResolution → runPostNarrationPasses → the
 * detection pass, and picks the one it names.
 *
 * Harness: makeConnectionKnownNpc.test.js's (below, its header).
 *
 * Issue #345 AA19 MAKE-CONNECTION-KNOWN-NPC-NOTHING-MADE.
 *
 * Make a Connection (vendor Make_a_Connection: "When you search out a new
 * relationship or give focus to an existing relationship … On a strong hit,
 * you create a connection") auto-creates its NPC from the detection pass's
 * NEW entities (routeEntityDrafts' connection slot) or a PENDING draft row
 * (confirmNamedPendingConnection — issue #325 W23). Two kinds of NPC were in
 * neither, so the move card said "Connection made" and nothing was made:
 *
 *   (a) an NPC who already has a card — Kira's connection Vance, whom Ren now
 *       makes his own: the detection prompt lists him as ESTABLISHED, the
 *       parse and the routing gate drop him. Ren got no bond Item. The
 *       module's own precedent for an existing NPC is a bond on the acting PC
 *       (a draft Confirm of an existing NPC — BOND-ITEM-AFTER-RELIST).
 *   (b) a name the GM once dismissed from a draft card: the prompt lists it
 *       under DISMISSED NAMES and the parse drops it. No card, no bond.
 *
 * Now the one known NPC the hit's narration names becomes the roller's
 * connection: (a) the bond Item on the roller, no second card; (b) the name
 * comes off the dismissed list and its draft row is confirmed as the
 * roller's. Several named: none is guessed, and the GMs are told.
 *
 * Driven end to end: the NPCs made / dismissed through the draft card's real
 * buttons; the Make a Connection through a player's chat line (interpreter,
 * pacing router, confirm dialog and dice mocked as rollerAttribution.test.js
 * does); narration and detection answered by scripted Claude replies (the
 * detection even names the known NPC, as a model that ignored its lists would).
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
    moveTarget: globalThis.__interpretedTarget ?? null,
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

const NARRATION_MODEL = 'claude-sonnet-5-5';
const VANCE = { type: 'connection', name: 'Vance Oduya', description: 'The dockmaster of the Hollow Spire.',
  pronouns: 'he/him', role: 'dockmaster', goal: null, confidence: 'high' };
const SABLE = { type: 'connection', name: 'Sable Ortiz', description: 'A scarred salvage broker.',
  pronouns: 'she/her', role: 'salvage broker', goal: null, confidence: 'high' };
const DETECTION = (entities) => JSON.stringify({
  entities, renames: [],
  worldJournal: { lore: [], threats: [], factionUpdates: [], locationUpdates: [], stateTransitions: [] },
});
const sidecar = '\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

let table;
let detected = [VANCE];
let narration = '';

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  detected = [VANCE];
  narration = '';
  globalThis.__interpretedTarget = null;
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
    if (/ENTITY TYPES TO DETECT/.test(call.userText)) return DETECTION(detected);
    if (call.model === NARRATION_MODEL && /SIDECAR|NARRATOR ROLE/.test(call.system ?? '')) return narration + sidecar;
    return '{}';
  } });
});

const cardsNamed = (name) => table.actors.filter(a => a?.name === name && a.flags?.[MODULE_ID]?.entityType === 'connection');
const bondNames = (actorId) => (table.actors.get(actorId)?.items?.contents ?? [])
  .filter(i => i.type === 'progress' && i.system?.subtype === 'bond').map(i => i.name);

/** An earlier narration of Kira's surfaced `entity`; the GM pressed `action` (confirm / dismiss) on its draft row. */
async function kirasDraft(entity, action) {
  const gm = table.client('gm-1');
  const { routeEntityDrafts } = await gm.import('../../src/entities/entityExtractor.js');
  await gm.run(() => routeEntityDrafts([{ ...entity }], game.settings.get(MODULE_ID, 'campaignState'),
    { autoCreateConnection: false, actorId: 'pc-pat' }));
  await table.settle();
  const card = table.cards(f => f.draftEntityCard).at(-1);
  gm.click(card._id, `[data-action="sf-draft-${action}"]`);
  await table.drain();
  return card;
}

/** Ren makes a connection: a player's chat line through the move pipeline. */
async function renMakesConnection(line) {
  await table.client('pl-2').chat(line, { speaker: { actor: 'pc-quinn' } });
  await table.drain();
  expect(table.world.messages().some(m => /Connection made/.test(m.content ?? '')), 'the move card says "Connection made" (setup)').toBe(true);
}

afterAll(() => { delete globalThis.__interpretedTarget; });

describe('KNOWN-NPC-CONNECTION-NO-TARGET — the interpreter\'s target picks among the known NPCs the narration names', () => {
  beforeEach(async () => {
    await kirasDraft(VANCE, 'confirm');
    await kirasDraft(SABLE, 'confirm');
    detected = [VANCE, SABLE];
    narration = 'Vance Oduya glances at Sable Ortiz; she smiles and promises Ren a berth on her next run.';
  });

  it('a line that names nobody: the NPC the interpreter read as the target becomes Ren\'s connection — no notice', async () => {
    globalThis.__interpretedTarget = 'Sable Ortiz';
    await renMakesConnection('I win her over with a share of the salvage.');

    expect(bondNames('pc-quinn')).toEqual(['Sable Ortiz']);          // was: [] and the GMs' notice
    expect(table.cards(f => f.knownNpcsConnectionNotice)).toEqual([]);
    expect(cardsNamed('Sable Ortiz'), 'no second card').toHaveLength(1);
  }, 60_000);

  it('a line that names both: the target says which', async () => {
    globalThis.__interpretedTarget = 'Sable';
    await renMakesConnection('I ask Vance Oduya and Sable Ortiz for a berth, and turn on the charm for Sable.');
    expect(bondNames('pc-quinn')).toEqual(['Sable Ortiz']);
  }, 60_000);

  it('control: no target — none is guessed, and the GMs are told', async () => {
    await renMakesConnection('I win her over with a share of the salvage.');
    expect(bondNames('pc-quinn')).toEqual([]);
    expect(table.cards(f => f.knownNpcsConnectionNotice)).toHaveLength(1);
  }, 60_000);

  it('control: a target naming neither — none is guessed', async () => {
    globalThis.__interpretedTarget = 'the harbourmaster';
    await renMakesConnection('I win her over with a share of the salvage.');
    expect(bondNames('pc-quinn')).toEqual([]);
    expect(table.cards(f => f.knownNpcsConnectionNotice)).toHaveLength(1);
  }, 60_000);
});
