/**
 * STARFORGED COMPANION
 * tests/unit/pacedNarratesOnWorkingCopy.test.js
 *
 * Issue #342 Z02 PACED-NARRATES-ON-CACHED-STORE (the narration auditor's
 * NARR-1 probe) — the paced narration (the pacing classifier's NARRATIVE /
 * NARRATIVE_WITH_MOVE decision — every chat line that is not a move) narrated
 * on the cached campaignState, by reference.
 *
 * src/index.js onMessage reads `preState = game.settings.get(…)` (the cached
 * value — rules/foundry-api.md) and hands it to routePacedInput, which handed
 * it on to narratePacedInput — which mints a scene on the object it is given
 * (ensureSceneStarted → startScene), advances the spotlight on it
 * (maybeAdvanceSpotlight) and applies the sidecar's truths, state and frame on
 * it (applyNarratorSidecar → applySidecar / applySceneFrame), each before a
 * write the world can refuse. A refused write left the GM's client alone
 * holding the scene / facts the world lacks. routePacedInput now hands the
 * narrator a working copy (issue #329 X09 / #335 Y04's shape — "A narration
 * works on a copy at every entry handler").
 *
 * A booted two-client table, keyed GM, a player's narrative line classified
 * NARRATIVE, the GM's campaignState writes refused.
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const KEY = `${MODULE_ID}.campaignState`;
const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';

const SIDECAR = {
  newTruths:    [{ subject: 'the dockmaster', fact: 'Owes the crew a favour' }],
  stateChanges: [{ subject: 'the dockmaster', attribute: 'location', value: 'the loading bay' }],
  sceneFrame:   { location: 'the loading bay', present: ['the dockmaster'], situation: 'Haggling over berth fees' },
};
const NARRATION = 'The dockmaster scratches his chin and lets you pass.\n```json\n' + JSON.stringify(SIDECAR) + '\n```';
const NARRATIVE = JSON.stringify({
  decision: 'NARRATIVE', suggestedMove: null, sceneChallenge: null,
  category: 'social', confidence: 0.9, reasoning: 'conversation, no move',
});

let table;

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

const base = (extra = {}) => ({
  ...CampaignStateSchema,
  sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1,
  sceneTruths: [], sceneState: { bySubject: {}, sceneId: null }, sceneFrame: null, currentSceneId: null,
  ...extra,
});

async function seed(extra = {}) {
  await table.reset({ world: { settings: { campaignState: base(extra) } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  scriptClaude(table, {
    fallback: (call) => {
      if (call.model === NARRATION_MODEL) return NARRATION;
      if (/pacing pre-classifier/.test(call.system)) return NARRATIVE;
      return '{}';
    },
  });
}

beforeEach(async () => { await seed(); });

/** Refuse every campaignState write the GM's client makes (a server error, a dropped socket). */
function refuseGmCampaignStateWrites() {
  table.interceptWrites(w => (w.kind === 'setting' && w.key === KEY && w.client === 'gm-1')
    ? new Error('Setting [campaignState] could not be saved: the server refused the write')
    : undefined);
}

const gmCache = () => table.client('gm-1').getSetting('campaignState');
const world   = () => table.world.campaignState();
const A_SCENE = { currentSceneId: 'sc-1', sceneState: { bySubject: {}, sceneId: 'sc-1' } };
const pacedCards = () => table.cards(f => f.narratorCard && f.pacedNarrative === true);

async function playerSaysNarrativeLine() {
  await table.client('pl-1').chat("Kira leans on the rail and asks the dockmaster how his day's been.",
    { speaker: { actor: 'pc-kira', alias: 'Kira' } });
  await table.settle();
}

describe('Z02 — the paced narration applies its facts on a working copy, never the cached setting', () => {
  it("a scene open, the GM's ledger write refused: the GM's cache keeps no truth the world lacks", async () => {
    silenceConsoleErrors();
    await seed(A_SCENE);
    refuseGmCampaignStateWrites();
    await playerSaysNarrativeLine();

    const narration = table.claude.calls.find(c => c.model === NARRATION_MODEL);
    expect(narration?.client).toBe('gm-1');                         // narrated on the keyed canonical GM
    expect(pacedCards()).toHaveLength(1);                           // the paced card posted
    expect(world().sceneTruths ?? []).toEqual([]);                  // the world refused the facts
    // The GM's cache is as the world: it held the narration's truth, state and
    // frame when narratePacedInput was handed the cached value itself.
    expect((gmCache().sceneTruths ?? []).map(t => t.fact)).toEqual([]);
    expect(gmCache().sceneState?.bySubject ?? {}).toEqual({});
    expect(gmCache().sceneFrame ?? null).toBeNull();
  }, 30_000);

  it("no scene open, the GM's writes refused: the GM's cache holds no scene the world lacks", async () => {
    silenceConsoleErrors();
    refuseGmCampaignStateWrites();
    await playerSaysNarrativeLine();

    expect(pacedCards()).toHaveLength(1);
    expect(world().currentSceneId ?? null).toBeNull();
    expect(gmCache().currentSceneId ?? null).toBeNull();            // it held the minted 'sc-…' on the cache only
    expect(gmCache().sceneTruths ?? []).toEqual([]);
  }, 30_000);

  it('control: the sibling @scene path (X09) leaves the GM cache as the refusing world', async () => {
    silenceConsoleErrors();
    await seed(A_SCENE);
    refuseGmCampaignStateWrites();
    await table.client('gm-1').chat('@scene What does the loading bay smell like?');
    await table.settle();

    expect(table.cards(f => f.sceneResponse && !f.sceneFallback)).toHaveLength(1);
    expect(world().sceneTruths ?? []).toEqual([]);
    expect(gmCache().sceneTruths ?? []).toEqual([]);
  }, 30_000);

  it('control: with the write accepted, the paced narration\'s facts land in the world and the cache agrees', async () => {
    await seed(A_SCENE);
    await playerSaysNarrativeLine();

    expect(pacedCards()).toHaveLength(1);
    expect(world().sceneTruths.map(t => t.fact)).toEqual(['Owes the crew a favour']);
    expect(gmCache().sceneTruths.map(t => t.fact)).toEqual(['Owes the crew a favour']);
  }, 30_000);
});
