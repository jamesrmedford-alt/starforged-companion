/**
 * STARFORGED COMPANION
 * tests/unit/makeConnectionLineOverFirstDetected.test.js
 *
 * Issue #362 AC19 MAKE-CONNECTION-FIRST-DETECTED (the audit's
 * ent/makeConnectionFirstDetectedNotTheLines probe; ENT-07).
 *
 * Ren rolls Make a Connection, a strong hit: "I seek out Ilsa Marr and ask her
 * to keep a berth open for me." Neither Ilsa Marr nor anyone else in the scene
 * has a card yet. The narration opens on a second new face — "Dace Varn
 * glances up from the bar as Ilsa Marr studies Ren …" — and the detector lists
 * the two new people in the order the prose names them.
 *
 * "Which one is the player's line's to say" (issue #347 AB10, decided for
 * pending rows and known NPCs). The free-flow slot took the FIRST connection
 * the detector listed (connectionSlots: `takes: () => true`) before the line
 * was read: Dace Varn got the card, the roll's seed and the bond on Ren's
 * sheet; Ilsa Marr was queued as a stranger. The same slot beat a KNOWN NPC
 * the line named: "I ask Vance Oduya …", narrated with a new deckhand in the
 * scene, made the deckhand Ren's connection. The hit now chooses first, the
 * newly detected people counted with the pending rows and the known NPCs
 * (chooseConnectionFigure): the one the line names; else the interpreter's
 * target; else the first person detected.
 *
 * Harness: makeConnectionKnownNpc.test.js's — the multi-client table, a
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

const NARRATION_MODEL = 'claude-sonnet-5-5';
const DETECTION = (entities) => JSON.stringify({
  entities, renames: [],
  worldJournal: { lore: [], threats: [], factionUpdates: [], locationUpdates: [], stateTransitions: [] },
});
const sidecar = '\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

let table;
let detected = [];
let narration = '';

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  detected = [];
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
    if (/ENTITY TYPES TO DETECT/.test(call.userText)) return DETECTION(detected);
    if (call.model === NARRATION_MODEL && /SIDECAR|NARRATOR ROLE/.test(call.system ?? '')) return narration + sidecar;
    return '{}';
  } });
});

const cards = () => table.actors.filter(a => a.flags?.[MODULE_ID]?.entityType === 'connection').map(a => a.name);
const bondNames = (actorId) => (table.actors.get(actorId)?.items?.contents ?? [])
  .filter(i => i.type === 'progress' && i.system?.subtype === 'bond').map(i => i.name);
const queuedNames = () => table.cards(f => f.draftEntityCard)
  .flatMap(c => (c.flags[MODULE_ID].drafts ?? []).filter(d => d.status === 'pending').map(d => d.name));

async function renMakesConnection(line) {
  await table.client('pl-2').chat(line, { speaker: { actor: 'pc-quinn' } });
  await table.drain();
  expect(table.world.messages().some(m => /Connection made/.test(m.content ?? '')), 'the move card says "Connection made" (setup)').toBe(true);
}

const ILSA = { type: 'connection', name: 'Ilsa Marr', description: 'A harbour pilot.', pronouns: 'she/her', role: 'pilot', goal: null, confidence: 'high' };
const DACE = { type: 'connection', name: 'Dace Varn', description: 'A raider drinking at the bar.', pronouns: 'he/him', role: 'raider', goal: null, confidence: 'high' };
const LINE = 'I seek out Ilsa Marr and ask her to keep a berth open for me.';

/** An earlier narration of Kira's surfaced Vance Oduya; the GM confirmed him as Kira's connection. */
async function kiraKnowsVance() {
  const gm = table.client('gm-1');
  const { routeEntityDrafts } = await gm.import('../../src/entities/entityExtractor.js');
  await gm.run(() => routeEntityDrafts([{ type: 'connection', name: 'Vance Oduya', description: 'The dockmaster of the Hollow Spire.',
    pronouns: 'he/him', role: 'dockmaster', goal: null, confidence: 'high' }], game.settings.get(MODULE_ID, 'campaignState'),
    { autoCreateConnection: false, actorId: 'pc-pat' }));
  await table.settle();
  table.client('gm-1').click(table.cards(f => f.draftEntityCard).at(-1)._id, '[data-action="sf-draft-confirm"]');
  await table.drain();
  expect(bondNames('pc-pat'), "Vance is Kira's connection (setup)").toEqual(['Vance Oduya']);
}

