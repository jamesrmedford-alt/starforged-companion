/**
 * STARFORGED COMPANION
 * tests/unit/xcardPostRace.test.js
 *
 * XCARD-POST-RACE (the #300 F13 shape). A narration whose reply passes its
 * interrupted check just before the X-Card is played applies its sidecar and
 * posts its card one ChatMessage.create round trip later — after the pause's
 * handler ran. The pause's pick answered the beat the table could see (the
 * card on its way was not in chat yet), and the late card then posted
 * unflagged, its facts live, into a paused scene. Every narrator path stands
 * down while the X-Card is active, so the canonical GM now removes a
 * narration card created while it is active, as the X-Card removes one
 * (registerXCardLatePostHook).
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn(async () => ({ content: [{ type: 'text', text: '{"contradictions":[]}' }] })) }));

import { applyNarratorSidecar, postNarrationCard } from '../../src/narration/narrator.js';
import { suppressScene, registerXCardLatePostHook } from '../../src/context/safety.js';
import { readFileSync } from 'node:fs';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const SESSION = 'sess-5';
const stored   = () => game.settings.get(MODULE_ID, 'campaignState');
const syncChat = () => { global.game.messages = { contents: ChatMessage._created.slice() }; };
const ticks = async (n = 10) => { for (let i = 0; i < n; i++) await new Promise(r => setTimeout(r, 0)); };

beforeAll(() => { registerXCardLatePostHook(); });

beforeEach(() => {
  ChatMessage._reset();
  game.settings._store.clear();
  global.game.messages = { contents: [] };
  global.game.users = Object.assign([{ id: 'gm-1', isGM: true, active: true }], {
    get: (id) => (id === 'gm-1' ? { id: 'gm-1', isGM: true, active: true } : null),
  });
  global.game.user = global.game.users[0];
  game.settings._store.set(KEY, {
    currentSessionId: SESSION, sessionNumber: 5, currentSceneId: 'sc-1',
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' }, sceneFrame: null,
    xCardActive: false, xCardPlays: 0, dismissedEntities: [],
  });
});

const sidecar = (fact) => `\n\`\`\`json\n${JSON.stringify({ newTruths: [{ subject: 'Vance', fact }], stateChanges: [] })}\n\`\`\``;
const truthOf = (fact) => stored().sceneTruths.find(t => t.fact === fact);

/** The narrator's order: the sidecar applied, then — a round trip later — the card, whose creation fires the hook. */
async function postCard(narrationId, text) {
  const card = await postNarrationCard(text, { moveId: 'compel', outcome: 'weak_hit', _id: `res-${narrationId}` },
    stored(), { playerText: 'I press him.', playerName: 'Kira', narrationId });
  syncChat();
  Hooks.call('createChatMessage', card, {}, 'gm-1');
  await ticks();
  return card;
}

describe('XCARD-POST-RACE — a narration whose card posts after the pause is removed with it', () => {
  it('the late card is flagged, its truth retracted and its id kept for the capture', async () => {
    const t1 = applyNarratorSidecar(`Vance glares across the table.${sidecar('Is angry')}`, stored(), { narrationId: 'nar-1' });
    await postCard('nar-1', t1);
    await ChatMessage.create({ content: 'I lean in.', flags: {} });   // a new beat
    syncChat();

    // nar-2's reply passed its check; its sidecar is applied; its card is on its way …
    const t2 = applyNarratorSidecar(`Vance draws a knife and lunges.${sidecar('Drew a knife')}`, stored(), { narrationId: 'nar-2' });
    // … when the X-Card lands: its pick answers the beat the table can see.
    expect(await suppressScene({}, { local: true })).toBe(true);
    expect(stored().xCardedNarrationIds).toEqual(['nar-1']);

    const late = await postCard('nar-2', t2);

    expect(late.flags[MODULE_ID].xCarded).toBe(true);
    expect(stored().xCardedNarrationIds).toEqual(['nar-1', 'nar-2']);
    expect(truthOf('Drew a knife')).toMatchObject({ retracted: true, retractedBy: 'xcard' });
    expect(stored().xCardActive).toBe(true);                          // still paused
  });

  it('control: with no X-Card in force the card stays live', async () => {
    const t1 = applyNarratorSidecar(`Vance draws a knife and lunges.${sidecar('Drew a knife')}`, stored(), { narrationId: 'nar-2' });
    const card = await postCard('nar-2', t1);
    expect(card.flags[MODULE_ID].xCarded).toBeUndefined();
    expect(truthOf('Drew a knife')).toMatchObject({ retracted: false });
  });

  it('control: a fallback card or the paused notice posted during the pause is left alone', async () => {
    game.settings._store.set(KEY, { ...stored(), xCardActive: true, xCardPlays: 1 });
    const fallback = await ChatMessage.create({ content: 'Face Danger: Miss — narration unavailable.', flags: { [MODULE_ID]: {
      narratorCard: true, narrationText: 'Face Danger: Miss — narration unavailable.', narrationFallback: true, sessionId: SESSION,
    } } });
    Hooks.call('createChatMessage', fallback, {}, 'gm-1');
    await ticks();
    expect(fallback.flags[MODULE_ID].xCarded).toBeUndefined();
    expect(stored().xCardedNarrationIds ?? []).toEqual([]);
  });

  it('the hook is registered at ready', () => {
    const src = readFileSync('src/index.js', 'utf8');
    expect(src).toMatch(/registerXCardLatePostHook\(\);/);
  });
});
