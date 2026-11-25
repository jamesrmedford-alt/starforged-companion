/**
 * STARFORGED COMPANION
 * tests/unit/forcedMoveStakes.test.js
 *
 * Issue #362 D11 (decided A, maintainer 2026-11-17): FORCED-MOVE-STATES-NO-STAKES.
 *
 * 1. A card-forced move — a paced card's "Roll ⟨move⟩", the way-out buttons, a
 *    round's Roll — builds its interpretation without the interpreter, so it
 *    stated no stakes: the Confirm dialog showed no "At stake" and its miss
 *    always rolled the Pay the Price table. A move with several stats keeps
 *    the stakes its stat reading states; a move with one is read for them —
 *    one interpreter call more. A move that rolls no stat makes no reading.
 * 2. A stated Withstand Damage or Companion Takes a Hit landed on the command
 *    vehicle or the first companion, whatever the move was made against: the
 *    move's targets now go with the stated price to the Pay the Price
 *    dispatch.
 *
 * End to end on a booted table (tests/helpers/multiClient.js): the player
 * clicks the GM-authored card's button on their own client, the canonical
 * GM's pipeline runs with the GM's key, and the Claude calls are answered at
 * the fetch boundary; the dice are scripted inside the real resolveMove.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ confirmed: [], dice: [], interpretation: null }));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
// The confirm dialog: record what it was shown, then accept.
vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async (interp) => {
    control.confirmed.push(JSON.parse(JSON.stringify({ moveId: interp.moveId, statUsed: interp.statUsed, stakes: interp.stakes ?? null })));
    return true;
  }),
}));
// A typed line's reading, when a test hands one; the real interpreter otherwise.
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, interpretMove: vi.fn(async (text, opts) => (control.interpretation && !opts?.expectedMoveSlug
    ? { ...control.interpretation, playerNarration: text, inputMethod: 'chat' }
    : real.interpretMove(text, opts))) };
});
vi.mock('../../src/pacing/router.js', async (original) => {
  const real = await original();
  return { ...real, routePacedInput: vi.fn(async (...args) => (control.interpretation
    ? { runMove: true, decision: 'MOVE', suggestedMove: null }
    : real.routePacedInput(...args))) };
});
vi.mock('../../src/moves/resolver.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    resolveMove: vi.fn((...args) => {
      const rng = vi.spyOn(Math, 'random');
      for (const value of control.dice) rng.mockReturnValueOnce(value);
      try { return original.resolveMove(...args); } finally { rng.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude, isReaderCall } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { enrichForcedMoveStat } from '../../src/moves/statEnrichment.js';
import { statedPrice } from '../../src/moves/stakes.js';

const isInterpreter = (call) => isReaderCall(call);
const MISS_LINE = 'The courier\'s trail goes cold and the sentries spot you.';
const STAKES = { hit: 'You find the courier\'s route.', miss: MISS_LINE, missSuffer: { move: 'endure_harm', amount: 1 } };
const MISS = [0.55, 0.65, 0.1];   // challenge 6, 7; action die 1 — a miss (momentum 2 cannot burn it)

let table, kira;
const moveCards  = () => table.cards(f => f.moveResolution);
const priceCards = () => table.cards(f => f.payThePriceCard);

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.confirmed.length = 0;
  control.interpretation = null;
  control.dice = MISS;
  await table.reset({ world: { settings: { chronicleAutoEntry: false, narratorSessionSummary: false, campaignState: {
    ...CampaignStateSchema,
    sessionActive: true, currentSessionId: 'd11-s1', sessionNumber: 2, currentSceneId: 'd11-scene', sceneTruths: [], clocks: [],
  } } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  kira = table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, system: { edge: 1, shadow: 4, wits: 2 } });
});

/** A paced narrative card as the narrator posts it: prose, a move hint and its Roll button. */
async function postPacedCard(suggestedMove, playerText) {
  const msg = await table.client('gm-1').run(() => globalThis.ChatMessage.create({
    content: `<div class="sf-narration-card sf-narration-card--paced"><div class="sf-narration-prose">The corridor narrows.</div>`
      + `<div class="sf-paced-actions"><button type="button" class="sf-paced-roll-btn" data-action="sf-paced-roll">Roll it</button></div></div>`,
    flags: { [MODULE_ID]: { narratorCard: true, pacedNarrative: true, playerText, suggestedMove, sessionId: 'd11-s1' } },
  }));
  await table.settle();
  return msg.id;
}

async function pressRoll(id) {
  table.client('pl-1').click(id, '[data-action="sf-paced-roll"]');
  await table.settle(); await table.drain();
}

