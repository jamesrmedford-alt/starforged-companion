/* global structuredClone, silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/moveCardsFollowTheirRoll.test.js
 *
 * A move's cards follow its roll — the long haul's third live run
 * (explorations/long-haul-live-20261124-0321; the chat as it stood, by step).
 *
 * The cards that say what a roll caused were posted above the roll's own card,
 * and a reader takes the top card for the cause:
 *   a12  "Pay the Price — Gather Information — As stated before the roll: Word
 *        of your hunt spreads…" above "Gather Information +wits … Miss";
 *   a38  "Combat progress — Marked progress once on The Ashen Wake." above
 *        "Clash +iron … Weak Hit";
 *   a40  "Fight over — The Ashen Wake marked complete." and "⚔ Victory — a
 *        milestone toward your vow" above "Take Decisive Action … Strong Hit";
 *   a64  "… marked completed", the reward note and "⚑ Vow Fulfilled" above
 *        "Fulfill Your Vow … Strong Hit".
 * Each now stands below its roll card (movePipeline.js rollMove's
 * `afterMoveCard`, the list the fight's threshold card joined a round earlier —
 * tests/unit/fightThresholdCardFollowsItsRoll.test.js). What holds beside it:
 * a held result's price is still paid only once it is kept, nothing is posted
 * twice, and a roll card the world refuses loses none of them.
 *
 * On a booted table: the pipeline's own roll, the interpretation and the dice
 * scripted at their boundaries. The lines are the run's.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [], interpretation: null }));
vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (narration) => ({
    ...control.interpretation, playerNarration: narration, inputMethod: 'chat',
  })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../src/moves/resolver.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random');
      for (const r of control.dice) dice.mockReturnValueOnce(r);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude, failWrites } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const REPLY = 'The comm hisses.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const VOW   = 'Find who is raiding the Cinder Expanse lanes';
const FIGHT = 'The Ashen Wake';
const EMOTE = 3;

let table, mira, tracksStore;

/** The run's vow, as the sheet holds it: the vendor system logs its close as the write lands. */
function vowItem({ ticks = 0, reward = null } = {}) {
  const item = {
    id: 'v-raiders', type: 'progress', name: VOW, documentName: 'Item',
    system: { subtype: 'vow', rank: 'dangerous', current: ticks, completed: false },
    flags: { [MODULE_ID]: { vowId: 'v-raiders', ...(reward ? { reward: { status: 'promised', ...reward } } : {}) } },
    update: async (changes) => {
      if ('system.current' in changes) item.system.current = changes['system.current'];
      if (changes['system.completed'] === true && item.system.completed !== true) {
        // foundry-ironsworn's change log ("log-changes"): an emote spoken by
        // the Actor, posted by the writing client while the update is in flight.
        await ChatMessage.create({ content: `<em>${VOW} marked completed</em>`, style: EMOTE, speaker: { actor: 'pc-mira' } });
      }
      if ('system.completed' in changes) item.system.completed = changes['system.completed'];
      return item;
    },
    setFlag: async (mod, key, value) => { (item.flags[mod] ??= {})[key] = structuredClone(value); },
  };
  return item;
}

function seat({ momentum = 2, vow = vowItem() } = {}) {
  mira = table.addActor({
    id: 'pc-mira', name: 'Mira Kestrel', ownership: { 'pl-1': 3 },
    system: { wits: 3, iron: 1, edge: 2, momentum: { value: momentum } },
    items: { contents: [vow] },
  });
  vow.parent = mira;
  return mira;
}

function fight({ ticks, position = 'in_control' }) {
  tracksStore[`${MODULE_ID}.tracks`].push({
    id: 'fight-wake', label: FIGHT, type: 'combat', rank: 'dangerous', ticks, completed: false,
    combatState: position, positions: { 'pc-mira': position }, linkedVowName: VOW, createdAt: 1,
  });
}

async function say(line, interpretation, dice) {
  control.interpretation = { adds: 0, rationale: 'test', mischiefApplied: false, ...interpretation };
  control.dice = dice;
  await table.client('pl-1').chat(line, { speaker: { actor: 'pc-mira' } });
  await table.settle();
  await table.drain();
}

