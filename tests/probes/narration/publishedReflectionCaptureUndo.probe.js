/**
 * PROBE — NARRATION-03 PUBLISHED-REFLECTION-CAPTURE-NO-ID
 *
 * What the user does: a player publishes a reflection from the Private
 * Channel (Publish… → the ◈ "<PC> — private reflection" card). Published
 * text is canon (issue #286 D1): the card carries the narrator flag family,
 * and on the canonical GM `registerPublishedReflectionHook` runs the tier
 * pass for the recorded entities it names, ~2 s later — the NPC it names
 * gets a "Narrator-added" detail on their card. The table then plays the
 * X-Card on that reflection.
 *
 * What happens: the X-Card picks the published card (it is the newest
 * narrator card in memory — xCardedNarrationCards) and flags it `xCarded`, so
 * it leaves the ring and the rolling summary. But the capture was scheduled
 * with no narration id — `registerPublishedReflectionHook` calls
 * `scheduleNarrationCapture(f.narrationText, campaignState)` with no
 * `narrationId` (src/narration/narrator.js), and the card carries none — so
 * the tier detail it wrote is unstamped and `retractNarrationCapture` (issue
 * #329 X01) cannot find it: the removed content stays on the NPC's card and
 * is handed back to the narrator as NARRATOR-ADDED on every ENTITIES IN
 * SCENE card from then on. Every other capture writer (move, paced, @scene,
 * oracle follow-up, session vignettes, the vow scene, the inciting incident)
 * takes the id from its caller; the published reflection is the one left
 * out — rules/narrator-memory.md 6b: "Anything a narration writes outside the
 * ledgers carries its `narrationId` so the X-Card can undo it too … and so
 * does everything its capture records".
 *
 * What should happen: the published card carries a narration id (its hook
 * passes it to the capture), and the X-Card on it drops the tier detail it
 * wrote, as it does for a narration's (issue #329 X01; the U07 decision:
 * full exclusion).
 *
 * Controls: the X-Card flags the published card `xCarded`; the same text
 * captured as a narration with an id loses its detail on the X-Card.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/narration/publishedReflectionCaptureUndo.probe.js
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

vi.mock('../../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));

import { apiPost } from '../../../src/api-proxy.js';
import { registerPublishedReflectionHook, runNarrationTierUpdate, postNarrationCard } from '../../../src/narration/narrator.js';
import { publishToMainChat } from '../../../src/private-channel/publish.js';
import { suppressScene } from '../../../src/context/safety.js';

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

describe('PROBE NARRATION-03 PUBLISHED-REFLECTION-CAPTURE-NO-ID', () => {
  it("the X-Card on a published reflection drops the tier detail its capture wrote", async () => {
    vi.useFakeTimers();
    const card = await publishToMainChat({ userId: 'pl-1', content: REFLECTION });
    expect(card?.flags?.[MODULE_ID]?.publishedReflection).toBe(true);
    // The stub's ChatMessage.create fires no hooks: the ready hook's handler is called as Foundry would.
    Hooks.call('createChatMessage', card);
    await runCapture();
    // control: the capture recorded the development on Vex's card
    expect(tierDetails()).toEqual([DETAIL]);
    syncChat();

    expect(await suppressScene({}, { local: true })).toBe(true);
    // control: the card itself left narrator memory
    expect.soft(card.flags?.[MODULE_ID]?.xCarded).toBe(true);
    // Expected: the removed reflection's detail is gone from Vex's card.
    // Today: it stays — the capture carried no narration id to undo it by.
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
