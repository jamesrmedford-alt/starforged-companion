/**
 * Issue #345 D4 PLAYER-TRUTH-SET-OVER-XCARD (the twelfth audit's CONT-7 — the
 * maintainer chose option A).
 *
 * W60 refuses a player's `!truth set` over a GM's strike ("only a GM can
 * restore it"), and an X-Card retraction is stronger than a strike: never
 * lifted, never named (rules/narrator-memory.md 6b; issue #331 X31). Yet a
 * PLAYER's `!truth set` of the very fact the X-Card removed was recorded as a
 * live, binding truth — in the active scene (findBareStrike passes over
 * `retractedBy: "xcard"`) and in a later scene (the lift's lookup leaves the
 * unnamed blocks out) — and from then on every prompt named it under TRUTHS.
 * Now setTruth refuses a non-GM set that matches an active-scene X-Card
 * retraction or one of the session's blocks (findSessionBlock) — which since
 * AA05 hold a GM's Replace originals too, so a player's set of the wording
 * the GM replaced is refused, in its scene and later ones, as a set over a
 * GM's strike is. A GM's own set is still recorded (decisions.md "What the
 * X-Card removed stays blocked for the session").
 *
 * Harness: tests/unit/xcardRetractionOutlivesScene.test.js's (single GM; the
 * player's command arrives as the relay handler's requesterIsGM: false).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn(async () => ({ content: [{ type: 'text', text: '{"contradictions":[]}' }] })) }));

import { applyNarratorSidecar, postNarrationCard } from '../../src/narration/narrator.js';
import { suppressScene } from '../../src/context/safety.js';
import { endScene, persistSceneLedgerFields } from '../../src/factContinuity/sceneLifecycle.js';
import { applyFactContinuityCommand } from '../../src/factContinuity/chatCommands.js';
import { replaceTruth } from '../../src/factContinuity/ledgers.js';
import { propagateRetraction } from '../../src/factContinuity/retractions.js';
import { buildLedgerBlock } from '../../src/narration/narratorPrompt.js';

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
const said = (fact) => String(fact).trim().replace(/[.!?\s]+$/, '').toLowerCase();
const liveTruths = (fact) => stored().sceneTruths.filter(t => said(t.fact) === said(fact) && !t.retracted);
const playXCard = async () => { syncChat(); expect(await suppressScene({}, { local: true })).toBe(true); };
const resume = () => { game.settings._store.set(KEY, { ...stored(), xCardActive: false }); };
const nextScene = async () => {
  await endScene(foundry.utils.deepClone(stored()), { reason: 'scene_command' });
  game.settings._store.set(KEY, { ...stored(), currentSceneId: 'sc-2', sceneState: { bySubject: {}, sceneId: 'sc-2' } });
};
const binding = () => /Vance — Is dead/.test(buildLedgerBlock(stored(), {}).truths);
/** The GM's Replace in the correction dialog: on a copy, persisted as the dialog persists it. */
async function gmReplaces(fact, wording) {
  const working = foundry.utils.deepClone(stored());
  const replaced = replaceTruth(working.sceneTruths.find(t => t.fact === fact).id, { fact: wording }, working, { isGM: true, actor: 'gm' });
  await propagateRetraction(replaced.struck, working);
  await persistSceneLedgerFields(working, ['sceneTruths'], 'test replace');
}

describe("issue #345 D4 — a player's `!truth set` cannot make what the X-Card removed binding again", () => {
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

  it('the card tells the player why — without naming the removed fact — and a full stop does not slip past (AA26)', async () => {
    await narrate('nar-1', [{ subject: 'Vance', fact: DEAD }]);
    await playXCard();
    resume();
    const inScene = await player(`!truth set "Vance" ${DEAD}.`);
    await nextScene();
    const later = await player(`!truth set "Vance" is DEAD.`);
    expect(liveTruths(DEAD)).toEqual([]);
    for (const line of [inScene, later]) {
      expect(line).toMatch(/taken out of the story this session; only a GM can set it again/);
      expect(line).not.toMatch(/dead/i);
    }
  });

  it("a player's set of the wording the GM replaced is refused too, in its scene and later — the GM's correction stands", async () => {
    await narrate('nar-1', [{ subject: 'Vance', fact: DEAD }]);
    await gmReplaces(DEAD, 'Is badly wounded');
    expect(await player(`!truth set "Vance" ${DEAD}`)).toMatch(/only a GM can set it again/);
    await nextScene();
    expect(await player(`!truth set "Vance" ${DEAD}`)).toMatch(/only a GM can set it again/);
    expect(liveTruths(DEAD)).toEqual([]);
    await gm(`!truth set "Vance" ${DEAD}`);                    // the GM may
    expect(liveTruths(DEAD).map(t => t.asserter)).toEqual(['gm']);
  });

  it("control: a player's set of another fact about the subject is recorded", async () => {
    await narrate('nar-1', [{ subject: 'Vance', fact: DEAD }]);
    await playXCard();
    resume();
    await player('!truth set "Vance" Owes the crew a favour');
    expect(liveTruths('Owes the crew a favour').map(t => t.asserter)).toEqual(['player']);
  });

  it("control: a player's own strike they set back is still lifted (W60) — no block", async () => {
    await narrate('nar-1', [{ subject: 'Vance', fact: DEAD }]);
    await player(`!truth strike ${stored().sceneTruths[0].id.slice(0, 8)}`);
    expect(await player(`!truth set "Vance" ${DEAD}`)).toMatch(/strike on it is lifted/);
    expect(liveTruths(DEAD).map(t => t.asserter)).toEqual(['player']);
  });

  it('control: the block is the session\'s — in the next session a player may set the fact', async () => {
    await narrate('nar-1', [{ subject: 'Vance', fact: DEAD }]);
    await playXCard();
    resume();
    await nextScene();
    game.settings._store.set(KEY, { ...stored(), currentSessionId: 'sess-5', sessionNumber: 5, currentSceneId: 'sc-9', sceneTruths: [] });
    await player(`!truth set "Vance" ${DEAD}`);
    expect(liveTruths(DEAD).map(t => t.asserter)).toEqual(['player']);
  });
});
