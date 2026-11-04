/**
 * PROBE — CONTINUITY-02 SCENE-COMMAND-CACHED-MUTATE
 * (src/index.js handleSceneCommand, lines 3377–3421 → startScene / endScene,
 *  src/factContinuity/sceneLifecycle.js 59–91 and 112–162, which mutate the
 *  object they are handed and persist it through persistCampaignStateFields →
 *  mergeOwnedFields, which returns the caller's own object when it IS the
 *  stored one — line 524)
 *
 * What the user does: the GM types `!scene start` (or `!scene end`) and the
 * world write is refused (a server error, a dropped socket).
 *
 * What happens: handleSceneCommand hands `game.settings.get(MODULE_ID,
 * "campaignState")` — the client's cached object, BY REFERENCE
 * (rules/foundry-api.md) — straight to startScene / endScene, which set
 * `currentSceneId`, `sceneTruths`, `sceneState`, `sceneFrame` and `spotlight` on
 * it before the write. persistCampaignStateFields swallows the refusal
 * (console.warn only), so the GM's cache now says a new scene is open (or the
 * old one is closed, its truths gone) while the world — and every other
 * client — still holds the old scene; and the card says "Scene started — sc-…"
 * / "Scene ended — migrated …". The GM's next narration continues the phantom
 * scene (startScene → adoptStoredScene reads the same mutated cache) and its
 * sidecar persist then writes the whole mutated cache over the world
 * (persistSceneLedgerFields: `latest === campaignState` → written as-is).
 * Issue #326 W51 fixed nine such writers and issue #321 U58 `!at` / `!sector`;
 * `!scene` was not among them.
 *
 * What should happen: a refused write leaves the client's cache equal to the
 * world, and the card says the scene change was not saved (decisions.md →
 * "Issue #326 audit": "A refusable write changes a copy … the commands say
 * when the world did not take the write").
 *
 * Controls: without a refusal `!scene start` opens a scene in the world and
 * `!scene end` closes it.
 *
 * Asserts the CORRECT behaviour; fails today.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/continuity/sceneCommandCachedWrite.probe.js
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const KEY = `${MODULE_ID}.campaignState`;
let table;

const TRUTH = {
  id: 'tr-dock0001', subject: { kind: 'text', text: 'the dockmaster' }, fact: 'Owes the crew a favour',
  sessionId: 'sess-1', sessionNum: 1, sceneId: 'sc-1', moveId: null, source: 'narrator_sidecar',
  asserter: 'narrator', createdAt: 1, retracted: false, retractedBy: null, retractedAt: null,
  correctedTo: null, migratedTo: null, sceneLocation: null,
};

const baseState = () => ({ ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1 });
const liveScene = () => ({ ...baseState(), currentSceneId: 'sc-1', sceneTruths: [TRUTH], sceneState: { bySubject: {}, sceneId: 'sc-1' }, sceneFrame: null });

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: { campaignState: baseState() } } });
});

/** Refuse every campaignState write the GM's client makes. */
function refuseGmCampaignStateWrites() {
  table.interceptWrites(w => (w.kind === 'setting' && w.key === KEY && w.client === 'gm-1')
    ? new Error('Setting [campaignState] could not be saved: the server refused the write')
    : undefined);
}

const gmCache = () => table.client('gm-1').getSetting('campaignState');
const world   = () => table.world.campaignState();
const sceneCard = () => table.cards(f => f.sceneCommand).at(-1);

describe('CONTINUITY-02 `!scene` on a refused write leaves the GM\'s cache equal to the world', () => {
  it('`!scene start`: no scene opens on the GM alone, and the card does not claim one', async () => {
    refuseGmCampaignStateWrites();
    await table.client('gm-1').chat('!scene start');
    await table.settle();

    expect(world().currentSceneId ?? null).toBeNull();
    // Expected: null (the cache equals the world). Today: "sc-…" on the GM only.
    expect(gmCache().currentSceneId ?? null).toBeNull();
    expect.soft(sceneCard()?.content ?? '').not.toMatch(/Scene started/i);
  }, 30_000);

  it('`!scene end`: the live scene stays open on the GM, its truths kept, and the card does not claim it ended', async () => {
    await table.reset({ world: { settings: { campaignState: liveScene() } } });
    refuseGmCampaignStateWrites();
    await table.client('gm-1').chat('!scene end');
    await table.settle();

    expect(world().currentSceneId).toBe('sc-1');
    expect(world().sceneTruths.map(t => t.fact)).toEqual(['Owes the crew a favour']);
    // Expected: the GM's cache still holds the scene the world holds. Today: null / [].
    expect(gmCache().currentSceneId ?? null).toBe('sc-1');
    expect.soft(gmCache().sceneTruths.map(t => t.fact)).toEqual(['Owes the crew a favour']);
    expect.soft(sceneCard()?.content ?? '').not.toMatch(/Scene ended/i);
  }, 30_000);

  it('control: without a refusal `!scene start` opens a scene in the world and `!scene end` closes it', async () => {
    await table.client('gm-1').chat('!scene start');
    await table.settle();
    expect(world().currentSceneId).toMatch(/^sc-/);
    expect(sceneCard().content).toMatch(/Scene started/);

    await table.client('gm-1').chat('!scene end');
    await table.settle();
    expect(world().currentSceneId ?? null).toBeNull();
    expect(gmCache().currentSceneId ?? null).toBeNull();
  }, 30_000);
});
