/**
 * Issue #335 Y11 — WAY-OUT-BATTLE-AS-FIRST-PC.
 *
 * At a two-PC table (Ren, created first; Kira) Kira's Enter the Fray posts
 * "⚔ A fight looms — Raiders" for her (its `actorId`, issue #329 X06). The GM
 * presses "🚪 Find another way", then "🏃 Slip away (Face Danger)" on the
 * way-out card. The way-out card carried no roller and applyWayOutPick spoke
 * as the PRESSER's PC — for a GM the campaign's first PC — so Kira's escape
 * was rolled as Ren's Face Danger (Ren's stat, momentum, Pay the Price). The
 * combat-track card made from her threshold ("⚔ Battle instead",
 * applyCombatTrackBattle) had the same shape. A card's forced follow-up is
 * the card's roller's move, whoever presses it (issue #329 X05): the
 * threshold's roller now rides onto both cards, and their player or a GM may
 * press — the clicker's PC stands in only on a card that names no roller.
 *
 * Control: the way-out pressed by Kira's own player rolls it as Kira.
 */

/* global silenceConsoleErrors, structuredClone */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../src/moves/abilityScanner.js', async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { buildCombatThresholdHtml } from '../../src/moves/combatThreshold.js';

let table;
const forced = (moveId) => table.cards(f => f.forcedMoveId === moveId);

function makeTracksJournal(tracks = []) {
  const store = { [`${MODULE_ID}.tracks`]: structuredClone(tracks) };
  return {
    id: 'tracks-journal', name: 'Starforged Progress Tracks',
    getFlag: (mod, key) => store[`${mod}.${key}`],
    setFlag: async (mod, key, value) => { store[`${mod}.${key}`] = structuredClone(value); },
  };
}

const gmPosts = (data) => table.client('gm-1').run(() => globalThis.ChatMessage.create(data)).then(async (m) => { await table.settle(); return m.id; });

async function press(userId, id, selector, index = 0) {
  table.client(userId).click(id, selector, { index });
  await table.settle(); await table.drain();
}

/** Kira's threshold card, as her Enter the Fray posts it (its actorId is hers — issue #329 X06). */
const postKirasThreshold = () => gmPosts({
  content: buildCombatThresholdHtml({ label: 'Raiders', suggestedRank: 'dangerous', vowNames: [] }),
  flags: { [MODULE_ID]: { combatThresholdCard: true, label: 'Raiders', position: null, actorId: 'pc-kira', resolutionId: 'res-1' } },
});

/** "🚪 Find another way" on Kira's threshold card, pressed by `userId`: the way-out card it posts. */
async function wayOutFrom(userId) {
  const id = await postKirasThreshold();
  await press(userId, id, '[data-action="sf-way-out"]');
  const [wayOut] = table.cards(f => f.wayOutCard);
  expect(wayOut, 'the way-out card was posted').toBeTruthy();
  return wayOut;
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'wo-s1', sessionNumber: 1,
      currentSceneId: 'wo-scene', sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  // Ren first: the campaign's "first PC" — what a GM's own press resolves to.
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, hasPlayerOwner: true });
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, hasPlayerOwner: true });
  scriptClaude(table, { fallback: () => 'The raiders close in.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
  silenceConsoleErrors();
});

describe('issue #335 Y11 — the follow-ups of Kira\'s threshold card are Kira\'s moves', () => {
  it('the GM\'s "Find another way" then "Slip away" rolls Kira\'s Face Danger, not the first PC\'s', async () => {
    const wayOut = await wayOutFrom('gm-1');
    expect(wayOut.flags[MODULE_ID].actorId, 'the way-out card carries the threshold\'s roller').toBe('pc-kira');

    await press('gm-1', wayOut._id, '[data-action="sf-way-out-move"]', 0);      // 🏃 Slip away (Face Danger)
    const [post] = forced('face_danger');
    expect(post, 'the off-ramp was posted').toBeTruthy();
    expect(post.speaker?.actor ?? null).toBe('pc-kira');
  }, 30_000);

  it('the GM\'s "⚔ Battle instead" on the combat-track card made from her threshold rolls Kira\'s Battle', async () => {
    table.journal._set(makeTracksJournal([]));
    const id = await postKirasThreshold();
    await press('gm-1', id, '[data-action="sf-enter-fray"]');                  // the fight's track and its card
    const [trackCard] = table.cards(f => f.combatTrackCard);
    expect(trackCard, 'the combat-track card was posted').toBeTruthy();
    expect(trackCard.flags[MODULE_ID]).toMatchObject({ created: true, actorId: 'pc-kira' });

    await press('gm-1', trackCard._id, '[data-action="sf-battle"]');
    const [post] = forced('battle');
    expect(post, 'the Battle was posted').toBeTruthy();
    expect(post.speaker?.actor ?? null).toBe('pc-kira');
  }, 30_000);

  it('another player\'s press of Kira\'s off-ramp is refused — nothing rolled, the card left open', async () => {
    const wayOut = await wayOutFrom('pl-2');                                     // anyone may take the threshold's choice (X06)
    await press('pl-2', wayOut._id, '[data-action="sf-way-out-move"]', 0);
    expect(forced('face_danger')).toHaveLength(0);
    expect(table.world.message(wayOut._id).flags[MODULE_ID].wayOutTaken ?? null).toBe(null);
  }, 30_000);

  it('a way-out card that names no roller (an older card) rolls the presser\'s own PC', async () => {
    const id = await gmPosts({
      content: '<div class="sf-ptp-card"><button type="button" data-action="sf-way-out-move" data-move-id="face_danger">🏃 Slip away</button></div>',
      flags: { [MODULE_ID]: { wayOutCard: true } },
    });
    await press('pl-2', id, '[data-action="sf-way-out-move"]', 0);
    expect(forced('face_danger')[0]?.speaker?.actor ?? null).toBe('pc-ren');
  }, 30_000);

  it('control: the way-out pressed by Kira\'s own player rolls it as Kira', async () => {
    const wayOut = await wayOutFrom('pl-1');
    await press('pl-1', wayOut._id, '[data-action="sf-way-out-move"]', 0);
    expect(forced('face_danger')[0]?.speaker?.actor ?? null).toBe('pc-kira');
  }, 30_000);
});
