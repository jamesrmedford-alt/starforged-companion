/**
 * PROBE — IP-05 BATTLE-BUTTON-REARMS (eighth audit, area index-pipeline)
 *
 * What the user does: a fight begins (Enter the Fray → the threshold card's
 * Enter the Fray creates the track; createCombatTrackFromThreshold posts the
 * "Enter the Fray" combat-track card with ⚔ Battle instead). A player clicks
 * Battle; the fight is resolved in one roll and its track is closed. Later the
 * card is rendered again (a page reload, the chat log re-rendering, a pop-out)
 * — or another player, whose client never saw the click, looks at it.
 *
 * What happens: wireCombatTrackCardButtons (src/index.js) disables the button
 * in the clicker's DOM only; nothing is stamped on the card. A re-render — or
 * any other client — shows Battle armed again, and a second click posts a
 * second forced Battle. Battle is an action roll, so the pipeline's track-gone
 * check (progress moves only) does not stop it: the fight it names is already
 * closed, and the second Battle rolls anyway — its +2 momentum (strong hit) or
 * its Pay the Price (weak hit / miss) applied a second time for one fight.
 * (Take Decisive Action's and Finish the Expedition's buttons are saved by
 * the track-gone card once their track is closed; Battle is not. Same
 * local-disable family as the excluded WHICH-FIGHT-LOCAL-DISABLE /
 * FULFIL-BUTTON-LOCAL-DISABLE, but a different button with no other guard.)
 *
 * What should happen: one Battle per card — the press claimed on the
 * GM-authored card on the canonical GM (the U02 relay-and-claim shape), or at
 * least refused once the card's fight is closed.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [] }));
vi.mock('../../../src/moves/interpreter.js', async (original) => ({
  ...(await original()),
  // The forced move's stat-only reading (enrichForcedMoveStat): +iron.
  interpretMove: vi.fn(async (text) => ({ moveId: 'battle', moveName: 'Battle', statUsed: 'iron', adds: 0,
    rationale: 'test', mischiefApplied: false, playerNarration: text })),
}));
vi.mock('../../../src/moves/abilityScanner.js', async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../../src/moves/resolver.js', async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, 'random');
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

function makeTracksJournal(tracks = []) {
  const store = { [`${MODULE_ID}.tracks`]: structuredClone(tracks) };
  return {
    id: 'tracks-journal', name: 'Starforged Progress Tracks',
    getFlag: (mod, key) => store[`${mod}.${key}`],
    setFlag: async (mod, key, value) => { store[`${mod}.${key}`] = structuredClone(value); },
  };
}

// Challenge 2 and 3; action 6 + iron 3 = 9: a strong hit (+2 momentum).
const STRONG = [0.15, 0.25, 0.99];

let table;
let kira;

const battles = () => table.cards(f => f.moveResolution).filter(c => /Battle/.test(c.content));
const tracks  = () => table.journal.find(j => j.name === 'Starforged Progress Tracks').getFlag(MODULE_ID, 'tracks');

async function beginFight() {
  const gm = table.client('gm-1');
  await gm.run(() => gm.index.createCombatTrackFromThreshold({ label: 'Corsair boarding party', rank: 'dangerous' }));
  await table.settle();
  const [card] = table.cards(f => f.combatTrackCard);
  return card._id;
}

async function clickBattle(userId, cardId, { rerender = false } = {}) {
  control.dice = STRONG;
  const client = table.client(userId);
  if (rerender) client.render(cardId);
  client.click(cardId, '[data-action="sf-battle"]');
  await table.settle(); await table.drain();
}

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'b-s1', sessionNumber: 1,
      currentSceneId: 'b-scene', sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  kira = table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, system: { momentum: { value: 2, max: 10, min: -6, resetValue: 2 } } });
  table.addActor({ id: 'pc-ren', name: 'Ren', ownership: { 'pl-2': 3 } });
  table.journal._set(makeTracksJournal([]));
  scriptClaude(table, { fallback: () => 'Steel rings.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
});

describe('IP-05 the combat card\'s ⚔ Battle instead resolves its fight once', () => {
  it('after a re-render, a second click does not roll Battle again on the closed fight', async () => {
    const cardId = await beginFight();
    await clickBattle('pl-1', cardId);
    expect(battles()).toHaveLength(1);
    expect(tracks()[0].completed).toBe(true);                  // the fight is over
    expect(kira.system.momentum.value).toBe(4);                // +2 for the strong hit

    await clickBattle('pl-1', cardId, { rerender: true });     // the card rendered again: the button is armed
    expect.soft(battles()).toHaveLength(1);                    // actual: 2 — a second Battle for one fight
    expect.soft(kira.system.momentum.value).toBe(4);           // actual: 6 — its +2 again
  }, 30_000);

  it('the way-out card (threshold card → Find another way) rolls its off-ramp move again after a re-render', async () => {
    const gm = table.client('gm-1');
    const { buildWayOutHtml } = await gm.import('../../src/moves/combatThreshold.js');
    const card = await gm.run(() => globalThis.ChatMessage.create({ content: buildWayOutHtml(), flags: { [MODULE_ID]: { wayOutCard: true } } }));
    await table.settle();
    control.dice = STRONG;
    table.client('pl-1').click(card.id, '[data-action="sf-way-out-move"][data-move-id="face_danger"]');
    await table.settle(); await table.drain();
    const faced = () => table.cards(f => f.moveResolution).filter(c => /Face Danger/.test(c.content));
    expect(faced()).toHaveLength(1);

    control.dice = STRONG;
    table.client('pl-1').render(card.id);
    table.client('pl-1').click(card.id, '[data-action="sf-way-out-move"][data-move-id="face_danger"]');
    await table.settle(); await table.drain();
    expect.soft(faced()).toHaveLength(1);                      // actual: 2 — the off-ramp rolled twice
  }, 30_000);

  it('another player\'s client still shows Battle armed after the fight was resolved', async () => {
    const cardId = await beginFight();
    await clickBattle('pl-1', cardId);
    await clickBattle('pl-2', cardId);
    expect.soft(battles()).toHaveLength(1);                    // actual: 2
  }, 30_000);
});
