/**
 * STARFORGED COMPANION
 * tests/unit/exploreMechanics.test.js
 *
 * The long haul's mechanical checks (issue #373 slice 2;
 * test/ci/playwright/lib/mechanics.mjs) — "each check shown to catch a defect
 * put into the module".
 *
 * A short stretch of play is written out as the run records it — the table
 * after each step, the cards that changed in it — in which every check is
 * made and none is violated: a session begun, a strong hit, an expedition
 * undertaken, a waypoint explored and the expedition finished, a weak hit
 * burned to a strong one, a miss paid for, a fight finished and its milestone marked,
 * a wound healed, a relationship developed, a bond forged, a vow fulfilled, a
 * weak hit held and kept with "Keep the result", a session ended. Then, one at a time, the table is made to do what a defect
 * in the module would have it do — pay momentum twice, mark a milestone
 * twice, keep the first outcome's marks under a burn, lag a mirror — and the
 * check that should catch it is shown to catch it, and to be the only kind
 * that does.
 *
 * The expectations inside the checks come from tests/helpers/sequence/rules.js
 * (the game's text), never from src/.
 */

import { describe, it, expect } from 'vitest';
import { CHECKS, cardsAt, checkMechanics } from '../../test/ci/playwright/lib/mechanics.mjs';
import { parsePriceLine, uniformFor } from '../../test/ci/playwright/lib/table.mjs';
import {
  BONDED_DEVELOP, EXPEDITION_MARKS, FIGHT_MARKS, MOVE_MOMENTUM, RANKS, WAYPOINT_CHOICE, burnedOutcome, canBurn, decisiveOutcome, dieCancelled,
  expeditionFinished, expeditionReward, momentumMaxFor, momentumResetFor, recover, rolledScore, sufferCost, xpForBoxes, boxesFilled,
} from '../helpers/sequence/rules.js';

// ── a stretch of play, as a run records it ───────────────────────────────────

const clone = (o) => JSON.parse(JSON.stringify(o));
const moveCard = (id, name, diceLine, shown, extra = {}) => ({ id, move: { resolutionId: id, actorId: 'pc', name, diceLine, shown, upgraded: false, burn: null, held: null, combatTrackId: null, ...extra } });
const narrated = (id, resolutionId, moveId, outcome, extra = {}) => ({ id, narration: { resolutionId, moveId, outcome, narrationId: `n-${id}`, ...extra } });
const say = (text) => ({ action: 'say', text });
const click = (label) => ({ action: 'click', label });