const KIND = [
  ['moveResolution', 'roll'], ['payThePriceCard', 'price'], ['combatProgressCard', 'progress'],
  ['combatFinishCard', 'fight over'], ['fightVowCard', 'victory'], ['fulfillVowCard', 'vow fulfilled'],
  ['rewardAbsentNote', 'no reward'], ['rewardGrantCard', 'reward'], ['systemNote', 'note'],
  ['decisiveActionCostCard', 'cost'],
];
/** The cards of interest, in the order they stand in chat. */
function chatOrder() {
  return table.cards().map((m) => {
    const f = m.flags?.[MODULE_ID] ?? {};
    return KIND.find(([flag]) => f[flag])?.[1] ?? null;
  }).filter(Boolean);
}
const rollCard = () => table.cards(f => f.moveResolution === true)[0];

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.dice = [];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    campaignState: {
      ...CampaignStateSchema,
      sessionActive: true, currentSessionId: 'sess-2', sessionNumber: 2, currentSceneId: 'sc-1', sceneTruths: [],
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  scriptClaude(table, { fallback: () => REPLY });
  tracksStore = { [`${MODULE_ID}.tracks`]: [] };
  table.journal._set({
    id: 'tracks-journal', name: 'Starforged Progress Tracks',
    getFlag: (mod, key) => tracksStore[`${mod}.${key}`],
    setFlag: async (mod, key, value) => { tracksStore[`${mod}.${key}`] = structuredClone(value); },
  });
});

// a12 — challenge 10 and 9, action 6 + wits 3 = 9: a miss; momentum 2 burns nothing.
const GATHER = {
  moveId: 'gather_information', moveName: 'Gather Information', statUsed: 'wits',
  stakes: {
    hit: 'A hauler names the lane the raiders were last seen in.',
    miss: 'Word of your hunt spreads through the docks, and the raiders hear that someone is asking after them.',
    missSuffer: null, priceStated: true,
  },
};
const GATHER_LINE = 'I lean on the stall and ask the dock hands and haulers who saw the raiders last, even if it means leaking that I\'m hunting them.';
const GATHER_MISS = [0.95, 0.85, 0.9];

describe('a12 — a miss\'s Pay the Price follows the roll it is the price of', () => {
  it('"Pay the Price — Gather Information" stands below "Gather Information … Miss"', async () => {
    seat();
    await say(GATHER_LINE, GATHER, GATHER_MISS);

    expect(rollCard().content).toMatch(/Gather Information[\s\S]*Miss/);
    expect(chatOrder()).toEqual(['roll', 'price']);
    const [price] = table.cards(f => f.payThePriceCard);
    expect(price.content).toContain('As stated before the roll');
    expect(price.content).toContain('Word of your hunt spreads through the docks');
    // Paid once, under the resolution of the move that paid it.
    expect(price.flags[MODULE_ID].oracleMemory.resolutionId).toBe(rollCard().flags[MODULE_ID].resolutionId);
  });

  // A guard on the mechanism, not a sample of the run: the price was paid
  // before the card, so a refused card never cost it. Queued behind the card,
  // it is paid on the stage's way out (rollMove's `finally`).
  it('a roll card the world refuses loses neither the price nor its card', async () => {
    silenceConsoleErrors();
    seat();
    const refused = failWrites(table, w => w.kind === 'message.create' && w.data?.flags?.[MODULE_ID]?.moveResolution === true, { times: 1 });
    await say(GATHER_LINE, GATHER, GATHER_MISS);

    expect(refused.refused).toBe(1);
    expect(chatOrder()).toEqual(['price']);
  });
});

