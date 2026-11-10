/**
 * PROBE — CONT-5 XCARD-CLEARS-KEPT-FRAME (LOSE-STATE / WRONG-DETAIL)
 *
 * The narrator emits the scene frame on every response and applySceneFrame
 * replaces it whole (ledgers.js ~404 — no `previous` kept). retractNarrations
 * (ledgers.js ~370) then clears a frame an X-carded narration wrote:
 * `if (sceneFrame && ids.has(sceneFrame.narrationId)) sceneFrame = null`.
 * So after ANY X-Card on a narration that emitted a frame (practically every
 * one), the scene has no frame at all — the kept narration's "Where / Present /
 * Now" is gone, though the frame is a never-dropped tier ("losing 'where we are
 * and who is here' is how drift starts" — narratorPrompt.js; rules/narrator-
 * memory.md invariant 4) and its `present` cast is what keeps the conversation
 * partner's card in scope (addSceneFrameCast). This is W41's defect
 * (XCARD-LOSES-EARLIER-STATE: "retracting narration B left no value" — fixed
 * for state values with a bounded `previous` chain) on the frame, its sibling
 * the fix did not cover. The redirect narration — the first after Resume — is
 * built with no SCENE FRAME block. At scene end resolveScenePlace then finds no
 * frame location either.
 * Control: the kept narration's state value IS restored (W41's chain).
 *
 * Harness: tests/unit/xcardRetractionOutlivesScene.test.js's (single GM).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/api-proxy.js', () => ({ apiPost: vi.fn(async () => ({ content: [{ type: 'text', text: '{"contradictions":[]}' }] })) }));

import { applyNarratorSidecar, postNarrationCard } from '../../../src/narration/narrator.js';
import { suppressScene } from '../../../src/context/safety.js';
import { buildLedgerBlock } from '../../../src/narration/narratorPrompt.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const SESSION = 'sess-4';
const stored   = () => game.settings.get(MODULE_ID, 'campaignState');
const syncChat = () => { global.game.messages = { contents: ChatMessage._created.slice() }; };

beforeEach(() => {
  ChatMessage._reset();
  game.settings._store.clear();
  global.game.messages = { contents: [] };
  global.game.users = Object.assign([{ id: 'gm-1', isGM: true, active: true }], {
    get: (id) => (id === 'gm-1' ? { id: 'gm-1', isGM: true, active: true } : null),
  });
  global.game.user = global.game.users[0];
  game.settings._store.set(KEY, {
    currentSessionId: SESSION, sessionNumber: 4, currentSceneId: 'sc-1',
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' }, sceneFrame: null,
    xCardActive: false, xCardPlays: 0, dismissedEntities: [],
  });
});

/** A narration as the narrator makes one: its sidecar (frame and state) applied under its id, then its card. */
async function narrate(narrationId, { sceneFrame, stateChanges = [] }) {
  const text = applyNarratorSidecar(
    `The dock hums.\n\`\`\`json\n${JSON.stringify({ newTruths: [], stateChanges, sceneFrame })}\n\`\`\``,
    stored(), { narrationId },
  );
  await postNarrationCard(text, { moveId: 'compel', outcome: 'weak_hit', _id: `res-${narrationId}` },
    stored(), { playerText: 'I haggle.', playerName: 'Kira', narrationId });
}
const someoneSpeaks = () => ChatMessage.create({ content: 'I look around.', flags: {} });
const playXCard = async () => { syncChat(); expect(await suppressScene({}, { local: true })).toBe(true); };

const KEPT_FRAME = { location: "Bleakhold's docking ring", present: ['Vance'], situation: 'Haggling over the fuel price' };
const REMOVED_FRAME = { location: "Bleakhold's docking ring", present: ['Vance'], situation: 'Vance has a knife at the child\'s throat' };

describe("CONT-5 — an X-Card leaves the scene with no frame, the kept narration's lost", () => {
  it("control: the kept narration's state value comes back (W41's previous chain)", async () => {
    await narrate('nar-1', { sceneFrame: KEPT_FRAME, stateChanges: [{ subject: 'Vance', attribute: 'location', value: 'the fuel pumps' }] });
    await someoneSpeaks();
    await narrate('nar-2', { sceneFrame: REMOVED_FRAME, stateChanges: [{ subject: 'Vance', attribute: 'location', value: 'the cargo cage' }] });
    await playXCard();
    expect(stored().sceneState.bySubject.vance?.[0]?.value).toBe('the fuel pumps');
  });

  it("the kept narration's frame is the scene's again after the X-Card on the narration that replaced it", async () => {
    await narrate('nar-1', { sceneFrame: KEPT_FRAME });
    expect(stored().sceneFrame).toMatchObject({ location: KEPT_FRAME.location, narrationId: 'nar-1' });
    await someoneSpeaks();
    await narrate('nar-2', { sceneFrame: REMOVED_FRAME });
    await playXCard();                                         // on nar-2 alone (someone spoke between)
    expect(stored().xCardedNarrationIds).toEqual(['nar-2']);

    expect(stored().sceneFrame?.situation ?? null).toBe(KEPT_FRAME.situation);
    expect(buildLedgerBlock(stored(), {}).frame).toContain("Bleakhold's docking ring");
  });
});