/** The story: each step's action, what it changes in the table, and the cards that are new or changed. */
function story() {
  const table = {
    session: { active: false, id: null, pendingMove: false, xCardActive: false, questFocus: '' },
    location: { id: 'L1', name: 'Bleakhold Station' }, ship: { token: null, tokenAt: null },
    pcs: [{
      id: 'pc', name: 'Mira', health: 5, spirit: 5, supply: 5, momentum: 2, momentumMax: 10, momentumReset: 2, debilities: [], combatPosition: null,
      legacies: {},
      vows: [{ id: 'v1', vowId: 'v1', name: 'Find the raiders', rank: 'dangerous', ticks: 16, completed: false, linkedConnectionId: 'A1', linkedConnectionName: 'Tamsin Vey' }],
      bonds: [{ id: 'i1', name: 'Tamsin Vey', rank: 'dangerous', ticks: 32, completed: false, connectionId: 'r1', lost: false }],
    }],
    connections: [{ hostId: 'A1', recordId: 'r1', name: 'Tamsin Vey', rank: 'dangerous', bonded: false, active: true, ticks: 32 }],
    entityCards: [{ id: 'A1', name: 'Tamsin Vey', entityType: 'connection' }],
    tracks: [{ id: 't1', label: 'Ashen Wake', type: 'combat', rank: 'dangerous', ticks: 0, completed: false, combatState: 'in_control', linkedVowName: 'Find the raiders' }],
    legacy: { quests: { ticks: 2, cleared: false, cycles: 0 }, bonds: { ticks: 0, cleared: false, cycles: 0 }, discoveries: { ticks: 0, cleared: false, cycles: 0 } },
    scene: { truths: [] }, helpers: {}, plans: [],
  };
  const pc = table.pcs[0];
  const fight = table.tracks[0];
  const vow = pc.vows[0];
  const conn = table.connections[0];
  const bond = pc.bonds[0];
  const steps = [];
  const dice = [];
  const rolled = (challenge, actionDie = null) => { dice.push(uniformFor(challenge[0], 10), uniformFor(challenge[1], 10)); if (actionDie != null) dice.push(uniformFor(actionDie, 6)); };
  const step = (id, action, change, cards = []) => { change(); steps.push({ step: id, action, table: clone(table), cards: clone(cards) }); };

  step('(setup)', null, () => {});
  step('a1', { action: 'dialog', title: 'Begin a Session', fields: [{ name: 'vignette', value: 'true' }], press: 'Begin' }, () => { table.session.active = true; table.session.id = 's1'; pc.momentum = 3; });
  step('a2', say('I work the docks for who saw the raiders.'), () => { pc.momentum = 5; rolled([2, 5], 4); },
    [moveCard('m2', 'Gather Information', 'Action: 4 + 3 = 7 | Challenge: 2, 5', 'strong_hit'), narrated('n2', 'm2', 'gather_information', 'strong_hit')]);
  // An expedition: a hit begins its track and marks it once; a waypoint's
  // strong hit offers a mark or momentum, and the mark is taken; the finish
  // is scored by its four boxes and pays the discoveries legacy by rank.
  const journey = { id: 't2', label: 'the source of the distress call', type: 'expedition', rank: 'dangerous', ticks: 8, completed: false, siteId: null };
  step('a2a', say('I take her off the charted lane, along the call\'s bearing.'), () => { table.tracks.push(journey); rolled([3, 6], 5); },
    [moveCard('m2a', 'Undertake an Expedition', 'Action: 5 + 3 = 8 | Challenge: 3, 6', 'strong_hit'), narrated('n2a', 'm2a', 'undertake_an_expedition', 'strong_hit'),
      { id: 'e2a', expedition: { created: true, trackId: 't2', trackLabel: 'the source of the distress call', actorId: 'pc' } }]);
  step('a2b', say('I go over the place the call is coming from.'), () => { rolled([2, 4], 3); },
    [moveCard('m2b', 'Explore a Waypoint', 'Action: 3 + 3 = 6 | Challenge: 2, 4', 'strong_hit'), narrated('n2b', 'm2b', 'explore_a_waypoint', 'strong_hit'),
      { id: 's2b', suffer: { resolved: false, picked: [], moveId: 'explore_a_waypoint', resolutionId: 'm2b', actorId: 'pc', options: [{ label: 'Mark expedition progress' }, { label: '+2 momentum' }] } }]);
  step('a2c', click('Mark expedition progress'), () => { table.tracks.find(t => t.id === 't2').ticks = 16; },
    [{ id: 's2b', suffer: { resolved: true, picked: [0], moveId: 'explore_a_waypoint', resolutionId: 'm2b', actorId: 'pc', options: [{ label: 'Mark expedition progress' }, { label: '+2 momentum' }] } },
      { id: 'e2c', expedition: { created: false, trackId: 't2', trackLabel: 'the source of the distress call', actorId: 'pc' } }]);
  step('a2d', click('🗺 Finish the Expedition (4/10)'), () => { table.tracks.find(t => t.id === 't2').completed = true; table.legacy.discoveries.ticks = 2; rolled([1, 2]); },
    [moveCard('m2d', 'Finish an Expedition', 'Progress: 4 | Challenge: 1, 2', 'strong_hit'), narrated('n2d', 'm2d', 'finish_an_expedition', 'strong_hit'),
      { id: 'f2d', expeditionFinished: { legacyTicks: 2 } }]);
  // A weak hit momentum would improve: held until it is kept or burned.
  const weak = moveCard('m3', 'Strike', 'Action: 1 + 2 = 3 | Challenge: 1, 4', 'weak_hit',
    { combatTrackId: 't1', burn: { canBurn: true, momentum: 5, originalOutcome: 'weak_hit', previewOutcome: 'strong_hit', moveId: 'strike' }, held: { open: true, resolvedBy: null, resolution: { moveId: 'strike', outcome: 'weak_hit' } } });
  step('a3', say('I rake her flank.'), () => { rolled([1, 4], 1); }, [weak]);
  step('a4', click('🔥 Burn Momentum (5 → Strong Hit)'), () => { pc.momentum = 2; fight.ticks = 16; },
    [{ ...weak, move: { ...weak.move, upgraded: true, burn: { ...weak.move.burn, consumed: true }, held: { ...weak.move.held, open: false, resolvedBy: 'burn' } } }, narrated('n4', 'm3-burned', 'strike', 'strong_hit', { upgradeOf: 'm3' })]);
  step('a5', say('I strike at her drive section.'), () => { fight.combatState = 'bad_spot'; rolled([10, 9], 1); },
    [moveCard('m5', 'Strike', 'Action: 1 + 2 = 3 | Challenge: 10, 9', 'miss', { combatTrackId: 't1' }), narrated('n5', 'm5', 'strike', 'miss'),
      { id: 's5', suffer: { resolved: false, picked: [], moveId: 'strike', resolutionId: 'm5', actorId: 'pc', options: [{ label: 'Endure Harm (-2)' }] } }]);
  step('a6', click('Endure Harm (-2)'), () => { pc.health = 3; },
    [{ id: 's5', suffer: { resolved: true, picked: [0], moveId: 'strike', resolutionId: 'm5', actorId: 'pc', options: [{ label: 'Endure Harm (-2)' }] } }]);
  // In a bad spot a strong hit with a match stays a strong hit: 4 boxes against 3 and 3.
  step('a7', click('⚔ Attempt to Finish the Fight: Ashen Wake'), () => { fight.completed = true; pc.momentum = 3; rolled([3, 3]); },
    [moveCard('m7', 'Take Decisive Action', 'Progress: 4 | Challenge: 3, 3 ✦ Match', 'strong_hit', { combatTrackId: 't1' }), narrated('n7', 'm7', 'take_decisive_action', 'strong_hit'),
      { id: 'v7', victory: { vowName: 'Find the raiders', vowId: 'v1', marks: 1, actorId: 'pc', resolvedActions: {} } }]);
  step('a8', click('⚑ Mark milestone (×1)'), () => { vow.ticks = 24; },
    [{ id: 'v7', victory: { vowName: 'Find the raiders', vowId: 'v1', marks: 1, actorId: 'pc', resolvedActions: { markMilestone: true } } }]);
  step('a9', say('I treat the gash in my arm.'), () => { rolled([2, 3], 5); },
    [moveCard('m9', 'Heal', 'Action: 5 + 1 = 6 | Challenge: 2, 3', 'strong_hit'), narrated('n9', 'm9', 'heal', 'strong_hit'),
      { id: 's9', suffer: { resolved: false, picked: [], moveId: 'heal', resolutionId: 'm9', actorId: 'pc', options: [{ label: 'Take/give +3 health' }] } }]);
  step('a10', click('Take/give +3 health'), () => { pc.health = 5; },
    [{ id: 's9', suffer: { resolved: true, picked: [0], moveId: 'heal', resolutionId: 'm9', actorId: 'pc', options: [{ label: 'Take/give +3 health' }] } }]);
  step('a11', say('I trade news with Tamsin.'), () => { conn.ticks = 40; bond.ticks = 40; },
    [moveCard('m11', 'Develop Your Relationship', '', null), narrated('n11', 'm11', 'develop_your_relationship', 'strong_hit')]);
  step('a12', say('I ask Tamsin to forge a bond.'), () => { conn.bonded = true; bond.completed = true; table.legacy.bonds.ticks = 2; rolled([3, 4]); },
    [moveCard('m12', 'Forge a Bond', 'Progress: 10 | Challenge: 3, 4', 'strong_hit'), narrated('n12', 'm12', 'forge_a_bond', 'strong_hit')]);
  step('a13', say('My vow is fulfilled.'), () => { vow.completed = true; table.legacy.quests.ticks = 4; rolled([1, 2]); },
    [moveCard('m13', 'Fulfill Your Vow', 'Progress: 6 | Challenge: 1, 2', 'strong_hit'), narrated('n13', 'm13', 'fulfill_your_vow', 'strong_hit'),
      { id: 'x13', legacyXp: { track: 'quests', boxes: 1, xp: 2 } }]);
  // A miss whose price names a suffer move: the table takes the cost at once and says what it took.
  step('a13b', say('I shoulder through the crowd at the board.'), () => { pc.health = 4; rolled([10, 9], 1); },
    [moveCard('m13b', 'Face Danger', 'Action: 1 + 2 = 3 | Challenge: 10, 9', 'miss'), narrated('n13b', 'm13b', 'face_danger', 'miss'),
      { id: 'p13b', price: { text: 'Pay the Price Face Danger d100 = 78 · You are harmed Routes to Endure Harm (-1).', actorId: 'pc' } },
      { id: 't13b', sufferTaken: { move: 'endure_harm', amount: 1, before: 5, after: 4, actorId: 'pc' } }]);
  // A weak hit momentum would improve, held — and kept with its button: its
  // narration comes with the press, before any other line.
  const heldGather = { open: true, resolvedBy: null, resolution: { moveId: 'gather_information', outcome: 'weak_hit' } };
  const lean = moveCard('m13c', 'Gather Information', 'Action: 3 + 3 = 6 | Challenge: 1, 8', 'weak_hit',
    { burn: { canBurn: true, momentum: 3, originalOutcome: 'weak_hit', previewOutcome: 'strong_hit', moveId: 'gather_information' }, held: heldGather });
  step('a13c', say('I lean on the clerk for the name.'), () => { rolled([1, 8], 3); }, [lean]);
  step('a13d', click('Keep the result'), () => {},
    [{ ...lean, move: { ...lean.move, held: { ...heldGather, open: false, resolvedBy: 'keep' } } }, narrated('n13d', 'm13c', 'gather_information', 'weak_hit')]);
  step('a14', { action: 'dialog', title: 'End a Session', fields: [{ name: 'questFocus', value: 'What the paymaster does next' }], press: 'End Session' },
    () => { table.session.active = false; table.session.questFocus = 'What the paymaster does next'; pc.momentum = 4; });

  return {
    marks: steps.map(s => ({ step: s.step, phase: 'session-1', table: s.table, cards: s.cards, settled: true })),
    actions: steps.filter(s => s.action).map(s => ({ step: s.step, action: s.action })),
    messages: [],
    dice,
  };
}