describe('a38 — "Combat progress" follows the Clash that marked it; a held result pays nothing until it is kept', () => {
  // Challenge 1 and 9, action 1 + iron 1 = 2: a weak hit. Momentum 10 burns it to a strong hit, so it is held.
  const CLASH = { moveId: 'clash', moveName: 'Clash', statUsed: 'iron', moveTarget: FIGHT };
  const CLASH_LINE = 'Bad spot or not, I fight back hard, slamming the Kobayashi IV around and hammering the Ashen Wake\'s gun mounts at close range.';

  it('the progress card stands below the roll card, and no price is posted while the result is held', async () => {
    seat({ momentum: 10 });
    fight({ ticks: 8, position: 'bad_spot' });
    await say(CLASH_LINE, CLASH, [0.05, 0.85, 0.0]);

    const roll = rollCard();
    expect(roll.content).toMatch(/Clash[\s\S]*Weak Hit/);
    expect(roll.flags[MODULE_ID].awaitingUpgrade?.open, 'the result is held').toBe(true);
    expect(roll.content).toContain('Nothing has been paid or narrated yet');
    expect(chatOrder()).toEqual(['roll', 'progress']);
    expect(tracksStore[`${MODULE_ID}.tracks`][0].ticks, 'one mark on a dangerous fight').toBe(16);

    // Kept: its price is paid now, once, below both.
    await table.client('pl-1').click(roll._id, '[data-action="sf-keep-result"]');
    await table.settle();
    await table.drain();

    const order = chatOrder();
    expect(order.slice(0, 3)).toEqual(['roll', 'progress', 'price']);
    expect(order.filter(k => k === 'price')).toHaveLength(1);
    expect(order.filter(k => k === 'progress')).toHaveLength(1);
  });
});

describe('a40 — "Fight over" and the victory card follow the Take Decisive Action that won the fight', () => {
  // Progress 4 (16 ticks) against 1 and 2: a strong hit.
  const DECISIVE = { moveId: 'take_decisive_action', moveName: 'Take Decisive Action', statUsed: null, isProgressMove: true, moveTarget: FIGHT, moveTargetId: 'fight-wake' };
  const DECISIVE_LINE = 'Take decisive action to seize the objective — The Ashen Wake.';

  it('roll card, then "Fight over", then "⚔ Victory — a milestone toward your vow" — each once', async () => {
    seat();
    fight({ ticks: 16 });
    await say(DECISIVE_LINE, DECISIVE, [0.05, 0.15]);

    expect(rollCard().content).toMatch(/Take Decisive Action[\s\S]*Strong Hit/);
    expect(chatOrder()).toEqual(['roll', 'fight over', 'victory']);
    expect(tracksStore[`${MODULE_ID}.tracks`][0].completed).toBe(true);
    // The victory card names the win it is of: an upgrade of the move finds it by this.
    const [victory] = table.cards(f => f.fightVowCard);
    expect(victory.flags[MODULE_ID]).toMatchObject({ vowName: VOW, marks: 1, resolutionId: rollCard().flags[MODULE_ID].resolutionId });
  });

  it('the promised reward\'s card follows too, after the victory card', async () => {
    seat({ vow: vowItem({ reward: { description: 'The harbourmaster\'s ledger', form: 'momentum' } }) });
    fight({ ticks: 16 });
    await say(DECISIVE_LINE, DECISIVE, [0.05, 0.15]);

    expect(chatOrder()).toEqual(['roll', 'fight over', 'victory', 'reward']);
    expect(mira.items.contents[0].flags[MODULE_ID].reward.status).toBe('granted');
  });
});

describe('a64 — the vow\'s close, its reward note and "⚑ Vow Fulfilled" follow the Fulfill Your Vow that fulfilled it', () => {
  // Progress 4 (16 ticks) against 1 and 2: a strong hit.
  const FULFIL = { moveId: 'fulfill_your_vow', moveName: 'Fulfill Your Vow', statUsed: null, isProgressMove: true, moveTarget: VOW, moveTargetId: 'v-raiders' };

  it('roll card, then "… marked completed", the note that no reward was chosen, and the fulfilled card', async () => {
    seat({ vow: vowItem({ ticks: 16 }) });
    await say('Attempt to fulfill your vow.', FULFIL, [0.05, 0.15]);

    expect(rollCard().content).toMatch(/Fulfill Your Vow[\s\S]*Strong Hit/);
    expect(chatOrder()).toEqual(['roll', 'note', 'no reward', 'vow fulfilled']);
    expect(mira.items.contents[0].system.completed).toBe(true);
    // The system's line, said as a note (no Actor speaking), not dropped.
    const [note] = table.cards(f => f.systemNote);
    expect(note.content).toBe(`<em>Mira Kestrel: ${VOW} marked completed</em>`);
    expect(note.speaker?.actor ?? null).toBeNull();
  });
});
