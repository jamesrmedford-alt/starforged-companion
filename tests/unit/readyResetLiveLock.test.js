/**
 * STARFORGED COMPANION
 * tests/unit/readyResetLiveLock.test.js
 *
 * Issue #335 Y07 (READY-RESET-RELEASES-LIVE-LOCK) — a second GM's world load
 * leaves a connected GM's live move lock alone.
 *
 * A two-GM table: Gus (gm-2) runs the night alone — the canonical GM — and a
 * player's move is being narrated, so gm-2's pipeline holds the move lock
 * (`pendingMoveBy: "gm-2"`, its claim token). Gina (gm-1, the lower id, in
 * the keyed-GM registry) loads the world mid-narration and is canonical at
 * once. Her ready hook reset the lock as one "left set if Foundry was closed
 * mid-move" without looking at its claimant: the next typed line would run a
 * second pipeline beside gm-2's. The ready reset now follows the W25
 * handover's rule — the claimant's departure is the event that matters: it
 * clears a lock that names nobody, this client's own earlier page's, or a
 * user's who is not connected, and only while the store still holds it.
 *
 * (Converted from the tenth audit's probe
 * tests/probes/session/readyResetReleasesLiveLock.probe.js.)
 *
 * LOCK-RESURRECTED-BY-COGM-STALE-WRITE (found while fixing Y07): with fact
 * continuity on, gm-2's narration relays its side-data to gm-1 (canonical by
 * then), whose ledger persist merges onto her cache. Built from a cache one
 * delivery behind gm-2's release and landing after it, the write carried
 * `pendingMove: true` and gm-2's claim back: the lock held until gm-2 left or
 * reloaded. Every writer takes the lock from its store, but a store can lag
 * the world by a delivery, so the claimant puts back what it last wrote: it
 * remembers the claims it released and releases one a write carries back —
 * or, when a later move of its own holds the lock, restores that claim.
 */

