/**
 * STARFORGED COMPANION
 * tests/unit/makeConnectionOneWordNameAsWritten.test.js
 *
 * Issue #364 CONNECTION-WHOLE-NAME-ANY-CASE (left open by issue #364
 * PART-NAME-CAPITAL-RULE-TWINS).
 *
 * A one-word name in a typed line counts only as a name is written — with its
 * capital as typed, or in address position (issue #362 D6,
 * relevanceResolver.namesOneWordName): the module's own name oracles give
 * ordinary words (Echo, Will, Ash, Hope). Make a Connection's naming
 * (entityExtractor figuresNamedIn) asked that rule for a first or last name,
 * but its whole-name test still matched in any case — so for an NPC whose
 * whole name is one word, "an echo on the scanner" named her:
 *
 *   - alone, she was made the roller's connection by a line about a scanner;
 *   - beside the NPC the line did name, the hit named "several" and made no
 *     connection at all.
 *
 * The whole-name test now asks D6's rule for a name of one word. A name of
 * several words is still matched whole in any case.
 *
 * Harness: makeConnectionPartNameAddress.test.js's — the multi-client table, a
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
const npc = (name, description, role) => ({ type: 'connection', name, description, pronouns: 'she/her', role, goal: null, confidence: 'high' });
const ECHO = npc('Echo', 'A signals broker on the Hollow Spire.', 'broker');
const VOSS = npc('Mara Voss', 'A tug pilot working the Spire.', 'pilot');
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
const noConnectionNotices = () => table.cards(f => f.knownNpcsConnectionNotice);

/** An earlier narration of Kira's surfaced an NPC on a New Entities card, and the GM made them Kira's connection. */
async function kiraMeets(figure) {
  const gm = table.client('gm-1');
  const { routeEntityDrafts } = await gm.import('../../src/entities/entityExtractor.js');
  await gm.run(() => routeEntityDrafts([{ ...figure }], game.settings.get(MODULE_ID, 'campaignState'),
    { autoCreateConnection: false, actorId: 'pc-pat' }));
  await table.settle();
  gm.click(table.cards(f => f.draftEntityCard).at(-1)._id, '[data-action="sf-draft-confirm"]');
  await table.drain();
  expect(cards().map(a => a.name), `${figure.name} has a card (setup)`).toContain(figure.name);
}

async function renMakesConnection(line) {
  await table.client('pl-2').chat(line, { speaker: { actor: 'pc-quinn' } });
  await table.drain();
  expect(table.world.messages().some(m => /Connection made/.test(m.content ?? '')), 'the move card says "Connection made" (setup)').toBe(true);
}

// The narration names no one: only the player's line can say who the hit is with.
const UNNAMED_NARRATION = 'The broker studies Ren a long moment, then nods: a channel will be kept open for him.';

describe('issue #364 CONNECTION-WHOLE-NAME-ANY-CASE — a one-word whole name is named for Make a Connection only as a name is written', () => {
  it('"an echo on the scanner" does not make the NPC called Echo the roller\'s connection', async () => {
    const line = 'I ask the broker about an echo on the scanner, and whether she will keep a channel open for me.';
    expect(namesOneWordName(line, 'Echo'), 'relevance reads no name in the line (D6)').toBe(false);
    await kiraMeets(ECHO);
    narration = UNNAMED_NARRATION;
    await renMakesConnection(line);

    expect(bondNames('pc-quinn'), "Ren's connections").toEqual([]);
    expect(noConnectionNotices(), 'the GMs are told the hit made no connection').toHaveLength(1);
    expect(noConnectionNotices()[0].content).not.toContain('Echo');
  }, 60_000);

  it('the ordinary word beside the NPC the line names does not make it "several": Mara Voss is the connection', async () => {
    await kiraMeets(ECHO);
    await kiraMeets(VOSS);
    narration = UNNAMED_NARRATION;
    await renMakesConnection('I ask Mara Voss about the echo on the scanner, and to keep a channel open for me.');

    expect(bondNames('pc-quinn'), 'the one the line names').toEqual(['Mara Voss']);
    expect(noConnectionNotices(), 'no "several named" notice').toEqual([]);
  }, 60_000);

  it('control: written with its capital, Echo is named — "I ask Echo to keep a channel open for me."', async () => {
    await kiraMeets(ECHO);
    narration = UNNAMED_NARRATION;
    await renMakesConnection('I ask Echo to keep a channel open for me.');

    expect(cards().map(a => a.name), 'no second card').toEqual(['Echo']);
    expect(bondNames('pc-quinn')).toEqual(['Echo']);
    expect(noConnectionNotices()).toEqual([]);
  }, 60_000);

  it('control: in address position any case names her — "echo, keep a channel open for me."', async () => {
    await kiraMeets(ECHO);
    narration = UNNAMED_NARRATION;
    await renMakesConnection('echo, keep a channel open for me.');

    expect(bondNames('pc-quinn')).toEqual(['Echo']);
  }, 60_000);

  it('control: the narration\'s "Echo" names her when the line names no one', async () => {
    await kiraMeets(ECHO);
    narration = 'Echo studies Ren a long moment, then nods: a channel will be kept open for him.';
    await renMakesConnection('I ask the broker to keep a channel open for me.');

    expect(bondNames('pc-quinn')).toEqual(['Echo']);
  }, 60_000);

  it('control: a name of several words is still matched whole in any case — "i hail mara voss"', async () => {
    await kiraMeets(VOSS);
    narration = UNNAMED_NARRATION;
    await renMakesConnection('i hail mara voss and ask her to keep a channel open for me.');

    expect(bondNames('pc-quinn')).toEqual(['Mara Voss']);
  }, 60_000);

  it('control: a one-word name with no capital to write (it starts with a digit) is matched whole, as before', async () => {
    await kiraMeets(npc('7-Zero', 'A salvage drone-wrangler on the Spire.', 'wrangler'));
    narration = UNNAMED_NARRATION;
    await renMakesConnection('I ask 7-zero to keep a channel open for me.');

    expect(bondNames('pc-quinn')).toEqual(['7-Zero']);
  }, 60_000);
});
