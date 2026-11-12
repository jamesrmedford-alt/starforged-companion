/**
 * STARFORGED COMPANION
 * tests/unit/makeConnectionNoDuplicateAfterMidMoveConfirm.test.js
 *
 * Issue #347 AB09 (MAKE-CONNECTION-DUPLICATE-NPC; the audit's
 * makeConnectionDuplicateAfterMidMoveConfirm probe): a Make a Connection hit
 * created a SECOND NPC card for an NPC the GM confirmed from a draft card
 * while the move was resolving.
 *
 * The move pipeline holds one campaignState object for the whole move
 * (src/index.js onMessage: `const campaignState = game.settings.get(...)`,
 * read before the lock claim's write replaces the cached value). The capture
 * that follows the narration dedups against THAT copy:
 *   - buildCombinedDetectionPrompt / detectionFromParsed →
 *     collectEstablishedEntityNames(campaignState)   (the ESTABLISHED list)
 *   - routeEntityDrafts → entityExistsAnyType(entity.name, campaignState)
 * and createConnection's adoptUnlistedEntityActor skips a card the STORE
 * lists. So a connection a draft Confirm created during the move — listed in
 * the store, not in the move's copy, its row no longer "pending" — is
 * invisible to every gate, and the auto-create makes a second card.
 *
 * Scenario (booted table, the real pipeline; interpreter / pacing / confirm /
 * dice mocked, Claude scripted — the scripted detector follows its prompt: it
 * returns Sable only when the prompt lists her neither as ESTABLISHED nor as
 * a PENDING DRAFT):
 *   1. An earlier narration left "Sable Ortiz" pending on the GM's draft card.
 *   2. Kira's player: "I ask Sable Ortiz to vouch for me…" — Make a
 *      Connection, strong hit; the narration is being written.
 *   3. The GM presses Confirm on Sable's draft row (she is about to matter).
 *   4. The narration lands; its capture runs.
 * It made two Sable Ortiz cards, each with its own bond on Kira. The dedup
 * gates now read the store's id lists as well as the move's copy
 * (entityExtractor withStoredEntityIds): one card.
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
const NARRATION = 'Sable Ortiz looks you over, then shakes your hand: she will vouch for you with the guild.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const SABLE = { type: 'connection', name: 'Sable Ortiz', description: 'A scarred salvage broker.',
  pronouns: 'she/her', role: 'salvage broker', goal: null, confidence: 'high' };
const LINE = 'I ask Sable Ortiz to vouch for me with the salvage guild.';
const isNarration = (call) => call.model === NARRATION_MODEL && /SIDECAR|NARRATOR ROLE/.test(call.system ?? '');
const isDetection = (call) => /ENTITY TYPES TO DETECT/.test(call.userText ?? '');

/** The line of names that follows a prompt heading. */
const listed = (prompt, heading) => {
  const lines = String(prompt ?? '').split('\n');
  const at = lines.findIndex(l => l.startsWith(heading));
  if (at < 0) return '';
  // PENDING DRAFTS' heading runs over two lines before its names.
  const skip = heading.startsWith('PENDING') ? 2 : 1;
  return lines[at + skip] ?? '';
};

/** A detector that follows its prompt: a name it was told is known is not returned as new. */
function detectionReply(call) {
  const told = `${listed(call.userText, 'ESTABLISHED ENTITIES')}\n${listed(call.userText, 'PENDING DRAFTS')}`;
  const entities = /Sable Ortiz/.test(told) ? [] : [SABLE];
  return JSON.stringify({
    entities, renames: [],
    worldJournal: { lore: [], threats: [], factionUpdates: [], locationUpdates: [], stateTransitions: [] },
  });
}

let table, claude;
const sables = () => table.actors.filter(a => a?.name === 'Sable Ortiz' && a.flags?.[MODULE_ID]?.entityType === 'connection');
const bondNames = (actorId) => (table.actors.get(actorId)?.items?.contents ?? [])
  .filter(i => i.type === 'progress' && i.system?.subtype === 'bond').map(i => i.name);
const draftCard = () => table.cards(f => f.draftEntityCard)[0];
const detectionCalls = () => table.claude.calls.filter(isDetection);

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
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
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  claude = scriptClaude(table, { fallback: (call) => {
    if (isDetection(call)) return detectionReply(call);
    if (isNarration(call)) return NARRATION;
    return '{}';
  } });

  // 1. An earlier narration (Kira's) left Sable Ortiz pending on the GM's draft card.
  const gm = table.client('gm-1');
  const { routeEntityDrafts } = await gm.import('../../src/entities/entityExtractor.js');
  await gm.run(() => routeEntityDrafts([SABLE], game.settings.get(MODULE_ID, 'campaignState'),
    { autoCreateConnection: false, actorId: 'pc-kira' }));
  await table.settle();
});

