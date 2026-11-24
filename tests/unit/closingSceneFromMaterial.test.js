/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/closingSceneFromMaterial.test.js
 *
 * Issue #381, slice 2 — the real End a Session on the multi-client table,
 * with the closing's dice scripted: whom it shows comes from the campaign's
 * own records (a connection's card, the sector's settlements), the prompt
 * carries each rolled result, the card keeps them in its `builtFrom` flag and
 * shows them to every client, and the next closing reads from that card whom
 * this one showed — never the same twice running. With nobody and nowhere to
 * show, there is no closing, and nothing is rolled for one.
 *
 * Asserted where each hop ends: the model call's user message, the posted
 * card's flags, its rendered line, the next call's message.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { installSceneDice } from '../helpers/scriptedDice.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const MODULE_ID = 'starforged-companion';
const NARRATION_MODEL = 'claude-sonnet-5-5';

const CLOSING = 'Tamsin tallies a debt twice and tapes the lid of a tin shut.\n```json\n' + JSON.stringify({
  newTruths: [], stateChanges: [],
  builtFrom: [{ n: 1, words: 'Tamsin' }, { n: 3, words: 'tallies a debt twice' }],
}) + '\n```';

const connectionActor = (id, record) => ({
  id, name: record.name, type: 'character', ownership: {},
  flags: { [MODULE_ID]: { entityType: 'connection', connection: { active: true, rank: 'dangerous', ...record } } },
});

let table;
let dice;

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
afterEach(() => dice?.restore());

async function setUp({ connections = [], sector = true, frame = null } = {}) {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false, autoRecapEnabled: false,
    combatTrackerEnabled: false,
    campaignState: {
      ...CampaignStateSchema, currentSessionId: 'cs-s1', sessionNumber: 2, sessionActive: true,
      sessionStartedId: 'cs-s1', sessionActiveStartedAt: new Date().toISOString(),
      lastSessionTimestamp: new Date().toISOString(), sessionEndedId: null,
      currentSceneId: frame ? 'cs-sc1' : null, sceneTruths: [], clocks: [],
      sceneFrame: frame, sceneState: { bySubject: {}, sceneId: frame ? 'cs-sc1' : null },
      connectionIds: connections.map(c => c.id),
      ...(sector ? {
        activeSectorId: 'sec-1',
        sectors: [{ id: 'sec-1', name: 'Cinder Expanse', settlements: [
          { id: 'st-spire', name: 'Hollow Spire', trouble: 'Water is rationed' },
          { id: 'st-bleak', name: 'Bleakhold Station', trouble: 'Raiders in the lanes' },
        ] }],
      } : { activeSectorId: null, sectors: [] }),
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-mira', name: 'Mira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  for (const c of connections) table.addActor(c);
  scriptClaude(table, { fallback: (call) => (call.model === NARRATION_MODEL ? CLOSING : '{}') });
  silenceConsoleErrors();
}

async function endSession(client = 'pl-1', fields = {}) {
  table.client(client).answerDialogs(d => d.submit({ 'input[name="questFocus"]': '', 'input[name="connectionFocus"]': '', ...fields }));
  await table.client(client).chat('!end-session');
  await table.settle(); await table.drain();
}

const closingCalls = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL && /^CLOSING VIGNETTE/.test(c.userText ?? ''));
const closingCards = () => table.world.messages().filter(m => m.flags?.[MODULE_ID]?.vignetteKind === 'npc_end');

const TAMSIN = connectionActor('npc-tamsin', { _id: 'c-tamsin', name: 'Tamsin Vey', bonded: true, pronouns: 'she/her',
  lastKnown: { location: { value: 'her ledger stall at Hollow Spire', sessionNum: 1 } } });
const DORAN  = connectionActor('npc-doran', { _id: 'c-doran', name: 'Doran Iske', bonded: false, rank: 'troublesome' });

