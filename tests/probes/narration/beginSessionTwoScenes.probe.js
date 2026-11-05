/**
 * PROBE — NARRATION-02 CONCURRENT-SCENE-MINT
 *
 * What the user does: the GM presses Begin a Session with the galley
 * vignette on (the default) at a table with a campaign clock whose Ask the
 * Oracle roll advances it. The previous session's scene was closed at the
 * mint (rollSessionIfDue → endScene), so no scene is open.
 *
 * What happens: `applyBeginSession` fires two narrations from two
 * `setTimeout(0)`s in a row — the clock vignette (narrateClockAdvancement,
 * on a working copy, sessionLifecycleDialogs.js:268-290) and the galley
 * vignette (narrateSessionVignette, :319-327). Each runs `ensureSceneStarted`
 * → `startScene`: the first reads the store (no scene), mints `sc-A` on its
 * copy and awaits its `persistCampaignStateFields` write — a server round
 * trip; the second's timer fires inside that round trip, reads the same
 * store (still no scene — `adoptStoredScene` finds nothing), mints `sc-B` and
 * writes too. Two scenes for one Begin; the write that lands last wins the
 * world. The narration on the losing scene applies its sidecar to its own
 * copy and `persistSceneLedgerFields` finds "the scene changed meanwhile —
 * not persisted (the stored scene's ledgers stand)": its truths, state and
 * frame — the clock's "the blockade tightens" beat — are never recorded,
 * though its card posts. Before issue #329 X09 both ran on the one cached
 * object: the second saw the first's scene id set in place and continued it.
 * The same shape runs on `!pay-the-price` when it fills a tension clock
 * (payThePriceClocks.js:86-91 + the oracle follow-up, oracleFollowup.js:149),
 * and the two copies there overwrite each other's `sceneState` / `sceneFrame`
 * even with a scene open (the issue #299 no-baseline merge, now between two
 * narrations of one command).
 *
 * What should happen: one scene for the Begin, and both vignettes' facts in
 * it (rules/narrator-memory.md 6: "A scene is never minted over a live one";
 * `ensureSceneStarted` on the canonical GM is a single emitter — the two
 * starts should be serialised, or the second adopt the first's pending scene).
 *
 * The harness applies a world write synchronously, so the round trip is
 * modelled by holding the GM's scene-start writes (tests/helpers/faults.js'
 * interceptWrites) until both vignettes have read the store, then releasing
 * them in the order they were sent — the order Foundry's server applies them.
 *
 * Controls: both vignette cards post; each vignette's own Claude call carries
 * its request.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/narration/beginSessionTwoScenes.probe.js
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

// The campaign clock's Ask the Oracle always says yes (a stateless leaf).
vi.mock('../../../src/oracles/roller.js', async (orig) => ({
  ...(await orig()),
  rollYesNo: vi.fn((odds) => ({ odds, threshold: 75, roll: 7, tens: 0, ones: 7, answer: 'yes', isMatch: false, question: '' })),
}));

import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { scriptClaude, campaignStateWrite, deferred } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';
const CLOCK_FACT  = 'The Syndicate blockade has tightened around Haven';
const GALLEY_FACT = 'Owes the crew a favour';
const CLOCK_NARRATION  = 'Another freighter turns back at the picket line.\n```json\n' + JSON.stringify({
  newTruths: [{ subject: 'the blockade', fact: CLOCK_FACT }], stateChanges: [], sceneFrame: { location: 'the picket line', present: ['Kira'], situation: 'The noose tightens' },
}) + '\n```';
const GALLEY_NARRATION = 'The galley smells of burnt caf. The dockmaster waves from the hatch.\n```json\n' + JSON.stringify({
  newTruths: [{ subject: 'the dockmaster', fact: GALLEY_FACT }], stateChanges: [], sceneFrame: { location: "the ship's galley", present: ['Kira', 'the dockmaster'], situation: 'Breakfast and bad news' },
}) + '\n```';

let table;
const world = () => table.world.campaignState();

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false,
    campaignState: {
      ...CampaignStateSchema, sessionActive: false, sessionStartedId: null, currentSessionId: 'bs-s1',
      sessionNumber: 1, lastSessionTimestamp: new Date().toISOString(), safetyFlags: [],
      currentSceneId: null, sceneTruths: [], sceneState: { bySubject: {}, sceneId: null }, sceneFrame: null,
      clocks: [{ _id: 'ck-syndicate', name: 'The Syndicate closes in', type: 'campaign', segments: 6, filled: 2, advanceOdds: 'likely', active: true, createdAt: new Date().toISOString() }],
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  scriptClaude(table, { fallback: (call) => {
    if (call.model !== NARRATION_MODEL) return '{}';
    return /The clock "/.test(call.userText) ? CLOCK_NARRATION : GALLEY_NARRATION;
  } });
});

async function begin() {
  table.client('gm-1').answerDialogs(d => d.submit({ 'input[name="vignette"]': false, 'input[name="galleyVignette"]': true }));
  await table.client('gm-1').chat('!begin-session');
}

describe('PROBE NARRATION-02 CONCURRENT-SCENE-MINT', () => {
  it('Begin a Session with an advancing campaign clock: one scene, with both vignettes\' facts in it', async () => {
    // Hold the GM's scene-start writes while they are "in flight" (each a
    // server round trip in Foundry); release them in the order they were sent.
    const held = [];
    table.interceptWrites(w => {
      if (!(campaignStateWrite('gm-1')(w) && typeof w.value?.currentSceneId === 'string')) return undefined;
      if (held.length >= 2) return undefined;
      const gate = deferred();
      held.push({ sceneId: w.value.currentSceneId, gate });
      return gate.promise;
    });

    await begin();
    await table.settle();                                     // everything not blocked on a held write is quiet

    const minted = [...new Set(held.map(h => h.sceneId))];
    for (const h of held) { h.gate.resolve(undefined); await table.settle(); }
    await table.drain();

    // controls: both vignettes narrated and posted
    expect(table.cards(f => f.clockVignetteCard)).toHaveLength(1);
    expect(table.cards(f => f.sessionVignetteCard && f.vignetteKind === 'galley_begin')).toHaveLength(1);
    expect(table.claude.calls.filter(c => c.model === NARRATION_MODEL)).toHaveLength(2);

    // Expected: one scene was started for the Begin, and the world holds both
    // vignettes' facts under it. Today: two scene ids were written (one per
    // vignette), and the vignette on the losing scene had its sidecar
    // dropped by the "scene changed meanwhile" guard.
    expect.soft(minted).toHaveLength(1);                      // today: two scene ids written for one Begin
    expect(world().currentSceneId).toMatch(/^sc-/);
    expect(world().sceneTruths.map(t => t.fact).sort()).toEqual([CLOCK_FACT, GALLEY_FACT].sort());
  }, 30_000);

  it('control: with the galley vignette off, the clock vignette alone opens the scene and records its beat', async () => {
    table.client('gm-1').answerDialogs(d => d.submit({ 'input[name="vignette"]': false, 'input[name="galleyVignette"]': false }));
    await table.client('gm-1').chat('!begin-session');
    await table.settle(); await table.drain();

    expect(table.cards(f => f.clockVignetteCard)).toHaveLength(1);
    expect(world().currentSceneId).toMatch(/^sc-/);
    expect(world().sceneTruths.map(t => t.fact)).toEqual([CLOCK_FACT]);
  }, 30_000);
});
