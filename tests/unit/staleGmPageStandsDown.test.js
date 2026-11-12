/**
 * STARFORGED COMPANION
 * tests/unit/staleGmPageStandsDown.test.js
 *
 * Issue #347 AB19-STALE-CACHE-WRITES — a GM page whose connection dropped
 * stands down until it reloads.
 *
 * A world write that lands while a client's socket is down never reaches that
 * client's cache, and a reconnect replays nothing. AB19 discarded a narration
 * that straddled the drop, but the move the page was resolving still saved its
 * record and freed its lock from that cache — campaignState is written whole,
 * so an X-Card pause the page missed was written away for the table, and so
 * was anything else it missed. Now a page whose connection dropped is stale
 * (src/multiplayer/connectionWatch.js): it is never the canonical GM, writes no
 * campaignState and no Batch Mode round, tells the table it stood down, and
 * asks its GM to reload — a persistent notice and a Reload button. Another GM
 * takes over what it held, as from a GM who left; with none, the table waits
 * for the reload.
 *
 * (Foundry) the harness's leave / join is a socket that drops and comes back on
 * the same page; table.reload is a page reload.
 */

/* global silenceConsoleErrors */
import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => ({
    moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'iron', adds: 0, rationale: 'test', mischiefApplied: false,
  })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(() => Promise.resolve(true)),
}));

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';
const REPLY = 'The hull groans and holds.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const isNarration = (call) => call.model === NARRATION_MODEL;

let table;
afterEach(() => table?.teardown());

const world = () => table.world.campaignState();
const resolutions = () => table.cards(f => f.moveResolution);
const narrated = () => table.cards(f => f.narratorCard && !f.narrationFallback);

async function seat(users) {
  table = await simulateTable({
    users,
    world: { settings: {
      chronicleAutoEntry: false, narratorSessionSummary: false,
      campaignState: {
        ...CampaignStateSchema,
        sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [],
        lastSessionTimestamp: new Date().toISOString(),
      },
    } },
  });
  for (const u of users) if (u.isGM) await table.setClaudeKey(u.id, `sk-ant-${u.id}`);
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  if (users.some(u => u.id === 'pl-2')) table.addActor({ id: 'pc-ren', name: 'Ren', ownership: { 'pl-2': 3 } });
  silenceConsoleErrors();
}

async function move(line = 'I brace against the hull and push through the breach.') {
  await table.client('pl-1').chat(line, { speaker: { actor: 'pc-kira' } });
  await table.settle();
}

/** Whether `userId`'s client counts itself the canonical GM. */
async function canonical(userId) {
  const client = table.client(userId);
  const gate = await client.import('../../src/multiplayer/gmGate.js');
  return client.run(() => gate.isCanonicalGM());
}

/** A campaignState write from `userId`'s page, through the chain: "written", or the refusal. */
async function writeCampaignState(userId, change) {
  const client = table.client(userId);
  const chain = await client.import('../../src/multiplayer/campaignStateChain.js');
  const out = client.run(() => chain.serialiseCampaignStateWrite(async () => {
    const cs = game.settings.get(MODULE_ID, 'campaignState');
    await game.settings.set(MODULE_ID, 'campaignState', { ...cs, ...change });
  }, 'a test write').then(() => 'written', err => String(err?.message ?? err)));
  await table.settle();
  return out;
}