describe('issue #362 D11 — a forced move states the stakes its reading gives', () => {
  it('a single-stat forced move (Gather Information) is read once for its stakes, and its miss pays the stated miss', async () => {
    scriptClaude(table).when(isInterpreter,
      JSON.stringify({ moveId: 'gather_information', statUsed: 'wits', confidence: 'high', rationale: 'Searching the logs.', stakes: STAKES }));
    const id = await postPacedCard('gather_information', 'I comb the logs for the courier\'s route.');
    await pressRoll(id);

    const readings = table.claude.calls.filter(isInterpreter);
    expect(readings).toHaveLength(1);
    expect(readings[0].userText).toContain('MODE — THE MOVE IS CHOSEN: gather_information (Gather Information)');
    expect(control.confirmed).toEqual([{ moveId: 'gather_information', statUsed: 'wits',
      stakes: { ...STAKES, priceStated: true } }]);
    // The miss pays what the dialog showed, not the table.
    expect(priceCards()).toHaveLength(1);
    expect(priceCards()[0].content).toContain(`As stated before the roll: <strong>${MISS_LINE}</strong>`);
    expect(kira.system.health.value).toBe(4);
  }, 30_000);

  it('a multi-stat forced move (Face Danger) keeps the stakes its stat reading states', async () => {
    scriptClaude(table).when(isInterpreter,
      JSON.stringify({ moveId: 'face_danger', statUsed: 'shadow', confidence: 'high', rationale: 'Creeping past unseen.', stakes: STAKES }));
    const id = await postPacedCard('face_danger', 'I melt into the shadows and slip past the sentries.');
    await pressRoll(id);

    expect(table.claude.calls.filter(isInterpreter)).toHaveLength(1);
    expect(control.confirmed).toEqual([{ moveId: 'face_danger', statUsed: 'shadow', stakes: { ...STAKES, priceStated: true } }]);
    expect(moveCards()[0].content).toContain('+shadow (4)');
    expect(priceCards()[0].content).toContain(`As stated before the roll: <strong>${MISS_LINE}</strong>`);
  }, 30_000);

  it('the reading\'s stakes follow the move\'s miss: a forced Enter the Fray shows no miss cost (issue #362 AC02)', async () => {
    scriptClaude(table).when(isInterpreter,
      JSON.stringify({ moveId: 'enter_the_fray', statUsed: 'edge', confidence: 'high', rationale: 'The fight begins.', stakes: STAKES }));
    const id = await postPacedCard('enter_the_fray', 'I draw on the sentries.');
    control.dice = [0.05, 0.15, 0.9];   // a strong hit: nothing else to answer
    await pressRoll(id);
    expect(control.confirmed.at(-1)).toMatchObject({ moveId: 'enter_the_fray', stakes: { hit: STAKES.hit, priceStated: false } });
  }, 30_000);
});

describe('issue #362 D11 — which forced moves are read', () => {
  const reading = { moveId: 'x', statUsed: 'wits', rationale: 'r', stakes: { ...STAKES, priceStated: true } };
  const forced = (moveId, statUsed) => ({ moveId, statUsed, playerNarration: 'line', rationale: '' });

  it('a move that rolls no stat — a progress move, a move with no roll, "whichever is higher" — makes no reading', async () => {
    for (const [moveId, statUsed] of [['take_decisive_action', null], ['reach_a_milestone', null], ['fulfill_your_vow', null],
      ['endure_harm', 'health']]) {
      const interpret = vi.fn(async () => reading);
      const interp = forced(moveId, statUsed);
      expect(await enrichForcedMoveStat(interp, { interpret })).toBeNull();
      expect(interpret, moveId).not.toHaveBeenCalled();
      expect(interp.stakes, moveId).toBeUndefined();
    }
  });

  it('a single-stat move takes the stakes and keeps its stat; a reading with none leaves what was there', async () => {
    const interp = forced('make_a_connection', 'heart');
    expect(await enrichForcedMoveStat(interp, { interpret: vi.fn(async () => ({ ...reading, statUsed: 'heart' })) })).toBeNull();
    expect(interp).toMatchObject({ statUsed: 'heart', stakes: reading.stakes });
    const kept = { ...forced('make_a_connection', 'heart'), stakes: { hit: 'Earlier.', miss: null, missSuffer: null, priceStated: false } };
    await enrichForcedMoveStat(kept, { interpret: vi.fn(async () => ({ statUsed: 'heart', stakes: null })) });
    expect(kept.stakes.hit).toBe('Earlier.');
  });

  it('no key: no reading, no stakes', async () => {
    const interp = forced('gather_information', 'wits');
    expect(await enrichForcedMoveStat(interp, { interpret: null })).toBeNull();
    expect(interp.stakes).toBeUndefined();
  });
});

