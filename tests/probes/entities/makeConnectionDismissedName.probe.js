/**
 * PROBE — ENT: MAKE-CONNECTION-DISMISSED-NAME (twelfth audit, 2026-11-09)
 *
 * The sibling W23 (MAKE-CONNECTION-PENDING-DRAFT) did not cover. A Make a
 * Connection hit auto-creates the NPC through the detection pass. W23 found
 * that a name sitting in a PENDING draft row was dropped before the
 * auto-create (prompt, parse and routeEntityDrafts all leave it out) — "the
 * card said 'Connection made' and nothing was made" — and rescued it with
 * confirmNamedPendingConnection. A name the GM earlier DISMISSED from a draft
 * card is dropped the same way and nothing rescues it:
 *   - buildCombinedDetectionPrompt lists it under "DISMISSED NAMES (do not
 *     return these — the GM has already rejected them)" (entityExtractor.js:299);
 *   - detectionFromParsed filters it out of `entities` even if returned
 *     (entityExtractor.js:476);
 *   - routeEntityDrafts' connection slot therefore never sees it, and
 *     confirmNamedPendingConnection only reads pending rows (:2283).
 * So a player who makes a connection with an NPC the GM once waved off (a
 * bartender the narrator named in passing, dismissed as noise) rolls a hit,
 * the move card says "Connection made. Give them a role and rank."
 * (resolver.js:572) — and no NPC card, no bond Item, nothing to Develop Your
 * Relationship with is made, and nobody is told. The dismissal also keeps
 * every later detection of the name out, so the table cannot get the card
 * from a later narration either until a GM finds the Dismissed tab.
 *
 * Driven end to end: the dismissal through the draft card's real Dismiss
 * button; the Make a Connection through a player's chat line (interpreter,
 * pacing router, confirm dialog, dice mocked as rollerAttribution.test.js
 * does), the narration and the detection pass answered by scripted Claude
 * replies — the detection reply even names her, as a model ignoring the
 * prompt's list would.
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

const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';
const NARRATION = 'Sable Ortiz looks you over, then shakes your hand: she will vouch for you with the guild.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const SABLE = { type: 'connection', name: 'Sable Ortiz', description: 'A scarred salvage broker.',
  pronouns: 'she/her', role: 'salvage broker', goal: null, confidence: 'high' };
const DETECTION = JSON.stringify({
  entities: [SABLE],
  renames: [],
  worldJournal: { lore: [], threats: [], factionUpdates: [], locationUpdates: [], stateTransitions: [] },
});

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
    if (/ENTITY TYPES TO DETECT/.test(call.userText)) return DETECTION;
    if (call.model === NARRATION_MODEL && /SIDECAR|NARRATOR ROLE/.test(call.system ?? '')) return NARRATION;
    return '{}';
  } });
});

const sable = () => table.actors.find(a => a?.name === 'Sable Ortiz' && a.flags?.[MODULE_ID]?.entityType === 'connection');
const bondNames = (actorId) => (table.actors.get(actorId)?.items?.contents ?? [])
  .filter(i => i.type === 'progress' && i.system?.subtype === 'bond').map(i => i.name);

/** An earlier narration named Sable in passing; the GM pressed Dismiss on her draft row. */
async function dismissSableEarlier() {
  const gm = table.client('gm-1');
  const { routeEntityDrafts } = await gm.import('../../src/entities/entityExtractor.js');
  await gm.run(() => routeEntityDrafts(
    [{ ...SABLE, description: 'A broker haggling at the salvage yard.' }],
    game.settings.get(MODULE_ID, 'campaignState'),
    { autoCreateConnection: false, actorId: 'pc-pat' },
  ));
  await table.settle();
  const [card] = table.cards(f => f.draftEntityCard);
  gm.click(card._id, '[data-action="sf-draft-dismiss"]');
  await table.drain();
  expect(table.world.campaignState().dismissedEntities, 'the Dismiss landed (setup)').toEqual(['Sable Ortiz']);
}

/** Ren makes a connection with Sable: a player's chat line through the move pipeline. */
async function renMakesConnectionWithSable() {
  await table.client('pl-2').chat('I ask Sable Ortiz to vouch for me with the salvage guild.', { speaker: { actor: 'pc-quinn' } });
  await table.drain();
  expect(table.world.messages().some(m => /Connection made/.test(m.content ?? '')), 'the move card says "Connection made" (setup)').toBe(true);
}

describe('ENT probe — Make a Connection with an NPC the GM had dismissed from a draft card', () => {
  it('a strong hit makes the connection — Sable Ortiz\'s card, bonded to Ren', async () => {
    await dismissSableEarlier();
    await renMakesConnectionWithSable();

    // The detection prompt told the model to leave her out (as W23's pending case).
    const detection = table.claude.calls.find(c => /ENTITY TYPES TO DETECT/.test(c.userText));
    expect(detection?.userText ?? '', 'the detection ran (setup)').toMatch(/DISMISSED NAMES[^\n]*\n[^\n]*Sable Ortiz/);

    expect({ created: !!sable(), ren: bondNames('pc-quinn') }).toEqual({ created: true, ren: ['Sable Ortiz'] });
  }, 60_000);

  it('control: with no earlier dismissal the same hit creates Sable, bonded to Ren', async () => {
    await renMakesConnectionWithSable();
    expect({ created: !!sable(), ren: bondNames('pc-quinn') }).toEqual({ created: true, ren: ['Sable Ortiz'] });
  }, 60_000);
});