/** The story with one thing changed, as a defect would change it. */
function withDefect(change) {
  const run = story();
  const at = (stepId) => run.marks.find(k => k.step === stepId);
  change({ run, at, from: (stepId, fn) => { let on = false; for (const k of run.marks) { if (k.step === stepId) on = true; if (on) fn(k.table); } },
    card: (stepId, cardId) => at(stepId).cards.find(c => c.id === cardId) });
  return checkMechanics(run);
}
const violated = (result) => [...new Set(result.violations.map(v => v.check))].sort();

describe('the stretch of play, as the module should play it', () => {
  const result = checkMechanics(story());

  it('violates nothing', () => {
    expect(result.violations).toEqual([]);
  });

  it('and makes every check there is, so none passes for want of being asked', () => {
    for (const check of CHECKS) expect(result.byCheck[check].made, check).toBeGreaterThan(0);
    expect(result.checks).toBe(Object.values(result.byCheck).reduce((n, c) => n + c.made, 0));
  });

  it('lists each roll with its own dice', () => {
    expect(result.rolls.map(r => `${r.step} ${r.moveId} ${r.outcome}`)).toEqual([
      'a2 gather_information strong_hit', 'a2a undertake_an_expedition strong_hit', 'a2b explore_a_waypoint strong_hit', 'a2d finish_an_expedition strong_hit',
      'a3 strike weak_hit', 'a5 strike miss', 'a7 take_decisive_action strong_hit', 'a9 heal strong_hit',
      'a12 forge_a_bond strong_hit', 'a13 fulfill_your_vow strong_hit', 'a13b face_danger miss', 'a13c gather_information weak_hit',
    ]);
    expect(result.rolls[0]).toMatchObject({ dice: 'Action: 4 + 3 = 7 | Challenge: 2, 5', kind: 'action', scripted: false });
  });

  it('a card\'s state at a step is the latest of each card up to it', () => {
    const { marks } = story();
    const i = marks.findIndex(k => k.step === 'a4');
    expect(cardsAt(marks, i - 1).get('m3').move.burn.consumed).toBeUndefined();
    expect(cardsAt(marks, i).get('m3').move.burn.consumed).toBe(true);
  });
});

