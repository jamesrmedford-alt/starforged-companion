/**
 * STARFORGED COMPANION
 * tests/unit/charactersPlaceIsTheFrames.test.js
 *
 * Issue #397, Code fix 3 (RECAP-TOLD-A-PLACE-SHE-HAD-LEFT). Two recaps said
 * the character was somewhere she had left:
 *   - round 7's a77, "aboard the Cinder Wren at her command console", when she
 *     had been at Tamsin's ledger stall for three beats;
 *   - round 8's a93, "at the relay console on the Hollow Spire docks", when
 *     play had gone back to the stall two beats before.
 * Each repeated its own input. a71's (round 7) and a87's (round 8) fact block
 * wrote a state entry for the player character's location, tagged from her
 * line, which binds; the beats after it were card presses with no line, so
 * nothing replaced it, while every frame moved her on. The recap's WHERE
 * THINGS STAND, the narrator's STANDING NOW and the judge all read it.
 *
 * Where the characters are within their place is the scene frame's alone
 * (rules/narrator-memory.md 6c: no store restates another's). A fact-block
 * state entry that says where a player character in the scene is, is not
 * kept — placeClaims.js, beside the sheet's meters (sheetClaims.js).
 */

/* global makeTestActor */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../src/system/campaignTruths.js', async () => {
  const actual = await vi.importActual('../../src/system/campaignTruths.js');
  return { ...actual, buildCampaignTruthsBlock: vi.fn(async () => '') };
});

import { apiPost } from '../../src/api-proxy.js';
import { withoutPlaceClaims } from '../../src/factContinuity/placeClaims.js';
import { narratePacedInput } from '../../src/narration/narrator.js';
import { standingLines } from '../../src/record/recapView.js';
import { installJournalMock } from '../helpers/fullStateFixture.js';
import { seedSessionRecord, recordedEvent } from '../helpers/sessionRecordSeed.js';

const MODULE_ID = 'starforged-companion';
const EXPLORATIONS = path.resolve(__dirname, '../../test/ci/playwright/explorations');
const replayOf = (folder) => JSON.parse(fs.readFileSync(path.join(EXPLORATIONS, folder, 'replay.json'), 'utf8'));
const replyText = (x) => x.response.content.map(c => c.text ?? '').join('');
const narrationAt = (run, step) => replyText(run.recording.exchanges
  .find(x => x.step === step && /narratePacedInput$|narrateResolution$/.test(x.kind)));
const ROUND_7 = replayOf('long-haul-live-20261126-030646');
const ROUND_8 = replayOf('long-haul-live-20261126-184225');

const change = (subject, attribute, value, from = 'line') => ({ subject, attribute, value, from });
const block = (stateChanges, present = ['Mira Kestrel']) => ({
  newTruths: [], stateChanges, sceneFrame: { location: 'Tamsin\'s ledger stall', present, situation: '', question: '' },
});
const kept = (b, pcs) => withoutPlaceClaims(b, { pcs }).stateChanges.map(c => `${c.subject} — ${c.attribute}`);

describe('the filter: a player character in the scene has no place of her own in the fact block', () => {
  it('drops her place by her whole name, a word of it, "you" or "the PC"; keeps every other entry', () => {
    const b = block([
      change('Mira Kestrel', 'location', 'aboard the Cinder Wren, at her command console'),
      change('Mira', 'aboard', 'the Cinder Wren'),
      change('the PC', 'location', 'at the relay console'),
      change('you', 'whereabouts', 'at the relay console'),
      change('PC', 'Vessel', 'the Kobayashi IV'),
      change('Tamsin Okoro', 'location', 'beside Mira at the counter'),
      change('visitor', 'location', 'at the stall, beside the PC'),
      change('Mira Kestrel', 'condition', 'soot on her sleeves', 'result'),
      change('Mira Kestrel\'s ship', 'location', 'at the docking ring'),
    ]);
    expect(kept(b, ['Mira Kestrel'])).toEqual([
      'Tamsin Okoro — location', 'visitor — location', 'Mira Kestrel — condition', 'Mira Kestrel\'s ship — location',
    ]);
  });

  it('two player characters: the place of one the frame does not have present is kept', () => {
    const b = block([change('Mira Kestrel', 'location', 'at the stall'), change('Ren Ashe', 'location', 'aboard the Kobayashi IV')], ['Mira Kestrel', 'Tamsin Okoro']);
    expect(kept(b, ['Mira Kestrel', 'Ren Ashe'])).toEqual(['Ren Ashe — location']);
    // With no one present named, "you" cannot be placed in the scene: kept.
    const you = block([change('you', 'location', 'at the stall')], []);
    expect(kept(you, ['Mira Kestrel', 'Ren Ashe'])).toEqual(['you — location']);
  });

  it('one player character is in every scene, whatever the frame\'s present (round 8 left her out of 40 of 68)', () => {
    const b = block([change('Mira Kestrel', 'location', 'at the relay console')], ['Tamsin Okoro', 'man at the water tap']);
    expect(kept(b, ['Mira Kestrel'])).toEqual([]);
  });

  it('the same block when it drops nothing; any other shape as it came; never throws', () => {
    const b = block([change('Tamsin Okoro', 'location', 'at the stall')]);
    expect(withoutPlaceClaims(b, { pcs: ['Mira Kestrel'] })).toBe(b);
    for (const odd of [null, undefined, 'text', 7, {}, { stateChanges: 'x' }, { stateChanges: [null, 'x', { attribute: 'location' }] }]) {
      expect(withoutPlaceClaims(odd, { pcs: ['Mira Kestrel'] })).toBe(odd);
    }
    expect(withoutPlaceClaims(block([change('Mira Kestrel', 'location', 'x')]), {}).stateChanges).toHaveLength(1);
  });
});

