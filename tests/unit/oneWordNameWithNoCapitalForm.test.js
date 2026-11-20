/**
 * STARFORGED COMPANION
 * tests/unit/oneWordNameWithNoCapitalForm.test.js
 *
 * Issue #364 ONE-WORD-NAME-NO-CAPITAL-FORM (left open by issue #364
 * CONNECTION-WHOLE-NAME-ANY-CASE).
 *
 * A one-word name in a typed line counts only as a name is written — with its
 * capital as typed, or in address position (issue #362 D6,
 * relevanceResolver.namesOneWordName). The rule asked every word for a capital
 * letter, so a name or name part with no capital to write — "7-Zero", the
 * "734" of Unit 734, a name in a script without case — could be named only in
 * address position:
 *
 *   - relevance never brought Unit 734's card in for "I ask 734 for the manifest";
 *   - the fellow-PC rule did not see a PC called 7-Zero named mid-line, nor
 *     the NPC Unit 734 in "Will, make 734 talk" (a Compel of her, narrated as
 *     a line to Will);
 *   - Make a Connection's part-name naming did not read "734" as Unit 734.
 *
 * The connection's whole-name test (entityExtractor namesWholeName) kept a
 * guard of its own for the one case it met. The shared rule now matches such
 * a word whole in any form, and the guard is gone: one rule.
 *
 * Harness (the last block): makeConnectionOneWordNameAsWritten.test.js's — the
 * multi-client table, a player's chat line through the move pipeline, scripted
 * Claude replies.
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
import {
  namesOneWordName, buildNameIndex, matchNamesInNarration, resolveRelevance,
} from '../../src/context/relevanceResolver.js';
import { lineIsToAFellowPlayerCharacter } from '../../src/narration/narrator.js';

const ent = (name, journalId) => ({ _id: `rec-${journalId}`, journalId, name, entityType: 'connection' });

describe('issue #364 ONE-WORD-NAME-NO-CAPITAL-FORM — namesOneWordName: a word with no capital to write is matched whole', () => {
  it('a name that starts with a digit is named mid-line, in any form', () => {
    expect(namesOneWordName('I ask 7-zero to keep a channel open.', '7-zero')).toBe(true);
    expect(namesOneWordName('I ask 7-Zero to keep a channel open.', '7-Zero')).toBe(true);
    expect(namesOneWordName('We raise 734 on the open band.', '734')).toBe(true);
  });

  it('a name in a script without letter case is named mid-line', () => {
    expect(namesOneWordName('I ask ミナ about the cargo.', 'ミナ')).toBe(true);
    expect(namesOneWordName('I ask דנה about the cargo.', 'דנה')).toBe(true);
  });

  it('a whole word only — never inside a longer one', () => {
    expect(namesOneWordName('Bay 1734 is sealed.', '734')).toBe(false);
    expect(namesOneWordName('The tag reads x7-zero.', '7-zero')).toBe(false);
    expect(namesOneWordName('I ask ミナミ about the cargo.', 'ミナ')).toBe(false);
  });

  it('control (issue #362 D6): a word with a capital to write is still asked for it', () => {
    expect(namesOneWordName('I check the scanner for an echo.', 'echo')).toBe(false);
    expect(namesOneWordName('I hail Echo on the open band.', 'echo')).toBe(true);
    expect(namesOneWordName('answer the hail, echo.', 'echo')).toBe(true);
    expect(namesOneWordName('Ask zoë about the cargo.', 'Zoë')).toBe(false);
  });
});

describe('issue #364 ONE-WORD-NAME-NO-CAPITAL-FORM — the relevance resolver', () => {
  const roster = [ent('Unit 734', 'npc-734'), ent('7-Zero', 'npc-7z'), ent('ミナ サトウ', 'npc-mina'), ent('Echo Vega', 'npc-echo')];
  const index = buildNameIndex(roster, []);
  const matched = (line) => matchNamesInNarration(line, index).matchedNames;

  it('a name part or a one-word name with no capital form is a hit mid-line', () => {
    expect(matched('I ask 734 for the manifest.')).toEqual(['Unit 734']);
    expect(matched('I ask 7-zero about the wreck.')).toEqual(['7-Zero']);
    expect(matched('I ask サトウ about the cargo.')).toEqual(['ミナ サトウ']);
  });

  it('control: the cased words beside them are still ordinary words in lowercase', () => {
    expect(matched('The unit is sealed, and there is an echo on the scanner.')).toEqual([]);
  });

  it('a hybrid move naming her by her number is an interaction with her', async () => {
    const res = await resolveRelevance('I ask 734 for the codes and dodge the debris.', 'face_danger', 'strong_hit', { dismissedEntities: [] },
      { collectEntities: async () => roster, classifyImplicit: async () => ({ impliedEntity: false, referenceType: 'none' }) });
    expect(res).toMatchObject({ resolvedClass: 'interaction', entityIds: ['npc-734'] });
  });
});

describe('issue #364 ONE-WORD-NAME-NO-CAPITAL-FORM — the fellow-PC rule', () => {
  const pcs = [{ name: 'Isaac Sutton' }, { name: 'Will Harrow' }, { name: '7-Zero' }];
  const toFellow = (line, npcNames = []) =>
    lineIsToAFellowPlayerCharacter('compel', line, 'Isaac Sutton', { pcActors: pcs, npcNames });

  it('a PC called 7-Zero is named mid-line: the line is theirs, not a roll', () => {
    expect(toFellow('I need 7-zero to cover the door while I work.')).toBe(true);
  });

  it('an NPC named by her number is named: "Will, make 734 talk" is a Compel of her, and is rolled', () => {
    expect(toFellow('Will, make 734 talk.', ['Unit 734'])).toBe(false);
    // Control: without her number in it, the line is Will's.
    expect(toFellow('Will, make the unit talk.', ['Unit 734'])).toBe(true);
  });
});

// ── Make a Connection's part-names, through the move pipeline ────────────────

const NARRATION_MODEL = 'claude-sonnet-5-5';
const npc = (name, description, role) => ({ type: 'connection', name, description, pronouns: 'she/her', role, goal: null, confidence: 'high' });
const DETECTION = (entities) => JSON.stringify({
  entities, renames: [],
  worldJournal: { lore: [], threats: [], factionUpdates: [], locationUpdates: [], stateTransitions: [] },
});
const sidecar = '\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
// The narration names no one: only the player's line can say who the hit is with.
const UNNAMED_NARRATION = 'The wrangler studies Ren a long moment, then nods: a channel will be kept open for him.';

describe('issue #364 ONE-WORD-NAME-NO-CAPITAL-FORM — Make a Connection: a part-name with no capital form', () => {
  let table;

  beforeAll(async () => {
    table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
  }, 30_000);
  afterAll(() => table?.teardown());

  beforeEach(async () => {
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
      if (call.model === NARRATION_MODEL && /SIDECAR|NARRATOR ROLE/.test(call.system ?? '')) return UNNAMED_NARRATION + sidecar;
      return '{}';
    } });
  });

  const cards = () => table.actors.filter(a => a.flags?.[MODULE_ID]?.entityType === 'connection');
  const bondNames = (actorId) => (table.actors.get(actorId)?.items?.contents ?? [])
    .filter(i => i.type === 'progress' && i.system?.subtype === 'bond').map(i => i.name);

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

  it('"I ask 734 to keep a channel open" names Unit 734 among the NPCs known: she is the connection', async () => {
    await kiraMeets(npc('Unit 734', 'A salvage drone-wrangler on the Spire.', 'wrangler'));
    await kiraMeets(npc('Mara Voss', 'A tug pilot working the Spire.', 'pilot'));
    await renMakesConnection('I ask 734 to keep a channel open for me.');

    expect(bondNames('pc-quinn')).toEqual(['Unit 734']);
  }, 60_000);

  it('control: the whole name with no capital form is still matched whole, now by the shared rule — "7-zero"', async () => {
    await kiraMeets(npc('7-Zero', 'A salvage drone-wrangler on the Spire.', 'wrangler'));
    await kiraMeets(npc('Mara Voss', 'A tug pilot working the Spire.', 'pilot'));
    await renMakesConnection('I ask 7-zero to keep a channel open for me.');

    expect(bondNames('pc-quinn')).toEqual(['7-Zero']);
  }, 60_000);
});
