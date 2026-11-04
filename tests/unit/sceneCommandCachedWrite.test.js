/**
 * STARFORGED COMPANION
 * tests/unit/sceneCommandCachedWrite.test.js
 *
 * Issue #329 X10 (SCENE-COMMAND-CACHED-MUTATE) — `!scene start` / `!scene
 * end` on a refused write leave the GM's cache equal to the world, and the
 * card does not claim the change.
 *
 * handleSceneCommand handed the cached campaignState to startScene /
 * endScene, which set or clear the scene fields on it before their write; the
 * refusal was only logged, so the GM's cache said a new scene was open (or
 * the old one closed) while the world kept the old one, and the card said
 * "Scene started — sc-…" / "Scene ended — migrated N …" whatever the write
 * did. The GM's next narration continued the phantom scene and its sidecar
 * persist wrote it into the world. Now the command works on a copy and the
 * card says what the world holds: "Scene start not saved — the world did
 * not take the write. Try again."
 *
 * (Converted from the ninth audit's probes
 * tests/probes/continuity/sceneCommandCachedWrite.probe.js and the `!scene`
 * cases of tests/probes/narration/narrationCachedStoreWrites.probe.js.)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';

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

describe('issue #329 X10 — `!scene` on a refused write leaves the GM\'s cache equal to the world', () => {
  it('`!scene start`: no scene opens on the GM alone, and the card does not claim one', async () => {
    refuseGmCampaignStateWrites();
    await table.client('gm-1').chat('!scene start');
    await table.settle();

    expect(world().currentSceneId ?? null).toBeNull();
    // The cache equals the world (it held "sc-…" on the GM only).
    expect(gmCache().currentSceneId ?? null).toBeNull();
    expect(sceneCard()?.content ?? '').not.toMatch(/Scene started/i);
    expect(sceneCard().content).toMatch(/Scene start not saved — the world did not take the write/);
  }, 30_000);

  it('`!scene end`: the live scene stays open on the GM, its truths kept, and the card does not claim it ended', async () => {
    await table.reset({ world: { settings: { campaignState: liveScene() } } });
    refuseGmCampaignStateWrites();
    await table.client('gm-1').chat('!scene end');
    await table.settle();

    expect(world().currentSceneId).toBe('sc-1');
    expect(world().sceneTruths.map(t => t.fact)).toEqual(['Owes the crew a favour']);
    // The GM's cache still holds the scene the world holds (it was null / []).
    expect(gmCache().currentSceneId ?? null).toBe('sc-1');
    expect(gmCache().sceneTruths.map(t => t.fact)).toEqual(['Owes the crew a favour']);
    expect(sceneCard()?.content ?? '').not.toMatch(/Scene ended/i);
    expect(sceneCard().content).toMatch(/Scene end not saved/);
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
    expect(sceneCard().content).toMatch(/Scene ended — migrated/);
  }, 30_000);

  it('`!scene start` over a live scene that the world refused to replace keeps the live scene everywhere', async () => {
    await table.reset({ world: { settings: { campaignState: liveScene() } } });
    refuseGmCampaignStateWrites();
    await table.client('gm-1').chat('!scene start');
    await table.settle();
    expect(world().currentSceneId).toBe('sc-1');
    expect(gmCache().currentSceneId).toBe('sc-1');
    expect(sceneCard().content).toMatch(/Scene start not saved/);
  }, 30_000);
});
