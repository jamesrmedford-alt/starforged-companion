/**
 * STARFORGED COMPANION
 * tests/unit/readerParse.test.js
 *
 * The line reader's parse (src/moves/reader.js parseReading): today's two
 * parses joined — tolerant, never throwing. A reply is a reading, no move,
 * or a failed reading; and the holds that need no more than the reading are
 * applied to it: the position remap, a stat the move lists, Heal's
 * situation, the stakes normalised and priced, and a Balanced misread kept
 * in kind on its own plain move (issue #384, D16).
 */

import { describe, it, expect } from 'vitest';
import { parseReading } from '../../src/moves/reader.js';

const reading = (over = {}) => JSON.stringify({
  move: 'face_danger', asked: false, risk: 'high', category: 'exploration', confidence: 'high', reason: 'Crossing the gap is risky.',
  target: null, sceneChallenge: null, stat: 'edge', healSituation: null, expeditionRank: null, combatRank: null,
  stakes: { hit: 'You make the far side.', miss: 'You slip and fall hard.', missSuffer: { move: 'endure_harm', amount: 1, target: null } },
  mischiefApplied: false, plainMove: null, ...over,
});

describe('a reply the reader can read', () => {
  it('is a reading: the move, asked, risk, category, confidence, reason, and the interpretation interpretMove returns', () => {
    const r = parseReading(reading(), { narration: 'I jump the gap.' });
    expect(r).toMatchObject({ mode: 'open', moveId: 'face_danger', asked: false, risk: 'high', category: 'exploration', confidence: 'high', reason: 'Crossing the gap is risky.', plainMove: null, failed: null });
    expect(r.interpretation).toMatchObject({
      playerNarration: 'I jump the gap.', inputMethod: 'chat', moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge',
      statValue: 0, adds: 0, isProgressMove: false, progressTicks: 0, moveTarget: null, rationale: 'Crossing the gap is risky.',
      stakes: { hit: 'You make the far side.', miss: 'You slip and fall hard.', missSuffer: { move: 'endure_harm', amount: 1 } },
      mischiefApplied: false, confidence: 'high', positionConstraintApplied: false, playerConfirmed: false,
    });
  });

  it('reads past fences and prose around the object', () => {
    expect(parseReading(`\`\`\`json\n${reading()}\n\`\`\``).moveId).toBe('face_danger');
    expect(parseReading(`Here is my reading:\n${reading({ move: 'gather_information', stat: 'wits' })}\nThat is all.`).moveId).toBe('gather_information');
  });

  it('a move by its display name is its id', () => {
    expect(parseReading(reading({ move: 'Gather Information', stat: 'wits' })).moveId).toBe('gather_information');
    expect(parseReading(reading({ move: 'develop-your-relationship', stat: null })).moveId).toBe('develop_your_relationship');
  });

  it('a reply that leaves out what is null or false reads as one that gives it', () => {
    const full = parseReading(reading(), { narration: 'I jump the gap.' });
    const lean = JSON.stringify({ move: 'face_danger', risk: 'high', category: 'exploration', confidence: 'high', reason: 'Crossing the gap is risky.', stat: 'edge',
      stakes: { hit: 'You make the far side.', miss: 'You slip and fall hard.', missSuffer: { move: 'endure_harm', amount: 1 } } });
    expect(parseReading(lean, { narration: 'I jump the gap.' })).toEqual(full);
    expect(parseReading('{"move": null, "category": "social", "confidence": "high", "reason": "Talk."}')).toMatchObject({ moveId: null, asked: false, risk: null, failed: null });
  });

  it('no move: null, "none" or "no move" — the open reading\'s right answer for a line that makes none', () => {
    for (const none of [null, 'none', 'No move', 'no_move']) {
      expect(parseReading(reading({ move: none, risk: null, stat: null, stakes: null })), String(none)).toMatchObject({ moveId: null, interpretation: null, failed: null, risk: null });
    }
  });
});

describe('a reply the reader cannot read is a failed reading, never a throw', () => {
  it('not JSON, not an object, no move key, an unknown move', () => {
    expect(parseReading('I think this is Face Danger.').failed).toBe('the reply could not be read');
    expect(parseReading('{"move": "face_danger", ').failed).toBe('the reply could not be read');
    expect(parseReading('[1, 2]').failed).toBe('the reply could not be read');
    expect(parseReading('{}').failed).toBe('the reply named no move and said none was made');
    expect(parseReading(reading({ move: 'tend_wounds' })).failed).toBe('the reply named no move the module knows (tend_wounds)');
    expect(parseReading(undefined).failed).toBe('the reply could not be read');
    expect(parseReading('{"move": "face_dan', { cutShort: true }).failed).toBe('the reply was cut short');
  });

  it('no move where a roll was asked for', () => {
    expect(parseReading(reading({ move: null }), { mode: 'roll' })).toMatchObject({ mode: 'roll', moveId: null, failed: 'a roll was asked for, and the reply named no move' });
    expect(parseReading(reading({ move: 'compel', stat: 'iron' }), { mode: 'roll' }).moveId).toBe('compel');
  });
});