describe('a draft Confirm during a Make a Connection whose hit names the same NPC', () => {
  it('control: confirmed BEFORE the move, the hit makes no second card', async () => {
    expect(draftCard()?.flags?.[MODULE_ID]?.drafts?.[0]).toMatchObject({ name: 'Sable Ortiz', status: 'pending' });
    table.client('gm-1').click(draftCard()._id, '[data-action="sf-draft-confirm"]');
    await table.drain();
    expect(sables(), 'the Confirm made her card (setup)').toHaveLength(1);

    await table.client('pl-1').chat(LINE, { speaker: { actor: 'pc-kira' } });
    await table.drain();

    expect(table.world.messages().some(m => /Connection made/.test(m.content ?? ''))).toBe(true);
    expect(listed(detectionCalls().at(-1)?.userText, 'ESTABLISHED ENTITIES')).toMatch(/Sable Ortiz/);
    expect(sables()).toHaveLength(1);
    expect(bondNames('pc-kira')).toEqual(['Sable Ortiz']);
  }, 60_000);

  it('confirmed WHILE the move is narrated, the hit still makes no second Sable Ortiz card', async () => {
    expect(draftCard()?.flags?.[MODULE_ID]?.drafts?.[0]).toMatchObject({ name: 'Sable Ortiz', status: 'pending' });

    // 2. Kira's Make a Connection: rolled, its narration being written.
    const held = claude.hold(isNarration);
    await table.client('pl-1').chat(LINE, { speaker: { actor: 'pc-kira' } });
    await held.arrived;

    // 3. The GM confirms Sable's draft row meanwhile.
    table.client('gm-1').click(draftCard()._id, '[data-action="sf-draft-confirm"]');
    await table.settle();
    expect(sables(), 'the Confirm made her card (setup)').toHaveLength(1);
    expect(draftCard().flags[MODULE_ID].drafts[0].status, 'her row is confirmed (setup)').toBe('confirmed');
    expect(table.world.campaignState().connectionIds, 'the store lists her (setup)').toContain(sables()[0].id);

    // 4. The narration lands; the capture runs.
    held.release();
    await table.settle(); await table.drain();
    expect(table.world.messages().some(m => /Connection made/.test(m.content ?? '')), 'the move resolved (setup)').toBe(true);

    // What the detector was told: she was confirmed and listed before this call was built.
    const prompt = detectionCalls().at(-1)?.userText ?? '';
    expect(listed(prompt, 'ESTABLISHED ENTITIES'), 'the detection prompt lists the NPC the store already holds as established')
      .toMatch(/Sable Ortiz/);

    expect(sables().map(a => a.id), 'one NPC card for Sable Ortiz').toHaveLength(1);
    expect(bondNames('pc-kira'), "one bond on Kira's sheet").toEqual(['Sable Ortiz']);
  }, 60_000);

  it("the dedup gates read the store's lists: a record listed since the caller read its copy exists — the copy is left as it was", async () => {
    const gm = table.client('gm-1');
    const ex = await gm.import('../../src/entities/entityExtractor.js');
    const stale = JSON.parse(JSON.stringify(table.world.campaignState()));   // a move's copy, read before the Confirm
    table.client('gm-1').click(draftCard()._id, '[data-action="sf-draft-confirm"]');
    await table.drain();
    const sableId = sables()[0]?.id;
    expect(stale.connectionIds, 'the copy predates her (setup)').not.toContain(sableId);

    expect(gm.run(() => ex.entityExistsAnyType('Sable Ortiz', stale))).toBe(true);
    expect(gm.run(() => ex.entityExistsForName('Sable Ortiz', 'connection', stale))).toBe(true);
    const prompt = gm.run(() => ex.buildCombinedDetectionPrompt('Sable Ortiz nods.', 'make_a_connection', 'strong_hit', stale));
    expect(listed(prompt, 'ESTABLISHED ENTITIES')).toMatch(/Sable Ortiz/);
    expect(stale.connectionIds, 'the caller\'s copy is read, never written').not.toContain(sableId);
  }, 60_000);
});
