/**
 * RETRACTION-POSSESSIVE (known-issues). A strike reaches the session's
 * auto-confirmed lore that states it about the struck subject
 * (propagateRetraction, issue #321 U39: a lore entry must mention the struck
 * subject by name). A possessive counted as that mention: striking
 * "Mira — Is dead" took "Mira's husband is dead" out of canon — the lore is
 * about her husband, and "is dead" overlapped. A possessive mention counts
 * now only when the struck fact is itself about something of the subject's
 * ("Mira — Her husband is dead").
 *
 * The stores are written through their production writers (recordLoreDiscovery).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { propagateRetraction } from '../../src/factContinuity/retractions.js';
import { recordLoreDiscovery, getConfirmedLore } from '../../src/world/worldJournal.js';
import { installJournalMock } from '../helpers/fullStateFixture.js';

let installed;
beforeEach(() => { installed = installJournalMock(); });
afterEach(() => { installed.restore(); });

const cs = () => ({
  currentSessionId: 'sess-1', sessionNumber: 4, currentSceneId: 'sc-2',
  sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-2' }, connectionIds: [],
});
const strike = (fact, text = 'Mira') => ({
  id: 'tr-mira0001', subject: { kind: 'text', text }, fact,
  sessionId: 'sess-1', sceneId: 'sc-2', retracted: true,
});
const lore = (state, title, text) => recordLoreDiscovery(title, {
  text, confirmed: true, narratorAsserted: true, sessionId: 'sess-1',
}, state);
const canon = (state) => getConfirmedLore(state).map(e => e.title).sort();

describe('RETRACTION-POSSESSIVE — a possessive is not a mention of the struck subject', () => {
  it('"Mira — Is dead" leaves "Mira\'s husband is dead" in canon', async () => {
    const state = cs();
    await lore(state, 'The reactor accident', "Mira's husband is dead, lost when the Ascent's reactor failed");
    const out = await propagateRetraction(strike('Is dead'), state);
    expect(out.lore).toBe(0);
    expect(canon(state)).toEqual(['The reactor accident']);
  });

  it('control: "Mira — Is dead" takes "Mira is dead" out of canon — a possessive elsewhere in the text does not hide the mention', async () => {
    const state = cs();
    await lore(state, 'The gantry', "Mira's crew watched: Mira is dead, shot on the gantry");
    const out = await propagateRetraction(strike('Is dead'), state);
    expect(out.lore).toBe(1);
    expect(canon(state)).toEqual([]);
  });

  it('a fact about something of hers — "Mira — Her husband is dead" — still reaches "Mira\'s husband is dead"', async () => {
    const state = cs();
    await lore(state, 'The reactor accident', "Mira's husband is dead, lost when the Ascent's reactor failed");
    const out = await propagateRetraction(strike('Her husband is dead'), state);
    expect(out.lore).toBe(1);
    expect(canon(state)).toEqual([]);
  });

  it('a name ending in s: "Marcus\' ship was lost" is not "Marcus — Was lost"', async () => {
    const state = cs();
    await lore(state, 'The wreck', "Marcus' ship was lost in the Shroud");
    const out = await propagateRetraction(strike('Was lost', 'Marcus'), state);
    expect(out.lore).toBe(0);
    expect(canon(state)).toEqual(['The wreck']);
  });
});
