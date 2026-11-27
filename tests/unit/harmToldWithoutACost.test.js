/**
 * STARFORGED COMPANION
 * tests/unit/harmToldWithoutACost.test.js
 *
 * Issue #399, D9 (HARM-TOLD-WITHOUT-A-COST): [sheet] is a certain line, its
 * harm clause held in code before a narration posts (checks.js
 * harmViolations). The eighth live round burned the character on three beats
 * whose price fell on the ship — a40 "Something hot rakes your shoulder", a44
 * "heat rakes your ribs", a46 "spits scalding vapor across your forearm" — and
 * round 4's refused Heals, at full health, "start on the cuts". The judge
 * never saw [sheet], and the audit raised nothing on round 9's a58.
 *
 * Narrow by design: harm told where health was lost, a wound from before,
 * someone else's harm, and a move whose narration tells a wound by design
 * (Endure Harm, Face Death; Heal and Sojourn, which treat one) break nothing.
 * The measure scores it on the labelled set with no call
 * (tests/unit/judgeMeasure.test.js): ten flags, all breaches.
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));

import { apiPost } from '../../src/api-proxy.js';
import { harmViolations, certainViolations, checkClassOf, judgeMayAct } from '../../src/moves/contracts/checks.js';
import { obligationsFor } from '../../src/moves/contracts/obligations.js';
import { narrateRound } from '../../src/narration/narrator.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const SIDECAR = '\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

/** Round 8's a40: Clash, a weak hit whose price was the stated Withstand Damage — the ship's. */
const clash = (missSuffer) => obligationsFor({ mode: 'move', resolution: { moveId: 'clash', outcome: 'weak_hit',
  stakes: { hit: 'Your shots tear into the drifting cutter.', miss: 'The cutter answers, and the berth\'s seam worsens.', missSuffer, priceStated: true } } });
const SHIP_PRICE = clash({ move: 'withstand_damage', amount: 1 });
const HEALTH_PRICE = clash({ move: 'endure_harm', amount: 1 });
const HEAL_REFUSED = obligationsFor({ mode: 'paced', refusal: { moveId: 'heal', code: 'recoverable-health', hard: false,
  why: "nothing to heal: Mira Kestrel's health is 5 of 5 and no wound is marked",
  premise: { claim: 'a wound to treat', never: 'a cut, a gash, blood or a dressing on them' }, offer: null } });

describe('[sheet] is certain, and its harm clause is the check', () => {
  it('declared certain, held in code, and asked of no judge', () => {
    expect(checkClassOf('sheet')).toBe('certain');
    expect(judgeMayAct('sheet', 'judge') || judgeMayAct('sheet', 'audit')).toBe(false);
    expect(SHIP_PRICE.map(o => o.kind)).toContain('sheet');
  });
});

describe('harm done to "you" on a beat whose price took no health', () => {
  it('round 8\'s three: a40, a44, a46 — each price fell on the ship', () => {
    for (const told of ['A shell hammers the berth, and the torn deck bucks up through your seat. Something hot rakes your shoulder as the hiss sharpens.',
      'The deck seam shrieks wider, and heat rakes your ribs. Vapor climbs your legs.',
      'A cracked line behind your seat spits scalding vapor across your forearm.']) {
      expect(harmViolations(told, SHIP_PRICE, { moveId: 'clash' }), told).toEqual([
        { tag: 'sheet', quote: expect.any(String), note: 'the sheet took no health on this beat: tell no harm done to you' }]);
    }
  });

  it('a41 and a45: the stated price was Endure Harm, health lost and told — not held', () => {
    expect(harmViolations('A shell lands on the berth, and heat rakes your arm.', HEALTH_PRICE, { moveId: 'clash' })).toEqual([]);
  });

  it('a paced beat changes no sheet: harm done there is held', () => {
    const paced = obligationsFor({ mode: 'paced', line: 'I watch the hatch' });
    expect(harmViolations('The panel sparks, and the arc burns your hand.', paced)).toHaveLength(1);
  });

  it('narrow: someone else\'s harm, a wound from before, and harm only coming break nothing', () => {
    for (const told of ['Heat rakes her ribs, and the stowaway gasps.',
      'The burn from yesterday still pulls when you reach for the turret.',
      'The vapor curls toward your arm, a breath from scalding.']) {
      expect(harmViolations(told, SHIP_PRICE, { moveId: 'clash' }), told).toEqual([]);
    }
  });

  it('a move whose narration tells a wound by design: Endure Harm, Face Death, and Heal or Sojourn, which treat one', () => {
    const told = 'The antiseptic burns your arm as the medic works the gel into the cut.';
    for (const moveId of ['endure_harm', 'face_death', 'heal', 'sojourn']) {
      const lines = obligationsFor({ mode: 'move', resolution: { moveId, outcome: 'strong_hit' } });
      expect(harmViolations(told, lines, { moveId }), moveId).toEqual([]);
    }
    // Control: the same words on a Face Danger.
    expect(harmViolations(told, obligationsFor({ mode: 'move', resolution: { moveId: 'face_danger', outcome: 'strong_hit' } }), { moveId: 'face_danger' })).toHaveLength(1);
  });
});