// The first rehearsal with the expedition crashed at a70 (the machine out of
// memory): its dice were never read from the GM's page, the run kept the
// empty list the runner then started with, and it was scored with fifteen
// rolls "not among the dice that fell" — every roll it made. A record never
// read is no record: explore.mjs keeps the dice null until it reads them, and
// the check is then not made. A record that is there and lacks a card's dice
// is still a violation.
describe('the dice as they fell, where the run kept no record of them', () => {
  it('is not made with no record — the same story is held to its dice when they were read', () => {
    const run = story();
    const rolls = checkMechanics(run).rolls.length;
    expect(checkMechanics({ ...run, dice: null }).byCheck['dice-as-they-fell']).toEqual({ made: 0, violated: 0 });
    expect(checkMechanics({ ...run, dice: null }).violations).toEqual([]);
    expect(checkMechanics(run).byCheck['dice-as-they-fell']).toEqual({ made: rolls, violated: 0 });
  });

  it('a record that is there and holds none of a card\'s dice is a violation, roll by roll', () => {
    const result = checkMechanics({ ...story(), dice: [] });
    expect(result.byCheck['dice-as-they-fell'].violated).toBe(result.byCheck['dice-as-they-fell'].made);
    expect(result.violations[0]).toMatchObject({ step: 'a2', check: 'dice-as-they-fell', detail: 'gather_information: the card\'s dice (Action: 4 + 3 = 7 | Challenge: 2, 5) are not among the dice that fell' });
  });
});

