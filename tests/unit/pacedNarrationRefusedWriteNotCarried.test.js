/**
 * STARFORGED COMPANION
 * tests/unit/pacedNarrationRefusedWriteNotCarried.test.js
 *
 * Issue #342 Z02 PACED-NARRATES-ON-CACHED-STORE (the pipeline auditor's
 * PIPE-1 probe) — the most common narration of all, a line the pacing
 * classifier calls NARRATIVE, was narrated on the canonical GM's CACHED
 * campaignState (issue #329 X09 / #335 Y04 did not reach it).
 *
 * onMessage reads `preState = game.settings.get(MODULE_ID, "campaignState")`
 * (the cached setting, by reference — rules/foundry-api.md) and hands it to
 * routePacedInput, which handed it to narratePacedInput — which mints a scene
 * on it (ensureSceneStarted) and applies the narration's sidecar onto it
 * (applyNarratorSidecar → applySidecarSideData). A write the world refused
 * left the GM's client holding a scene / truths the world and every other
 * client lacked — and the next whole-object write (the next move's lock claim
 * writes the cached object itself) carried them into the world after all.
 * routePacedInput now narrates on a working copy.
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const KEY = `${MODULE_ID}.campaignState`;
const NARRATION_MODEL = 'claude-sonnet-5-5';
const isClassifier = (call) => /pacing pre-classifier/.test(call.system ?? '');
const NARRATIVE = JSON.stringify({
  decision: 'NARRATIVE', suggestedMove: null, sceneChallenge: null,
  category: 'social', confidence: 0.9, reasoning: 'Small talk — no stakes.',
});
const MOVE = JSON.stringify({
  decision: 'MOVE', suggestedMove: null, sceneChallenge: null,
  category: 'social', confidence: 0.9, reasoning: 'Pressing for an outcome.',
});
const SIDECAR = {
  newTruths:    [{ subject: 'the dockmaster', fact: 'Owes the crew a favour' }],
  stateChanges: [],
};
const NARRATION = 'The dockmaster grins and waves you through.\n```json\n' + JSON.stringify(SIDECAR) + '\n```';
const PLAIN_NARRATION = 'The hull groans and holds.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

let table;
let script;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

const base = (extra = {}) => ({
  ...CampaignStateSchema,
  sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1,
  lastSessionTimestamp: new Date().toISOString(),
  sceneTruths: [], sceneState: { bySubject: {}, sceneId: null }, sceneFrame: null, currentSceneId: null,
  ...extra,
});
const A_SCENE = { currentSceneId: 'sc-1', sceneState: { bySubject: {}, sceneId: 'sc-1' } };

async function seed(extra = {}) {
  await table.reset({ world: { settings: { chronicleAutoEntry: false, narratorSessionSummary: false, campaignState: base(extra) } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  script = scriptClaude(table, { fallback: (call) => (call.model === NARRATION_MODEL ? NARRATION : '{}') });
  silenceConsoleErrors();
}

beforeEach(async () => { await seed(A_SCENE); });

/** Refuse every campaignState write the GM's client makes, until `off()`. */
function refuseGmCampaignStateWrites() {
  return table.interceptWrites(w => (w.kind === 'setting' && w.key === KEY && w.client === 'gm-1')
    ? new Error('Setting [campaignState] could not be saved: the server refused the write')
    : undefined);
}

const gmCache = () => table.client('gm-1').getSetting('campaignState');
const world   = () => table.world.campaignState();
const facts   = (cs) => (cs?.sceneTruths ?? []).map(t => t.fact);

async function kiraChats() {
  script.when(isClassifier, NARRATIVE);
  await table.client('pl-1').chat('Kira asks the dockmaster how the berth fees are this cycle.', { speaker: { actor: 'pc-kira', alias: 'Kira' } });
  await table.settle(); await table.drain();
}

describe('Z02 — a NARRATIVE line is narrated on a working copy, never the GM\'s cached setting', () => {
  it("a refused ledger write leaves the GM's cache as the world has it (no truth the world lacks)", async () => {
    refuseGmCampaignStateWrites();
    await kiraChats();

    // Sanity: the paced narration ran on the GM and posted its card.
    expect(table.cards(f => f.pacedNarrative)).toHaveLength(1);
    expect(facts(world()), 'the world refused the truth').toEqual([]);

    // The GM's cached campaignState must agree with the world.
    expect(facts(gmCache())).toEqual([]);
  }, 30_000);

  it('…and the truth the world refused does not reach it on the GM\'s next whole-object write (the next move\'s lock claim)', async () => {
    const off = refuseGmCampaignStateWrites();
    await kiraChats();
    expect(facts(world()), 'refused').toEqual([]);
    off();

    // A later line rolls a move: the claim writes the cached object whole.
    // Its own narration states nothing new, so whatever reaches the world is
    // what the GM's client still held.
    script.when(isClassifier, MOVE);
    script.when(c => c.model === NARRATION_MODEL, PLAIN_NARRATION, { times: 5 });
    table.claude.calls.length = 0;
    await table.client('pl-1').chat('Kira leans on the dockmaster to waive the fee.', { speaker: { actor: 'pc-kira', alias: 'Kira' } });
    await table.settle(); await table.drain();
    expect(table.cards(f => f.moveResolution), 'the move rolled').toHaveLength(1);

    expect(facts(world())).not.toContain('Owes the crew a favour');
  }, 30_000);

  it("with no scene open, a refused scene start leaves no scene in the GM's cache", async () => {
    await seed();   // no scene
    script.when(c => c.model === NARRATION_MODEL, PLAIN_NARRATION);
    refuseGmCampaignStateWrites();
    await kiraChats();

    expect(table.cards(f => f.pacedNarrative)).toHaveLength(1);
    expect(world().currentSceneId ?? null, 'the world refused the scene').toBeNull();
    expect(gmCache().currentSceneId ?? null).toBeNull();
  }, 30_000);

  it("control: with the write accepted, the paced narration's truth lands in the world and the GM's cache agrees", async () => {
    await kiraChats();
    expect(facts(world())).toEqual(['Owes the crew a favour']);
    expect(facts(gmCache())).toEqual(['Owes the crew a favour']);
  }, 30_000);

  it('control: @scene (X09) narrates on a working copy — a refused write leaves the cache as the world', async () => {
    await seed();
    refuseGmCampaignStateWrites();
    await table.client('gm-1').chat('@scene What does the loading bay smell like?');
    await table.settle(); await table.drain();
    expect(world().currentSceneId ?? null).toBeNull();
    expect(gmCache().currentSceneId ?? null).toBeNull();
  }, 30_000);
});
