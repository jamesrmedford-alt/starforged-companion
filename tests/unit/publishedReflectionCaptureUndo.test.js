/**
 * STARFORGED COMPANION
 * tests/unit/publishedReflectionCaptureUndo.test.js
 *
 * Issue #335 Y03 (XCARD-REFLECTION-CAPTURE-UNSTAMPED, the narration side) — a
 * player publishes a reflection from the Private Channel; it is canon (issue
 * #286 D1), so on the canonical GM registerPublishedReflectionHook runs the
 * tier pass ~2 s later and the NPC it names gains a Narrator-added detail.
 * The table then plays the X-Card on it. publishToMainChat minted no
 * narration id and the hook scheduled the capture with none, so the detail
 * stayed on the NPC's card. The card now carries a `narrationId` and the hook
 * hands it to the capture (issue #329 X01; U07 full exclusion).
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));

import { apiPost } from '../../src/api-proxy.js';
import { registerPublishedReflectionHook, runNarrationTierUpdate, postNarrationCard } from '../../src/narration/narrator.js';
import { publishToMainChat } from '../../src/private-channel/publish.js';
import { suppressScene } from '../../src/context/safety.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const SESSION = 'sess-7';
const stored = () => game.settings.get(MODULE_ID, 'campaignState');
const syncChat = () => { global.game.messages = { contents: ChatMessage._created.slice() }; };

const REFLECTION = 'Vex held the prisoner down while the torch came out, and did not look away.';
const DETAIL     = 'Held the prisoner down for the torch.';

const GM = { id: 'gm-1', isGM: true, active: true };
const PL = { id: 'pl-1', isGM: false, active: true };

const reply = (text) => ({ content: [{ type: 'text', text }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'end_turn' });

let vex;

beforeAll(() => {
  // Registered once, as src/index.js's ready hook does.
  registerPublishedReflectionHook();
});

beforeEach(() => {
  vi.clearAllMocks();
  ChatMessage._reset();
  game.settings._store.clear();
  game.actors._reset();
  global.game.messages = { contents: [] };
  global.game.users = Object.assign([GM, PL], { get: (id) => [GM, PL].find(u => u.id === id) ?? null });
  global.game.user = GM;
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
  game.settings._store.set(KEY, {
    currentSessionId: SESSION, sessionNumber: 7, currentSceneId: 'sc-1',
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' }, sceneFrame: null,
    xCardActive: false, xCardPlays: 0, dismissedEntities: [],
    connectionIds: ['npc-vex'], factionIds: [], settlementIds: [], locationIds: [], planetIds: [], shipIds: [], creatureIds: [],
  });
  vex = makeTestActor({ id: 'npc-vex', name: 'Vex', type: 'character', hasPlayerOwner: false,
    flags: { [MODULE_ID]: { entityType: 'connection', connection: { name: 'Vex', role: 'enforcer', generativeTier: [] } } } });
  game.actors._set(vex.id, vex);
  // The tier pass's Haiku reply names Vex's development; every other call is a no-op.
  apiPost.mockImplementation(async (_url, _headers, body) => {
    const user = String(body?.messages?.[0]?.content ?? '');
    if (/established entity records/.test(user)) {
      return reply(JSON.stringify({ updates: [{ entityId: 'npc-vex', detail: DETAIL, salience: 'defining' }] }));
    }
    return reply('{"contradictions":[]}');
  });
});
afterEach(() => { vi.useRealTimers(); });

const tierDetails = () => (vex.getFlag(MODULE_ID, 'connection').generativeTier ?? []).map(e => e.detail);

/** Let the capture's 2 s timer fire and its Haiku call and record write settle. */
async function runCapture() {
  await vi.advanceTimersByTimeAsync(2_100);
  vi.useRealTimers();
  for (let i = 0; i < 8; i++) await new Promise(r => setTimeout(r, 2));
}

describe('issue #335 Y03 — the X-Card on a published reflection undoes its capture', () => {
  it("the X-Card on a published reflection drops the tier detail its capture wrote", async () => {
    vi.useFakeTimers();
    const card = await publishToMainChat({ userId: 'pl-1', content: REFLECTION });
    expect(card?.flags?.[MODULE_ID]?.publishedReflection).toBe(true);
    // The stub's ChatMessage.create fires no hooks: the ready hook's handler is called as Foundry would.
    Hooks.call('createChatMessage', card);
    await runCapture();
    // The capture recorded the development on Vex's card.
    expect(tierDetails()).toEqual([DETAIL]);
    syncChat();

    expect(await suppressScene({}, { local: true })).toBe(true);
    // The card itself left narrator memory …
    expect(card.flags?.[MODULE_ID]?.xCarded).toBe(true);
    // … and so did the detail its capture wrote.
    expect(tierDetails()).toEqual([]);
  });

  it('control: the same text captured as a narration (with its id) loses its detail on the X-Card', async () => {
    const cs = stored();
    const card = await postNarrationCard(REFLECTION, { moveId: 'compel', outcome: 'weak_hit', _id: 'res-1' }, cs,
      { playerText: 'I watch Vex.', playerName: 'Kira', narrationId: 'nar-1' });
    expect(card.flags[MODULE_ID].narrationId).toBe('nar-1');
    await runNarrationTierUpdate(REFLECTION, cs, { narrationId: 'nar-1' });
    expect(tierDetails()).toEqual([DETAIL]);
    syncChat();

    expect(await suppressScene({}, { local: true })).toBe(true);
    expect(tierDetails()).toEqual([]);
  });
});
