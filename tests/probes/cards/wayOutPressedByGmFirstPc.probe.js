/**
 * PROBE — CARDS-08 WAY-OUT-BATTLE-AS-FIRST-PC (tenth audit, area cards)
 *
 * What the user does: at a two-PC table (Ren, created first; Kira) Kira's
 * Enter the Fray posts the "⚔ A fight looms — Raiders" threshold card for
 * her (its `actorId`, issue #329 X06). The GM presses "🚪 Find another way",
 * then "🏃 Slip away (Face Danger)" on the way-out card it posts.
 *
 * What happens: the way-out card carries no roller, and applyWayOutPick
 * (src/moves/cardActions.js) speaks as the PRESSER's PC — the relayed
 * `actorId` from clickerActorId() (src/index.js), which for a GM resolves to
 * the campaign's first PC (resolveUserActorId: "the first PC only for a GM").
 * So Kira's escape is rolled as Ren's Face Danger: Ren's stat, Ren's
 * momentum, a Pay the Price on Ren on a miss. The combat-track card's
 * "⚔ Battle instead" (applyCombatTrackBattle, relayedClickerPc) has the
 * same shape: the GM's press rolls the first PC's Battle for a fight Kira
 * entered. This is issue #329 X05's defect ("a GM pressing one on a
 * crewmate's card at a two-PC table rolls the move as the first PC") at the
 * two sites its fix did not reach — the threshold's own follow-ups.
 *
 * What should happen: a card's forced follow-up is the card's roller's move,
 * whoever presses it (decisions.md → issue #329 X05; "Multiplayer
 * attribution"): the way-out card carries the threshold card's `actorId`
 * and its off-ramp speaks as that PC (Kira); the combat-track card made from
 * her threshold carries her too.
 *
 * Control: the same way-out pressed by Kira's own player rolls it as Kira.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/cards/wayOutPressedByGmFirstPc.probe.js
 */

/* global silenceConsoleErrors, structuredClone */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../../src/moves/abilityScanner.js', async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';
import { buildCombatThresholdHtml } from '../../../src/moves/combatThreshold.js';

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

describe('CARDS-08 the GM presses the follow-ups of Kira\'s threshold card', () => {
  it('"Find another way" then "Slip away" rolls Kira\'s Face Danger, not the first PC\'s', async () => {
    const id = await postKirasThreshold();
    await press('gm-1', id, '[data-action="sf-way-out"]');
    const [wayOut] = table.cards(f => f.wayOutCard);
    expect(wayOut, 'the way-out card was posted').toBeTruthy();

    await press('gm-1', wayOut._id, '[data-action="sf-way-out-move"]', 0);      // 🏃 Slip away (Face Danger)
    const [post] = forced('face_danger');
    expect(post, 'the off-ramp was posted').toBeTruthy();
    // Expected: Kira's escape — the card's roller. Actual: speaker "pc-ren", the campaign's first PC.
    expect(post.speaker?.actor ?? null).toBe('pc-kira');
  }, 30_000);

  it('"⚔ Battle instead" on the combat-track card made from her threshold rolls Kira\'s Battle', async () => {
    table.journal._set(makeTracksJournal([{ id: 'fight-1', label: 'Raiders', type: 'combat', rank: 'dangerous', ticks: 0, completed: false }]));
    const id = await gmPosts({
      content: `<div class="sf-ptp-card"><p>Created combat track <strong>Raiders</strong>.</p>`
        + `<button type="button" data-action="sf-battle" class="entity-btn">⚔ Battle instead</button></div>`,
      flags: { [MODULE_ID]: { combatTrackCard: true, created: true, trackId: 'fight-1', trackLabel: 'Raiders' } },
    });
    await press('gm-1', id, '[data-action="sf-battle"]');
    const [post] = forced('battle');
    expect(post, 'the Battle was posted').toBeTruthy();
    expect(post.speaker?.actor ?? null).toBe('pc-kira');                // actual: "pc-ren"
  }, 30_000);

  it('control: the way-out pressed by Kira\'s own player rolls it as Kira', async () => {
    const id = await postKirasThreshold();
    await press('pl-1', id, '[data-action="sf-way-out"]');
    const [wayOut] = table.cards(f => f.wayOutCard);
    expect(wayOut).toBeTruthy();
    await press('pl-1', wayOut._id, '[data-action="sf-way-out-move"]', 0);
    expect(forced('face_danger')[0]?.speaker?.actor ?? null).toBe('pc-kira');
  }, 30_000);
});
