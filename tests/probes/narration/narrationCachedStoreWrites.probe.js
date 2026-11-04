/**
 * PROBE — NARRATION-02 SIDECAR-APPLY-CACHED-MUTATE and NARRATION-03 SCENE-COMMAND-CACHED-MUTATE
 *
 * rules/foundry-api.md: `game.settings.get` returns an object setting's cached
 * value by reference — set nothing on it before a write that can fail (the
 * issue #302 / #321 U58 / #326 W51 shape; W51 fixed nine command writers and
 * left these). Three narration-side writers still change the cached
 * campaignState in place and then write that same object:
 *
 *   NARRATION-02 — a narration that is handed the cached setting applies its
 *   sidecar onto it: applySidecarSideData (src/narration/narrator.js:3616-3647)
 *   runs applySidecar / applySceneFrame (factContinuity/ledgers.js — they push
 *   onto `campaignState.sceneTruths`, set `sceneState.bySubject[key]` and
 *   `sceneFrame` on the object given) and ensureSceneStarted (narrator.js:3418
 *   → sceneLifecycle.startScene, which sets `currentSceneId` on it), then
 *   persistSceneLedgerFields / persistCampaignStateFields find `latest ===
 *   campaignState` and write that object. The callers that pass the cached
 *   setting: the oracle follow-up on the keyed GM (src/oracles/oracleFollowup.js:86
 *   `game.settings.get(…)` → narrateOracleFollowup), `@scene`
 *   (src/index.js:659 → interrogateScene), the three clock-vignette sites
 *   (src/clocks/clocks.js:781, src/clocks/payThePriceClocks.js:88,
 *   src/safety/sessionLifecycleDialogs.js:265 → narrateClockAdvancement) and
 *   the relayed sidecar handler (narrator.js:3558 applyRelayedNarratorSidecar).
 *
 *   NARRATION-03 — `!scene start` / `!scene end` (src/index.js:3386-3398
 *   handleSceneCommand) hand the cached setting to startScene / endScene,
 *   which clear or mint the scene fields on it before their write; the card
 *   then says "Scene started — sc-…" / "Scene ended — migrated N …" whatever
 *   the write did (the persist failure is only console.warned,
 *   sceneLifecycle.js persistCampaignStateFields).
 *
 * What the user sees after a refused write (a server error, a dropped
 * socket): the GM's client holds facts, a frame or a scene the world and
 * every other client lack — its next narration renders them as binding (the
 * live ledger is read from that cache, narrator.js:463), the consistency
 * check audits against them, and they either vanish when a later world write
 * replaces the cache or ride the GM's next whole-object write into the world
 * after all; `!scene end` leaves the world's scene open while the GM's client
 * believes it closed (its next narration mints a second scene over it).
 *
 * Correct behaviour (asserted): after a refused write this client's cache
 * still equals the world, and the `!scene` card does not claim the change.
 *
 * Controls: without a refusal the same paths land in the world.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/narration/narrationCachedStoreWrites.probe.js
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

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

describe('PROBE NARRATION-02 SIDECAR-APPLY-CACHED-MUTATE', () => {
  it("oracle follow-up on the keyed GM: a refused ledger write leaves the GM's cache equal to the world", async () => {
    await seed(A_SCENE);
    refuseGmCampaignStateWrites();
    await table.client('pl-1').chat('!oracle yes likely is the dockmaster friendly', { speaker: { actor: 'pc-kira' } });
    await table.settle();

    const narration = table.claude.calls.find(c => c.model === NARRATION_MODEL && /invoked the oracle/.test(c.userText));
    expect(narration?.client).toBe('gm-1');                       // the follow-up ran on the keyed canonical GM
    expect(table.cards(f => f.oracleNarrationCard)).toHaveLength(1);
    expect(world().sceneTruths).toEqual([]);                      // the write was refused: the world has no truth
    // Expected: as the world. Today: the GM's cache holds the dockmaster's truth, his location and the frame.
    expect.soft(gmCache().sceneTruths).toEqual([]);
    expect.soft(gmCache().sceneState?.bySubject ?? {}).toEqual({});
    expect.soft(gmCache().sceneFrame ?? null).toBeNull();
  }, 30_000);

  it("@scene on the GM with no scene open: a refused scene start leaves no scene in the GM's cache", async () => {
    refuseGmCampaignStateWrites();
    await table.client('gm-1').chat('@scene What does the loading bay smell like?');
    await table.settle();

    expect(table.cards(f => f.sceneResponse && !f.sceneFallback)).toHaveLength(1);
    expect(world().currentSceneId ?? null).toBeNull();
    // Expected: null (as the world). Today: the scene ensureSceneStarted minted on the cache.
    expect.soft(gmCache().currentSceneId ?? null).toBeNull();
    expect.soft(gmCache().sceneTruths ?? []).toEqual([]);
  }, 30_000);

  it('control: without a refusal the oracle follow-up\'s facts land in the world', async () => {
    await seed(A_SCENE);
    await table.client('pl-1').chat('!oracle yes likely is the dockmaster friendly', { speaker: { actor: 'pc-kira' } });
    await table.settle();
    expect(world().sceneTruths.map(t => t.fact)).toEqual(['Owes the crew a favour']);
    expect(world().sceneFrame?.location).toBe('the loading bay');
    expect(gmCache().sceneTruths.map(t => t.fact)).toEqual(['Owes the crew a favour']);
  }, 30_000);
});

describe('PROBE NARRATION-03 SCENE-COMMAND-CACHED-MUTATE', () => {
  it("!scene start: a refused write leaves no scene in the GM's cache, and the card does not claim one", async () => {
    refuseGmCampaignStateWrites();
    await table.client('gm-1').chat('!scene start');
    await table.settle();

    expect(world().currentSceneId ?? null).toBeNull();
    // Expected: null (as the world). Today: sc-xxxxxxxx on the GM only.
    expect.soft(gmCache().currentSceneId ?? null).toBeNull();
    const card = table.cards(f => f.sceneCommand).at(-1);
    expect(card).toBeDefined();
    expect.soft(card.content).not.toMatch(/Scene started/);
  }, 30_000);

  it("!scene end: a refused write leaves the scene in the GM's cache as the world has it, and the card does not claim it ended", async () => {
    await seed({
      ...A_SCENE,
      sceneTruths: [{
        id: 'tr-1', subject: { kind: 'text', text: 'the dockmaster' }, fact: 'Owes the crew a favour',
        sessionId: 'sess-1', sessionNum: 1, sceneId: 'sc-1', moveId: null, source: 'narrator_sidecar', asserter: 'narrator',
        createdAt: Date.now(), retracted: false, retractedBy: null, retractedAt: null, correctedTo: null, migratedTo: null,
      }],
    });
    refuseGmCampaignStateWrites();
    await table.client('gm-1').chat('!scene end');
    await table.settle();

    expect(world().currentSceneId).toBe('sc-1');
    expect(world().sceneTruths).toHaveLength(1);
    // Expected: as the world. Today: the GM's cache has the scene cleared (no id, no truths).
    expect.soft(gmCache().currentSceneId ?? null).toBe('sc-1');
    expect.soft((gmCache().sceneTruths ?? []).length).toBe(1);
    const card = table.cards(f => f.sceneCommand).at(-1);
    expect(card).toBeDefined();
    expect.soft(card.content).not.toMatch(/Scene ended/);
  }, 30_000);

  it('control: without a refusal !scene start lands in the world', async () => {
    await table.client('gm-1').chat('!scene start');
    await table.settle();
    expect(world().currentSceneId).toMatch(/^sc-/);
    expect(gmCache().currentSceneId).toBe(world().currentSceneId);
    expect(table.cards(f => f.sceneCommand).at(-1).content).toMatch(/Scene started/);
  }, 30_000);
});
