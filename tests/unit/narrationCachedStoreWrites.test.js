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
 *
 * Issue #335 Y04 (NARRATION-CACHED-STORE-SIBLINGS) — the siblings X09 did not
 * reach: ✦ Envision Inciting Incident (`!incite`, the Session panel's GM
 * press) and a vow rolled on the foundry-ironsworn sheet narrated by the
 * keyed GM (the native progress-roll hook's narrateResolution) minted a scene
 * and applied their sidecar on the cached setting. (The session vignettes are
 * in sessionVignetteCachedWrites.test.js; Campaign Start's phase 5 in
 * campaignStart.test.js. From the tenth audit's probes
 * tests/probes/ui/inciteNarratesOnCache.probe.js and
 * tests/probes/sweep/inciteCachedStoreWrites.probe.js.)
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const KEY = `${MODULE_ID}.campaignState`;
const NARRATION_MODEL = 'claude-sonnet-5-5';

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

// The vendor roll card: JSON HTML-escaped inside a single-quoted attribute (nativeBondRollNarration.test.js).
function nativeProgressCard({ source, value, dice }) {
  const roll = { preRollOptions: { progress: { source, value }, actorId: 'pc-1' }, rawChallengeDiceValues: dice };
  const json = JSON.stringify(roll).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  return `<article class='ironsworn-roll' data-ironswornroll='${json}'><h3>Progress Roll: ${source}</h3></article>`;
}

/** A player rolls their vow's progress on the foundry-ironsworn sheet (a miss: 1 vs 5, 8). */
async function rollVowOnSheet() {
  table.addActor({
    id: 'pc-1', name: 'Vex', type: 'character', ownership: { 'pl-1': 3 },
    items: { contents: [
      { id: 'vow-1', type: 'progress', name: 'Find Chen', system: { subtype: 'vow', rank: 'dangerous', current: 0 }, flags: {} },
    ] },
  });
  await table.client('pl-1').run(() => globalThis.ChatMessage.create({
    content: nativeProgressCard({ source: 'Find Chen', value: 1, dice: [5, 8] }),
    speaker: { actor: 'pc-1', alias: 'Vex' },
    rolls: [{ formula: '{d10,d10}', total: 0 }],
  }));
  await table.settle();
}

/** The GM presses ✦ Envision Inciting Incident on their own Session panel (the client's own module copy). */
async function pressEnvisionOnGm() {
  await table.client('gm-1').run(async () => {
    const { SessionPanelApp } = await import('../../src/ui/sessionPanel.js');
    await SessionPanelApp.DEFAULT_OPTIONS.actions.envisionIncite.call({ render() {} }, {}, {});
  });
  await table.settle();
}

/** The GM's cache holds no scene and none of the narration's facts — as the world, which refused them. */
function expectCacheAsRefusedWorld() {
  expect(world().currentSceneId ?? null).toBeNull();
  expect(world().sceneTruths ?? []).toEqual([]);
  expect(gmCache().currentSceneId ?? null).toBeNull();
  expect(gmCache().sceneTruths ?? []).toEqual([]);
  expect(gmCache().sceneState?.bySubject ?? {}).toEqual({});
  expect(gmCache().sceneFrame ?? null).toBeNull();
}

describe('issue #335 Y04 — the inciting incident and a sheet-rolled vow narrate on a working copy', () => {
  it("!incite on the keyed GM: a refused write leaves no scene and no truth in the GM's cache", async () => {
    silenceConsoleErrors();
    refuseGmCampaignStateWrites();
    await table.client('gm-1').chat('!incite');
    await table.settle();

    expect(table.claude.calls.find(c => c.model === NARRATION_MODEL)?.client).toBe('gm-1');   // narrated on the keyed GM
    expect(table.cards(f => f.incitingIncidentCard)).toHaveLength(1);                         // the card still posts
    expectCacheAsRefusedWorld();
  }, 30_000);

  it("the Session panel's ✦ Envision Inciting Incident (GM): a refused write leaves the GM's cache as the world", async () => {
    silenceConsoleErrors();
    refuseGmCampaignStateWrites();
    await pressEnvisionOnGm();

    expect(table.claude.calls.some(c => c.model === NARRATION_MODEL && c.client === 'gm-1')).toBe(true);
    expect(table.cards(f => f.incitingIncidentCard)).toHaveLength(1);
    expectCacheAsRefusedWorld();
  }, 30_000);

  it("a sheet-rolled vow narrated by the keyed GM: a refused write leaves no scene and no truth in the GM's cache", async () => {
    silenceConsoleErrors();
    refuseGmCampaignStateWrites();
    await rollVowOnSheet();

    expect(table.cards(f => f.narratorCard && f.moveId === 'fulfill_your_vow')).toHaveLength(1);   // narrated
    expectCacheAsRefusedWorld();
  }, 30_000);

  it("control: with the write accepted, !incite's scene and truth land in the world and the GM's cache agrees", async () => {
    await table.client('gm-1').chat('!incite');
    await table.settle();
    expect(world().currentSceneId).toMatch(/^sc-/);
    expect(world().sceneTruths.map(t => t.fact)).toEqual(['Owes the crew a favour']);
    expect(gmCache().currentSceneId).toBe(world().currentSceneId);
    expect(gmCache().sceneTruths.map(t => t.fact)).toEqual(['Owes the crew a favour']);
  }, 30_000);

  it("control: with the write accepted, the sheet roll's narration mints the scene in the world and the GM's cache agrees", async () => {
    await rollVowOnSheet();
    expect(world().currentSceneId).toMatch(/^sc-/);
    expect(world().sceneTruths.map(t => t.fact)).toEqual(['Owes the crew a favour']);
    expect(gmCache().currentSceneId).toBe(world().currentSceneId);
  }, 30_000);
});