describe('issue #362 D11 — a stated vehicle or companion price lands on what the move was made against', () => {
  it('statedPrice carries the move\'s vehicle or companion on that route alone', () => {
    const stakes = (move) => ({ hit: 'h', miss: 'm', missSuffer: { move, amount: 1 }, priceStated: true });
    expect(statedPrice(stakes('withstand_damage'), { vehicleItemId: 'bike-1', companionItemId: 'c-1' }).sufferRoutes)
      .toEqual([{ move: 'withstand_damage', amount: 1, vehicleItemId: 'bike-1' }]);
    expect(statedPrice(stakes('companion_takes_a_hit'), { companionItemId: 'c-1' }).sufferRoutes)
      .toEqual([{ move: 'companion_takes_a_hit', amount: 1, soloFallback: 'endure_harm', companionItemId: 'c-1' }]);
    // A Heal for a companion: its patient.
    expect(statedPrice(stakes('companion_takes_a_hit'), { patientCompanionItemId: 'c-2' }).sufferRoutes[0].companionItemId).toBe('c-2');
    expect(statedPrice(stakes('endure_harm'), { vehicleItemId: 'bike-1', companionItemId: 'c-1' }).sufferRoutes)
      .toEqual([{ move: 'endure_harm', amount: 1 }]);
    expect(statedPrice(stakes('withstand_damage')).sufferRoutes).toEqual([{ move: 'withstand_damage', amount: 1 }]);
  });

  /** An asset Item whose condition track is written by its own update(). */
  const asset = (id, name, category, trackName, value) => {
    const item = { id, name, type: 'asset',
      system: { category, abilities: [], track: { enabled: true, name: trackName, value, min: 0, max: 5 } },
      update: async (changes) => { if ('system.track.value' in changes) item.system.track.value = changes['system.track.value']; } };
    return item;
  };

  async function typedMiss({ missSuffer, targets }) {
    control.interpretation = { moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'wits', adds: 0, rationale: 'test',
      mischiefApplied: false, stakes: { hit: 'You make it across.', miss: MISS_LINE, missSuffer, priceStated: true }, ...targets };
    scriptClaude(table, { fallback: () => 'The moment turns.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
    await table.client('pl-1').chat('I gun it across the gap.', { speaker: { actor: kira.id } });
    await table.settle(); await table.drain();
  }

  it('a stated Companion Takes a Hit lands on the companion the move was made for — not the first in the list', async () => {
    const rock = asset('c-rockhorn', 'Rockhorn', 'Companion', 'Health', 4);
    const glow = asset('c-glowcat', 'Glowcat', 'Companion', 'Health', 3);
    kira = table.addActor({ id: 'pc-kira-2', name: 'Kira', ownership: { 'pl-1': 3 }, system: { wits: 2 }, items: { contents: [rock, glow] } });
    await typedMiss({ missSuffer: { move: 'companion_takes_a_hit', amount: 1 }, targets: { companionItemId: 'c-glowcat' } });
    expect(priceCards()).toHaveLength(1);
    expect({ rock: rock.system.track.value, glow: glow.system.track.value }).toEqual({ rock: 4, glow: 2 });
  }, 30_000);

  it('a stated Withstand Damage lands on the support vehicle the move was rolled for — not the command vehicle', async () => {
    const bike = asset('bike-1', 'Hoverbike', 'Support Vehicle', 'Integrity', 3);
    kira = table.addActor({ id: 'pc-kira-3', name: 'Kira', ownership: { 'pl-1': 3 }, system: { wits: 2 }, items: { contents: [bike] } });
    await typedMiss({ missSuffer: { move: 'withstand_damage', amount: 1 }, targets: { vehicleItemId: 'bike-1' } });
    expect(priceCards()).toHaveLength(1);
    expect(priceCards()[0].flags[MODULE_ID].sufferRoutes).toEqual([{ move: 'withstand_damage', amount: 1, vehicleItemId: 'bike-1' }]);
    expect(bike.system.track.value).toBe(2);
    expect(table.cards(f => f.sufferCard && f.suffer === 'withstand_damage').at(-1).content).toContain('Hoverbike: 3 → 2');
  }, 30_000);

  // With several companions and none named the route asks which, as the
  // table's does: the first in the list took the hit unasked (issue #364
  // ANY-SUFFER-SUPPORT-VEHICLE — anySufferVehicleAndCompanionChoice.test.js).
  it('control: with no target, a stated Companion Takes a Hit asks which of several companions, as the table\'s route does', async () => {
    const rock = asset('c-rockhorn', 'Rockhorn', 'Companion', 'Health', 4);
    const glow = asset('c-glowcat', 'Glowcat', 'Companion', 'Health', 3);
    kira = table.addActor({ id: 'pc-kira-4', name: 'Kira', ownership: { 'pl-1': 3 }, system: { wits: 2 }, items: { contents: [rock, glow] } });
    await typedMiss({ missSuffer: { move: 'companion_takes_a_hit', amount: 1 }, targets: {} });
    expect({ rock: rock.system.track.value, glow: glow.system.track.value }).toEqual({ rock: 4, glow: 3 });
    const which = table.cards(f => f.sufferCard && f.sufferPrompt?.kind === 'enumerated').at(-1);
    expect(which.flags[MODULE_ID].sufferPrompt.options.map(o => o.itemId)).toEqual(['c-rockhorn', 'c-glowcat']);
    // The card is the price's: bound to the move that paid it.
    expect(which.flags[MODULE_ID]).toMatchObject({ priceCard: true, resolutionId: table.cards(f => f.moveResolution).at(-1).flags[MODULE_ID].resolutionId });
    table.client('pl-1').click(which._id, '[data-action="sf-suffer-pick"][data-option-index="0"]');
    await table.settle(); await table.drain();
    expect({ rock: rock.system.track.value, glow: glow.system.track.value }).toEqual({ rock: 3, glow: 3 });
  }, 30_000);
});