describe('each check catches the defect it is for', () => {
  it.each([
    ['roll-score', 'a card whose score is not its dice', ({ card }) => { card('a2', 'm2').move.diceLine = 'Action: 4 + 3 = 9 | Challenge: 2, 5'; }, 'its own dice give 7'],
    ['roll-outcome', 'a weak hit called a strong hit', ({ card }) => { card('a9', 'm9').move.diceLine = 'Action: 1 + 1 = 2 | Challenge: 1, 3'; card('a9', 'm9').move.shown = 'strong_hit'; }, 'is a weak hit'],
    ['roll-outcome', 'a decisive action in a bad spot not taken down a step', ({ card }) => { card('a7', 'm7').move.diceLine = 'Progress: 4 | Challenge: 2, 3'; }, 'is a weak hit'],
    ['roll-match', 'a match the card does not show', ({ card }) => { card('a7', 'm7').move.diceLine = 'Progress: 4 | Challenge: 3, 3'; }, 'are a match the card does not show'],
    ['roll-cancelled-die', 'negative momentum that did not cancel the die it equals', ({ from, card }) => { from('a1', (t) => { if (t.pcs[0].momentum === 3) t.pcs[0].momentum = -4; }); card('a2', 'm2').move.diceLine = 'Action: 4 + 3 = 7 | Challenge: 2, 5'; }, 'not cancelled with momentum at -4'],
    ['roll-narrated-as-rolled', 'a strong hit narrated as a weak one', ({ card }) => { card('a2', 'n2').narration.outcome = 'weak_hit'; }, 'narrated as a weak hit'],
    ['progress-score', 'a progress roll scored off the wrong track', ({ card }) => { card('a12', 'm12').move.diceLine = 'Progress: 8 | Challenge: 3, 4'; }, 'the relationship had 40 ticks (10 boxes)'],
    ['meter-bounds', 'health past its maximum', ({ from }) => from('a10', (t) => { t.pcs[0].health = 6; }), 'health is 6'],
    ['meter-bounds', 'momentum past its own maximum', ({ from }) => from('a14', (t) => { t.pcs[0].momentumMax = 3; }), 'its maximum is 3'],
    ['track-bounds', 'a track past its tenth box', ({ from }) => from('a11', (t) => { t.connections[0].ticks = 44; t.pcs[0].bonds[0].ticks = 44; }), '44 ticks'],
    ['progress-per-mark', 'a mark of the wrong size for its rank', ({ from }) => from('a8', (t) => { t.pcs[0].vows[0].ticks = 20; }), 'a mark at that rank is 8'],
    ['expedition-progress', 'an expedition marked twice for one hit', ({ from }) => from('a2a', (t) => { const e = t.tracks.find(x => x.id === 't2'); if (e.ticks === 8) e.ticks = 16; }), 'marks progress once: the dangerous expedition "the source of the distress call" gained 16 ticks'],
    ['expedition-progress', 'a hit that began no expedition and marked none', ({ at }) => { at('a2a').table.tracks = at('a2a').table.tracks.filter(x => x.id !== 't2'); }, 'no expedition gained any'],
    ['expedition-progress', 'a crossing that missed and began a journey all the same', ({ card }) => { card('a2a', 'm2a').move.diceLine = 'Action: 1 + 3 = 4 | Challenge: 9, 6'; card('a2a', 'm2a').move.shown = 'miss'; card('a2a', 'n2a').narration.outcome = 'miss'; }, 'undertake_an_expedition missed, and "the source of the distress call" was begun'],
    ['expedition-progress', 'a waypoint\'s mark that marked nothing', ({ at }) => { at('a2c').table.tracks.find(x => x.id === 't2').ticks = 8; }, '"Mark expedition progress" marks progress once: no expedition gained any'],
    ['progress-score', 'an expedition finished on a score that is not its boxes', ({ card }) => { card('a2d', 'm2d').move.diceLine = 'Progress: 6 | Challenge: 1, 2'; }, 'the expedition "the source of the distress call" had 16 ticks (4 boxes)'],
    ['legacy-reward', 'an expedition finished that paid the discoveries legacy nothing', ({ from }) => from('a2d', (t) => { t.legacy.discoveries.ticks = 0; }), 'the discoveries legacy gained 0 ticks, not 2'],
    ['legacy-reward', 'an expedition\'s card that says other than the legacy track', ({ card }) => { card('a2d', 'f2d').expeditionFinished.legacyTicks = 4; }, 'the discoveries legacy gained 2 ticks — and its card says 4'],
    ['legacy-reward', 'a finish that hit and left its expedition open', ({ from }) => from('a2d', (t) => { t.tracks.find(x => x.id === 't2').completed = false; }), '0 expeditions were completed, not one'],
    ['bond-mirror', 'the bond Item left behind the card', ({ at }) => { at('a11').table.pcs[0].bonds[0].ticks = 32; }, 'bond Item for Tamsin Vey says 32 ticks'],
    ['link-mirror', 'a renamed card whose vow still shows the old name', ({ from }) => from('a9', (t) => { t.connections[0].name = 'Tamsin Okoro'; t.pcs[0].bonds[0].name = 'Tamsin Okoro'; }), 'shows the name "Tamsin Vey"'],
    ['legacy-reward', 'a forged bond paid at the wrong rank', ({ from }) => from('a12', (t) => { t.legacy.bonds.ticks = 4; }), 'the bonds legacy gained 4 ticks, not 2'],
    ['legacy-reward', 'a fulfilled vow that paid nothing', ({ from }) => from('a13', (t) => { t.legacy.quests.ticks = 2; }), 'the quests legacy gained 0 ticks, not 2'],
    ['legacy-reward', 'legacy marked with nothing to mark it for', ({ from }) => from('a9', (t) => { t.legacy.quests.ticks += 4; }), 'no vow was fulfilled in this step'],
    ['xp-per-box', 'a legacy box paid one experience', ({ card }) => { card('a13', 'x13').legacyXp.xp = 1; }, 'gives 1 experience for 1 box'],
    ['move-momentum', 'a strong hit\'s momentum paid twice', ({ from }) => from('a2', (t) => { t.pcs[0].momentum += 2; }), 'gives +2 momentum: Mira went from 3 to 7, not 5'],
    ['milestone-once', 'a milestone marked twice by one press', ({ from }) => from('a8', (t) => { t.pcs[0].vows[0].ticks = 32; }), '16 → 32 ticks, not 24'],
    ['suffer-cost', 'a cost of two that took three', ({ from }) => from('a6', (t) => { if (t.pcs[0].health === 3) t.pcs[0].health = 2; }), 'health went from 5 to 2, not 3'],
    ['suffer-cost', 'a price of one that took two', ({ from }) => from('a13b', (t) => { t.pcs[0].health = 3; }), 'routes to endure_harm (-1): Mira\'s health went from 5 to 3, not 4'],
    ['suffer-cost', 'a cost whose card says other than the sheet', ({ card }) => { card('a13b', 't13b').sufferTaken.after = 3; }, 'its card says 5 → 3'],
    ['recover-amount', 'a recovery that gave less than it said', ({ from }) => from('a10', (t) => { t.pcs[0].health = 4; }), 'health went from 3 to 4, not 5'],
    ['burn', 'momentum not reset by the burn', ({ at }) => { at('a4').table.pcs[0].momentum = 5; }, 'momentum is 5 after the burn; its reset value is 2'],
    ['burn', 'the first outcome\'s marks kept under the burned one\'s', ({ from }) => from('a4', (t) => { t.tracks[0].ticks = 32; }), 'the fight\'s track holds 32 ticks; strike on a strong hit from 0 gives 16'],
    ['burn', 'the burned outcome narrated twice', ({ at }) => { at('a4').cards.push(narrated('n4b', 'm3-again', 'strike', 'strong_hit', { upgradeOf: 'm3' })); }, 'narrated again 2 time(s), not once'],
    ['burn', 'a burn that marked no card', ({ at }) => { at('a4').cards.shift(); }, 'no move card is marked burned'],
    ['session-momentum', 'Begin a Session\'s +1 paid twice', ({ at }) => { at('a1').table.pcs[0].momentum = 4; }, 'momentum went from 2 to 4, not 3'],
    ['session-momentum', 'End a Session paying with no focus noted', ({ run }) => { run.actions.find(a => a.step === 'a14').action.fields = []; }, 'End a Session without its +1'],
    ['lock-free', 'the move lock held after the table settled', ({ at }) => { at('a9').table.session.pendingMove = true; }, 'the move lock was held'],
    ['answered-once', 'a line narrated twice', ({ at }) => { at('a2').cards.push(narrated('n2b', 'other', 'gather_information', 'strong_hit')); }, 'narrated 2 times'],
    ['answered-once', 'a line nobody answered', ({ at }) => { at('a11').cards.length = 0; }, 'no narration and no card that asks for a choice'],
    ['held-narrated-in-turn', 'a held result kept by the next line, and narrated after it', ({ run, at }) => {
      run.actions.find(a => a.step === 'a13d').action = say('I take the name and go.');
      at('a13d').cards.push(narrated('n13e', 'own-13d', 'face_danger', 'strong_hit'));
    }, 'gather_information (a weak hit), rolled at a13c and held for Keep or Burn, was kept by the next line and narrated after the next line (a13d)'],
  ])('%s — %s', (check, _what, change, says) => {
    const result = withDefect(change);
    expect(violated(result), JSON.stringify(result.violations)).toContain(check);
    expect(result.violations.find(v => v.check === check).detail).toContain(says);
  });

  // The fourth live run's a38–a41 (explorations/long-haul-live-20261124-213912):
  // Enter the Fray missed and was held; "⚔ Begin the fight" kept nothing; the
  // attack at a41 kept it, so a38's narration came after a41's line — and then
  // the Clash's own. The run's own check counted that as a line narrated twice.
  it('held-narrated-in-turn — the fourth live run\'s a38–a41: one answer to the line, and the held result told after it', () => {
    const t = (over = {}) => ({ session: { active: true, id: 's2', pendingMove: false }, pcs: [{ id: 'pc', name: 'Mira', health: 5, spirit: 1, supply: 5, momentum: 9, momentumMax: 10, momentumReset: 2, debilities: [], vows: [], bonds: [], legacies: {} }], connections: [], tracks: [], legacy: {}, ...over });
    const held = { open: true, resolvedBy: null, resolution: { moveId: 'enter_the_fray', outcome: 'miss' } };
    const fray = moveCard('m38', 'Enter the Fray', 'Action: 3 + 1 = 4 | Challenge: 6, 7', 'miss', { held, burn: { canBurn: true, momentum: 9, originalOutcome: 'miss', previewOutcome: 'strong_hit', moveId: 'enter_the_fray' } });
    const fight = { id: 'f1', label: 'The Ashen Wake', type: 'combat', rank: 'dangerous', ticks: 0, completed: false, combatState: 'bad_spot' };
    const marks = [
      { step: 'a37', table: t(), cards: [], settled: true },
      { step: 'a38', table: t(), cards: [fray, { id: 'th38', threshold: { label: 'The Ashen Wake', position: 'bad_spot' } }], settled: true },
      { step: 'a40', table: t({ tracks: [fight] }), cards: [{ id: 'tc40', trackCard: { created: true, trackId: 'f1' } }], settled: true },
      { step: 'a41', table: t({ tracks: [fight] }), settled: true, cards: [
        { ...fray, move: { ...fray.move, held: { ...held, open: false, resolvedBy: 'later' } } },
        narrated('n41a', 'm38', 'enter_the_fray', 'miss'),
        moveCard('m41', 'Clash', 'Action: 1 + 2 = 3 | Challenge: 10, 9', 'miss', { combatTrackId: 'f1' }),
        narrated('n41b', 'm41', 'clash', 'miss'),
      ] },
    ];
    const actions = [
      { step: 'a38', action: say('The Ashen Wake drops out of the dark off Bleakhold\'s ring. I spin the Kobayashi IV to face her and bring the guns to bear.') },
      { step: 'a40', action: click('⚔ Begin the fight') },
      { step: 'a41', action: say('I\'m in a bad spot, so I fight back hard, throwing the Kobayashi IV into a tight turn and hammering the Ashen Wake\'s flank with everything the guns have.') },
    ];
    const result = checkMechanics({ marks, actions, messages: [] });
    expect(result.byCheck['answered-once'], 'a38 held its result on a card; a41 had one answer of its own').toEqual({ made: 2, violated: 0 });
    expect(result.byCheck['held-narrated-in-turn']).toEqual({ made: 1, violated: 1 });
    expect(result.violations).toEqual([{ step: 'a41', check: 'held-narrated-in-turn', detail: 'enter_the_fray (a miss), rolled at a38 and held for Keep or Burn, was kept by the next line and narrated after the next line (a41): the player read it as this line\'s answer' }]);
    // Kept with its own button instead, at a39: told in turn, before the attack.
    const pressed = [...marks.slice(0, 2),
      { step: 'a39', table: t(), settled: true, cards: [{ ...fray, move: { ...fray.move, held: { ...held, open: false, resolvedBy: 'keep' } } }, narrated('n39', 'm38', 'enter_the_fray', 'miss')] },
      { ...marks[2] }, { ...marks[3], cards: marks[3].cards.slice(2) }];
    const inTurn = checkMechanics({ marks: pressed, actions: [actions[0], { step: 'a39', action: click('Keep the result') }, ...actions.slice(1)], messages: [] });
    expect(inTurn.byCheck['held-narrated-in-turn']).toEqual({ made: 1, violated: 0 });
    expect(inTurn.violations).toEqual([]);
  });

  it('dice-as-they-fell — a card whose dice are not the dice that fell', () => {
    const run = story();
    run.dice[0] = uniformFor(9, 10);                    // the first challenge die fell a 9; the card says 2
    const result = checkMechanics(run);
    expect(violated(result)).toEqual(['dice-as-they-fell']);
    expect(result.violations[0]).toMatchObject({ step: 'a2', detail: expect.stringContaining('are not among the dice that fell') });
  });

  it.each([
    // …and the vow's later fulfilment is then scored off a track that does not hold what its card says.
    ['a mark of the wrong size', ({ from }) => from('a8', (t) => { t.pcs[0].vows[0].ticks = 20; }), ['milestone-once', 'progress-per-mark', 'progress-score']],
    ['momentum paid twice at Begin a Session', ({ at }) => { at('a1').table.pcs[0].momentum = 4; }, ['move-momentum', 'session-momentum']],
    ['a held lock', ({ at }) => { at('a9').table.session.pendingMove = true; }, ['lock-free']],
    ['a lagging bond Item', ({ at }) => { at('a11').table.pcs[0].bonds[0].ticks = 32; }, ['bond-mirror']],
  ])('a defect is named by the checks it breaks and no others: %s', (_what, change, checks) => {
    expect(violated(withDefect(change))).toEqual(checks);
  });

  it('a step the table never settled after, or left waiting on the GM, is not held to the lock or to an answer', () => {
    const run = story();
    const mark = run.marks.find(k => k.step === 'a11');
    mark.table.session.pendingMove = true;
    mark.cards.length = 0;
    mark.waitingOnGm = true;
    expect(checkMechanics(run).violations.filter(v => v.step === 'a11').map(v => v.check)).toEqual([]);
  });
});