describe('a GM page whose connection dropped stands down until it reloads (issue #347 AB19-STALE-CACHE-WRITES)', () => {
  it("an X-Card the page missed stands: the move it was resolving saves nothing over the pause", async () => {
    await seat([USERS.GM, USERS.GM2, USERS.P1, USERS.P2]);
    const narration = scriptClaude(table, { fallback: () => REPLY }).hold(isNarration);
    await move();
    await narration.arrived;
    expect(world(), 'gm-1 is narrating the move (setup)').toMatchObject({ pendingMove: true, pendingMoveBy: 'gm-1' });

    await table.leave('gm-1');                         // gm-1's socket drops; gm-2 frees its lock (W25)
    await table.client('pl-2').chat('!x');             // Ren's player plays the X-Card — gm-2 records it
    await table.settle();
    expect(world().xCardActive, 'the pause is in the world (setup)').toBe(true);

    await table.join('gm-1');                          // the same page, its cache without the pause
    narration.release(REPLY);
    await table.settle();
    await table.drain(5_000).catch(() => {});
    await table.settle();

    expect(narrated(), 'nothing narrated under the X-Card').toHaveLength(0);
    expect(world().xCardActive, "the move's record and lock release did not write the pause away").toBe(true);
    expect(world().pendingMove).toBe(false);
  }, 30_000);

  it('the stale page is not the canonical GM, writes no campaignState or round, and asks its GM to reload; the other GM runs the table', async () => {
    await seat([USERS.GM, USERS.GM2, USERS.P1]);
    scriptClaude(table, { fallback: () => REPLY });
    expect(await canonical('gm-1'), 'gm-1 runs the table (setup)').toBe(true);

    await table.leave('gm-1');
    await table.join('gm-1');
    expect(await canonical('gm-1')).toBe(false);
    expect(await canonical('gm-2')).toBe(true);

    expect(await writeCampaignState('gm-1', { sceneTruths: [{ id: 't1', fact: 'from the stale page' }] }))
      .toMatch(/not written — this page lost its connection to the server/);
    expect(world().sceneTruths).toEqual([]);
    const driver = await table.client('gm-1').import('../../src/batch/driver.js');
    const round = await table.client('gm-1').run(() => driver.queueRoundWrite(() => ({ id: 'r-stale', phase: 'collecting', entries: {} }))
      .then(() => 'written', err => String(err?.message ?? err)));
    expect(round).toMatch(/the round was not written — this page lost its connection/);
    expect(table.world.getSetting('batchMode.round') ?? null).toBeNull();

    // Asked to reload: a notice that stays, and a dialog with a Reload button.
    const notices = table.client('gm-1').notifications.filter(n => /connection to the server dropped/.test(n.message));
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ level: 'error', options: { permanent: true } });
    const prompt = table.client('gm-1').dialogs.find(d => d.title === 'Reload this page');
    expect(prompt?.options?.ok?.label).toBe('Reload');
    const savedLocation = globalThis.location;
    const reload = vi.fn();
    globalThis.location = { reload };
    try { prompt.submit(); } finally { globalThis.location = savedLocation; }
    expect(reload).toHaveBeenCalledTimes(1);
    expect(table.client('gm-2').dialogs.find(d => d.title === 'Reload this page'), 'only the stale page is asked').toBeUndefined();

    // gm-2 runs the table meanwhile.
    await move();
    await table.drain();
    expect(resolutions()).toHaveLength(1);
    expect(table.claude.calls.filter(isNarration).map(c => c.client)).toEqual(['gm-2']);

    // The reload: a fresh page, canonical again, that writes.
    await table.reload('gm-1');
    await table.settle();
    expect(await canonical('gm-1')).toBe(true);
    expect(await canonical('gm-2')).toBe(false);
    expect(await writeCampaignState('gm-1', { sceneTruths: [{ id: 't2', fact: 'from the fresh page' }] })).toBe('written');
    expect(world().sceneTruths.map(t => t.id)).toEqual(['t2']);
  }, 30_000);

  it("a drop the server never saw — no GM is seen leaving — still stands the page down, and the other GM frees its move's lock", async () => {
    await seat([USERS.GM, USERS.GM2, USERS.P1]);
    const narration = scriptClaude(table, { fallback: () => REPLY }).hold(isNarration);
    await move();
    await narration.arrived;
    expect(world()).toMatchObject({ pendingMove: true, pendingMoveBy: 'gm-1' });

    // gm-1's socket drops and comes back before the server saw the old one go:
    // the user stays active, so no userConnected fires anywhere.
    const gm1 = table.client('gm-1');
    gm1.emitOwnSocketEvent('disconnect', 'ping timeout');
    gm1.emitOwnSocketEvent('connect');
    await table.settle();

    expect(await canonical('gm-2'), 'gm-1 told the table it stood down').toBe(true);
    expect(world(), "gm-2 freed the stale page's lock").toMatchObject({ pendingMove: false, pendingMoveBy: null });
    expect(table.cards(f => f.moveLockReleasedCard)).toHaveLength(1);

    narration.release(REPLY);                          // gm-1's narration comes back: discarded
    await table.settle();
    await table.drain(5_000).catch(() => {});
    expect(narrated()).toHaveLength(0);

    await move('I slip through the hatch before it seals.');
    await table.drain();
    expect(resolutions()).toHaveLength(2);
    expect(table.claude.calls.filter(isNarration).at(-1).client).toBe('gm-2');
    expect(narrated()).toHaveLength(1);
  }, 30_000);

  it("a sole GM's stale page: the table waits for its reload — a move typed meanwhile is not rolled", async () => {
    await seat([USERS.GM, USERS.P1]);
    scriptClaude(table, { fallback: () => REPLY });
    await table.leave('gm-1');
    await table.join('gm-1');

    await move();
    await table.drain();
    expect(resolutions(), 'nothing runs the table').toHaveLength(0);
    expect(table.client('gm-1').dialogs.filter(d => d.title === 'Reload this page')).toHaveLength(1);

    await table.reload('gm-1');
    await move();
    await table.drain();
    expect(resolutions()).toHaveLength(1);
    expect(narrated()).toHaveLength(1);
  }, 30_000);

  it("an X-Card played while a sole GM's page is stood down says it was not recorded — not \"Scene paused\" — and is recorded once replayed after the reload", async () => {
    await seat([USERS.GM, USERS.P1]);
    scriptClaude(table, { fallback: () => REPLY });
    const xcards = () => table.world.messages().filter(m => m.flags?.[MODULE_ID]?.xcardCard);
    await table.leave('gm-1');
    await table.join('gm-1');

    await table.client('pl-1').chat('!x');
    await table.settle();
    expect(world().xCardActive, 'nothing could record it').toBeFalsy();
    expect(xcards()).toHaveLength(1);
    expect(xcards()[0].flags[MODULE_ID].xcardRecorded).toBe(false);
    expect(xcards()[0].content).toMatch(/could not be recorded — the GM's browser lost its connection/);
    expect(table.client('pl-1').notifications.some(n => /must be reloaded/.test(n.message))).toBe(true);

    await table.reload('gm-1');
    await table.client('pl-1').chat('!x');
    await table.settle();
    expect(world().xCardActive).toBe(true);
    expect(xcards().at(-1).flags[MODULE_ID].xcardRecorded).toBe(true);
  }, 30_000);

  it("the stale GM's own X-Card goes to the GM who runs the table, and is recorded", async () => {
    await seat([USERS.GM, USERS.GM2, USERS.P1]);
    scriptClaude(table, { fallback: () => REPLY });
    await table.leave('gm-1');
    await table.join('gm-1');

    await table.client('gm-1').chat('!x');
    await table.settle();
    expect(world().xCardActive).toBe(true);
  }, 30_000);

  it('control: a page whose connection never dropped is not stale — it runs the table and writes', async () => {
    await seat([USERS.GM, USERS.GM2, USERS.P1]);
    scriptClaude(table, { fallback: () => REPLY });
    expect(await canonical('gm-1')).toBe(true);
    expect(await writeCampaignState('gm-1', { sceneTruths: [{ id: 't0', fact: 'kept' }] })).toBe('written');
    await move();
    await table.drain();
    expect(resolutions()).toHaveLength(1);
    expect(table.client('gm-1').dialogs.filter(d => d.title === 'Reload this page')).toHaveLength(0);
  }, 30_000);
});
