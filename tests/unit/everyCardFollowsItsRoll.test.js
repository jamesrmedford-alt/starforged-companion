/* global structuredClone -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/everyCardFollowsItsRoll.test.js
 *
 * CARDS-STILL-ABOVE-THEIR-ROLL. The cards that say what a roll caused stand
 * below the roll's own card (rollMove's `afterMoveCard`); the price, the
 * fight's cards, the vow's close and Set a Course's card were moved there
 * (moveCardsFollowTheirRoll.test.js). The other per-move branches still
 * posted as each effect landed, above the roll card a reader takes for their
 * cause — the long haul's fifth live run: Forge a Bond's "… marked
 * completed" and "⚑ Bond Forged" above it (a71), Finish an Expedition's
 * "Expedition complete" and "◈ Site Discovered" (a26); the third: Reach a
 * Milestone's card (a63).
 *
 * Now every one of them follows its roll card: Develop Your Relationship,
 * Reach a Milestone (its card or its picker), Forge a Bond (and the system's
 * note of the bond's close), Finish an Expedition (and its site), Finish the
 * Scene, the recommit offers, Forsake Your Vow (and its notes), an
 * expedition's progress, a legacy mark, a scene challenge's card — and the
 * price of a result that offers an upgrade and is not held, which is paid
 * before the roll card (that card's Burn state carries its receipts from its
 * first write) and posted after it. An upgrade's cards post at once: its roll
 * card is on the table already.
 *
 * On a booted table: the pipeline's own roll, the interpretation and the dice
 * scripted at their boundaries.
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
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const REPLY = 'The comm hisses.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
const VOW = 'Find who is raiding the Cinder Expanse lanes';
const TAMSIN = 'Tamsin Okoro';
const EMOTE = 3;
// Challenge 1 and 2: a strong hit on any progress roll, and on an action roll of 6 + 2 or more.
const STRONG = [0.05, 0.15, 0.9];
// Challenge 10 and 9: a miss on a progress of 4, and on an action roll of 6 + 3.
const MISS = [0.95, 0.85, 0.9];

let table, mira, tracksStore;

/**
 * A progress Item on the sheet whose close the ironsworn system logs as the
 * write lands — "… marked completed", an emote spoken by the Actor.
 */
function progressItem({ id, subtype, name, ticks = 0, flags = {} }) {
  const item = {
    id, type: 'progress', name, documentName: 'Item',
    system: { subtype, rank: 'dangerous', current: ticks, progress: ticks, completed: false },
    flags: { [MODULE_ID]: { ...flags } },
    update: async (changes) => {
      for (const key of ['system.current', 'system.progress']) if (key in changes) item.system[key.split('.')[1]] = changes[key];
      if (changes['system.completed'] === true && item.system.completed !== true) {
        await ChatMessage.create({ content: `<em>${name} marked completed</em>`, style: EMOTE, speaker: { actor: 'pc-mira' } });
      }
      if ('system.completed' in changes) item.system.completed = changes['system.completed'];
      for (const [k, v] of Object.entries(changes)) {
        const m = /^flags\.([^.]+)\.(.+)$/.exec(k);
        if (m) (item.flags[m[1]] ??= {})[m[2]] = structuredClone(v);
      }
      return item;
    },
    setFlag: async (mod, key, value) => { (item.flags[mod] ??= {})[key] = structuredClone(value); },
  };
  return item;
}

const vowItem = (ticks = 0) => progressItem({ id: 'v-raiders', subtype: 'vow', name: VOW, ticks, flags: { vowId: 'v-raiders' } });

function seat({ momentum = 2, items = [vowItem()] } = {}) {
  mira = table.addActor({
    id: 'pc-mira', name: 'Mira Kestrel', ownership: { 'pl-1': 3 },
    system: { wits: 3, iron: 1, edge: 2, heart: 2, momentum: { value: momentum } },
    items: { contents: items },
  });
  for (const item of items) item.parent = mira;
  return mira;
}

/** Tamsin, Mira's connection: her NPC card and Mira's bond Item for her. */
function tamsin(ticks) {
  const record = { _id: 'rec-tamsin', name: TAMSIN, rank: 'dangerous', role: 'Broker', relationshipTicks: ticks, bonded: false, active: true, history: [] };
  table.addActor({ id: 'npc-tamsin', name: TAMSIN, type: 'character', flags: { [MODULE_ID]: { entityType: 'connection', connection: record } } });
  return progressItem({ id: 'bond-tamsin', subtype: 'bond', name: TAMSIN, ticks, flags: { connectionId: 'rec-tamsin' } });
}

function track(t) {
  tracksStore[`${MODULE_ID}.tracks`].push({ rank: 'dangerous', completed: false, createdAt: 1, ...t });
}

async function say(line, interpretation, dice = []) {
  control.interpretation = { adds: 0, rationale: 'test', mischiefApplied: false, statUsed: null, ...interpretation };
  control.dice = dice;
  await table.client('pl-1').chat(line, { speaker: { actor: 'pc-mira' } });
  await table.settle();
  await table.drain();
}

