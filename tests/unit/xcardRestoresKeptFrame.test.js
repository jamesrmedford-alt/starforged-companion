/**
 * STARFORGED COMPANION
 * tests/unit/xcardRestoresKeptFrame.test.js
 *
 * Issue #345 D3 XCARD-CLEARS-KEPT-FRAME — the twelfth audit's CONT-5 probe;
 * the maintainer chose option A (decisions.md → "The X-Card restores the
 * scene frame its narration replaced").
 *
 * The narrator emits the scene frame on every response, and applySceneFrame
 * replaced it whole, keeping nothing; retractNarrations then cleared a frame
 * an X-carded narration wrote. So after almost any X-Card the scene had no
 * frame at all — the kept narration's "Where / Present / Now" was gone, though
 * the frame is a never-dropped tier and its `present` cast keeps the
 * conversation partner's card in scope (addSceneFrameCast) — and the redirect
 * narration was built with no SCENE FRAME block. W41 (XCARD-LOSES-EARLIER-STATE)
 * had fixed the same for state values with a bounded `previous` chain; U07
 * had recorded the frame's clearing as the choice.
 *
 * Now a frame keeps the frames of its scene it replaced (`previous`, the same
 * bounded chain), and retractNarrations puts back the newest one no removed
 * narration wrote — pruning the removed ones from the chain of a frame that
 * stays. An upgrade's supersede (the same retractNarrations, `by:
 * "superseded"`) reaches a frame down the chain too (resultUpgrade.js
 * ledgersHold walks it).
 *
 * Controls: the kept narration's state value comes back (W41); with no earlier
 * frame the scene is left with none.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn(async () => ({ content: [{ type: 'text', text: '{"contradictions":[]}' }] })) }));

import { applyNarratorSidecar, postNarrationCard } from '../../src/narration/narrator.js';
import { suppressScene } from '../../src/context/safety.js';
import { buildLedgerBlock } from '../../src/narration/narratorPrompt.js';
import { applySceneFrame, retractNarrations } from '../../src/factContinuity/ledgers.js';
import { persistResolution } from '../../src/moves/persistResolution.js';
import { retractSupersededNarrations } from '../../src/moves/resultUpgrade.js';

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

describe("issue #345 D3 — after an X-Card the kept narration's scene frame is the scene's again", () => {
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
  it("a move resolving from a snapshot read before the X-Card does not put the removed frame back over the restored one", async () => {
    await narrate('nar-1', { sceneFrame: KEPT_FRAME });
    await someoneSpeaks();
    await narrate('nar-2', { sceneFrame: REMOVED_FRAME });
    const snapshot = JSON.parse(JSON.stringify(stored()));   // the move pipeline's working copy
    await playXCard();

    await persistResolution({
      _id: 'res-9', moveId: 'face_danger', outcome: 'strong_hit',
      consequences: { momentumChange: 0, healthChange: 0, spiritChange: 0, supplyChange: 0 },
    }, snapshot);

    expect(stored().sceneFrame).toMatchObject({ situation: KEPT_FRAME.situation, narrationId: 'nar-1' });
  });

  it('control: with no earlier frame, the removed narration\'s frame still leaves none', async () => {
    await narrate('nar-2', { sceneFrame: REMOVED_FRAME });
    await playXCard();
    expect(stored().sceneFrame).toBeNull();
  });
});

// The chain itself (ledgers.js applySceneFrame / retractNarrations).
describe('issue #345 D3 — a scene frame keeps the frames it replaced', () => {
  const frame = (n) => ({ location: `place ${n}`, present: [], situation: `beat ${n}` });
  const scene = () => ({ currentSceneId: 'sc-1', sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' }, sceneFrame: null });
  const chain = (f) => { const out = []; for (let cur = f; cur; cur = cur.previous ?? null) out.push(cur.narrationId); return out; };

  it('keeps a bounded chain of this scene\'s frames, newest first; a frame of another scene is not kept', () => {
    const cs = scene();
    for (let n = 1; n <= 7; n++) applySceneFrame(frame(n), cs, { narrationId: `nar-${n}` });
    expect(chain(cs.sceneFrame)).toEqual(['nar-7', 'nar-6', 'nar-5', 'nar-4', 'nar-3']);

    const other = { ...scene(), sceneFrame: { ...frame(0), sceneId: 'sc-0', narrationId: 'nar-0' } };
    applySceneFrame(frame(1), other, { narrationId: 'nar-1' });
    expect(other.sceneFrame.previous).toBeUndefined();
  });

  it('a removed narration\'s frame gives way to the newest kept one, and leaves the chain of a frame that stays', () => {
    const cs = scene();
    applySceneFrame(frame(1), cs, { narrationId: 'nar-1' });
    applySceneFrame(frame(2), cs, { narrationId: 'nar-2' });
    applySceneFrame(frame(3), cs, { narrationId: 'nar-3' });
    const before = cs.sceneFrame;

    retractNarrations(cs, ['nar-2']);                              // not the current frame's
    expect(chain(cs.sceneFrame)).toEqual(['nar-3', 'nar-1']);
    expect(chain(before)).toEqual(['nar-3', 'nar-2', 'nar-1']);    // replaced, never changed in place

    retractNarrations(cs, ['nar-3']);                              // a later X-Card: nar-2 never comes back
    expect(cs.sceneFrame).toMatchObject({ situation: 'beat 1', narrationId: 'nar-1' });

    retractNarrations(cs, ['nar-1']);
    expect(cs.sceneFrame).toBeNull();
  });

  it("an upgrade's supersede reaches a superseded narration's frame down the chain (the store is written)", async () => {
    const cs = scene();
    applySceneFrame(frame(1), cs, { narrationId: 'nar-kept' });
    applySceneFrame(frame(2), cs, { narrationId: 'nar-vignette' });
    applySceneFrame(frame(3), cs, { narrationId: 'nar-later' });
    game.settings._store.set(KEY, { ...stored(), ...cs });

    expect(await retractSupersededNarrations(['nar-vignette'], { label: 'burn' })).toBe(true);
    expect(chain(stored().sceneFrame)).toEqual(['nar-later', 'nar-kept']);
  });
});
