/**
 * STARFORGED COMPANION
 * tests/unit/narrationCachedStoreWrites.test.js
 *
 * Issue #329 X09 (SIDECAR-APPLY-CACHED-MUTATE) — a narration handed the
 * cached campaignState applied its facts onto it in place.
 *
 * `game.settings.get` returns an object setting's cached value by reference
 * (rules/foundry-api.md). applySidecarSideData pushes the sidecar's truths,
 * state and frame onto the object it is given, ensureSceneStarted mints a
 * scene on it, and the persists found `latest === campaignState` and wrote
 * it. The oracle follow-up on the keyed GM, `@scene`, the three clock
 * vignettes and the relayed-sidecar handler handed it the cache, so a
 * refused write left the GM's client holding facts, a frame or a scene the
 * world and every other client lacked — rendered as binding in its next
 * narration, audited against, or carried into the world by its next
 * whole-object write. Each now narrates from a working copy.
 *
 * (Converted from the ninth audit's probe
 * tests/probes/narration/narrationCachedStoreWrites.probe.js — its `!scene`
 * cases are X10's, in sceneCommandCachedWrite.test.js.)
 */

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
const NARRATION = 'The dockmaster waves you through.\n```json\n' + JSON.stringify(SIDECAR) + '\n```';

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

/** Seed the world, key the GM (the keyed canonical GM runs every Claude call), one PC, the Claude script. */
async function seed(extra = {}) {
  await table.reset({ world: { settings: { campaignState: base(extra) } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  scriptClaude(table, { fallback: (call) => (call.model === NARRATION_MODEL ? NARRATION : '{}') });
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

describe('issue #329 X09 — a narration never applies its facts onto the cached setting', () => {
  it("oracle follow-up on the keyed GM: a refused ledger write leaves the GM's cache equal to the world", async () => {
    await seed(A_SCENE);
    refuseGmCampaignStateWrites();
    await table.client('pl-1').chat('!oracle yes likely is the dockmaster friendly', { speaker: { actor: 'pc-kira' } });
    await table.settle();

    const narration = table.claude.calls.find(c => c.model === NARRATION_MODEL && /invoked the oracle/.test(c.userText));
    expect(narration?.client).toBe('gm-1');                       // the follow-up ran on the keyed canonical GM
    expect(table.cards(f => f.oracleNarrationCard)).toHaveLength(1);
    expect(world().sceneTruths).toEqual([]);                      // the write was refused: the world has no truth
    // The GM's cache is as the world: no truth, no location, no frame.
    expect(gmCache().sceneTruths).toEqual([]);
    expect(gmCache().sceneState?.bySubject ?? {}).toEqual({});
    expect(gmCache().sceneFrame ?? null).toBeNull();
  }, 30_000);

  it("@scene on the GM with no scene open: a refused scene start leaves no scene in the GM's cache", async () => {
    refuseGmCampaignStateWrites();
    await table.client('gm-1').chat('@scene What does the loading bay smell like?');
    await table.settle();

    expect(table.cards(f => f.sceneResponse && !f.sceneFallback)).toHaveLength(1);
    expect(world().currentSceneId ?? null).toBeNull();
    // No scene the world lacks — ensureSceneStarted minted one on the cache.
    expect(gmCache().currentSceneId ?? null).toBeNull();
    expect(gmCache().sceneTruths ?? []).toEqual([]);
  }, 30_000);

  it('control: without a refusal the oracle follow-up\'s facts land in the world', async () => {
    await seed(A_SCENE);
    await table.client('pl-1').chat('!oracle yes likely is the dockmaster friendly', { speaker: { actor: 'pc-kira' } });
    await table.settle();
    expect(world().sceneTruths.map(t => t.fact)).toEqual(['Owes the crew a favour']);
    expect(world().sceneFrame?.location).toBe('the loading bay');
    expect(gmCache().sceneTruths.map(t => t.fact)).toEqual(['Owes the crew a favour']);
  }, 30_000);

  it('control: @scene with no scene open mints one in the world and files its facts under it', async () => {
    await table.client('gm-1').chat('@scene What does the loading bay smell like?');
    await table.settle();
    expect(world().currentSceneId).toMatch(/^sc-/);
    expect(world().sceneTruths.map(t => [t.fact, t.sceneId])).toEqual([['Owes the crew a favour', world().currentSceneId]]);
    expect(gmCache().currentSceneId).toBe(world().currentSceneId);
  }, 30_000);
});