const KIND = [
  ['moveResolution', 'roll'], ['payThePriceCard', 'price'], ['systemNote', 'note'],
  ['developRelationshipCard', 'develop'], ['reachMilestoneCard', 'milestone'], ['milestonePicker', 'which vow'],
  ['forgeABondCard', 'bond forged'], ['expeditionFinishCard', 'expedition complete'], ['siteDiscovered', 'site'],
  ['sceneFinishCard', 'scene finished'], ['recommitOfferCard', 'recommit'], ['vowRecommitOfferCard', 'recommit'],
  ['bondRecommitOfferCard', 'recommit'], ['forsakeVowCard', 'forsaken'], ['expeditionProgressCard', 'expedition progress'],
  ['legacyMarkCard', 'legacy'], ['sceneChallengeCard', 'scene challenge'], ['combatProgressCard', 'progress'],
];
/** The cards of interest, in the order they stand in chat. A system note is the emote the mock posts, re-spoken. */
function chatOrder() {
  return table.cards().map((m) => {
    const f = m.flags?.[MODULE_ID] ?? {};
    const kind = KIND.find(([flag]) => f[flag])?.[1] ?? null;
    if (kind) return kind;
    return /marked completed/.test(String(m.content ?? '')) ? 'note' : null;
  }).filter(Boolean);
}
const rollCard = () => table.cards(f => f.moveResolution === true)[0];

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

