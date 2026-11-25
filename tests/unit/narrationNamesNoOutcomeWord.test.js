/**
 * STARFORGED COMPANION
 * tests/unit/narrationNamesNoOutcomeWord.test.js
 *
 * known-issues NARRATION-NAMES-THE-OUTCOME — two samples, two live runs.
 *
 *   - run 2 (explorations/long-haul-live-20261123-1459, a51), a Resupply:
 *     "Strong hit, and a match: he throws in a sealed ration crate…"
 *   - run 3 (explorations/long-haul-live-20261124-0321, a27), an Enter the
 *     Fray: "The match flares bright on the scope" — nothing in the scene is
 *     a match.
 *
 * Both outcome blocks read "[OUTCOME: Strong Hit with a Match [MATCH]]". The
 * rule against repeating the mechanical outcome ("Do not repeat the mechanical
 * outcome verbatim. Transform it into narrative.") named no word, and nothing
 * told the narrator what a match is for. It now names the four — strong hit,
 * weak hit, miss, match — and says a match is told as its twist.
 */

import { describe, it, expect } from 'vitest';
import { buildNarratorSystemPrompt, buildNarratorUserMessage, buildRoundUserMessage } from '../../src/narration/narratorPrompt.js';

// The outcome blocks as the two runs sent them.
const RUN3_A27 = '[MOVE: Enter the Fray +edge] [ROLL: Action: 6 + 2 = 8 vs Challenge: 2, 2] [OUTCOME: Strong Hit with a Match [MATCH]] '
  + '[CONSEQUENCE: Strong hit: take both — +2 momentum AND you are in control.]';
const RUN2_A51 = '[MOVE: Resupply +heart] [ROLL: Action: 6 + 2 = 8 vs Challenge: 5, 5] [OUTCOME: Strong Hit with a Match [MATCH]] '
  + '[CONSEQUENCE: If unprepared, clear it and take/give +2 supply; otherwise take/give +2 supply. Or acquire a specific item and take +1 momentum.]';

const move = (loremasterContext, over = {}) => ({
  moveId: 'enter_the_fray', moveName: 'Enter the Fray', outcome: 'strong_hit', outcomeLabel: 'Strong Hit with a Match',
  isMatch: true, loremasterContext, ...over,
});

const role = (mode) => buildNarratorSystemPrompt({}, {}, null, '', { mode });

describe('NARRATION-NAMES-THE-OUTCOME — the dice\'s own words are not written into the prose', () => {
  it('the move narration\'s rule names the four words as never to appear as such', () => {
    const system = role('move_resolution');
    expect(system).toMatch(/Do not repeat the mechanical outcome verbatim\. Transform it into narrative\./);   // the rule it sits beside
    expect(system).toMatch(/"Strong hit", "weak hit", "miss" and "match" never appear in the narration as such/);
    expect(system).toMatch(/not as the roll's name \("a strong hit", "it's a miss", "and a match"\)/);
    expect(system).toMatch(/not as an image made out of the word \(a match that flares/);
  });

  it('a match is told as its twist, with no name for it', () => {
    const system = role('move_resolution');
    expect(system).toMatch(/A match is told as its twist — on a hit, something unexpected or a new opening; on a miss, the turn that makes it worse/);
    expect(system).toMatch(/as an event in the scene, with no name for it/);
  });

  it('a Batch Mode round\'s role carries the same rule', () => {
    expect(role('round_resolution')).toMatch(/"Strong hit", "weak hit", "miss" and "match" never appear in the narration as such/);
  });

  it('run 3\'s a27: the outcome block says [MATCH], and the ask under it says the word is never written', () => {
    const user = buildNarratorUserMessage(move(RUN3_A27),
      'The Ashen Wake bursts out of the dark off Bleakhold, so I swing the Kobayashi IV around and turn to fight her, guns hot.', 3, 'Mira Kestrel');
    expect(user).toContain('[OUTCOME: Strong Hit with a Match [MATCH]]');
    // The match line is TELL [match] of the narration's one block now (overhaul 4, slice 2), its words kept.
    expect(user).toContain('- [match] This roll came with a match: tell its twist as something that happens in the scene, and never write the word "match".');
    expect(user).toMatch(/Do not explain the mechanical outcome — embody it\. Keep to the block above/);
    expect(user.indexOf('[MATCH]')).toBeLessThan(user.indexOf('never write the word "match"'));
  });

  it('run 2\'s a51: the same for a Resupply', () => {
    const user = buildNarratorUserMessage(move(RUN2_A51, { moveId: 'resupply', moveName: 'Resupply' }),
      "I give up on the wound for now and restock the ship at Bleakhold's market instead, a Resupply.", 3, 'Mira Kestrel');
    expect(user).toMatch(/This roll came with a match: tell its twist as something that happens in the scene/);
  });

  it('a round entry with a match says so under its own outcome', () => {
    const user = buildRoundUserMessage({ entries: [
      { actorName: 'Mira Kestrel', text: 'I turn to fight her, guns hot.', input: { kind: 'move', moveName: 'Enter the Fray', statUsed: 'edge',
        outcome: 'strong_hit', outcomeLabel: 'Strong Hit with a Match', isMatch: true, loremasterContext: RUN3_A27 } },
      { actorName: 'Ren', text: 'I hold the helm steady.', input: { kind: 'move', moveName: 'Face Danger', statUsed: 'edge',
        outcome: 'weak_hit', outcomeLabel: 'Weak Hit', isMatch: false, loremasterContext: '[MOVE: Face Danger +edge] [OUTCOME: Weak Hit]' } },
    ], sentenceTarget: 3 });
    expect(user.match(/This roll came with a match/g)).toHaveLength(1);
    expect(user.indexOf('This roll came with a match')).toBeLessThan(user.indexOf('### 2. Ren'));
  });

  it('control: a roll with no match is told nothing about one', () => {
    const user = buildNarratorUserMessage(move('[MOVE: Heal +iron] [OUTCOME: Weak Hit]', { isMatch: false, outcome: 'weak_hit' }), 'I bind the cut.', 3, 'Mira Kestrel');
    expect(user).not.toMatch(/match/i);
  });

  it('an oracle\'s match is the table\'s word too', () => {
    expect(role('oracle_followup')).toMatch(/A result that came with a match is the answer at its most extreme, or with a twist[\s\S]*The word "match" is the table's and is never written\./);
  });

  it('control: a mode that narrates no roll carries no such rule', () => {
    for (const mode of ['paced_narrative', 'scene_interrogation', 'session_vignette', 'campaign_recap']) {
      expect(role(mode), mode).not.toMatch(/never appear in the narration as such/);
    }
  });
});