describe('End a Session — the closing\'s dice reach the prompt and the card', () => {
  it('a player ends the session; the canonical GM rolls once among the campaign\'s people, and the prompt carries each result', async () => {
    await setUp({ connections: [TAMSIN, DORAN] });
    // Tamsin weighs 3, Doran 1: a d4, face 2 is Tamsin. Then her business and the thing in hand.
    dice = installSceneDice([[2, 4], 14, 20, 5, 6, 63, 18, 7, 8]);
    await endSession('pl-1');

    const [call] = closingCalls();
    expect(call, 'the closing was narrated').toBeTruthy();
    expect(call.client).toBe('gm-1');
    expect(call.userText).toMatch(/^Subject \(bonded_connection\): Tamsin Vey\. Context: Pronouns: she\/her$/m);
    expect(call.userText).toContain('1. Who it shows — the campaign\'s people (d4: 2): Tamsin Vey');
    expect(call.userText).toContain('2. Where Tamsin Vey is — LAST KNOWN on their card: her ledger stall at Hollow Spire');
    expect(call.userText).toContain('3. What Tamsin Vey is busy with — Action + Theme (14, 20): Bolster Debt');
    expect(call.userText).toContain('4. The thing in hand, or close by — Descriptor + Focus (63, 18): Makeshift Container');
    expect(dice.drawn).toHaveLength(9);
    // Per call: in the user message, never the system prompt.
    expect(String(call.system)).not.toMatch(/Bolster Debt|Makeshift Container/);
  }, 30_000);

  it('the card keeps the rolls and whom it showed by stable ref, and every client is shown them', async () => {
    await setUp({ connections: [TAMSIN, DORAN] });
    dice = installSceneDice([[2, 4], 14, 20, 5, 6, 63, 18, 7, 8]);
    await endSession('pl-1');

    const [card] = closingCards();
    expect(card, 'the closing card was posted').toBeTruthy();
    expect(card.content).toContain('<strong>Closing — Tamsin Vey</strong>');
    const f = card.flags[MODULE_ID];
    expect(f.vignetteNpc).toBe('Tamsin Vey');
    expect(f.builtFrom.map(s => [s.slot, s.result])).toEqual([
      ['subject', 'Tamsin Vey'], ['place', 'her ledger stall at Hollow Spire'], ['busy', 'Bolster Debt'], ['thing', 'Makeshift Container'],
    ]);
    expect(f.builtFrom[0]).toMatchObject({ ref: 'connection:c-tamsin', kind: 'bonded_connection', tables: [{ roll: 2, die: 4 }] });
    // The account: 1 and 3 are words of the prose; 2 and 4 have none.
    expect(f.builtFrom.map(s => s.used)).toEqual(['Tamsin', false, 'tallies a debt twice', false]);

    const root = table.client('pl-1').render(card._id ?? card.id);
    const line = root.querySelector('.sf-scene-rolls');
    expect(line, '"Rolled for this scene" is on the card').toBeTruthy();
    expect(line.textContent).toContain('Who it shows — the campaign\'s people (d4: 2): Tamsin Vey');
    expect(line.textContent).toMatch(/LAST KNOWN on their card: her ledger stall at Hollow Spire — not used/);
  }, 30_000);

  it('the next session\'s closing reads that card: never the same person twice running', async () => {
    await setUp({ connections: [TAMSIN, DORAN] });
    dice = installSceneDice([[2, 4], 14, 20, 5, 6, 63, 18, 7, 8]);
    await endSession('pl-1');
    dice.restore();

    // The next session: begun, played, ended. Tamsin was shown last, so only
    // Doran is left — no die for whom; his place is rolled (no LAST KNOWN).
    table.client('gm-1').answerDialogs(d => d.submit({ 'input[name="vignette"]': false, 'input[name="galleyVignette"]': false }));
    await table.client('gm-1').chat('!begin-session');
    await table.settle(); await table.drain();
    dice = installSceneDice([40, 12, 70, 30, 14, 20, 5, 6, 63, 18, 7, 8]);
    await endSession('gm-1');

    const calls = closingCalls();
    expect(calls).toHaveLength(2);
    expect(calls[1].userText).toMatch(/^Subject \(connection\): Doran Iske\./m);
    expect(calls[1].userText).toContain('1. Who it shows — the campaign\'s people: Doran Iske');
    expect(calls[1].userText).toContain('2. Where Doran Iske is — Settlement zone + area (40, 12): Galley or kitchen (Living)');
    expect(dice.drawn).toHaveLength(12);
  }, 60_000);

  it('the scene the session ended in: whom it had with the characters is not shown, and where they are is told', async () => {
    // End keeps the frame before it closes the scene: Tamsin was with Mira at the docks.
    await setUp({ connections: [TAMSIN, DORAN], frame: { location: 'Hollow Spire docks', present: ['Mira', 'Tamsin'], situation: 'Haggling over the manifest' } });
    // Doran is the one left — no die for whom; his place is rolled (no LAST KNOWN).
    dice = installSceneDice([40, 12, 70, 30, 14, 20, 5, 6, 63, 18, 7, 8]);
    await endSession('pl-1');
    const [call] = closingCalls();
    expect(call.userText).toMatch(/^Subject \(connection\): Doran Iske\./m);
    expect(call.userText).toContain('Where the characters are as the session ends: Hollow Spire docks.');
    expect(call.userText).not.toMatch(/Ship's sector when the session ended/);
    expect(dice.drawn).toHaveLength(12);
    // The scene itself was closed, as End a Session always closes it.
    expect(table.world.campaignState().sceneFrame ?? null).toBeNull();
  }, 30_000);

  it('the table\'s connection focus names whom it shows', async () => {
    await setUp({ connections: [TAMSIN, DORAN] });
    dice = installSceneDice([40, 12, 70, 30, 14, 20, 5, 6, 63, 18, 7, 8]);
    await endSession('pl-1', { 'input[name="connectionFocus"]': 'Doran Iske' });
    const [call] = closingCalls();
    expect(call.userText).toContain('1. Who it shows — the table\'s connection focus: Doran Iske');
  }, 30_000);

  it('with nobody on record, a settlement the table knows', async () => {
    await setUp({ connections: [] });
    // A d2 between the two settlements, face 1; then where in it, the business, the thing.
    dice = installSceneDice([[1, 2], 40, 12, 70, 30, 14, 20, 5, 6, 63, 18, 7, 8]);
    await endSession('pl-1');
    const [call] = closingCalls();
    expect(call.userText).toMatch(/^Subject \(settlement\): Hollow Spire\. Context: Trouble: Water is rationed$/m);
    expect(call.userText).toContain('1. Where it shows — the active sector\'s settlements (d2: 1): Hollow Spire');
    expect(closingCards()[0].content).toContain('<strong>Closing — Hollow Spire</strong>');
  }, 30_000);

  it('nobody and nowhere: no closing, no card, nothing rolled — the scene is still closed', async () => {
    await setUp({ connections: [], sector: false });
    dice = installSceneDice([1, 2, 3, 4]);
    await endSession('pl-1');
    expect(closingCalls()).toHaveLength(0);
    expect(closingCards()).toHaveLength(0);
    expect(dice.drawn).toHaveLength(0);
    expect(table.world.campaignState().sessionEndedId).toBe('cs-s1');
  }, 30_000);

  it('no narration, no dice: with narration switched off nothing is rolled', async () => {
    await setUp({ connections: [TAMSIN, DORAN] });
    await table.client('gm-1').setSetting('narrationEnabled', false);
    dice = installSceneDice([[2, 4], 14, 20, 5, 6, 63, 18, 7, 8]);
    await endSession('pl-1');
    expect(closingCalls()).toHaveLength(0);
    expect(dice.drawn).toHaveLength(0);
  }, 30_000);
});
