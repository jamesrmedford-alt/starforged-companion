/**
 * NARR-2 SWEAR-VOW-SCENE-NARRATES-ON-CACHED-STORE (eleventh audit, narration)
 * — the shared inciting vow's oath scene narrates on the cached campaignState.
 *
 * ⚔ Swear this vow on the inciting card rolls Swear an Iron Vow; the move
 * pipeline's rollMove (src/moves/movePipeline.js:900-916) calls
 * swearSharedVowForAll, which reads `campaignState = game.settings.get(…)` —
 * the cached value, by reference — and hands it to narrateAndPostVowSwearing →
 * narrateVowSwearing, which mints a scene on it when none is open
 * (ensureSceneStarted) and applies the oath scene's sidecar truths, state and
 * frame onto it (applyNarratorSidecar) before writes the world can refuse.
 * The free-flow Swear an Iron Vow (movePipeline.js:918) narrates on the
 * pipeline's own object; this one does not. Issue #335 Y04's fix ("A
 * narration works on a copy at every entry handler") missed it.
 *
 * Driven on a booted table: the inciting card is in chat, the GM's
 * campaignState writes are refused, the GM's client runs swearSharedVowForAll
 * as the pipeline does once the swear has rolled.
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const KEY = `${MODULE_ID}.campaignState`;
const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';

const SIDECAR = {
  newTruths:    [{ subject: 'the crew', fact: 'Swore on the cold iron of the airlock' }],
  stateChanges: [],
  sceneFrame:   { location: 'the airlock', present: ['Kira'], situation: 'An oath on iron' },
};
const NARRATION = 'Kira presses her palm to the cold iron and speaks the words.\n```json\n' + JSON.stringify(SIDECAR) + '\n```';

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
  scriptClaude(table, { fallback: (call) => (call.model === NARRATION_MODEL ? NARRATION : '{}') });
}

beforeEach(async () => { await seed(); });

function refuseGmCampaignStateWrites() {
  table.interceptWrites(w => (w.kind === 'setting' && w.key === KEY && w.client === 'gm-1')
    ? new Error('Setting [campaignState] could not be saved: the server refused the write')
    : undefined);
}

const gmCache = () => table.client('gm-1').getSetting('campaignState');
const world   = () => table.world.campaignState();
const A_SCENE = { currentSceneId: 'sc-1', sceneState: { bySubject: {}, sceneId: 'sc-1' } };

/** The inciting card, posted by the GM; no crisis clock and no target (no campaignState write before the scene). */
async function postIncitingCard() {
  return table.client('gm-1').run(() => globalThis.ChatMessage.create({
    content: '<div class="sf-incite-card"><p>The beacon went dark.</p></div>',
    flags: { [MODULE_ID]: {
      incitingIncidentCard: true,
      incitingMeta: {
        vow: { statement: 'Relight the Haven beacon', rank: 'dangerous' },
        clock: null, immediateCrisis: null, target: null,
      },
    } },
  }));
}

/** What the move pipeline runs on the canonical GM once the swear has rolled (movePipeline.js:915). */
async function swearOnGm(card) {
  await table.client('gm-1').run(async () => {
    const { swearSharedVowForAll } = await import('../../../src/session/swearVow.js');
    await swearSharedVowForAll(card, { speakerActorId: 'pc-kira' });
  });
  await table.settle();
}

describe('NARR-2 — the inciting swear\'s oath scene applies its facts onto the cached setting', () => {
  it("a scene open, the GM's writes refused: the GM's cache keeps no oath-scene truth the world lacks", async () => {
    silenceConsoleErrors();
    await seed(A_SCENE);
    const card = await postIncitingCard();
    refuseGmCampaignStateWrites();
    await swearOnGm(card);

    expect(table.cards(f => f.vowSceneCard)).toHaveLength(1);              // the oath scene posted
    expect(world().sceneTruths ?? []).toEqual([]);                          // the world refused its facts
    expect((gmCache().sceneTruths ?? []).map(t => t.fact)).toEqual([]);     // today: the oath's truth, on the GM's cache only
    expect(gmCache().sceneFrame ?? null).toBeNull();
  }, 30_000);

  it("no scene open, the GM's writes refused: the GM's cache holds no scene the world lacks", async () => {
    silenceConsoleErrors();
    const card = await postIncitingCard();
    refuseGmCampaignStateWrites();
    await swearOnGm(card);

    expect(table.cards(f => f.vowSceneCard)).toHaveLength(1);
    expect(world().currentSceneId ?? null).toBeNull();
    expect(gmCache().currentSceneId ?? null).toBeNull();                    // today: a scene minted on the cache only
  }, 30_000);

  it('control: with the writes accepted, the oath scene\'s truth lands in the world and the cache agrees', async () => {
    await seed(A_SCENE);
    const card = await postIncitingCard();
    await swearOnGm(card);

    expect(table.cards(f => f.vowSceneCard)).toHaveLength(1);
    expect(world().sceneTruths.map(t => t.fact)).toEqual(['Swore on the cold iron of the airlock']);
    expect(gmCache().sceneTruths.map(t => t.fact)).toEqual(['Swore on the cold iron of the airlock']);
  }, 30_000);
});