async function reset(settings = {}) {
  control.dice = [];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false, ...settings,
    campaignState: {
      ...CampaignStateSchema,
      sessionActive: true, currentSessionId: 'sess-3', sessionNumber: 3, currentSceneId: 'sc-1', sceneTruths: [],
      connectionIds: ['npc-tamsin'],
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
}
beforeEach(() => reset());

describe('a connection\'s moves: their cards follow the move\'s card', () => {
  it('a71 — Forge a Bond: the roll card, then the system\'s "… marked completed", then "⚑ Bond Forged"', async () => {
    seat({ items: [vowItem(), tamsin(40)] });
    await say(`${TAMSIN}, I want you with me past this job, for good.`,
      { moveId: 'forge_a_bond', moveName: 'Forge a Bond', isProgressMove: true, moveTarget: TAMSIN, moveTargetId: 'npc-tamsin' }, STRONG);

    expect(rollCard().content).toMatch(/Forge a Bond[\s\S]*Strong Hit/);
    expect(chatOrder()).toEqual(['roll', 'note', 'bond forged']);
  });

  it('Develop Your Relationship — the move\'s card, then the development\'s', async () => {
    seat({ items: [vowItem(), tamsin(8)] });
    await say(`I watch ${TAMSIN}'s stall for an hour while she rests.`,
      { moveId: 'develop_your_relationship', moveName: 'Develop Your Relationship', moveTarget: TAMSIN, moveTargetId: 'npc-tamsin' });

    expect(chatOrder()).toEqual(['roll', 'develop']);
  });
});

describe('a vow\'s moves', () => {
  it('a63 — Reach a Milestone: the move\'s card, then the milestone\'s', async () => {
    seat();
    await say('The logs put the raids at the station\'s own door — that is headway.', { moveId: 'reach_a_milestone', moveName: 'Reach a Milestone', moveTarget: VOW });

    expect(chatOrder()).toEqual(['roll', 'milestone']);
  });

  it('Forsake Your Vow: the move\'s card, then the system\'s close, then "Vow Forsaken"', async () => {
    seat();
    await say('I let the raiders go. I am done with it.', { moveId: 'forsake_your_vow', moveName: 'Forsake Your Vow', moveTarget: VOW, moveTargetId: 'v-raiders' });

    const order = chatOrder();
    expect(order[0]).toBe('roll');
    expect(order.filter(k => k === 'note' || k === 'forsaken')).toEqual(['note', 'forsaken']);
    expect(order.indexOf('forsaken')).toBeGreaterThan(order.indexOf('note'));
  });
});

describe('an expedition\'s moves', () => {
  const EXPEDITION = { id: 'exp-1', label: 'the source of the distress call', type: 'expedition' };

  it('a26 — Finish an Expedition: the roll card, then "Expedition complete"', async () => {
    seat();
    track({ ...EXPEDITION, ticks: 16 });
    await say('I bring her in among the ribs and finish it.', { moveId: 'finish_an_expedition', moveName: 'Finish an Expedition', isProgressMove: true, moveTarget: EXPEDITION.label, moveTargetId: 'exp-1' }, STRONG);

    expect(rollCard().content).toMatch(/Finish an Expedition[\s\S]*Strong Hit/);
    expect(chatOrder()).toEqual(['roll', 'expedition complete']);
  });

  it('Finish an Expedition missed: the roll card, then the recommit offer', async () => {
    seat();
    track({ ...EXPEDITION, ticks: 16 });
    await say('I bring her in among the ribs and finish it.', { moveId: 'finish_an_expedition', moveName: 'Finish an Expedition', isProgressMove: true, moveTarget: EXPEDITION.label, moveTargetId: 'exp-1' }, MISS);

    const order = chatOrder();
    expect(order[0]).toBe('roll');
    expect(order).toContain('recommit');
  });

  // A waypoint's hit marks nothing at the roll — its card asks what is found — so the leg itself.
  it('Undertake an Expedition: the roll card, then the expedition\'s progress', async () => {
    seat();
    track({ ...EXPEDITION, ticks: 4 });
    await say('I take the Kobayashi IV off the charted lane toward the call.', { moveId: 'undertake_an_expedition', moveName: 'Undertake an Expedition', statUsed: 'wits', moveTarget: EXPEDITION.label, moveTargetId: 'exp-1' }, STRONG);

    const order = chatOrder();
    expect(order[0]).toBe('roll');
    expect(order).toContain('expedition progress');
  });
});

describe('a scene challenge\'s moves', () => {
  const CHALLENGE = { id: 'sc-talks', label: 'The negotiation', type: 'scene_challenge' };

  it('Face Danger (Scene Challenge): the roll card, then the challenge\'s card', async () => {
    seat();
    track({ ...CHALLENGE, ticks: 0 });
    await say('I hold the dockmaster\'s gaze and press the point.', { moveId: 'face_danger_scene_challenge', moveName: 'Face Danger (Scene Challenge)', statUsed: 'wits', moveTarget: CHALLENGE.label, moveTargetId: 'sc-talks' }, STRONG);

    const order = chatOrder();
    expect(order[0]).toBe('roll');
    expect(order).toContain('scene challenge');
  });

  it('Finish the Scene: the roll card, then the scene\'s end', async () => {
    seat();
    track({ ...CHALLENGE, ticks: 24 });
    await say('I lay the terms on the table and end it.', { moveId: 'finish_the_scene', moveName: 'Finish the Scene', isProgressMove: true, moveTarget: CHALLENGE.label, moveTargetId: 'sc-talks' }, STRONG);

    const order = chatOrder();
    expect(order[0]).toBe('roll');
    expect(order).toContain('scene finished');
  });
});

describe('a missed vow, and a discovery', () => {
  it('Fulfill Your Vow missed: the roll card, then the recommit offer', async () => {
    seat({ items: [vowItem(16)] });
    await say('I name the paymaster before the board.', { moveId: 'fulfill_your_vow', moveName: 'Fulfill Your Vow', isProgressMove: true, moveTarget: VOW, moveTargetId: 'v-raiders' }, MISS);

    const order = chatOrder();
    expect(order[0]).toBe('roll');
    expect(order).toContain('recommit');
  });

  it('Make a Discovery at a waypoint: the move\'s card, then the legacy\'s mark', async () => {
    seat();
    track({ id: 'exp-1', label: 'the source of the distress call', type: 'expedition', ticks: 8 });
    await say('Among the ribs, something no chart has ever named.', { moveId: 'make_a_discovery', moveName: 'Make a Discovery', fromWaypoint: true });

    const order = chatOrder();
    expect(order[0]).toBe('roll');
    expect(order).toContain('legacy');
  });
});

describe('control: a fight\'s progress, which already followed its roll (the third live run, a38)', () => {
  it('a Strike: the roll card, then "Combat progress" — as before', async () => {
    seat();
    track({ id: 'fight-wake', label: 'The Ashen Wake', type: 'combat', ticks: 8, combatState: 'in_control', positions: { 'pc-mira': 'in_control' }, linkedVowName: VOW });
    await say('I rake the Ashen Wake\'s flank.', { moveId: 'strike', moveName: 'Strike', statUsed: 'edge', moveTarget: 'The Ashen Wake', moveTargetId: 'fight-wake' }, STRONG);

    expect(chatOrder()).toEqual(['roll', 'progress']);
  });
});

describe('a price no hold waits on — a result that offers an upgrade, with the hold off', () => {
  // Gather Information +wits: challenge 10 and 9, action 6 + 3 = 9 — a miss.
  // Momentum 10 burns it to a weak hit, so the card offers Burn Momentum.
  const GATHER = {
    moveId: 'gather_information', moveName: 'Gather Information', statUsed: 'wits',
    stakes: { hit: 'A hauler names the lane.', miss: 'Word of your hunt spreads through the docks.', missSuffer: null, priceStated: true },
  };

  it('the price is paid before the roll card — its receipts in the card\'s Burn state — and its card stands below', async () => {
    await reset({ holdResultForUpgrade: false });
    seat({ momentum: 10 });
    await say('I ask the dock hands who saw the raiders last.', GATHER, MISS);

    const roll = rollCard();
    expect(roll.content).toMatch(/Gather Information[\s\S]*Miss/);
    expect(roll.flags[MODULE_ID].awaitingUpgrade?.open ?? false, 'not held').toBe(false);
    expect(roll.flags[MODULE_ID].burn?.canBurn).toBe(true);
    expect(roll.flags[MODULE_ID].burn?.ptpReversals, 'the price\'s receipts, in the card\'s first write').toBeTruthy();
    expect(chatOrder()).toEqual(['roll', 'price']);
    const [price] = table.cards(f => f.payThePriceCard);
    expect(price.content).toContain('Word of your hunt spreads through the docks');
  });
});
