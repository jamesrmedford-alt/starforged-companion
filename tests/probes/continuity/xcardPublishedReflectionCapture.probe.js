/**
 * PROBE — CONT-03 XCARD-REFLECTION-CAPTURE-UNSTAMPED
 *
 * What the user does: a player publishes a reflection from the Private
 * Channel ("Vex smiled when the prisoner screamed…"). A published reflection
 * is canon (issue #286 D1): its card carries the narrator flag family, and
 * the canonical GM's registerPublishedReflectionHook runs the tier pass for
 * the recorded entities it names — Vex's card gains a Narrator-added detail.
 * Another player plays the X-Card on it.
 *
 * What happens: the X-Card picks the reflection card (it is the newest
 * narrator card in memory) and flags it `xCarded`, but the card carries no
 * `narrationId` (publish.js mints none) and the hook calls
 * scheduleNarrationCapture without one, so the tier detail it wrote carries
 * none either: retractNarrationCapture is never even called (no ids), and
 * Vex's card keeps the removed reflection's detail for every later prompt.
 *
 * What should happen: a published reflection is a narration in every memory
 * surface (ring, rolling summary, tier pass), so the X-Card must undo its
 * capture as it undoes any narration's (issue #329 X01; rules/narrator-
 * memory.md 6b — "a new capture writer takes the id from its caller"): the
 * published card carries a narration id, the hook hands it to the capture,
 * and the X-Card drops the detail.
 *
 * Control: the same detail written by a narrator card's capture, stamped with
 * its narration id, leaves Vex's card when that narration is X-carded.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/continuity/xcardPublishedReflectionCapture.probe.js
 */

/* global makeTestActor, setImmediate */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../src/api-proxy.js', () => ({
  apiPost: vi.fn(async (_url, _headers, body) => {
    const prompt = String(body?.messages?.[0]?.content ?? '');
    const text = prompt.includes('Given the following established entity records')
      ? JSON.stringify({ updates: [{ entityId: 'npc-vex', detail: 'Smiled when the prisoner screamed.', salience: 'significant' }] })
      : '{"contradictions":[]}';
    return { content: [{ type: 'text', text }], stop_reason: 'end_turn' };
  }),
}));

import { postNarrationCard, registerPublishedReflectionHook, runNarrationTierUpdate } from '../../../src/narration/narrator.js';
import { publishToMainChat } from '../../../src/private-channel/publish.js';
import { suppressScene } from '../../../src/context/safety.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const SESSION = 'sess-7';
const stored   = () => game.settings.get(MODULE_ID, 'campaignState');
const syncChat = () => { global.game.messages = { contents: ChatMessage._created.slice() }; };
const flush    = async () => { for (let i = 0; i < 30; i++) await new Promise(r => setImmediate(r)); };

let vex;
beforeEach(() => {
  ChatMessage._reset();
  game.settings._store.clear();
  game.actors._reset();
  global.game.messages = { contents: [] };
  const users = [{ id: 'gm-1', isGM: true, active: true }, { id: 'pl-1', isGM: false, active: true, name: 'Dana' }];
  global.game.users = Object.assign(users, { get: (id) => users.find(u => u.id === id) ?? null });
  global.game.user = users[0];
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-probe');   // the tier pass's Haiku call
  vex = makeTestActor({ id: 'npc-vex', name: 'Vex', type: 'character', hasPlayerOwner: false,
    flags: { [MODULE_ID]: { entityType: 'connection', connection: { name: 'Vex', generativeTier: [] } } } });
  game.actors._set(vex.id, vex);
  game.settings._store.set(KEY, {
    currentSessionId: SESSION, sessionNumber: 7, currentSceneId: 'sc-1',
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' }, sceneFrame: null,
    xCardActive: false, xCardPlays: 0, dismissedEntities: [],
    connectionIds: ['npc-vex'], factionIds: [], settlementIds: [], locationIds: [], planetIds: [], shipIds: [], creatureIds: [],
  });
});
afterEach(() => { vi.useRealTimers(); });

const REFLECTION = 'Vex smiled when the prisoner screamed. I will not forget that.';
const vexDetails = () => (vex.getFlag(MODULE_ID, 'connection').generativeTier ?? []).map(e => e.detail);

/** The player publishes; the canonical GM's createChatMessage hook captures it (after the module's 2 s delay). */
async function publishAndCapture() {
  registerPublishedReflectionHook();
  const card = await publishToMainChat({ userId: 'pl-1', content: REFLECTION });
  expect(card?.flags?.[MODULE_ID]?.publishedReflection).toBe(true);
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  Hooks.call('createChatMessage', card);       // the stub's ChatMessage.create fires no hooks
  await vi.advanceTimersByTimeAsync(2500);
  vi.useRealTimers();
  await flush();
  return card;
}

describe('CONT-03 — the X-Card on a published reflection undoes the tier details its capture wrote', () => {
  it("control: a narrator card's capture is stamped, and the X-Card on that narration drops its detail", async () => {
    await postNarrationCard(REFLECTION, { moveId: 'compel', outcome: 'weak_hit', _id: 'res-1' }, stored(),
      { playerText: 'I watch Vex.', playerName: 'Kira', narrationId: 'nar-1' });
    await runNarrationTierUpdate(REFLECTION, stored(), { narrationId: 'nar-1' });   // scheduleNarrationCapture with an id
    expect(vexDetails()).toEqual(['Smiled when the prisoner screamed.']);
    syncChat();

    expect(await suppressScene({}, { local: true })).toBe(true);
    expect(vexDetails()).toEqual([]);
  });

  it('the published reflection\'s detail leaves Vex\'s card when the reflection is X-carded', async () => {
    const card = await publishAndCapture();
    expect(vexDetails(), 'control: the hook ran the tier pass').toEqual(['Smiled when the prisoner screamed.']);
    syncChat();

    expect(await suppressScene({}, { local: true })).toBe(true);
    // The X-Card did answer the reflection: its card is the one flagged removed.
    expect(card.flags?.[MODULE_ID]?.xCarded, 'the published card is flagged xCarded').toBe(true);
    expect.soft(card.flags?.[MODULE_ID]?.narrationId ?? null, 'the published card carries a narration id').not.toBeNull();
    expect.soft(vex.getFlag(MODULE_ID, 'connection').generativeTier?.[0]?.narrationId ?? null, 'the detail carries the narration id').not.toBeNull();
    expect(vexDetails(), 'Narrator-added details on Vex\'s card after the X-Card').toEqual([]);
  });
});
