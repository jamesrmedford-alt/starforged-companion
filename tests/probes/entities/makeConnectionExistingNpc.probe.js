/**
 * PROBE — ENT: MAKE-CONNECTION-EXISTING-NPC (twelfth audit, 2026-11-09)
 *
 * Make a Connection (vendor json-packs/starforged-moves/Make_a_Connection:
 * "When you search out a new relationship or give focus to an existing
 * relationship … On a strong hit, you create a connection") on an NPC the
 * world already has a card for — here Kira's connection Vance, whom Ren now
 * makes his own contact. The module's Make a Connection auto-create takes its
 * NPC only from the detection pass's NEW entities (routeEntityDrafts'
 * connection slot, entityExtractor.js:580) or a PENDING draft row
 * (confirmNamedPendingConnection, :2283 — W23). An established NPC is in
 * neither: the prompt lists him under "ESTABLISHED ENTITIES (do not return
 * these as new entities)" (:281), detectionFromParsed drops him (:477) and
 * routeEntityDrafts' entityExistsAnyType gate drops him again (:571). So the
 * move card says "Connection made" (resolver.js:572) and Ren gets no bond Item
 * — no connection on his sheet, none in his CHARACTER STATE, nothing his
 * Develop Your Relationship can find as his. The module's own precedent for
 * an existing NPC is a bond on the acting PC: a draft Confirm whose NPC
 * already exists puts the bond Item on the card's PC
 * (registerConnectionOnActiveCharacter, idempotent per PC and connection —
 * known-issues BOND-ITEM-AFTER-RELIST).
 *
 * Driven end to end: Vance made through the draft card's real Confirm for
 * Kira's narration; Ren's Make a Connection through his chat line
 * (interpreter, pacing router, confirm dialog and dice mocked as
 * rollerAttribution.test.js does); narration and detection answered by
 * scripted Claude replies (the detection even names Vance, as a model that
 * ignored its ESTABLISHED list would).
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
    rationale: 'a new contact', mischiefApplied: false, moveTarget: 'Vance Oduya',
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
const VANCE = { type: 'connection', name: 'Vance Oduya', description: 'The dockmaster of the Hollow Spire.',
  pronouns: 'he/him', role: 'dockmaster', goal: null, confidence: 'high' };
const NARRATION = (name) => `${name} studies Ren a long moment, then nods: he will keep a berth open for him.\n\`\`\`json\n{"newTruths":[],"stateChanges":[]}\n\`\`\``;
const DETECTION = (entity) => JSON.stringify({
  entities: [entity], renames: [],
  worldJournal: { lore: [], threats: [], factionUpdates: [], locationUpdates: [], stateTransitions: [] },
});

let table;
let detected = VANCE;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  detected = VANCE;
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
    if (call.model === NARRATION_MODEL && /SIDECAR|NARRATOR ROLE/.test(call.system ?? '')) return NARRATION(detected.name);
    return '{}';
  } });
});

const cardsNamed = (name) => table.actors.filter(a => a?.name === name && a.flags?.[MODULE_ID]?.entityType === 'connection');
const bondNames = (actorId) => (table.actors.get(actorId)?.items?.contents ?? [])
  .filter(i => i.type === 'progress' && i.system?.subtype === 'bond').map(i => i.name);

/** Kira's narration introduced Vance; the GM confirmed him from the draft card (bond on Kira). */
async function vanceIsKirasConnection() {
  const gm = table.client('gm-1');
  const { routeEntityDrafts } = await gm.import('../../src/entities/entityExtractor.js');
  await gm.run(() => routeEntityDrafts([{ ...VANCE }], game.settings.get(MODULE_ID, 'campaignState'),
    { autoCreateConnection: false, actorId: 'pc-pat' }));
  await table.settle();
  const [card] = table.cards(f => f.draftEntityCard);
  gm.click(card._id, '[data-action="sf-draft-confirm"]');
  await table.drain();
  expect(cardsNamed('Vance Oduya'), 'Vance has a card (setup)').toHaveLength(1);
  expect(bondNames('pc-pat'), "Vance is Kira's connection (setup)").toEqual(['Vance Oduya']);
}

/** Ren makes a connection with the named NPC: a player's chat line through the move pipeline. */
async function renMakesConnection(name) {
  await table.client('pl-2').chat(`I ask ${name} to keep a berth open for me.`, { speaker: { actor: 'pc-quinn' } });
  await table.drain();
  expect(table.world.messages().some(m => /Connection made/.test(m.content ?? '')), 'the move card says "Connection made" (setup)').toBe(true);
}

describe('ENT probe — Make a Connection with an NPC who already has a card', () => {
  it("Ren's strong hit with Kira's connection Vance makes Vance Ren's connection too — a bond on Ren, no second card", async () => {
    await vanceIsKirasConnection();
    await renMakesConnection('Vance Oduya');

    expect(cardsNamed('Vance Oduya'), 'still one Vance').toHaveLength(1);
    expect({ ren: bondNames('pc-quinn'), kira: bondNames('pc-pat') })
      .toEqual({ ren: ['Vance Oduya'], kira: ['Vance Oduya'] });
  }, 60_000);

  it('control: a strong hit with an NPC nobody has a card for creates him, bonded to Ren', async () => {
    detected = { ...VANCE, name: 'Ilsa Marr', description: 'A harbour pilot.', pronouns: 'she/her', role: 'pilot' };
    await renMakesConnection('Ilsa Marr');

    expect(cardsNamed('Ilsa Marr')).toHaveLength(1);
    expect(bondNames('pc-quinn')).toEqual(['Ilsa Marr']);
  }, 60_000);
});
