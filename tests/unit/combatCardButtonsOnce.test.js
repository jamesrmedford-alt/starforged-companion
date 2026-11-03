/**
 * The combat card's ⚔ Battle and the way-out card's off-ramps resolve once
 * per card, on every client and across a re-render (issue #325 W11).
 *
 * Both posted their forced move from the clicker's client and disabled only
 * that DOM button: a re-render, or another player's client, rolled the move
 * again — a second Battle on a closed fight (its +2 momentum again), a second
 * off-ramp. Each press now relays to the canonical GM, which claims the card
 * (`battleClaimed`, `wayOutTaken`) before posting the move once.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [] }));
vi.mock('../../src/moves/interpreter.js', async (original) => ({
  ...(await original()),
  // The forced move's stat-only reading (enrichForcedMoveStat): +iron.
  interpretMove: vi.fn(async (text) => ({ moveId: 'battle', moveName: 'Battle', statUsed: 'iron', adds: 0,
    rationale: 'test', mischiefApplied: false, playerNarration: text })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (original) => ({
  ...(await original()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (original) => ({
  ...(await original()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../src/moves/resolver.js', async (original) => {
  const real = await original();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, 'random');
    for (const value of control.dice) rng.mockReturnValueOnce(value);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

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

describe('one forced move per combat card', () => {
  it('after a re-render, a second click does not roll Battle again on the closed fight', async () => {
    const cardId = await beginFight();
    await clickBattle('pl-1', cardId);
    expect(battles()).toHaveLength(1);
    expect(tracks()[0].completed).toBe(true);                  // the fight is over
    expect(kira.system.momentum.value).toBe(4);                // +2 for the strong hit

    await clickBattle('pl-1', cardId, { rerender: true });     // the card rendered again: the button is armed
    expect(battles()).toHaveLength(1);
    expect(kira.system.momentum.value).toBe(4);
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
    expect(faced()).toHaveLength(1);
    expect(table.world.message(card.id).flags[MODULE_ID].wayOutTaken).toBe('face_danger');
  }, 30_000);

  it('another player\'s client still shows Battle armed after the fight was resolved', async () => {
    const cardId = await beginFight();
    await clickBattle('pl-1', cardId);
    await clickBattle('pl-2', cardId);
    expect(battles()).toHaveLength(1);
  }, 30_000);
});
