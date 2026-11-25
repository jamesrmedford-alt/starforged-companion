/**
 * STARFORGED COMPANION
 * tests/unit/fightNotNarratedBeforeBegun.test.js
 *
 * known-issues FIGHT-NARRATED-BEFORE-IT-IS-BEGUN — the long haul's third live
 * run (explorations/long-haul-live-20261124-0321, a27), beside
 * FIGHT-COMMIT-CARD-AFTER-THE-ROLL.
 *
 * "…so I swing the Kobayashi IV around and turn to fight her, guns hot." was
 * rolled as Enter the Fray, a strong hit. Its card said "Your Enter the Fray
 * is rolled, but the fight's track is not made yet: set it up here and press
 * ⚔ Begin the fight to begin it — or look for a way out instead", and the
 * narration under it: "Your first salvo takes her forward plating while her
 * gunners are still finding the range." Had the player taken the way out, the
 * salvo would have stood.
 *
 * The narration was told the stakes shown before the roll — "open with a clean
 * salvo before she can bring her own guns to bear" — and "This is a strong
 * hit: deliver the hit as stated". Nothing told it the fight was still only
 * offered. "Combat is offered, not forced" (decisions.md) stands: the track
 * is made only on the card. While that card is unanswered the narration now
 * brings the scene to the moment before the first blow, and no further.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

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
import { obligationsFor, unansweredCardsFor } from "../../src/moves/contracts/obligations.js";
// The STAKES / PRICE / COST / FIGHT blocks are lines of the narration's one
// obligations block now (overhaul 4, slice 2 — contracts/obligations.js, their
// words kept): each stand-in below is that line, tagged, as the block carries it.
const lineFor = (kind, resolution) => { const o = obligationsFor({ mode: "move", resolution }).find(x => x.kind === kind); return o ? `- [${o.kind}] ${o.text}` : ""; };
const formatFightOfferBlock = (fightOffer) => lineFor("fight", { moveId: "enter_the_fray", fightOffer });
const formatStakesBlock = (stakes, outcome, extra = {}) => lineFor("stakes", { stakes, outcome, ...extra });
const withUnansweredCards = (input) => ({ ...input, ...unansweredCardsFor(input) });
import { buildNarratorUserMessage, buildRoundUserMessage } from '../../src/narration/narratorPrompt.js';

// Run 3, a27 — the player's line, the stakes the dialog showed, the outcome block sent.
const LINE   = 'The Ashen Wake bursts out of the dark off Bleakhold, so I swing the Kobayashi IV around and turn to fight her, guns hot.';
const STAKES = { hit: "You swing the Kobayashi IV into the Wake's line and open with a clean salvo before she can bring her own guns to bear." };
const OUTCOME = '[MOVE: Enter the Fray +edge] [ROLL: Action: 6 + 2 = 8 vs Challenge: 2, 2] [OUTCOME: Strong Hit with a Match [MATCH]] '
  + '[CONSEQUENCE: Strong hit: take both — +2 momentum AND you are in control.]';
const OFFERED  = '[fight] THE FIGHT IS STILL ONLY OFFERED.';
const DECLINED = '[fight] THE FIGHT WAS NOT BEGUN.';

const frayStrongHit = (over = {}) => ({
  _id: 'res-a27', moveId: 'enter_the_fray', moveName: 'Enter the Fray', statUsed: 'edge', outcome: 'strong_hit',
  outcomeLabel: 'Strong Hit with a Match', isMatch: true, loremasterContext: OUTCOME, stakes: STAKES, ...over,
});
const fightCard = (over = {}) => ({ flags: { [MODULE_ID]: {
  combatThresholdCard: true, label: 'The Ashen Wake', position: 'in_control', actorId: 'pc-mira', resolutionId: 'res-a27', ...over,
} } });

describe("an Enter the Fray whose fight is still only offered — as its narration is told it (unit)", () => {
  let saved;
  beforeEach(() => { saved = globalThis.game.messages; globalThis.game.messages = { contents: [] }; });
  afterEach(() => { globalThis.game.messages = saved; });

  it('a27: the fight\'s card on the table, unanswered — the fight is offered, in control', () => {
    globalThis.game.messages.contents.push(fightCard());
    expect(withUnansweredCards(frayStrongHit()).fightOffer).toEqual({ status: 'offered', position: 'in_control' });
  });

  it('the narration brings the scene to the moment before the first blow, and no further', () => {
    globalThis.game.messages.contents.push(fightCard());
    const user = buildNarratorUserMessage(withUnansweredCards(frayStrongHit()), LINE, 3, 'Mira Kestrel');
    expect(user).toContain(`- On a hit: ${STAKES.hit}`);                          // what it was shown
    expect(user).not.toContain('This is a strong hit: deliver the hit as stated.');
    expect(user).toContain('This is a strong hit: the hit as stated is the opening this roll has won — where it puts them — not a blow already struck.');
    expect(user).toContain(OFFERED);
    expect(user).toMatch(/the fight has not begun: a card asks the player whether to begin it or look for a way out, and they have not answered/);
    expect(user).toMatch(/Bring the scene to the moment before the first blow, and stop there: where each side stands/);
    expect(user).toMatch(/The footing this roll gave them: the upper hand\./);
    expect(user).toMatch(/Nobody has struck yet: no shot is fired, no blow lands, nothing and no one is hit, damaged or hurt/);
    expect(user).toMatch(/a first salvo, a first strike — show it as what they are placed to do, about to happen, never as done/);
    // The one block comes after the player's line, before the instruction (overhaul 4).
    expect(user.indexOf(OFFERED)).toBeGreaterThan(user.indexOf('## PLAYER NARRATION'));
  });

  it('a miss says the footing it gave: the back foot', () => {
    globalThis.game.messages.contents.push(fightCard({ position: 'bad_spot' }));
    const told = withUnansweredCards(frayStrongHit({ outcome: 'miss', outcomeLabel: 'Miss', isMatch: false }));
    expect(formatFightOfferBlock(told.fightOffer)).toMatch(/The footing this roll gave them: the back foot\./);
  });

  it('once the fight is begun on the card, the roll is narrated as before', () => {
    globalThis.game.messages.contents.push(fightCard({ thresholdTaken: 'fray' }));
    const resolution = frayStrongHit();
    expect(unansweredCardsFor(resolution)).toEqual({});
    const user = buildNarratorUserMessage(resolution, LINE, 3, 'Mira Kestrel');
    expect(user).toContain('This is a strong hit: deliver the hit as stated.');
    expect(user).not.toContain(OFFERED);
  });

  it('the way out taken: no blow is struck at all', () => {
    globalThis.game.messages.contents.push(fightCard({ thresholdTaken: 'wayOut' }));
    const told = withUnansweredCards(frayStrongHit());
    expect(told.fightOffer).toEqual({ status: 'declined', position: 'in_control' });
    const user = buildNarratorUserMessage(told, LINE, 3, 'Mira Kestrel');
    expect(user).toContain(DECLINED);
    expect(user).toMatch(/the player chose to look for a way out instead of beginning the fight\. No blow is struck by either side/);
    expect(user).not.toContain('deliver the hit as stated.');
  });

  it('control: no card posted — an open fight with that foe was resumed, and nothing is offered', () => {
    const resolution = frayStrongHit();
    expect(unansweredCardsFor(resolution)).toEqual({});
    expect(formatFightOfferBlock(null)).toBe('');
    expect(formatStakesBlock(STAKES, 'strong_hit')).toContain('This is a strong hit: deliver the hit as stated.');
  });

  it('control: another move\'s result is no fight\'s offer, whatever card carries its id', () => {
    globalThis.game.messages.contents.push(fightCard());
    const strike = { _id: 'res-a27', moveId: 'strike', outcome: 'strong_hit', stakes: { hit: 'Your shot lands.' } };
    expect(unansweredCardsFor(strike)).toEqual({});
  });

  it('a Batch Mode round\'s entry carries the block under its own outcome', () => {
    globalThis.game.messages.contents.push(fightCard());
    const input = withUnansweredCards({ kind: 'move', resolutionId: 'res-a27', moveId: 'enter_the_fray', moveName: 'Enter the Fray',
      statUsed: 'edge', outcome: 'strong_hit', outcomeLabel: 'Strong Hit', loremasterContext: OUTCOME, stakes: STAKES });
    const user = buildRoundUserMessage({ entries: [{ actorName: 'Mira Kestrel', text: LINE, input }], sentenceTarget: 3 });
    expect(user).toContain('[fight] THE FIGHT IS STILL ONLY OFFERED.');
    expect(user).not.toContain('deliver the hit as stated.');
  });
});

describe('FIGHT-NARRATED-BEFORE-IT-IS-BEGUN — Enter the Fray, through the pipeline', () => {
  const REPLY = 'The cutter slides into your forward view.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';
  const NARRATION_MODEL = 'claude-sonnet-5-5';
  // a27's dice: challenge 2 and 2, action 6 + edge 2 = 8 — a strong hit with a match (in control).
  const FRAY_STRONG = [0.15, 0.15, 0.9];
  let table, journal;

  function makeTracksJournal() {
    const flags = {};
    return {
      id: 'tracks-journal', name: 'Starforged Progress Tracks',
      getFlag: (mod, key) => flags[`${mod}.${key}`],
      setFlag: async (mod, key, value) => { flags[`${mod}.${key}`] = JSON.parse(JSON.stringify(value)); },
    };
  }
  const narrations = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL
    && /Narrate the consequence/.test(c.userText ?? '') && /MOVE: Enter the Fray/i.test(c.userText ?? ''));

  beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
  afterAll(() => table?.teardown());
  beforeEach(async () => {
    control.dice = [];
    await table.reset({ world: { settings: {
      chronicleAutoEntry: false, narratorSessionSummary: false,
      campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-2', sessionNumber: 2, currentSceneId: 'sc-2', sceneTruths: [] },
    } } });
    await table.setClaudeKey('gm-1', 'sk-ant-gina');
    table.addActor({ id: 'pc-mira', name: 'Mira Kestrel', ownership: { 'pl-1': 3 }, system: { edge: 2, momentum: { value: 2 } } });
    journal = makeTracksJournal();
    table.journal._set(journal);
    scriptClaude(table, { fallback: () => REPLY });
  });

  it('the roll\'s narration, written under the unanswered card, stops before the first blow — and the fight is still made only on the card', async () => {
    control.interpretation = {
      moveId: 'enter_the_fray', moveName: 'Enter the Fray', statUsed: 'edge', adds: 0,
      moveTarget: 'The Ashen Wake', combatRank: 'dangerous', rationale: 'test', mischiefApplied: false, stakes: { ...STAKES },
    };
    control.dice = FRAY_STRONG;
    await table.client('pl-1').chat(LINE, { speaker: { actor: 'pc-mira' } });
    await table.settle();
    await table.drain();

    const cards = table.cards();
    const threshold = cards.find(m => m.flags?.[MODULE_ID]?.combatThresholdCard === true);
    expect(threshold, 'the fight\'s card was posted').toBeTruthy();
    expect(threshold.flags[MODULE_ID].thresholdTaken ?? null).toBeNull();
    expect(threshold.flags[MODULE_ID].position).toBe('in_control');

    expect(narrations()).toHaveLength(1);
    const user = narrations()[0].userText;
    expect(user).toContain('[OUTCOME: Strong Hit with a Match [MATCH]]');
    expect(user).toContain(`- On a hit: ${STAKES.hit}`);
    expect(user).toContain(OFFERED);
    expect(user).toContain('Nobody has struck yet: no shot is fired, no blow lands');
    expect(user).toContain('The footing this roll gave them: the upper hand.');
    expect(user).not.toContain('This is a strong hit: deliver the hit as stated.');
    // "Combat is offered, not forced": nothing made the fight's track but the card will.
    expect(journal.getFlag(MODULE_ID, 'tracks') ?? []).toEqual([]);
  }, 60_000);
});
