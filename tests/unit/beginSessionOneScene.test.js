/**
 * STARFORGED COMPANION
 * tests/unit/beginSessionOneScene.test.js
 *
 * Issue #335 Y05 (CONCURRENT-SCENE-MINT) — one scene for one Begin.
 *
 * Begin a Session with the galley vignette on, a campaign clock whose Ask the
 * Oracle roll advances it, and no scene open: applyBeginSession fired the
 * clock vignette and the galley vignette from two setTimeout(0)s, each on its
 * own working copy (issue #329 X09). Each ran ensureSceneStarted →
 * startScene: the first read the store (no scene), minted `sc-A` and awaited
 * its write — a server round trip; the second read the same store inside it
 * (still no scene — adoptStoredScene found nothing) and minted `sc-B`. The
 * write that landed last owned the world, and the vignette on the losing
 * scene had its sidecar dropped by persistSceneLedgerFields ("the scene
 * changed meanwhile") although its card posted. Now scene starts run one at
 * a time (a start waits for the one in flight, then adopts it), and the
 * galley runs after the clock vignettes, reading its copy once they are done.
 *
 * The harness applies a world write synchronously, so the round trip is
 * modelled by holding the GM's scene-start writes (a write whose scene the
 * world does not have yet) until everything else is quiet, then releasing
 * them in the order they were sent — the order Foundry's server applies them.
 *
 * (From the tenth audit's probe
 * tests/probes/narration/beginSessionTwoScenes.probe.js; the `!pay-the-price`
 * site and startScene's own serialisation are in sceneStartSerialised.test.js.)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

// The campaign clock's Ask the Oracle always says yes (a stateless leaf).
vi.mock('../../src/oracles/roller.js', async (orig) => ({
  ...(await orig()),
  rollYesNo: vi.fn((odds) => ({ odds, threshold: 75, roll: 7, tens: 0, ones: 7, answer: 'yes', isMatch: false, question: '' })),
}));

import { simulateTable, USERS } from '../helpers/multiClient.js';
import { scriptClaude, campaignStateWrite, deferred } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';
const CLOCK_FACT  = 'The Syndicate blockade has tightened around Haven';
const GALLEY_FACT = 'Owes the crew a favour';
const CLOCK_NARRATION  = 'Another freighter turns back at the picket line.\n```json\n' + JSON.stringify({
  newTruths: [{ subject: 'the blockade', fact: CLOCK_FACT }],
  stateChanges: [{ subject: 'the picket line', attribute: 'condition', value: 'tightening' }],
  sceneFrame: { location: 'the picket line', present: ['Kira'], situation: 'The noose tightens' },
}) + '\n```';
const GALLEY_NARRATION = 'The galley smells of burnt caf. The dockmaster waves from the hatch.\n```json\n' + JSON.stringify({
  newTruths: [{ subject: 'the dockmaster', fact: GALLEY_FACT }], stateChanges: [],
  sceneFrame: { location: "the ship's galley", present: ['Kira', 'the dockmaster'], situation: 'Breakfast and bad news' },
}) + '\n```';

let table;
const world = () => table.world.campaignState();
const isClockCall = (call) => /The clock "/.test(call.userText);

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
});

/** Hold each GM write that starts a scene the world does not have yet, until released. */
function holdSceneStarts() {
  const held = [];
  table.interceptWrites(w => {
    if (!campaignStateWrite('gm-1')(w)) return undefined;
    const scene = w.value?.currentSceneId;
    if (typeof scene !== 'string' || scene === (world()?.currentSceneId ?? null)) return undefined;
    const gate = deferred();
    held.push({ sceneId: scene, gate });
    return gate.promise;
  });
  return held;
}

async function begin({ galley = true } = {}) {
  table.client('gm-1').answerDialogs(d => d.submit({ 'input[name="vignette"]': false, 'input[name="galleyVignette"]': galley }));
  await table.client('gm-1').chat('!begin-session');
}

describe('issue #335 Y05 — one scene for one Begin a Session', () => {
  it("an advancing campaign clock and the galley vignette: one scene, with both vignettes' facts in it", async () => {
    scriptClaude(table, { fallback: (call) => (call.model !== NARRATION_MODEL ? '{}' : isClockCall(call) ? CLOCK_NARRATION : GALLEY_NARRATION) });
    const held = holdSceneStarts();

    await begin();
    await table.settle();                                   // everything not blocked on a held write is quiet
    const minted = [...new Set(held.map(h => h.sceneId))];
    for (const h of held) { h.gate.resolve(undefined); await table.settle(); }
    await table.drain();

    // both vignettes narrated and posted
    expect(table.cards(f => f.clockVignetteCard)).toHaveLength(1);
    expect(table.cards(f => f.sessionVignetteCard && f.vignetteKind === 'galley_begin')).toHaveLength(1);
    expect(table.claude.calls.filter(c => c.model === NARRATION_MODEL)).toHaveLength(2);

    // One scene was started for the Begin, and the world holds both vignettes' facts under it.
    expect(minted).toHaveLength(1);
    expect(world().currentSceneId).toBe(minted[0]);
    expect(world().sceneTruths.map(t => t.fact).sort()).toEqual([CLOCK_FACT, GALLEY_FACT].sort());
    expect(world().sceneTruths.every(t => t.sceneId === minted[0])).toBe(true);
    // The galley read its copy after the clock vignette: the clock's state stands beside it.
    expect(Object.keys(world().sceneState.bySubject)).toContain('the picket line');
    expect(world().sceneFrame?.location).toBe("the ship's galley");
  }, 30_000);

  it('the galley vignette narrates after the clock vignette — its Claude call waits for the clock card', async () => {
    const claude = scriptClaude(table, { fallback: (call) => (call.model !== NARRATION_MODEL ? '{}' : isClockCall(call) ? CLOCK_NARRATION : GALLEY_NARRATION) });
    const clockCall = claude.hold(call => call.model === NARRATION_MODEL && isClockCall(call));

    await begin();
    await clockCall.arrived;
    await table.settle();
    // The clock vignette is in flight: the galley has asked for nothing yet.
    expect(table.claude.calls.filter(c => c.model === NARRATION_MODEL && !isClockCall(c))).toHaveLength(0);

    clockCall.release(CLOCK_NARRATION);
    await table.settle(); await table.drain();
    const posted = table.cards(f => f.clockVignetteCard || (f.sessionVignetteCard && f.vignetteKind === 'galley_begin'));
    expect(posted.map(c => (c.flags['starforged-companion'].clockVignetteCard ? 'clock' : 'galley'))).toEqual(['clock', 'galley']);
  }, 30_000);

  it('control: with the galley vignette off, the clock vignette alone opens the scene and records its beat', async () => {
    scriptClaude(table, { fallback: (call) => (call.model !== NARRATION_MODEL ? '{}' : CLOCK_NARRATION) });
    await begin({ galley: false });
    await table.settle(); await table.drain();

    expect(table.cards(f => f.clockVignetteCard)).toHaveLength(1);
    expect(world().currentSceneId).toMatch(/^sc-/);
    expect(world().sceneTruths.map(t => t.fact)).toEqual([CLOCK_FACT]);
  }, 30_000);
});