describe('the recorded replies, through the narrator (explorations: rounds 7 and 8)', () => {
  const T = 1_800_000_000_000;
  let journals;

  beforeEach(async () => {
    vi.clearAllMocks();
    journals = installJournalMock();
    const at = (k, scene, when, opts = {}) => ({ ...recordedEvent('sess-3', k, { ...opts, at: when }), scene });
    await seedSessionRecord('sess-3', [
      at('session.begun', null, T, { d: { number: 3, table: {} } }),
      at('scene.started', 'sc-3', T + 1_000, { d: { sceneId: 'sc-3', reason: 'first', cause: 'first', what: 'the session begins' } }),
    ], { number: 3 });
    game.settings._store.set(`${MODULE_ID}.worldSnapshot`, false);
    game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
    game.actors._reset();
    game.actors._set('pc-mira', makeTestActor({ id: 'pc-mira', name: 'Mira Kestrel' }));
    game.actors._set('npc-tamsin', makeTestActor({ id: 'npc-tamsin', name: 'Tamsin Okoro', type: 'character',
      flags: { [MODULE_ID]: { entityType: 'connection', connection: { _id: 'rec-tamsin', name: 'Tamsin Okoro', active: true } } } }));
    game.messages = { contents: [] };
    game.settings._store.set(`${MODULE_ID}.campaignState`, {
      currentSessionId: 'sess-3', sessionNumber: 3, currentSceneId: 'sc-3', connectionIds: ['npc-tamsin'],
      sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-3' },
      sceneFrame: { location: 'Tamsin Okoro\'s ledger stall', present: ['Mira Kestrel', 'Tamsin Okoro'], sceneId: 'sc-3' },
    });
  });
  afterEach(() => journals.restore());

  /** One beat of play: the line, answered with the recorded reply. */
  async function beat(line, reply) {
    apiPost.mockImplementation(async (url, headers, body, opts) => ({
      content: [{ type: 'text', text: String(opts?.label ?? '').startsWith('narrator:narratePacedInput') ? reply
        : opts?.label === 'obligationJudge' ? '{"violations":[]}' : 'Session 3.' }],
      usage: {}, stop_reason: 'end_turn',
    }));
    await narratePacedInput(line, game.settings.get(MODULE_ID, 'campaignState'), { speakerActorId: 'pc-mira' });
  }
  const state = () => game.settings.get(MODULE_ID, 'campaignState');
  const placesOf = (subject) => (state().sceneState?.bySubject?.[subject] ?? []).filter(e => /^(?:location|vessel|aboard|whereabouts)$/i.test(e.attribute));

  it('round 7: a71 then a72 leave her no place of her own, and the recap is not told one', async () => {
    await beat('I go to the cutter\'s wreck and search her command console and logs for whoever sent her, even though the hull is breached and could vent on me.',
      narrationAt(ROUND_7, 'a71'));
    await beat('I read the ledger with Tamsin.', narrationAt(ROUND_7, 'a72'));
    expect(placesOf('mira kestrel')).toEqual([]);
    // The rest of a71's block is kept: the cutter's hull.
    expect(state().sceneState.bySubject['cinder wren']?.map(e => e.attribute)).toContain('hull');
    const standing = (await standingLines(state())).join('\n');
    expect(standing).not.toContain('aboard the Cinder Wren');
  });

  it('round 8: a87 then a91, the same — and the man at the water tap keeps his', async () => {
    await beat('I cross to the relay console and pull the comm traffic from the last few hours, looking for who the Cinder Wren answered to, and I keep Tamsin close.',
      narrationAt(ROUND_8, 'a87'));
    await beat('I look the man over.', narrationAt(ROUND_8, 'a91'));
    expect(placesOf('mira kestrel')).toEqual([]);
    expect(placesOf('man at the water tap').map(e => e.value)).toEqual(['at Tamsin\'s stall, close behind the PC']);
    const standing = (await standingLines(state())).join('\n');
    expect(standing).not.toContain('at the relay console on the Hollow Spire docks');
  });
});
