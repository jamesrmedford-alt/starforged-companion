/**
 * STARFORGED COMPANION
 * tests/unit/sessionVignetteCachedWrites.test.js
 *
 * Issue #335 Y04 (NARRATION-CACHED-STORE-SIBLINGS) — Begin a Session's
 * opening galley vignette and End a Session's closing vignette handed
 * narrateSessionVignette the cached campaignState by reference
 * (`game.settings.get`, rules/foundry-api.md). On it ensureSceneStarted →
 * startScene set the scene fields and applySidecar / applySceneFrame pushed
 * the vignette's truths, state and frame — before each write. A refused
 * write left the GM's cache holding a scene and facts the world and every
 * other client lacked (rendered as binding in its next narration, carried
 * into the world by its next whole-object write); for End, a scene opened on
 * the cache after End closed the real one. Each now narrates from a working
 * copy, as the clock vignette beside them does (issue #329 X09).
 *
 * (From the tenth audit's probe
 * tests/probes/narration/galleyVignetteCachedMutate.probe.js.)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { scriptClaude, campaignStateWrite } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-5-5';

const SIDECAR = {
  newTruths:    [{ subject: 'the dockmaster', fact: 'Owes the crew a favour' }],
  stateChanges: [{ subject: 'the dockmaster', attribute: 'location', value: 'the galley hatch' }],
  sceneFrame:   { location: "the ship's galley", present: ['Kira', 'the dockmaster'], situation: 'Breakfast and bad news' },
};
const NARRATION = 'The galley smells of burnt caf. The dockmaster waves from the hatch.\n```json\n' + JSON.stringify(SIDECAR) + '\n```';

let table;
const world   = () => table.world.campaignState();
const gmCache = () => table.client('gm-1').getSetting('campaignState');

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

async function seed(extra = {}) {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false,
    campaignState: {
      ...CampaignStateSchema, sessionActive: false, sessionStartedId: null, currentSessionId: 'bs-s1',
      sessionNumber: 1, lastSessionTimestamp: new Date().toISOString(), clocks: [], safetyFlags: [],
      currentSceneId: null, sceneTruths: [], sceneState: { bySubject: {}, sceneId: null }, sceneFrame: null,
      ...extra,
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  scriptClaude(table, { fallback: (call) => (call.model === NARRATION_MODEL ? NARRATION : '{}') });
}

/**
 * Refuse every campaignState write the GM makes that carries a scene the world
 * did not have — the vignette's scene start and its ledger persist (`except`:
 * a scene already open, whose writes pass).
 */
function refuseSceneWrites({ except = null } = {}) {
  let refused = 0;
  table.interceptWrites(w => {
    const scene = w.value?.currentSceneId;
    if (!(campaignStateWrite('gm-1')(w) && typeof scene === 'string' && scene !== except)) return undefined;
    refused += 1;
    return new Error('Setting [campaignState] could not be saved: the server refused the write');
  });
  return { get refused() { return refused; } };
}

async function begin({ galley = true } = {}) {
  table.client('gm-1').answerDialogs(d => d.submit({ 'input[name="vignette"]': false, 'input[name="galleyVignette"]': galley }));
  await table.client('gm-1').chat('!begin-session');
  await table.settle(); await table.drain();
}

async function endSessionOnGm() {
  const api = await table.client('gm-1').import('../../src/multiplayer/gmRelay.js');
  await table.client('gm-1').run(() => api.requestGmAction('session.end', { questFocus: '', connectionFocus: '' }));
  await table.settle(); await table.drain();
}

describe('issue #335 Y04 — the session vignettes narrate on a working copy', () => {
  it("Begin a Session's galley vignette: a refused scene write leaves the GM's cache as the world has it", async () => {
    await seed();
    const fault = refuseSceneWrites();
    await begin();

    expect(table.cards(f => f.sessionVignetteCard && f.vignetteKind === 'galley_begin')).toHaveLength(1);
    expect(world().sessionActive).toBe(true);                  // Begin's own write landed
    expect(fault.refused).toBeGreaterThan(0);                  // the vignette's scene writes were refused
    expect(world().currentSceneId ?? null).toBeNull();
    expect(world().sceneTruths ?? []).toEqual([]);
    // The GM's cache is as the world: no scene, truth, state or frame the world lacks.
    expect(gmCache().currentSceneId ?? null).toBeNull();
    expect(gmCache().sceneTruths ?? []).toEqual([]);
    expect(gmCache().sceneState?.bySubject ?? {}).toEqual({});
    expect(gmCache().sceneFrame ?? null).toBeNull();
  }, 30_000);

  it("End a Session's closing vignette: a refused scene write leaves the GM's cache as the world has it", async () => {
    await seed({ sessionActive: true, sessionStartedId: 'bs-s1', currentSceneId: 'es-scene', sceneState: { bySubject: {}, sceneId: 'es-scene' } });
    const fault = refuseSceneWrites({ except: 'es-scene' });  // End's own writes (the gate first, then the scene close) pass
    await endSessionOnGm();

    expect(table.cards(f => f.sessionVignetteCard && f.vignetteKind === 'npc_end')).toHaveLength(1);
    expect(world().sessionEndedId).toBe('bs-s1');              // End's own write landed
    expect(fault.refused).toBeGreaterThan(0);
    expect(world().currentSceneId ?? null).toBeNull();         // End closed the scene; the vignette's new one was refused
    expect(gmCache().currentSceneId ?? null).toBeNull();
    expect(gmCache().sceneTruths ?? []).toEqual([]);
  }, 30_000);

  it("control: without a refusal the galley's scene and facts land in the world and the cache equals it", async () => {
    await seed();
    await begin();
    expect(table.cards(f => f.sessionVignetteCard && f.vignetteKind === 'galley_begin')).toHaveLength(1);
    expect(world().currentSceneId).toMatch(/^sc-/);
    expect(world().sceneTruths.map(t => t.fact)).toEqual(['Owes the crew a favour']);
    expect(world().sceneFrame?.location).toBe("the ship's galley");
    expect(gmCache().currentSceneId).toBe(world().currentSceneId);
    expect(gmCache().sceneTruths.map(t => t.fact)).toEqual(['Owes the crew a favour']);
  }, 30_000);
});
