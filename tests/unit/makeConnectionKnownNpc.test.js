/**
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

describe('issue #345 AA19 — Make a Connection with an NPC who already has a card', () => {
  it("Ren's strong hit with Kira's connection Vance makes Vance Ren's connection too — a bond on Ren, no second card", async () => {
    await kirasDraft(VANCE, 'confirm');
    expect(cardsNamed('Vance Oduya'), 'Vance has a card (setup)').toHaveLength(1);
    expect(bondNames('pc-pat'), "Vance is Kira's connection (setup)").toEqual(['Vance Oduya']);

    narration = 'Vance Oduya studies Ren a long moment, then nods: he will keep a berth open for him.';
    await renMakesConnection('I ask Vance Oduya to keep a berth open for me.');

    expect(cardsNamed('Vance Oduya'), 'still one Vance').toHaveLength(1);
    expect({ ren: bondNames('pc-quinn'), kira: bondNames('pc-pat') })
      .toEqual({ ren: ['Vance Oduya'], kira: ['Vance Oduya'] });
    const vanceId = cardsNamed('Vance Oduya')[0].flags[MODULE_ID].connection._id;
    const rensBond = table.actors.get('pc-quinn').items.contents.find(i => i.system?.subtype === 'bond');
    expect(rensBond.flags?.[MODULE_ID]?.connectionId, "Ren's bond is keyed to Vance's record").toBe(vanceId);
  }, 60_000);

  it('control: a strong hit with an NPC nobody has a card for creates him, bonded to Ren', async () => {
    detected = [{ ...VANCE, name: 'Ilsa Marr', description: 'A harbour pilot.', pronouns: 'she/her', role: 'pilot' }];
    narration = 'Ilsa Marr studies Ren a long moment, then nods: she will keep a berth open for him.';
    await renMakesConnection('I ask Ilsa Marr to keep a berth open for me.');

    expect(cardsNamed('Ilsa Marr')).toHaveLength(1);
    expect(bondNames('pc-quinn')).toEqual(['Ilsa Marr']);
  }, 60_000);

  it('a narration naming two NPCs the table knows guesses neither — the GMs are told', async () => {
    await kirasDraft(VANCE, 'confirm');
    await kirasDraft(SABLE, 'confirm');
    detected = [VANCE, SABLE];
    narration = 'Vance Oduya glances at Sable Ortiz, then nods: a berth will be kept open for Ren.';
    await renMakesConnection('I ask Vance Oduya and Sable Ortiz to keep a berth open for me.');

    expect(bondNames('pc-quinn'), 'no bond guessed for Ren').toEqual([]);
    const [notice] = table.cards(f => f.knownNpcsConnectionNotice);
    expect(notice, 'the GMs are told').toBeTruthy();
    expect(String(notice.content)).toContain('<strong>Vance Oduya</strong>, <strong>Sable Ortiz</strong>');
    expect(notice.whisper).toEqual(['gm-1']);
  }, 60_000);
});

describe('issue #345 AA19 — Make a Connection with an NPC the GM had dismissed from a draft card', () => {
  beforeEach(() => {
    detected = [SABLE];
    narration = 'Sable Ortiz looks you over, then shakes your hand: she will vouch for you with the guild.';
  });

  it("a strong hit makes the connection — Sable Ortiz's card, bonded to Ren, her name off the dismissed list", async () => {
    const card = await kirasDraft({ ...SABLE, description: 'A broker haggling at the salvage yard.' }, 'dismiss');
    expect(table.world.campaignState().dismissedEntities, 'the Dismiss landed (setup)').toEqual(['Sable Ortiz']);

    await renMakesConnection('I ask Sable Ortiz to vouch for me with the salvage guild.');

    // The detection prompt told the model to leave her out (as W23's pending case).
    const detection = table.claude.calls.find(c => /ENTITY TYPES TO DETECT/.test(c.userText));
    expect(detection?.userText ?? '', 'the detection ran (setup)').toMatch(/DISMISSED NAMES[^\n]*\n[^\n]*Sable Ortiz/);

    expect({ created: cardsNamed('Sable Ortiz').length, ren: bondNames('pc-quinn'), kira: bondNames('pc-pat') })
      .toEqual({ created: 1, ren: ['Sable Ortiz'], kira: [] });
    expect(table.world.campaignState().dismissedEntities, 'no longer dismissed').toEqual([]);
    const row = table.world.messages().find(m => m._id === card._id).flags[MODULE_ID].drafts[0];
    expect(row.status, 'the dismissed row is confirmed').toBe('confirmed');
  }, 60_000);

  it('control: with no earlier dismissal the same hit creates Sable, bonded to Ren', async () => {
    await renMakesConnection('I ask Sable Ortiz to vouch for me with the salvage guild.');
    expect({ created: cardsNamed('Sable Ortiz').length, ren: bondNames('pc-quinn') }).toEqual({ created: 1, ren: ['Sable Ortiz'] });
  }, 60_000);
});
