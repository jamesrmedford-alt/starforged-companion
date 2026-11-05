/**
 * PROBE — NARRATION-01 SESSION-VIGNETTE-CACHED-MUTATE
 *
 * What the user does: the GM presses Begin a Session with "Include an opening
 * galley vignette" ticked (the default) — or End a Session, whose closing
 * vignette follows — and the world refuses the canonical GM's write of the
 * vignette's scene start or its ledger facts (a server error, a dropped
 * socket).
 *
 * What happens: issue #329 X09 ("a narration never applies its facts onto the
 * cached campaignState") gave six callers a working copy — the oracle
 * follow-up, @scene, the three clock-vignette sites, the relayed sidecar —
 * but the two session vignettes still hand `narrateSessionVignette` the
 * cached setting by reference: src/safety/sessionLifecycleDialogs.js:320
 * (`const cs = game.settings.get(MODULE_ID, "campaignState") ?? {}` for the
 * galley vignette) and :587 (the same for the closing vignette). On that
 * object `ensureSceneStarted` → `startScene` sets `currentSceneId`,
 * `sceneState.sceneId`, `sceneFrame` and `spotlight`, and
 * `applySidecarSideData` → `applySidecar` / `applySceneFrame` push the
 * vignette's truths, state and frame — before each write. A refused write
 * (persistCampaignStateFields / persistSceneLedgerFields log and continue)
 * leaves the GM's cache holding a scene and facts the world and every other
 * client lack: this GM's next narration renders them as binding
 * (liveSceneLedger reads that cache), the consistency check audits against
 * them, and they ride the GM's next whole-object write into the world after
 * all. rules/foundry-api.md ("get returns an object setting's cached value by
 * reference — set nothing on it before a write that can fail"); the X09
 * decision: "A narration or a command works on a copy of the stored
 * campaignState".
 *
 * What should happen: the vignettes narrate from
 * `foundry.utils.deepClone(game.settings.get(…))`, as the clock vignette
 * beside them does (sessionLifecycleDialogs.js:270), so a refused write
 * leaves the cache as the world has it.
 *
 * Controls: without a refusal the galley's scene and facts land in the world
 * and the cache equals it; the clock vignette at the same site narrates from
 * a copy.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/narration/galleyVignetteCachedMutate.probe.js
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { scriptClaude, campaignStateWrite } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';

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

describe('PROBE NARRATION-01 SESSION-VIGNETTE-CACHED-MUTATE', () => {
  it("Begin a Session's galley vignette: a refused scene write leaves the GM's cache as the world has it", async () => {
    await seed();
    const fault = refuseSceneWrites();
    await begin();

    const galley = table.cards(f => f.sessionVignetteCard && f.vignetteKind === 'galley_begin');
    expect(galley).toHaveLength(1);                            // the vignette narrated on the keyed GM
    expect(world().sessionActive).toBe(true);                  // Begin's own write landed
    expect(fault.refused).toBeGreaterThan(0);                  // the vignette's scene writes were refused
    expect(world().currentSceneId ?? null).toBeNull();         // the world has no scene …
    expect(world().sceneTruths ?? []).toEqual([]);             // … and no truth
    // Expected: the GM's cache is as the world — no scene the world lacks.
    // Today: `currentSceneId: "sc-…"`, the truth, the location and the frame
    // sit on the cached setting alone (ensureSceneStarted and applySidecar
    // worked on it in place).
    expect.soft(gmCache().sceneTruths ?? []).toEqual([]);
    expect.soft(gmCache().sceneState?.bySubject ?? {}).toEqual({});
    expect.soft(gmCache().sceneFrame ?? null).toBeNull();
    expect(gmCache().currentSceneId ?? null).toBeNull();
  }, 30_000);

  it("End a Session's closing vignette: a refused scene write leaves the GM's cache as the world has it", async () => {
    await seed({ sessionActive: true, sessionStartedId: 'bs-s1', currentSceneId: 'es-scene', sceneState: { bySubject: {}, sceneId: 'es-scene' } });
    const fault = refuseSceneWrites({ except: 'es-scene' });  // End's own writes (the gate first, then the scene close) pass
    await endSessionOnGm();

    const closing = table.cards(f => f.sessionVignetteCard && f.vignetteKind === 'npc_end');
    expect(closing).toHaveLength(1);
    expect(world().sessionEndedId).toBe('bs-s1');              // End's own write landed
    expect(fault.refused).toBeGreaterThan(0);
    expect(world().currentSceneId ?? null).toBeNull();         // End closed the scene; the vignette's new one was refused
    // Expected: no scene in the GM's cache either. Today: the vignette minted
    // one on the cached setting and its facts were applied onto it.
    expect.soft(gmCache().sceneTruths ?? []).toEqual([]);
    expect(gmCache().currentSceneId ?? null).toBeNull();
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
