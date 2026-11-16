/**
 * ENT-01 · MAKE-CONNECTION-PART-NAME-NOTHING-MADE
 *
 * Scenario: the table knows the NPC "Vuldar Archer" (Kira's connection, made
 * from a draft card). The narration and the players call him "Archer" — the
 * name issue #354 P2-16 was written for. Ren rolls Make a Connection with
 * him, a strong hit: "I ask Archer to keep a berth open for me."
 *
 * Correct: Archer is Vuldar Archer (nameMatch.personNameMatch — the rule the
 * detection filter and the draft gate now apply), so the hit makes him Ren's
 * connection: the bond Item on Ren's sheet, no second card (issue #345 AA19's
 * outcome for an NPC the table already knows).
 *
 * Today: the detection filter drops "Archer" as a known person (P2-16), and
 * connectNamedFigure's candidates must be named IN FULL in the line or the
 * narration (wholeWordPattern(rec.name)), so "Vuldar Archer" is no candidate.
 * The move card says "Connection made"; no bond, no card, no notice.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (narration) => ({
    moveId: 'make_a_connection', moveName: 'Make a Connection', statUsed: 'heart', adds: 0,
    rationale: 'a new contact', mischiefApplied: false,
    playerNarration: narration, inputMethod: 'chat',
  })),
}));
vi.mock('../../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../../src/moves/resolver.js', async (importOriginal) => {
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

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-5-5';
const ARCHER = { type: 'connection', name: 'Vuldar Archer', description: 'The dockmaster of the Hollow Spire.',
  pronouns: 'he/him', role: 'dockmaster', goal: null, confidence: 'high' };
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

const cards = () => table.actors.filter(a => a.flags?.[MODULE_ID]?.entityType === 'connection');
const bondNames = (actorId) => (table.actors.get(actorId)?.items?.contents ?? [])
  .filter(i => i.type === 'progress' && i.system?.subtype === 'bond').map(i => i.name);

/** An earlier narration of Kira's surfaced Vuldar Archer on a New Entities card (`confirm`: the GM made him Kira's connection). */
async function kiraMeetsArcher({ confirm = true } = {}) {
  const gm = table.client('gm-1');
  const { routeEntityDrafts } = await gm.import('../../src/entities/entityExtractor.js');
  await gm.run(() => routeEntityDrafts([{ ...ARCHER }], game.settings.get(MODULE_ID, 'campaignState'),
    { autoCreateConnection: false, actorId: 'pc-pat' }));
  await table.settle();
  const card = table.cards(f => f.draftEntityCard).at(-1);
  if (!confirm) return card;
  gm.click(card._id, '[data-action="sf-draft-confirm"]');
  await table.drain();
  expect(cards().map(a => a.name), 'Vuldar Archer has a card (setup)').toEqual(['Vuldar Archer']);
  expect(bondNames('pc-pat'), "he is Kira's connection (setup)").toEqual(['Vuldar Archer']);
  return card;
}

async function renMakesConnection(line) {
  await table.client('pl-2').chat(line, { speaker: { actor: 'pc-quinn' } });
  await table.drain();
  expect(table.world.messages().some(m => /Connection made/.test(m.content ?? '')), 'the move card says "Connection made" (setup)').toBe(true);
}

const SHORT_NARRATION = 'Archer studies Ren a long moment, then nods: he will keep a berth open for him.';
const SHORT_LINE = 'I ask Archer to keep a berth open for me.';

describe('ENT-01 — Make a Connection with a known NPC called by part of their name', () => {
  it("control: named in full, the known NPC becomes the roller's connection (issue #345 AA19)", async () => {
    await kiraMeetsArcher();
    narration = 'Vuldar Archer studies Ren a long moment, then nods: he will keep a berth open for him.';
    await renMakesConnection('I ask Vuldar Archer to keep a berth open for me.');

    expect(cards().map(a => a.name), 'still one card').toEqual(['Vuldar Archer']);
    expect(bondNames('pc-quinn')).toEqual(['Vuldar Archer']);
  }, 60_000);

  it('control: a pending row named in full is confirmed as the roller\'s (issue #325 W23)', async () => {
    await kiraMeetsArcher({ confirm: false });
    narration = 'Vuldar Archer studies Ren a long moment, then nods: he will keep a berth open for him.';
    await renMakesConnection('I ask Vuldar Archer to keep a berth open for me.');

    expect(cards().map(a => a.name)).toEqual(['Vuldar Archer']);
    expect(bondNames('pc-quinn')).toEqual(['Vuldar Archer']);
  }, 60_000);

  it('"Archer" is the known Vuldar Archer: the strong hit makes him Ren\'s connection (the detector left him out, as its prompt tells it to)', async () => {
    await kiraMeetsArcher();
    detected = [];
    narration = SHORT_NARRATION;
    await renMakesConnection(SHORT_LINE);

    expect(cards().map(a => a.name), 'no second card').toEqual(['Vuldar Archer']);
    expect(bondNames('pc-quinn'), "Ren's connections after \"Connection made\"").toEqual(['Vuldar Archer']);
  }, 60_000);

  it('the same when the detector returns "Archer" all the same (the P2-16 filter drops it as known)', async () => {
    await kiraMeetsArcher();
    detected = [{ ...ARCHER, name: 'Archer' }];
    narration = SHORT_NARRATION;
    await renMakesConnection(SHORT_LINE);

    expect(cards().map(a => a.name), 'no second card').toEqual(['Vuldar Archer']);
    expect(bondNames('pc-quinn'), "Ren's connections after \"Connection made\"").toEqual(['Vuldar Archer']);
  }, 60_000);

  it('"Archer" is the pending Vuldar Archer: his row is confirmed as Ren\'s', async () => {
    const card = await kiraMeetsArcher({ confirm: false });
    detected = [{ ...ARCHER, name: 'Archer' }];
    narration = SHORT_NARRATION;
    await renMakesConnection(SHORT_LINE);

    const row = table.world.messages().find(m => m._id === card._id).flags[MODULE_ID].drafts[0];
    expect({ row: row.status, cards: cards().map(a => a.name), ren: bondNames('pc-quinn') })
      .toEqual({ row: 'confirmed', cards: ['Vuldar Archer'], ren: ['Vuldar Archer'] });
  }, 60_000);

  it('and when none is made, the table is told — never "Connection made" with nothing made and no notice', async () => {
    await kiraMeetsArcher();
    detected = [];
    narration = SHORT_NARRATION;
    await renMakesConnection(SHORT_LINE);

    const made = bondNames('pc-quinn').length > 0;
    const told = table.world.messages().some(m => m.flags?.[MODULE_ID]?.knownNpcsConnectionNotice
      || /no connection (was )?made/i.test(String(m.content ?? '')));
    expect(made || told, 'a connection, or a notice that none was made').toBe(true);
  }, 60_000);
});