describe('a refused Heal\'s character, whom the sheet holds unhurt: any wound told', () => {
  it('round 4\'s a62 and a63, and round 1\'s a56', () => {
    for (const told of ['You pull the medkit from under the console and start on the cuts.',
      'The dressing holds under your palm, and the gash throbs against it.',
      'The scorched patch along your ribs takes the gel with a hiss.']) {
      expect(harmViolations(told, HEAL_REFUSED), told).toEqual([
        { tag: 'sheet', quote: expect.any(String), note: 'the sheet holds no wound: tell none' }]);
    }
    // The attempt meeting the facts: nothing to treat.
    expect(harmViolations('You check your arms and find nothing that needs it.', HEAL_REFUSED)).toEqual([]);
  });

  it('through the certain checks, on the body: the closing offer line is never read', () => {
    expect(certainViolations('You check your arms and find nothing that needs it.\n\n*Tending a real wound would be a Heal.*', HEAL_REFUSED)).toEqual([]);
    expect(certainViolations('You start on the cuts.', HEAL_REFUSED).map(v => v.tag)).toEqual(['sheet']);
  });
});

describe('a Batch Mode round: its moves are the check\'s (narrator.js roundCheckContext)', () => {
  const reply = (text) => ({ content: [{ type: 'text', text }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'end_turn' });
  const labels = () => apiPost.mock.calls.map(c => c[3]?.label ?? null);
  const roundOf = (moveId, moveName) => ({
    id: 'round-1', number: 1, phase: 'narrating', acting: ['pl-1'],
    entries: { 'pl-1': { userId: 'pl-1', actorId: 'pc-kira', actorName: 'Kira', userName: 'Kira', text: 'I brace against the lock.',
      rolled: { narrationInput: {
        kind: 'move', resolutionId: 'res-1', moveId, moveName, statUsed: 'iron',
        outcome: 'strong_hit', outcomeLabel: 'Strong hit', isMatch: false, endingTrackIds: [],
        relevance: { resolvedClass: 'interaction', entityIds: [], entityTypes: [] },
      } } } },
  });
  const TOLD = 'The deck bucks, and heat rakes your ribs as you brace against the lock.';
  const AGAIN = 'The deck bucks, and you brace against the lock.';

  beforeEach(() => {
    vi.clearAllMocks();
    ChatMessage._reset();
    game.settings._store.clear();
    game.actors._reset();
    global.game.user = { id: 'gm-1', isGM: true };
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
    game.settings._store.set(KEY, {
      currentSessionId: 'sess-3', sessionNumber: 3, currentSceneId: 'sc-3',
      sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-3' }, sceneFrame: null,
    });
    game.actors._set('pc-kira', makeTestActor({ id: 'pc-kira', name: 'Kira', hasPlayerOwner: true }));
    const queue = [reply(TOLD + SIDECAR), reply(AGAIN + SIDECAR)];
    apiPost.mockImplementation(async () => queue.shift() ?? reply(''));
  });

  it('harm told on a round of Face Danger is asked once more', async () => {
    await narrateRound({ round: roundOf('face_danger', 'Face Danger'), campaignState: game.settings.get(MODULE_ID, 'campaignState') });
    expect(labels().slice(0, 2)).toEqual(['narrator:narrateRound', 'narrator:narrateRound:reask']);
    expect(String(apiPost.mock.calls[1][2].messages[0].content)).toContain('the sheet took no health on this beat: tell no harm done to you');
  });

  it('the same words on a round that holds an Endure Harm post as written', async () => {
    await narrateRound({ round: roundOf('endure_harm', 'Endure Harm'), campaignState: game.settings.get(MODULE_ID, 'campaignState') });
    expect(labels()).not.toContain('narrator:narrateRound:reask');
    expect(ChatMessage._created.some(m => (m.content ?? '').includes('heat rakes your ribs'))).toBe(true);
  });
});