describe("issue #362 AC19 — a Make a Connection hit connects the NPC the player's line names, not the first one detected", () => {
  it('control: with one new NPC in the narration, she is made the roller\'s connection', async () => {
    detected = [ILSA];
    narration = 'Ilsa Marr studies Ren a long moment, then nods: she will keep a berth open for him.';
    await renMakesConnection(LINE);
    expect({ cards: cards(), ren: bondNames('pc-quinn') }).toEqual({ cards: ['Ilsa Marr'], ren: ['Ilsa Marr'] });
  }, 60_000);

  it('control: listed first, the NPC the line names is made the connection and the other is queued', async () => {
    detected = [ILSA, DACE];
    narration = 'Ilsa Marr studies Ren a long moment, then nods, while Dace Varn glances up from the bar.';
    await renMakesConnection(LINE);
    expect({ ren: bondNames('pc-quinn'), queued: queuedNames() }).toEqual({ ren: ['Ilsa Marr'], queued: ['Dace Varn'] });
  }, 60_000);

  it('listed second — the prose named a bystander first — she is still the one the move was with', async () => {
    detected = [DACE, ILSA];
    narration = 'Dace Varn glances up from the bar as Ilsa Marr studies Ren a long moment, then nods: she will keep a berth open for him.';
    await renMakesConnection(LINE);
    expect({ ren: bondNames('pc-quinn'), queued: queuedNames() }).toEqual({ ren: ['Ilsa Marr'], queued: ['Dace Varn'] });
  }, 60_000);

  it('control: a hit with a known NPC, nobody new in the narration, makes him the roller\'s connection (AA19)', async () => {
    await kiraKnowsVance();
    detected = [];
    narration = 'Vance Oduya studies Ren a long moment, then nods: he will keep a berth open for him.';
    await renMakesConnection('I ask Vance Oduya to keep a berth open for me.');
    expect(bondNames('pc-quinn')).toEqual(['Vance Oduya']);
  }, 60_000);

  it('a hit with a known NPC the line names stays his when the narration brings a new face along', async () => {
    await kiraKnowsVance();
    detected = [ILSA];
    narration = 'Vance Oduya studies Ren a long moment, then waves over his deckhand, Ilsa Marr, to log the berth he will keep open.';
    await renMakesConnection('I ask Vance Oduya to keep a berth open for me.');
    expect({ ren: bondNames('pc-quinn'), queued: queuedNames() }).toEqual({ ren: ['Vance Oduya'], queued: ['Ilsa Marr'] });
  }, 60_000);
  it('the line names both newcomers: none is guessed — both wait on the card, and the GMs are told', async () => {
    detected = [DACE, ILSA];
    narration = 'Dace Varn and Ilsa Marr trade a look across the bar; one of them will keep a berth open for Ren.';
    await renMakesConnection('I ask Dace Varn and Ilsa Marr to keep a berth open for me.');
    expect({ cards: cards(), ren: bondNames('pc-quinn'), queued: queuedNames().sort() })
      .toEqual({ cards: [], ren: [], queued: ['Dace Varn', 'Ilsa Marr'] });
    const notices = table.cards(f => f.knownNpcsConnectionNotice);
    expect(notices).toHaveLength(1);
    expect(String(notices[0].content)).toContain('<strong>Dace Varn</strong>, <strong>Ilsa Marr</strong>');
    expect(String(notices[0].content)).toMatch(/New Entities card/);
  }, 60_000);

  it('control: a line that names no one leaves it to the first person detected, as before', async () => {
    detected = [DACE, ILSA];
    narration = 'Dace Varn glances up from the bar as Ilsa Marr studies Ren a long moment.';
    await renMakesConnection('I look around the bar for someone who can keep a berth open for me.');
    expect({ ren: bondNames('pc-quinn'), queued: queuedNames() }).toEqual({ ren: ['Dace Varn'], queued: ['Ilsa Marr'] });
  }, 60_000);
});