/* global silenceConsoleErrors */
import { describe, it, expect, afterEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ finalize: null }));
vi.mock('../../src/pacing/router.js', async (orig) => ({
  ...(await orig()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (orig) => ({
  ...(await orig()), interpretMove: vi.fn(async (text) => ({
    moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'iron', adds: 0, rationale: 'test',
    mischiefApplied: false, playerNarration: text, inputMethod: 'chat',
  })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (orig) => ({
  ...(await orig()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (orig) => ({
  ...(await orig()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../src/narration/narrator.js', async (orig) => ({
  ...(await orig()),
  // A test may hold the session roll's summary finalise (an await inside the ready mint).
  finalizeSessionSummary: vi.fn(async () => { if (control.finalize) await control.finalize; }),
  getCampaignRecap:       vi.fn(async () => ''),
  postCampaignRecap:      vi.fn(async () => ''),
}));

import { simulateTable, USERS } from '../helpers/multiClient.js';
import { scriptClaude, deferred, campaignStateWrite } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

let table;
afterEach(() => { control.finalize = null; table?.teardown(); });

const world = () => table.world.campaignState();
const LINE = 'Kira slips past the sentry and forces the hatch open.';

function liveSession(extra = {}) {
  return {
    ...CampaignStateSchema, sessionActive: true, sessionActiveStartedAt: new Date().toISOString(),
    currentSessionId: 'rl-s1', sessionStartedId: 'rl-s1', sessionNumber: 1,
    lastSessionTimestamp: new Date().toISOString(), currentSceneId: null, sceneTruths: [], clocks: [],
    ...extra,
  };
}

const SETTINGS = { chronicleAutoEntry: false, narratorSessionSummary: false, autoRecapEnabled: false };

/** gm-1 loads a world whose stored lock is `lock`, alone with a player. */
async function loadWithLock(lock, extra = {}) {
  table = await simulateTable({
    users: [USERS.GM, USERS.P1], boot: false,
    world: { settings: { ...SETTINGS, campaignState: liveSession({ ...lock, ...extra }) } },
  });
  await table.client('gm-1').boot();
  await table.client('pl-1').boot();
  await table.settle(); await table.drain();
}

describe('issue #335 Y07 — the ready-time stale-lock reset', () => {
  it("gm-2 (canonical, alone) is narrating a move when gm-1 loads: gm-2's live lock stands until gm-2 releases it", async () => {
    silenceConsoleErrors();
    // gm-1 is away: gm-2 is the canonical GM and runs the pipeline. Both GMs
    // have played keyed before, so both are in the world's keyed-GM registry
    // (advertiseClaudeKeyPresence never removes a keyed GM who is merely
    // offline): gm-1 is the canonical GM the moment she is active.
    // Fact continuity is off here: with it on, gm-2's narration relays its
    // side-data to gm-1 (canonical by then), whose whole-object write can land
    // within one delivery of gm-2's release and carry its cached lock back —
    // the two-GM concurrent-write limitation (issue #299), not this finding.
    table = await simulateTable({
      users: [{ ...USERS.GM, active: false }, USERS.GM2, USERS.P1],
      world: { settings: { ...SETTINGS, 'factContinuity.enabled': false, keyedGmUserIds: ['gm-1', 'gm-2'], campaignState: liveSession() } },
      clientSettings: { 'gm-1': { claudeApiKey: 'sk-ant-test' } },
    });
    await table.setClaudeKey('gm-2', 'sk-ant-test');
    table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
    const claude = scriptClaude(table);
    const held = claude.hold(() => true);                 // the move's narration, in flight on gm-2

    await table.client('pl-1').chat(LINE, { speaker: { actor: 'pc-kira' } });
    await held.arrived;
    await table.settle();

    expect(world().pendingMove).toBe(true);               // gm-2's pipeline holds the lock
    expect(world().pendingMoveBy).toBe('gm-2');
    const claim = world().pendingMoveClaim;
    expect(typeof claim).toBe('string');

    // gm-1 arrives mid-move: a fresh page load, canonical from now on.
    await table.join('gm-1');
    await table.settle();

    // gm-2 is connected and mid-move, so its lock stands — claimant and token.
    expect(world().pendingMove).toBe(true);
    expect(world().pendingMoveBy).toBe('gm-2');
    expect(world().pendingMoveClaim).toBe(claim);

    // gm-2's narration returns: its own release (its claim) frees the table.
    held.release();
    await table.drain();
    expect(world().pendingMove).toBe(false);
  }, 60_000);

  it("control: a lock held by a GM who is no longer connected is released by the next canonical GM's load", async () => {
    silenceConsoleErrors();
    await loadWithLock({ pendingMove: true, pendingMoveBy: 'gm-9', pendingMoveClaim: 'crashed-claim' });

    expect(world().pendingMove).toBe(false);              // the stale lock is cleared
    expect(world().pendingMoveBy).toBeNull();
    expect(world().pendingMoveClaim).toBeNull();
  }, 60_000);

  it("control: the GM's own lock from before a reload (Foundry closed mid-move) is released at its load", async () => {
    silenceConsoleErrors();
    await loadWithLock({ pendingMove: true, pendingMoveBy: 'gm-1', pendingMoveClaim: 'my-old-page' });

    expect(world().pendingMove).toBe(false);
    expect(world().pendingMoveClaim).toBeNull();
  }, 60_000);

  it('control: a lock from before the claimant was stamped is released at load', async () => {
    silenceConsoleErrors();
    await loadWithLock({ pendingMove: true, pendingMoveBy: null, pendingMoveClaim: null });

    expect(world().pendingMove).toBe(false);
  }, 60_000);

  it('a move claimed while the load is still minting the session keeps its lock', async () => {
    silenceConsoleErrors();
    // A session idle past the gap: the load closes it out (its summary
    // finalise, held here) before minting the next — the stale lock's reset
    // is written with the mint.
    const finalise = deferred();
    control.finalize = finalise.promise;
    table = await simulateTable({
      users: [USERS.GM, USERS.P1], boot: false,
      world: { settings: { ...SETTINGS, campaignState: liveSession({
        pendingMove: true, pendingMoveBy: 'gm-9', pendingMoveClaim: 'crashed-claim',
        lastSessionTimestamp: new Date(Date.now() - 6 * 3600_000).toISOString(),
      }) } },
    });
    await table.client('gm-1').boot();

    // Meanwhile a move claims the lock — the pipeline's own claim, a fresh token.
    await table.client('gm-1').setSetting('campaignState', { ...world(), pendingMove: true, pendingMoveBy: 'gm-1', pendingMoveClaim: 'live-claim' });
    finalise.resolve();
    await table.settle(); await table.drain();

    expect(world().currentSessionId).not.toBe('rl-s1');    // the mint landed …
    expect(world().pendingMove).toBe(true);               // … and left the live claim alone
    expect(world().pendingMoveClaim).toBe('live-claim');
  }, 60_000);
});

// A narration whose side-data gives the canonical GM a ledger write to make.
const NARRATION = 'Kira forces the hatch; it gives with a groan.\n```json\n'
  + '{"newTruths":[{"subject":"hatch","fact":"The hatch is forced open."}],"stateChanges":[]}\n```';
const isNarration = (call) => /NARRATOR ROLE|SIDECAR/.test(call?.system ?? '');
const holdsTheTruth = (state) => (state?.sceneTruths ?? []).some(t => /forced open/.test(t?.fact ?? t?.text ?? ''));

/** A world write the test lets land only after `gate`. */
function landsAfter(gate) { return gate.promise.then(() => undefined); }

describe('LOCK-RESURRECTED-BY-COGM-STALE-WRITE — a released claim a stale write carries back', () => {
  it("fact continuity on: gm-1's relayed ledger write, built before gm-2's release reached her, does not hold the lock again", async () => {
    silenceConsoleErrors();
    // The Y07 table above, with fact continuity on (its default).
    table = await simulateTable({
      users: [{ ...USERS.GM, active: false }, USERS.GM2, USERS.P1],
      world: { settings: { ...SETTINGS, keyedGmUserIds: ['gm-1', 'gm-2'], campaignState: liveSession() } },
      clientSettings: { 'gm-1': { claudeApiKey: 'sk-ant-test' } },
    });
    await table.setClaudeKey('gm-2', 'sk-ant-test');
    table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
    const claude = scriptClaude(table);
    const held = claude.hold(isNarration);                // the move's narration, in flight on gm-2

    await table.client('pl-1').chat(LINE, { speaker: { actor: 'pc-kira' } });
    await held.arrived;
    await table.settle();
    const claim = world().pendingMoveClaim;
    expect(world().pendingMoveBy).toBe('gm-2');

    await table.join('gm-1');                             // canonical from now on
    await table.settle();
    expect(world().pendingMoveClaim).toBe(claim);         // Y07: gm-2's live lock stands

    // The write order the race needs, made deterministic: gm-2's release
    // waits until gm-1 has built her ledger write — from a cache that still
    // holds gm-2's lock — and her write lands after the release.
    const gm1Built = deferred();
    const releaseLanded = deferred();
    table.onEvent((e) => {
      if (e.type === 'write' && e.outcome === 'applied' && e.kind === 'setting' && e.client === 'gm-2'
        && world().pendingMove === false) releaseLanded.resolve();
    });
    let ledgerWrite = null;
    table.interceptWrites((w) => {
      if (!campaignStateWrite()(w)) return undefined;
      if (w.client === 'gm-1' && w.value.pendingMoveClaim === claim && holdsTheTruth(w.value)) {
        ledgerWrite = w.value;
        gm1Built.resolve();
        return landsAfter(releaseLanded);
      }
      if (w.client === 'gm-2' && w.value.pendingMove === false) return landsAfter(gm1Built);
      return undefined;
    });

    held.release(NARRATION);
    await table.drain();

    // The race happened: gm-1's write carried gm-2's claim, after the release.
    expect(ledgerWrite?.pendingMove).toBe(true);
    expect(holdsTheTruth(world())).toBe(true);            // her ledger write landed …
    expect(world().pendingMove).toBe(false);              // … and the lock is free again
    expect(world().pendingMoveBy).toBeNull();
    expect(world().pendingMoveClaim).toBeNull();
  }, 60_000);

  it("a later move's claim the stale write overwrote is put back, and released by its own move", async () => {
    silenceConsoleErrors();
    // gm-1 runs the table (canonical); gm-2 is a co-GM whose write is built
    // while gm-1's first move holds the lock and lands once a second move holds it.
    table = await simulateTable({
      users: [USERS.GM, USERS.GM2, USERS.P1],
      world: { settings: { ...SETTINGS, campaignState: liveSession() } },
      clientSettings: { 'gm-1': { claudeApiKey: 'sk-ant-test' } },
    });
    table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
    const claude = scriptClaude(table);
    const first = claude.hold(isNarration);

    await table.client('pl-1').chat(LINE, { speaker: { actor: 'pc-kira' } });
    await first.arrived;
    await table.settle();
    const c1 = world().pendingMoveClaim;
    expect(world().pendingMoveBy).toBe('gm-1');

    // gm-2's write (a GM-side store write: a dismissed name), built now — its
    // cache holds c1 — is held, and lands once a second move holds the lock.
    const gm2Lands = deferred();
    table.interceptWrites((w) => (campaignStateWrite('gm-2')(w) ? landsAfter(gm2Lands) : undefined));
    const stale = table.client('gm-2').run(() => game.settings.set('starforged-companion', 'campaignState',
      { ...game.settings.get('starforged-companion', 'campaignState'), dismissedEntities: ['Vex'] }));

    first.release();
    await table.drain();
    expect(world().pendingMove).toBe(false);              // the first move released c1

    const second = claude.hold(isNarration);
    await table.client('pl-1').chat('Kira hauls herself through the hatch.', { speaker: { actor: 'pc-kira' } });
    await second.arrived;                                 // the second move holds its claim, parked at its narration
    await table.settle();
    const c2 = world().pendingMoveClaim;
    expect(world().pendingMove).toBe(true);
    expect(c2).not.toBe(c1);

    gm2Lands.resolve();
    await stale;                                          // gm-2's write lands, carrying c1 over c2
    await table.settle();

    expect(world().dismissedEntities).toEqual(['Vex']);   // gm-2's own change stands
    expect(world().pendingMove).toBe(true);               // the second move's lock is held …
    expect(world().pendingMoveClaim).toBe(c2);            // … under its own claim, not c1's
    expect(world().pendingMoveBy).toBe('gm-1');

    second.release();
    await table.drain();
    expect(world().pendingMove).toBe(false);              // its own release frees the table
    expect(world().pendingMoveClaim).toBeNull();
    expect(world().dismissedEntities).toEqual(['Vex']);
  }, 60_000);
});