describe('a price, as its card tells it', () => {
  it('names its roll, its entry, and the suffer move it routes to — or none', () => {
    expect(parsePriceLine('Pay the Price Strike d100 = 78 · You are harmed Routes to Endure Harm (-1).'))
      .toEqual({ roll: 78, entry: 'You are harmed', route: { move: 'endure_harm', amount: 1 } });
    expect(parsePriceLine('Pay the PriceStriked100 = 36 · Something of value is lost or destroyed'))
      .toEqual({ roll: 36, entry: 'Something of value is lost or destroyed', route: null });
    expect(parsePriceLine('Pay the Price Clash d100 = 70 · You waste resources Routes to Sacrifice Resources (-2).').route).toEqual({ move: 'sacrifice_resources', amount: 2 });
    expect(parsePriceLine('')).toEqual({ roll: null, entry: '', route: null });
  });
});

describe('the rules the checks hold the table to (tests/helpers/sequence/rules.js)', () => {
  it('an action score is the die, the stat and the adds, never above ten; a cancelled die counts for nothing', () => {
    expect(rolledScore({ actionDie: 4, stat: 3, adds: 1 })).toBe(8);
    expect(rolledScore({ actionDie: 6, stat: 3, adds: 2 })).toBe(10);
    expect(rolledScore({ actionDie: 4, stat: 2, cancelled: true })).toBe(2);
    expect([dieCancelled(4, -4), dieCancelled(4, -3), dieCancelled(4, 4)]).toEqual([true, false, false]);
  });

  it('momentum: its maximum and reset by impacts; a burn needs more than the action die and scores as itself', () => {
    expect([momentumMaxFor(0), momentumMaxFor(2), momentumResetFor(0), momentumResetFor(1), momentumResetFor(3)]).toEqual([10, 8, 2, 1, 0]);
    expect([canBurn(5, 3), canBurn(3, 3), canBurn(0, 1), canBurn(-2, 1)]).toEqual([true, false, false, false]);
    expect([burnedOutcome(5, [1, 4]), burnedOutcome(5, [1, 5]), burnedOutcome(5, [6, 9])]).toEqual(['strong_hit', 'weak_hit', 'miss']);
  });

  it('a decisive action in a bad spot goes down a step — but a strong hit with a match stands', () => {
    expect(decisiveOutcome('strong_hit', { inBadSpot: true })).toBe('weak_hit');
    expect(decisiveOutcome('strong_hit', { inBadSpot: true, match: true })).toBe('strong_hit');
    expect(decisiveOutcome('weak_hit', { inBadSpot: true })).toBe('miss');
    expect(decisiveOutcome('weak_hit', { inBadSpot: false })).toBe('weak_hit');
  });

  it('experience by legacy box; costs to the floor with what is left over; recoveries to the ceiling', () => {
    expect([xpForBoxes(1), xpForBoxes(2), xpForBoxes(2, true), boxesFilled(2, 4), boxesFilled(3, 9), boxesFilled(4, 6)]).toEqual([2, 4, 2, 1, 2, 0]);
    expect(sufferCost(1, 3)).toEqual({ after: 0, remainder: 2 });
    expect(sufferCost(-5, 3, -6)).toEqual({ after: -6, remainder: 2 });
    expect([recover(3, 3), recover(1, 3), recover(9, 2, 10)]).toEqual([5, 4, 10]);
  });

  // The expedition moves, in their own words (the header of rules.js quotes
  // them): one mark for a hit that undertakes it and none for a miss; a
  // waypoint's strong hit a choice of one mark or +2 momentum, its weak hit
  // +1; a finish paid on the discoveries legacy by rank, one rank lower on a
  // weak hit — and a miss finishes nothing.
  it('an expedition: a mark for a hit, a waypoint\'s choice, the discoveries legacy by rank', () => {
    expect(EXPEDITION_MARKS).toEqual({ strong_hit: 1, weak_hit: 1, miss: 0 });
    expect(WAYPOINT_CHOICE).toEqual({ marks: 1, momentum: 2 });
    expect(MOVE_MOMENTUM.explore_a_waypoint).toEqual({ weak_hit: 1 });
    expect(RANKS.map(r => expeditionReward(r, 'strong_hit'))).toEqual([1, 2, 4, 8, 12]);
    expect(RANKS.map(r => expeditionReward(r, 'weak_hit')), 'one rank lower; none under troublesome').toEqual([0, 1, 2, 4, 8]);
    expect(RANKS.map(r => expeditionReward(r, 'miss'))).toEqual([0, 0, 0, 0, 0]);
    expect([expeditionFinished('strong_hit'), expeditionFinished('weak_hit'), expeditionFinished('miss')]).toEqual([true, true, false]);
  });

  it('the tables are the play kit\'s: momentum by outcome, marks in a fight, the bonded roll', () => {
    expect(MOVE_MOMENTUM.gather_information).toEqual({ strong_hit: 2, weak_hit: 1 });
    expect(MOVE_MOMENTUM.enter_the_fray).toEqual({ strong_hit: 2 });
    expect(FIGHT_MARKS).toEqual({ strike: { strong_hit: 2, weak_hit: 2, miss: 0 }, clash: { strong_hit: 2, weak_hit: 1, miss: 0 } });
    expect(BONDED_DEVELOP).toEqual({ strong_hit: { bondsTicks: 2, momentum: 0 }, weak_hit: { bondsTicks: 0, momentum: 2 }, miss: { bondsTicks: 0, momentum: 0 } });
  });
});
