/**
 * PROBE — CONT-7 PLAYER-TRUTH-SET-OVER-XCARD (SAFETY / GM-GATE, policy)
 *
 * W60 refuses a player's `!truth set` over a GM's strike ("only a GM can
 * restore it" — ledgers.js setTruth ~736, chatCommands.js ~261), and an
 * X-Card retraction is stronger than a strike: never lifted, never named
 * (rules/narrator-memory.md 6b; issue #331 X31). Yet a PLAYER's `!truth set`
 * of the very fact the X-Card removed is recorded as a live, binding truth —
 * in the active scene (findBareStrike skips `retractedBy: "xcard"`) and in a
 * later scene (setTruth's findSessionStrike lookup leaves the unnamed blocks
 * out) — and from then on every prompt names it under TRUTHS, the help's
 * "they are never named to it" broken by one chat line. decisions.md
 * ("What the X-Card removed stays blocked for the session") rules only on the
 * GM's own set ("still recorded"); a player has no such authority anywhere
 * else in the correction model.
 * Control: the GM's own set is recorded (the decision).
 *
 * Harness: tests/unit/xcardRetractionOutlivesScene.test.js's (single GM; the
 * player's command arrives as the relay handler's requesterIsGM: false).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/api-proxy.js', () => ({ apiPost: vi.fn(async () => ({ content: [{ type: 'text', text: '{"contradictions":[]}' }] })) }));

import { applyNarratorSidecar, postNarrationCard } from '../../../src/narration/narrator.js';
import { suppressScene } from '../../../src/context/safety.js';
import { endScene } from '../../../src/factContinuity/sceneLifecycle.js';
import { applyFactContinuityCommand } from '../../../src/factContinuity/chatCommands.js';
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

const DEAD = 'Is dead';
async function narrate(narrationId, newTruths) {
  const text = applyNarratorSidecar(
    `The airlock cycles.\n\`\`\`json\n${JSON.stringify({ newTruths, stateChanges: [] })}\n\`\`\``,
    stored(), { narrationId },
  );
  await postNarrationCard(text, { moveId: 'compel', outcome: 'weak_hit', _id: `res-${narrationId}` },
    stored(), { playerText: 'I press on.', playerName: 'Kira', narrationId });
}
const player = (text) => applyFactContinuityCommand({ text }, { requesterIsGM: false });
const gm     = (text) => applyFactContinuityCommand({ text }, { requesterIsGM: true });
const liveTruths = (fact) => stored().sceneTruths.filter(t => t.fact === fact && !t.retracted);
const playXCard = async () => { syncChat(); expect(await suppressScene({}, { local: true })).toBe(true); };
const resume = () => { game.settings._store.set(KEY, { ...stored(), xCardActive: false }); };
const nextScene = async () => {
  await endScene(foundry.utils.deepClone(stored()), { reason: 'scene_command' });
  game.settings._store.set(KEY, { ...stored(), currentSceneId: 'sc-2', sceneState: { bySubject: {}, sceneId: 'sc-2' } });
};
const binding = () => /Vance — Is dead/.test(buildLedgerBlock(stored(), {}).truths);

describe("CONT-7 — a player's `!truth set` makes what the X-Card removed binding again", () => {
  it("control: the GM's own set of the removed fact is recorded (decisions.md)", async () => {
    await narrate('nar-1', [{ subject: 'Vance', fact: DEAD }]);
    await playXCard();
    resume();
    await gm(`!truth set "Vance" ${DEAD}`);
    expect(liveTruths(DEAD)).toHaveLength(1);
  });

  it("control: a player's set over a GM's strike is refused (W60)", async () => {
    await narrate('nar-1', [{ subject: 'Vance', fact: DEAD }]);
    await gm(`!truth strike ${stored().sceneTruths[0].id.slice(0, 8)}`);
    await player(`!truth set "Vance" ${DEAD}`);
    expect(liveTruths(DEAD)).toHaveLength(0);
  });

  it("in the X-carded narration's scene, a player's set of the removed fact is not recorded", async () => {
    await narrate('nar-1', [{ subject: 'Vance', fact: DEAD }]);
    await playXCard();
    resume();
    await player(`!truth set "Vance" ${DEAD}`);
    expect({ live: liveTruths(DEAD).map(t => t.asserter), binding: binding() }).toEqual({ live: [], binding: false });
  });

  it("in a later scene of the session, a player's set of the removed fact is not recorded", async () => {
    await narrate('nar-1', [{ subject: 'Vance', fact: DEAD }]);
    await playXCard();
    resume();
    await nextScene();
    await player(`!truth set "Vance" ${DEAD}`);
    expect({ live: liveTruths(DEAD).map(t => t.asserter), binding: binding() }).toEqual({ live: [], binding: false });
  });
});