describe('the words held to their values', () => {
  it('confidence: a word, or a number read as one; anything else is medium', () => {
    const c = (confidence) => parseReading(reading({ confidence })).confidence;
    expect([c('HIGH'), c('low'), c(0.8), c(0.5), c(0.2), c('certain'), c(undefined)]).toEqual(['high', 'low', 'high', 'medium', 'low', 'medium', 'medium']);
  });

  it('risk: a word for a rolled move — an unknown one is plain — and none for a move with no roll', () => {
    expect(parseReading(reading({ risk: 'huge' })).risk).toBe('plain');
    expect(parseReading(reading({ risk: null })).risk).toBe('plain');
    expect(parseReading(reading({ risk: 'Slight' })).risk).toBe('slight');
    expect(parseReading(reading({ move: 'reach_a_milestone', risk: 'high', stat: null, stakes: null })).risk).toBeNull();
    // A progress roll is rolled: its risk stands.
    expect(parseReading(reading({ move: 'fulfill_your_vow', risk: 'high', stat: null })).risk).toBe('high');
  });

  it('category: one of the five, else exploration; asked: true or "true" only', () => {
    expect(parseReading(reading({ category: 'Social' })).category).toBe('social');
    expect(parseReading(reading({ category: 'heist' })).category).toBe('exploration');
    expect(parseReading(reading({ asked: 'true' })).asked).toBe(true);
    expect(parseReading(reading({ asked: 'yes' })).asked).toBe(false);
  });

  it('reason: one line, capped; a reply that gives only today\'s rationale is read for it', () => {
    expect(parseReading(reading({ reason: `a ${'very '.repeat(80)}long reason` })).reason.length).toBe(280);
    const legacy = JSON.parse(reading());
    delete legacy.reason;
    legacy.rationale = 'today\'s key';
    expect(parseReading(JSON.stringify(legacy)).reason).toBe('today\'s key');
  });
});

describe('a line that names its move asks for it (classifier.js "A LINE THAT NAMES ITS MOVE ASKS FOR IT", in code)', () => {
  const askedFor = (line, over) => parseReading(reading({ asked: false, ...over }), { narration: line }).asked;

  it('the move\'s name of two words or more, in any tense or person, everyday English included', () => {
    // The fourth live run's a33, offered for the density; the one reader's own asked missed it.
    expect(askedFor('I set a course for Bleakhold Station.', { move: 'set_a_course', stat: 'supply' })).toBe(true);
    expect(askedFor('I face danger and slip the ship through that gap.', { move: 'face_danger' })).toBe(true);
    expect(askedFor('We gathered information from the dock clerks.', { move: 'gather_information', stat: 'wits' })).toBe(true);
    expect(askedFor('I fulfil my vow at last.', { move: 'fulfill_your_vow', stat: null })).toBe(true);
    expect(askedFor('Forging a bond with her is all I want.', { move: 'forge_a_bond', stat: null })).toBe(true);
    // A scene-challenge variant is named by its ordinary move's name.
    expect(askedFor('I face danger to hold the crowd back.', { move: 'face_danger_scene_challenge', sceneChallenge: 'The Riot' })).toBe(true);
  });

  it('not when the line names another move, or none; a one-word name is an everyday verb, left to the reader', () => {
    expect(askedFor('I plot the course and take her out to Bleakhold Station.', { move: 'set_a_course', stat: 'supply' })).toBe(false);
    expect(askedFor('I set a course for the drift beyond the charts.', { move: 'undertake_an_expedition', stat: 'wits' })).toBe(false);
    expect(askedFor('I heal the cut on my arm.', { move: 'heal', stat: 'wits', healSituation: 'self' })).toBe(false);
    // The reply's own asked stands.
    expect(askedFor('I try to heal the cut on my arm.', { move: 'heal', stat: 'wits', healSituation: 'self', asked: true })).toBe(true);
    // A chosen move is the card's: nothing is asked.
    expect(parseReading(reading({ move: 'set_a_course', stat: 'supply' }), { mode: 'chosen', chosen: { moveId: 'set_a_course' }, narration: 'I set a course for Bleakhold.' }).asked).toBe(false);
  });
});

