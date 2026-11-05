/**
 * STARFORGED COMPANION
 * tests/unit/incitingPremiseRefusedSilent.test.js
 *
 * Issue #336 Y33 (INCITING-PREMISE-REFUSED-SILENT). The GM runs ✦ Envision
 * Inciting Incident; the opening is narrated and posted with its ⚔ Swear
 * button; the world refuses the write that files the premise
 * (`campaignState.incitingIncident`). runIncitingIncident found the store
 * without it and wrote one console line — no card, whisper or notification —
 * so the inciting card stood as if the campaign had its premise, and since
 * issue #331 X38 removed the cache's copy every later narration on every
 * client was built without the CAMPAIGN PREMISE block the prompt contract
 * calls "never dropped", with nobody knowing to run it again. The X13 / X10
 * standard ("the card says not saved"): a "Premise not saved" card is now
 * whispered to the author and the GMs, naming the remedy.
 *
 * (From the tenth audit's probe tests/probes/sweep/incitingPremiseRefusedSilent.probe.js.)
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const KEY = `${MODULE_ID}.campaignState`;
const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';
const NARRATION = [
  'The beacon at Paradox Station screams a distress code no one has used in a century.',
  '',
  'Suggested vow: Find who silenced the beacon (dangerous)',
  'Situation: Paradox Station has gone dark and its beacon is screaming.',
  '```json', JSON.stringify({ newTruths: [], stateChanges: [] }), '```',
].join('\n');
const TOLD = /premise|not saved|not canon|run it again|try again/i;

let table;
const world = () => table.world.campaignState();
const notices = () => table.cards(f => f.incitingPremiseNotSaved);
const told  = () => table.cards(f => !f.incitingIncidentCard).some(c => TOLD.test(c.content))
  || table.client('gm-1').notifications.some(n => TOLD.test(n.message));

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: { campaignState: {
    ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1,
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: null }, sceneFrame: null, currentSceneId: null,
  } } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-1', name: 'Kira', type: 'character', ownership: { 'pl-1': 3 } });
  scriptClaude(table, { fallback: (call) => (call.model === NARRATION_MODEL ? NARRATION : '{}') });
});

/** Refuse the one write that files the premise; every other write lands. */
function refusePremiseWrite() {
  table.interceptWrites(w => (w.kind === 'setting' && w.key === KEY && w.client === 'gm-1' && w.value?.incitingIncident)
    ? new Error('Setting [campaignState] could not be saved: the server refused the write')
    : undefined);
}

describe('issue #336 Y33 — a refused inciting premise is told, not only logged', () => {
  it("the GM's !incite: a refused premise write is told to the GM, with the remedy", async () => {
    silenceConsoleErrors();
    refusePremiseWrite();
    await table.client('gm-1').chat('!incite');
    await table.settle();

    // Sanity: the opening was narrated and posted; the premise never reached the world.
    expect(table.cards(f => f.incitingIncidentCard)).toHaveLength(1);
    expect(world().incitingIncident ?? null).toBeNull();
    expect(told()).toBe(true);
    const [notice] = notices();
    expect(notice.content).toMatch(/Premise not saved/);
    expect(notice.content).toMatch(/Envision Inciting Incident/);   // the remedy
    expect(notice.whisper).toEqual(['gm-1']);                       // the author is the GM
  }, 30_000);

  it("a player's !incite narrated on the keyed GM: the notice is whispered to the player and the GMs", async () => {
    silenceConsoleErrors();
    refusePremiseWrite();
    await table.client('pl-1').chat('!incite');
    await table.settle();

    expect(table.claude.calls.find(c => c.model === NARRATION_MODEL)?.client).toBe('gm-1');
    expect(world().incitingIncident ?? null).toBeNull();
    const [notice] = notices();
    expect(notice).toBeDefined();
    expect([...notice.whisper].sort()).toEqual(['gm-1', 'pl-1']);
    // It reaches the player's client, not only the GM's.
    expect(table.client('pl-1').messages.contents.some(m => m.flags?.[MODULE_ID]?.incitingPremiseNotSaved)).toBe(true);
  }, 30_000);

  it("control: with the write accepted the premise is canon and nothing says 'not saved'", async () => {
    await table.client('gm-1').chat('!incite');
    await table.settle();
    expect(world().incitingIncident?.prose).toMatch(/Paradox Station/);
    expect(told()).toBe(false);
    expect(notices()).toHaveLength(0);
  }, 30_000);
});