describe('the holds that need no more than the reading', () => {
  it('a combat move for the wrong position is the same intent\'s for the speaker\'s, and says so', () => {
    const r = parseReading(reading({ move: 'strike', stat: 'iron' }), { combatPosition: 'bad_spot' });
    expect(r.moveId).toBe('clash');
    expect(r.interpretation).toMatchObject({ moveId: 'clash', moveName: 'Clash', statUsed: 'iron', positionConstraintApplied: true });
    expect(r.interpretation.rationale).toMatch(/\(Adjusted to Clash — you are in a bad spot\.\)$/);
    expect(parseReading(reading({ move: 'react_under_fire', stat: 'edge' }), { combatPosition: 'in_control' }).moveId).toBe('gain_ground');
    expect(parseReading(reading({ move: 'strike', stat: 'iron' }), { combatPosition: null }).moveId).toBe('strike');
  });

  it('a stat the move lists: else its first — the Chaotic dial keeps an unlisted one; a chosen move never does', () => {
    expect(parseReading(reading({ move: 'gather_information', stat: 'iron' })).interpretation.statUsed).toBe('wits');
    expect(parseReading(reading({ move: 'gather_information', stat: 'iron' }), { mischiefLevel: 'chaotic' }).interpretation.statUsed).toBe('iron');
    expect(parseReading(reading({ move: 'gather_information', stat: 'luck' }), { mischiefLevel: 'chaotic' }).interpretation.statUsed).toBe('wits');
    expect(parseReading(reading({ move: 'aid_your_ally', stat: null })).interpretation.statUsed, 'a rolled move is never left without one').toBe('edge');
    // A progress roll and a move with no roll have none, and no stakes.
    expect(parseReading(reading({ move: 'take_decisive_action', stat: 'iron' })).interpretation).toMatchObject({ statUsed: null, isProgressMove: true, stakes: null });
    expect(parseReading(reading({ move: 'develop_your_relationship', stat: 'heart' })).interpretation).toMatchObject({ statUsed: null, stakes: null });
  });

  it('a chosen move stands whatever the reply named — or if it named none — with a stat it lists', () => {
    const chosen = { moveId: 'compel' };
    expect(parseReading(reading({ move: 'face_danger', stat: 'edge' }), { mode: 'chosen', chosen, mischiefLevel: 'chaotic' }).interpretation)
      .toMatchObject({ moveId: 'compel', statUsed: 'heart', mischiefApplied: false });
    expect(parseReading(reading({ move: null, stat: 'iron' }), { mode: 'chosen', chosen }).interpretation).toMatchObject({ moveId: 'compel', statUsed: 'iron' });
    // The position remap is the open and roll readings': a card's move is the card's.
    expect(parseReading(reading({ move: 'strike', stat: 'iron' }), { mode: 'chosen', chosen: { moveId: 'strike' }, combatPosition: 'bad_spot' }).moveId).toBe('strike');
  });

  it('Heal\'s situation for heal alone; the target and the ranks as given', () => {
    expect(parseReading(reading({ move: 'heal', stat: 'wits', healSituation: 'self' })).interpretation.healSituation).toBe('self');
    expect(parseReading(reading({ move: 'heal', stat: 'wits', healSituation: 'surgery' })).interpretation.healSituation).toBeNull();
    expect(parseReading(reading({ healSituation: 'self' })).interpretation.healSituation).toBeNull();
    expect(parseReading(reading({ move: 'undertake_an_expedition', stat: 'wits', target: '  The Ashen   Drift ', expeditionRank: 'Formidable' })).interpretation)
      .toMatchObject({ moveTarget: 'The Ashen Drift', expeditionRank: 'formidable' });
    // A scene-challenge move with no target named is aimed at the challenge it names.
    expect(parseReading(reading({ move: 'face_danger_scene_challenge', target: null, sceneChallenge: 'The Long Haggle' })))
      .toMatchObject({ sceneChallenge: 'The Long Haggle', interpretation: { moveTarget: 'The Long Haggle' } });
  });

  it('the stakes: normalised, and priced when the move\'s miss pays one', () => {
    const r = parseReading(reading({ move: 'face_danger', stakes: { hit: '  You make it. ', miss: 'You fall.', missSuffer: { move: 'endure_harm', amount: '7' } } }));
    // An amount past the scale is its top (stakes.js normaliseStakes: 1–3).
    expect(r.interpretation.stakes).toMatchObject({ hit: 'You make it.', miss: 'You fall.', missSuffer: { move: 'endure_harm', amount: 3 } });
    expect(typeof r.interpretation.stakes.priceStated).toBe('boolean');
    expect(parseReading(reading({ stakes: 'none' })).interpretation.stakes).toBeNull();
  });

  it('a Balanced misread that turns a line of dialogue into a travel move is put back to its own plain move', () => {
    const misread = reading({ move: 'undertake_an_expedition', stat: 'wits', category: 'social', mischiefApplied: true, plainMove: 'compel' });
    const r = parseReading(misread, { mischiefLevel: 'balanced' });
    expect(r).toMatchObject({ moveId: 'compel', plainMove: 'compel', category: 'social' });
    expect(r.interpretation).toMatchObject({ moveId: 'compel', keptInKind: 'undertake_an_expedition', mischiefApplied: false, stakes: null });
    // Chaotic keeps its freedom; a misread with no plain move named has no anchor to go back to.
    expect(parseReading(misread, { mischiefLevel: 'chaotic' }).moveId).toBe('undertake_an_expedition');
    expect(parseReading(reading({ move: 'undertake_an_expedition', stat: 'wits', category: 'social', mischiefApplied: true, plainMove: null }), { mischiefLevel: 'balanced' }).moveId).toBe('undertake_an_expedition');
    // plainMove is read only with a misread.
    expect(parseReading(reading({ plainMove: 'compel' })).plainMove).toBeNull();
  });
});
